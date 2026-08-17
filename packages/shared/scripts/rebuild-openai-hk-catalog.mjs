/**
 * Rebuild openai-hk chat/image/video catalogs from a pricing dump.
 *
 * Pricing formula (对照 openai-hk 定价页截图，default 分组 group_ratio=7)：
 *   50 元 = 500,000 积分  →  1 元 = 10,000 积分
 *   按量：输入积分/1M = model_ratio × group_ratio × 20,000
 *         输出积分/1M = 输入 × completion_ratio
 *         缓存读/建   = 输入 × cache_ratio / create_cache_ratio
 *   按次：积分/次 = model_price × 10,000
 *
 * Usage: node packages/shared/scripts/rebuild-openai-hk-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pricingPath = path.join(root, 'src', 'openai-hk-pricing.json');
const catalogPath = path.join(root, 'src', 'openai-hk-catalog.json');

/** 1 元人民币 = 多少积分（50 元 = 50 万积分） */
const POINTS_PER_CNY = 10_000;
/** 倍率 1.0 × group_ratio=1 时，每 1M tokens 输入积分 */
const POINTS_PER_RATIO_AT_GROUP1 = 20_000;

const VENDOR_BY_ID = {
  1: 'Anthropic',
  2: 'Google',
  3: 'OpenAI',
  4: 'DeepSeek',
  5: 'xAI',
  6: '讯飞',
};

const SKIP_NAME =
  /^(text-embedding|text-moderation|text-ada|text-babbage|text-curie|text-davinci-edit|davinci-002|babbage-002|tts-|whisper)/i;

const IMAGE_NAME =
  /^(dall-e|gpt-image|gpt-4o-image|sora_image|nano-banana)|image-preview|-image(?:-vip)?$/i;

const VIDEO_NAME = /^(sora_video|sora-2|veo|runway|kling)|_video/i;

const VIDEO_EXTRAS = [
  // 对照 openai-hk「模型价格」页（1 元 = 10,000 积分）
  // kling-video 1.5 元/次=15000；kling-video-v1.5 3 元/次=30000 → 站内可灵统一按 30000
  { value: 'kling-v1-6', vendor: 'Kling', modelPrice: 3, quotaType: 1 },
  { value: 'kling-v2-6', vendor: 'Kling', modelPrice: 3, quotaType: 1 },
  { value: 'luma', vendor: 'Luma', modelPrice: 0.4, quotaType: 1 }, // luma-relax 4000
  { value: 'luma-v2', vendor: 'Luma', modelPrice: 1.2, quotaType: 1 }, // luma-pro 12000
  { value: 'runway-gen3', vendor: 'Runway', modelPrice: 0.12, quotaType: 1 }, // 1200
  { value: 'runway-gen3-turbo', vendor: 'Runway', modelPrice: 0.9, quotaType: 1 }, // gen3-fast 9000
  { value: 'pika-2.2', vendor: 'Pika', modelPrice: 0.6, quotaType: 1 }, // 6000
  { value: 'pixverse-v5', vendor: 'Pixverse', modelPrice: 0.35, quotaType: 1 },
  { value: 'minimax-i2v', vendor: 'MiniMax', modelPrice: 0.3, quotaType: 1 },
  { value: 'higgsfield-lite', vendor: 'Higgsfield', modelPrice: 0.25, quotaType: 1 },
  { value: 'veo3-fast', vendor: 'Google', modelPrice: 1.0, quotaType: 1 },
  { value: 'veo3', vendor: 'Google', modelPrice: 5, quotaType: 1 }, // veo3.1 pro 级
  { value: 'veo3.1-fast', vendor: 'Google', modelPrice: 1.0, quotaType: 1 },
  { value: 'sora-2', vendor: 'OpenAI', modelPrice: 0.2, quotaType: 1 },
  { value: 'sora-2-pro', vendor: 'OpenAI', modelPrice: 3, quotaType: 1 },
];

const PRICE_LABEL = {
  cheap: '便宜',
  fair: '适中',
  pricey: '偏贵',
  costly: '很贵',
};

/** 准度文案保守：基本都是「适中」，轻量模型标「一般」 */
const QUALITY_LABEL = {
  basic: '准度一般',
  balanced: '准度适中',
};

