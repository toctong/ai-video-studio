/**
 * 从 OpenAI-HK /api/pricing 风格 JSON 生成精简目录。
 * 用法：node scripts/gen-openai-hk-catalog.mjs < pricing.json
 * 或：node scripts/gen-openai-hk-catalog.mjs path/to/pricing.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../src/openai-hk-catalog.json');

const arg = process.argv[2];
let raw;
if (arg && arg !== '-') {
  raw = fs.readFileSync(arg, 'utf8');
} else {
  raw = fs.readFileSync(0, 'utf8');
}

const payload = JSON.parse(raw);
const vendors = Object.fromEntries((payload.vendors || []).map((v) => [v.id, v.name]));

const SKIP =
  /^(dall-e|gpt-image|nano-banana|sora_|text-embedding|tts-|text-moderation|babbage|davinci|text-ada|text-curie|text-babbage|text-davinci|gpt-4-gizmo)/i;

const models = [];
for (const row of payload.data || []) {
  const name = String(row.model_name || '');
  if (!name || SKIP.test(name)) continue;
  const endpoints = row.supported_endpoint_types || [];
  const chatOk = endpoints.some((e) => ['openai', 'anthropic', 'gemini'].includes(e));
  const imageOnly =
    endpoints.includes('image-generation') &&
    !endpoints.some((e) => ['openai', 'anthropic', 'gemini'].includes(e));
  if (!chatOk || imageOnly) continue;
  if (/image|video/i.test(name) && !/chat|gpt-|claude|gemini|deepseek|grok|o[1-4]/i.test(name)) {
    continue;
  }
  if (/image-preview|sora_image|gpt-4o-image/i.test(name)) continue;

  models.push({
    value: name,
    vendor: vendors[row.vendor_id] || guessVendor(name),
    modelRatio: row.model_ratio ?? 0,
    completionRatio: row.completion_ratio ?? 0,
    quotaType: row.quota_type ?? 0,
    modelPrice: row.model_price ?? 0,
    endpoints,
  });
}

models.sort((a, b) => {
  const va = a.vendor.localeCompare(b.vendor, 'en');
  if (va) return va;
  return a.value.localeCompare(b.value, 'en');
});

fs.writeFileSync(outPath, JSON.stringify({ updatedAt: new Date().toISOString(), models }, null, 2));
console.log(`Wrote ${models.length} chat models → ${outPath}`);

function guessVendor(name) {
  const n = name.toLowerCase();
  if (n.startsWith('claude')) return 'Anthropic';
  if (n.startsWith('gemini')) return 'Google';
  if (n.startsWith('deepseek')) return 'DeepSeek';
  if (n.startsWith('grok')) return 'xAI';
  if (n.startsWith('gpt') || n.startsWith('o1') || n.startsWith('o3') || n.startsWith('o4') || n.startsWith('chatgpt'))
    return 'OpenAI';
  return 'Other';
}