function classify(row) {
  const name = String(row.model_name || '').trim();
  if (!name) return 'skip';
  const endpoints = Array.isArray(row.supported_endpoint_types)
    ? row.supported_endpoint_types.map(String)
    : [];

  if (/gizmo/i.test(name)) return 'skip';
  if (endpoints.includes('image-generation') || IMAGE_NAME.test(name)) return 'image';
  if (VIDEO_NAME.test(name)) return 'video';
  if (SKIP_NAME.test(name)) return 'skip';
  return 'chat';
}

function vendorOf(row) {
  if (row.vendor_id != null && VENDOR_BY_ID[row.vendor_id]) return VENDOR_BY_ID[row.vendor_id];
  const n = String(row.model_name || '').toLowerCase();
  if (n.startsWith('claude')) return 'Anthropic';
  if (n.startsWith('gemini') || n.startsWith('nano-banana')) return 'Google';
  if (n.startsWith('grok')) return 'xAI';
  if (n.startsWith('deepseek')) return 'DeepSeek';
  if (/^(gpt|o[0-9]|chatgpt|dall-e|tts|sora|text-|davinci|babbage)/.test(n)) return 'OpenAI';
  return 'OpenAI';
}

function fmtPoints(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('en-US');
}

function fmtCny(points) {
  const cny = (Number(points) || 0) / POINTS_PER_CNY;
  if (cny <= 0) return '¥0';
  if (cny < 0.01) return `¥${cny.toFixed(4)}`;
  if (cny < 1) return `¥${cny.toFixed(2)}`;
  if (cny < 100) return `¥${cny.toFixed(1)}`;
  return `¥${Math.round(cny)}`;
}

function qualityTierOf(name) {
  const n = String(name || '').toLowerCase();
  // 轻量 / 打包通道 / 专用检索：不当「准度适中」写作主力
  if (
    /mini|nano|flash|haiku|lite|babbage|curie|3\.5|gpt-4o-mini|gpt-5-nano|codex|deepsearch|-all$/.test(
      n,
    )
  ) {
    return 'basic';
  }
  return 'balanced';
}

/** 好用度：面向漫剧写作/出图/镜头场景的可用性，不是官方跑分 */
function usefulnessOf(name, kind) {
  const n = String(name || '').toLowerCase();
  let u = 48;

  if (kind === 'chat') {
    // 写作主力优先：文笔稳 > 纯便宜草稿
    if (/^claude-sonnet-4-5$|^claude-sonnet-4-6$|^claude-sonnet-5$/.test(n)) u = 96;
    else if (/^claude-sonnet-4-5-20250929$|^claude-sonnet-4-20250514$|^claude-sonnet-4-6-thinking$/.test(n))
      u = 90;
    else if (/^gpt-4\.1$|^gpt-4o$|^chatgpt-4o-latest$/.test(n)) u = 88;
    else if (/^claude-opus-4-[567]|^claude-opus-5$|^claude-opus-4-5/.test(n)) u = 86;
    else if (/^gpt-5\.4$|^gpt-5\.6$|^gpt-5\.5$/.test(n)) u = 84;
    else if (/sonnet/.test(n) && /claude/.test(n)) u = 78;
    else if (/opus/.test(n) && /claude/.test(n)) u = 76;
    else if (/^gemini-2\.5-pro$|^gemini-3\.1-pro|^gemini-3-pro/.test(n)) u = 74;
    else if (/^o3$|^o4-mini$/.test(n)) u = 70;
    else if (/^gemini-2\.5-flash$|^gemini-3\.1-flash$|^gemini-3-flash|^gemini-3\.5-flash/.test(n)) u = 58;
    else if (/^o3-mini$|^gpt-5-mini$|^gpt-4\.1-mini$/.test(n)) u = 56;
    else if (/^gpt-5-nano$|^gpt-4\.1-nano$|^claude-haiku|^gemini.*lite/.test(n)) u = 50;

    if (/codex/.test(n)) u -= 28;
    if (/-all$/.test(n)) u -= 30;
    if (/thinking|xhigh|-high$|-medium$|-low$/.test(n) && !/sonnet-4-6-thinking/.test(n)) u -= 12;
    if (/0613|0314|0125|0301|1106|20240229|20240620/.test(n)) u -= 22;
    if (/gpt-3\.5|text-/.test(n)) u -= 20;
    if (/grok-3-deepsearch/.test(n)) u -= 18;
  }

  if (kind === 'image') {
    if (/^gpt-image-1$/.test(n)) u = 94;
    else if (/^gpt-image-1\.5$/.test(n)) u = 88;
    else if (/^gpt-image-2$/.test(n)) u = 86;
    else if (/^dall-e-3$/.test(n)) u = 78;
    else if (/^sora_image$|^nano-banana$/.test(n)) u = 64;
    else if (/nano-banana-2$/.test(n)) u = 62;
    else u = 52;
    if (/-vip$/.test(n)) u -= 8;
    if (/4k|2k|hd/.test(n)) u -= 4;
    if (/preview/.test(n)) u -= 10;
  }

  if (kind === 'video') {
    if (/^sora_video2$/.test(n)) u = 96;
    else if (/^kling-v1-6$|^kling-v2-6$/.test(n)) u = 90;
    else if (/^veo3-fast$|^veo3\.1-fast$/.test(n)) u = 88;
    else if (/^luma-v2$|^luma$/.test(n)) u = 84;
    else if (/^minimax-i2v$|^pixverse/.test(n)) u = 80;
    else if (/^sora-2$/.test(n)) u = 78;
    else if (/^runway-gen3-turbo$|^pika/.test(n)) u = 74;
    else if (/^veo3$|^runway-gen3$/.test(n)) u = 72;
    else if (/^higgsfield/.test(n)) u = 66;
    else if (/^sora-2-pro$/.test(n)) u = 64;
    else u = 50;
  }

  return Math.max(8, Math.min(100, u));
}

/** 排序权重：优先便宜，准度适中加分；好用度作同档 tie-break */
function valueWeights(kind) {
  if (kind === 'chat') return { cheap: 0.72, use: 0.28 };
  if (kind === 'image') return { cheap: 0.7, use: 0.3 };
  return { cheap: 0.68, use: 0.32 };
}

/**
 * 价格档位（绝对阈值，不以百分位）：
 * 参照：GPT-4（约 ¥336/百万 tokens）与 GPTs/gizmo（约 ¥0.2/次）已算「很贵」。
 * 按量：costScore = 入积分 + 0.3×出积分（典型用量）；按次：单次积分。
 */
function priceTierOf(item) {
  const score = Number(item.costScore) || 0;
  if (item.billingType === 'fixed') {
    // GPTs ≈ 2000 积分/次 → 很贵；sora/gpt-image ≈ 1000–1200 → 适中
    if (score < 800) return 'cheap';
    if (score < 1500) return 'fair';
    if (score < 2000) return 'pricey';
    return 'costly';
  }
  // GPT-4 ≈ 3.36e6 → 很贵；4o/Sonnet ≈ 3.5e5–5e5 → 适中；nano/mini < 1.2e5 → 便宜
  if (score < 120_000) return 'cheap';
  if (score < 600_000) return 'fair';
  if (score < 2_000_000) return 'pricey';
  return 'costly';
}

const PRICE_TIER_RANK = { cheap: 0, fair: 1, pricey: 2, costly: 3 };

/** 用「典型用量」成本做相对贵贱：按量按 1M 入 + 0.3M 出；按次直接用单次积分 */
function costScoreOf(billing) {
  if (billing.billingType === 'fixed') return Number(billing.perUsePoints) || 0;
  const inp = Number(billing.inputPoints) || 0;
  const out = Number(billing.outputPoints) || 0;
  return inp + out * 0.3;
}

function normRank(values, value, invert) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n <= 1) return 0.5;
  let idx = sorted.findIndex((v) => v >= value);
  if (idx < 0) idx = n - 1;
  let lo = idx;
  let hi = idx;
  while (lo > 0 && sorted[lo - 1] === value) lo -= 1;
  while (hi < n - 1 && sorted[hi + 1] === value) hi += 1;
  const mid = (lo + hi) / 2;
  const p = mid / (n - 1);
  return invert ? 1 - p : p;
}

/**
 * 排序：价格档（便宜→贵）→ 准度适中优先 → valueScore。
 * 推荐 = 最便宜的「准度适中」；没有则取排序第一。
 */
function rankByValueAndRecommend(items, kind) {
  const costs = items.map((it) => Number(it.costScore) || 0);
  const uses = items.map((it) => usefulnessOf(it.value, kind));
  const w = valueWeights(kind);

  const enriched = items.map((it, i) => {
    const cheapness = normRank(costs, costs[i], true);
    const usefulness = uses[i];
    const useNorm = (usefulness - 8) / 92;
    const balancedBoost = it.qualityTier === 'balanced' ? 0.12 : 0;
    const valueScore = w.cheap * cheapness + w.use * useNorm + balancedBoost;
    return {
      ...it,
      usefulness,
      valueScore: Number(valueScore.toFixed(6)),
      recommended: false,
    };
  });

  enriched.sort((a, b) => {
    // 准度适中优先，同准度再按价格便宜→贵（甜区：适中价+准度适中）
    const qa = a.qualityTier === 'balanced' ? 0 : 1;
    const qb = b.qualityTier === 'balanced' ? 0 : 1;
    if (qa !== qb) return qa - qb;
    const ta = PRICE_TIER_RANK[a.priceTier] ?? 9;
    const tb = PRICE_TIER_RANK[b.priceTier] ?? 9;
    if (ta !== tb) return ta - tb;
    if (b.valueScore !== a.valueScore) return b.valueScore - a.valueScore;
    return a.value.localeCompare(b.value);
  });

  // 推荐：排序靠前里，取真正好用的「准度适中」（避开廉价打包通道）
  const pick =
    enriched.find((x) => x.qualityTier === 'balanced' && x.usefulness >= 70) ||
    enriched.find((x) => x.qualityTier === 'balanced' && x.usefulness >= 55) ||
    enriched.find((x) => x.qualityTier === 'balanced') ||
    enriched[0];
  if (pick) pick.recommended = true;
  return enriched;
}

function buildBilling(row, groupRatio) {
  const quotaType = Number(row.quota_type) === 1 ? 1 : 0;
  if (quotaType === 1) {
    const perUsePoints = Math.round((Number(row.model_price) || 0) * POINTS_PER_CNY);
    return {
      billingType: 'fixed',
      billingLabel: '按次计费',
      perUsePoints,
      inputPoints: 0,
      outputPoints: 0,
      cacheReadPoints: 0,
      cacheCreatePoints: 0,
      priceLines: [
        {
          label: '模型价格',
          pointsText: `${fmtPoints(perUsePoints)} 积分 / 次`,
          cnyText: `${fmtCny(perUsePoints)} / 次`,
        },
      ],
      priceSummary: `${fmtCny(perUsePoints)} / 次 · ${fmtPoints(perUsePoints)} 积分`,
    };
  }

  const mr = Number(row.model_ratio) || 0;
  const cr = Number(row.completion_ratio) || 1;
  const cacheRatio = Number(row.cache_ratio) || 0;
  const createCacheRatio = Number(row.create_cache_ratio) || 0;
  const inputPoints = Math.round(mr * groupRatio * POINTS_PER_RATIO_AT_GROUP1);
  const outputPoints = Math.round(inputPoints * cr);
  const cacheReadPoints = cacheRatio > 0 ? Math.round(inputPoints * cacheRatio) : 0;
  const cacheCreatePoints = createCacheRatio > 0 ? Math.round(inputPoints * createCacheRatio) : 0;

  const priceLines = [
    {
      label: '输入价格',
      pointsText: `${fmtPoints(inputPoints)} 积分 / 百万 tokens`,
      cnyText: `${fmtCny(inputPoints)} / 百万 tokens`,
    },
    {
      label: '输出价格',
      pointsText: `${fmtPoints(outputPoints)} 积分 / 百万 tokens`,
      cnyText: `${fmtCny(outputPoints)} / 百万 tokens`,
    },
  ];
  if (cacheReadPoints > 0) {
    priceLines.push({
      label: '缓存读取',
      pointsText: `${fmtPoints(cacheReadPoints)} 积分 / 百万 tokens`,
      cnyText: `${fmtCny(cacheReadPoints)} / 百万 tokens`,
    });
  }
  if (cacheCreatePoints > 0) {
    priceLines.push({
      label: '缓存创建',
      pointsText: `${fmtPoints(cacheCreatePoints)} 积分 / 百万 tokens`,
      cnyText: `${fmtCny(cacheCreatePoints)} / 百万 tokens`,
    });
  }

  return {
    billingType: 'token',
    billingLabel: '按量计费',
    perUsePoints: 0,
    inputPoints,
    outputPoints,
    cacheReadPoints,
    cacheCreatePoints,
    priceLines,
    priceSummary: `输入 ${fmtCny(inputPoints)} · 输出 ${fmtCny(outputPoints)} / 百万 tokens`,
  };
}

function enrichRow(value, row, groupRatio, vendorOverride) {
  const base = row || {
    model_name: value,
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    completion_ratio: 1,
  };
  const billing = buildBilling(base, groupRatio);
  const qualityTier = qualityTierOf(value);
  return {
    value,
    vendor: vendorOverride || vendorOf(base),
    quotaType: Number(base.quota_type) === 1 ? 1 : 0,
    modelRatio: Number(base.model_ratio) || 0,
    completionRatio: Number(base.completion_ratio) || 0,
    modelPrice: Number(base.model_price) || 0,
    cacheRatio: Number(base.cache_ratio) || 0,
    createCacheRatio: Number(base.create_cache_ratio) || 0,
    groupRatio,
    ...billing,
    costScore: costScoreOf(billing),
    priceTier: 'fair',
    priceLabel: PRICE_LABEL.fair,
    qualityTier,
    qualityLabel: QUALITY_LABEL[qualityTier],
  };
}

function assignPriceTiers(items) {
  return items.map((it) => {
    const tier = priceTierOf(it);
    return {
      ...it,
      priceTier: tier,
      priceLabel: PRICE_LABEL[tier],
    };
  });
}

function toRows(names, rowsByName, groupRatio, extrasByName = new Map()) {
  return names.map((value) => {
    const extra = extrasByName.get(value);
    if (extra && !rowsByName.has(value)) {
      return enrichRow(
        value,
        {
          model_name: value,
          quota_type: extra.quotaType ?? 1,
          model_price: extra.modelPrice ?? 0,
          model_ratio: 0,
          completion_ratio: 0,
        },
        groupRatio,
        extra.vendor,
      );
    }
    return enrichRow(value, rowsByName.get(value) || { model_name: value }, groupRatio, extra?.vendor);
  });
}

function main() {
  if (!fs.existsSync(pricingPath)) {
    console.error('Missing pricing dump:', pricingPath);
    process.exit(1);
  }
  const pricing = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
  const rows = Array.isArray(pricing.data) ? pricing.data : [];
  const rowsByName = new Map(rows.map((r) => [String(r.model_name || '').trim(), r]));
  const extrasByName = new Map(VIDEO_EXTRAS.map((e) => [e.value, e]));
  const groupRatio = Number(pricing.group_ratio?.default) || 7;

  const seen = { chat: new Set(), image: new Set(), video: new Set() };
  const skip = [];

  for (const row of rows) {
    const name = String(row.model_name || '').trim();
    const kind = classify(row);
    if (kind === 'skip') {
      skip.push(name);
      continue;
    }
    if (seen[kind].has(name)) continue;
    seen[kind].add(name);
  }

  const chat = rankByValueAndRecommend(
    assignPriceTiers(toRows([...seen.chat], rowsByName, groupRatio)),
    'chat',
  );
  const image = rankByValueAndRecommend(
    assignPriceTiers(toRows([...seen.image], rowsByName, groupRatio)),
    'image',
  );

  const videoSeen = new Set(seen.video);
  for (const extra of VIDEO_EXTRAS) {
    if (!videoSeen.has(extra.value)) videoSeen.add(extra.value);
  }
  const video = rankByValueAndRecommend(
    assignPriceTiers(toRows([...videoSeen], rowsByName, groupRatio, extrasByName)),
    'video',
  );

  const catalog = {
    updatedAt: new Date().toISOString(),
    pricingVersion: pricing.pricing_version || null,
    source: 'openai-hk-pricing.json',
    docs: 'https://www.openai-hk.com/docs/openai/api-key.html',
    pointsPerCny: POINTS_PER_CNY,
    groupRatioDefault: groupRatio,
    recommended: {
      chat: chat.find((m) => m.recommended)?.value || null,
      image: image.find((m) => m.recommended)?.value || null,
      video: video.find((m) => m.recommended)?.value || null,
    },
    /** @deprecated use chat */
    models: chat,
    chat,
    image,
    video,
  };
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        groupRatio,
        recommended: catalog.recommended,
        topChat: chat.slice(0, 5).map((m) => ({
          value: m.value,
          price: m.priceLabel,
          quality: m.qualityLabel,
          use: m.usefulness,
          score: m.valueScore,
        })),
        topImage: image.slice(0, 3).map((m) => m.value),
        topVideo: video.map((m) => m.value),
      },
      null,
      2,
    ),
  );
  console.log('Wrote', catalogPath);
}

main();
