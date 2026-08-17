import { isMultiImageGrid, resolveImageGrid, type AssetType } from '@ai-video-studio/shared';
import {
  buildCharacterProportionLock,
  buildCharacterSheetLayoutLock,
  buildCharacterSheetNegative,
  buildImageGridLayoutLock,
  buildImageGridNegative,
} from '../../ai/visual-prompt';
import type { WorkflowNodeDefinition } from './types';
import { asNumber, asText, htmlToPlainText, port, workflowAssetMeta } from './types';

/** Seedream 显式 WxH 下限：宽×高 ≥ 3686400（2560×1440 / 1440×2560） */
const SEEDREAM_MIN_PIXELS = 3686400;

function seedreamSizeForAspect(aspect: string): string {
  const a = String(aspect || '').trim();
  if (a === '9:16' || /9\s*[:/]\s*16/.test(a)) return '1440x2560';
  if (a === '3:4' || /3\s*[:/]\s*4/.test(a)) return '1728x2304';
  if (a === '4:3' || /4\s*[:/]\s*3/.test(a)) return '2304x1728';
  if (a === '1:1' || /1\s*[:/]\s*1/.test(a)) return '2048x2048';
  if (a === '16:9' || /16\s*[:/]\s*9/.test(a)) return '2560x1440';
  return '2560x1440';
}

/** 把 1K/2K 或过小的 WxH 升到 Seedream 可接受尺寸 */
function resolveSeedreamImageSize(sizeRaw: string, aspect: string): string {
  const size = String(sizeRaw || '').trim() || '1K';
  if (!/^\d+x\d+$/i.test(size)) {
    return seedreamSizeForAspect(aspect);
  }
  const [ws, hs] = size.toLowerCase().split('x');
  const w = Number(ws) || 0;
  const h = Number(hs) || 0;
  if (w > 0 && h > 0 && w * h >= SEEDREAM_MIN_PIXELS) {
    return `${w}x${h}`;
  }
  return seedreamSizeForAspect(aspect);
}

export const aiNodes: WorkflowNodeDefinition[] = [
  {
    type: 'ai.chat',
    title: 'AI 对话',
    category: 'AI',
    description: 'Agent：可连文本/参考图，在画布上派发创作任务',
    inputs: [
      port('prompt', '提示', 'text', true),
      port('image', '参考图', 'image', true),
    ],
    outputs: [port('text', '回复', 'text')],
    defaultParams: {
      model: '',
      system: '',
      prompt: '',
      referenceImage: '',
      agentMode: 'agent',
      timeoutMs: 120_000,
    },
    paramSchema: [
      { key: 'model', label: '模型', type: 'string', placeholder: '留空用默认' },
      { key: 'system', label: '系统提示', type: 'textarea' },
      { key: 'prompt', label: '任务', type: 'textarea' },
      { key: 'referenceImage', label: '参考图 URL', type: 'image' },
      { key: 'agentMode', label: '模式', type: 'string' },
      { key: 'timeoutMs', label: '超时(ms)', type: 'number', min: 5000, max: 600_000, step: 1000 },
    ],
    async execute(ctx) {
      const prompt = asText(ctx.inputs.prompt || ctx.params.prompt);
      if (!prompt.trim()) throw new Error('ai.chat 需要 prompt');
      const refs = collectImageUrls(ctx.inputs);
      const paramRef = asText(ctx.params.referenceImage).trim();
      if (paramRef && !refs.includes(paramRef)) refs.unshift(paramRef);
      let system = asText(ctx.params.system) || '你是有用的创作助手，可基于参考图与画布上下文协助创作。';
      const agentMode = asText(ctx.params.agentMode).trim().toLowerCase() || 'agent';
      const agentIntent = asText(ctx.params.agentIntent).trim().toLowerCase();
      if (agentIntent === 'ask') {
        system = `${system}\n当前是「询问澄清」模式：先用简短问题确认目标、约束与交付物，不要直接长篇输出成品；每轮最多问 3 个关键问题。`;
      } else if (agentMode === 'agent') {
        system = `${system}\n当前是 Agent 模式：理解用户任务后给出可执行建议；若用户要出图/视频，说明应落到画布对应节点，不要假装已生成媒体文件。`;
      }
      if (refs.length) {
        system = `${system}\n用户提供了 ${refs.length} 张参考图（已在工作流中连线），请结合其视觉内容理解需求。`;
      }
      const model = asText(ctx.params.model) || undefined;
      const timeoutMs = asNumber(ctx.params.timeoutMs, 120_000);
      await ctx.progress(refs.length ? `Agent 处理中（${refs.length} 张参考）…` : 'Agent 处理中…');
      const text = await ctx.services.ai.chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        model,
        { signal: ctx.signal, timeoutMs: timeoutMs > 0 ? timeoutMs : undefined },
      );
      return { text: String(text || ''), referenceImage: refs[0] || '' };
    },
  },
  {
    type: 'ai.image',
    title: 'AI 生图',
    category: 'AI',
    description: '文生图 / 图生图：节点上写提示词，可连参考图（豆包 Seedream）',
    inputs: [
      port('prompt', '提示词', 'text', true),
      port('image', '参考图', 'image', true),
    ],
    outputs: [port('image', '图片', 'image')],
    defaultParams: {
      model: '',
      name: 'workflow-image',
      prompt: '',
      referenceImage: '',
      /** 与 ai.video 默认宽高比保持一致 */
      aspect: '16:9',
      size: '1K',
      imageGrid: '1',
      assetType: '',
    },
    paramSchema: [
      { key: 'name', label: '名称', type: 'string' },
      { key: 'model', label: '模型', type: 'string', placeholder: '留空用默认' },
      { key: 'prompt', label: '提示词', type: 'textarea', placeholder: '也可在节点上直接输入' },
      { key: 'referenceImage', label: '参考图 URL', type: 'image' },
      { key: 'aspect', label: '比例', type: 'string' },
      { key: 'size', label: '分辨率', type: 'string', placeholder: '1K / 2K / 4K' },
      {
        key: 'imageGrid',
        label: '构图宫格',
        type: 'select',
        options: [
          { label: '单图', value: '1' },
          { label: '4 宫格', value: '4' },
          { label: '9 宫格', value: '9' },
          { label: '16 宫格', value: '16' },
          { label: '25 宫格', value: '25' },
        ],
      },
    ],
    async execute(ctx) {
      // 输入框自定义优先；未填时才用上游连线文案兜底
      let prompt = htmlToPlainText(ctx.params.prompt || ctx.inputs.prompt);
      // 多文案偶发落成数组
      if (!prompt.trim() && Array.isArray(ctx.inputs.prompt)) {
        prompt = (ctx.inputs.prompt as unknown[])
          .map((x) => htmlToPlainText(x))
          .filter(Boolean)
          .join('\n');
      }
      if (!prompt.trim()) throw new Error('ai.image 需要提示词（在弹框中填写，或连接文本节点）');
      const citedImages = parseUrlListParam(ctx.params.citedImageUrls);
      const connected = collectImageUrls(ctx.inputs);
      const paramRef = asText(ctx.params.referenceImage).trim();
      // 有 @ 图片引用时只下发被引用的图（按 @ 顺序）；否则沿用连线/参数参考
      const refs = citedImages.length
        ? citedImages
        : (() => {
            const list = [...connected];
            if (paramRef && !list.includes(paramRef)) list.unshift(paramRef);
            return list;
          })();
      const model = asText(ctx.params.model) || undefined;
      const assetTypeRaw = asText(ctx.params.assetType);
      const assetNameHint = asText(ctx.params.name) || nameFromPrompt(prompt, '图片');
      const resolvedType = resolveImageAssetType(assetTypeRaw, assetNameHint);
      // 关键帧强制单图，忽略宫格
      const forceSingle =
        resolvedType === 'keyframe' || /关键帧|keyframe/i.test(assetNameHint);
      const grid = forceSingle
        ? resolveImageGrid('1')
        : resolveImageGrid(asText(ctx.params.imageGrid));
      const multiGrid = isMultiImageGrid(grid.id);
      let aspect = asText(ctx.params.aspect).trim();
      if (multiGrid) aspect = '1:1';
      let size = asText(ctx.params.size).trim();
      // 仅 Seedream 强制大像素；默认 gpt-image 用官方三档尺寸
      if (model && /seedream/i.test(model)) {
        size = resolveSeedreamImageSize(size || '1K', multiGrid ? '1:1' : aspect);
      } else if (multiGrid) {
        size = '1536x1536';
      } else if (!size || /^\d+x\d+$/i.test(size) || /^[124]k$/i.test(size)) {
        if (/9:?16|portrait|竖/i.test(aspect) || /1440x2560|1024x1536|720x1280/i.test(size)) {
          size = '1024x1536';
        } else if (/1:?1|square/i.test(aspect) || /1024x1024/i.test(size)) {
          size = '1024x1024';
        } else {
          size = '1536x1024';
        }
      }
      // 竖版单人定妆 ≠ 工业设定板；勿对 bust 注入五区 sheet 硬锁
      const isCharacterBust =
        resolvedType === 'other' ||
        /竖版定妆|半身定妆|character_bust/i.test(assetNameHint);
      const isCharacterSheet =
        !isCharacterBust &&
        (resolvedType === 'character_ref' ||
          /设定板|character\s*sheet|concept design sheet/i.test(assetNameHint));
      const gridLock = multiGrid ? buildImageGridLayoutLock(grid.rows, grid.cols) : '';
      const sheetLock = buildCharacterSheetLayoutLock();
      const singleFrameLock =
        '【构图硬锁】输出必须是一张完整单帧电影画面（单一连续空间与时间瞬间）。严禁漫画分格、四格/多格连页、故事板网格、角色设定展示板、三视图拼贴、分屏、画中画、九宫格、缩略图拼版、contact sheet。不要做成一张图里多个小格的漫画风格展示图。';
      let finalPrompt = prompt.trim();
      if (multiGrid) {
        if (!/宫格硬锁|equal grid/i.test(finalPrompt)) {
          finalPrompt = `${finalPrompt}\n${gridLock}`;
        }
      } else if (isCharacterSheet) {
        // 设定板用途：注入完整概念设定板布局；切勿套单帧硬锁（那会禁止拼版）
        if (
          !/布局硬锁|concept design sheet|Character design sheet|Front\s*\/\s*Side\s*\/\s*Back/i.test(
            finalPrompt,
          )
        ) {
          finalPrompt = `${sheetLock}\n【角色外观与气质】${finalPrompt}`;
        } else if (!/体型硬锁|头身/.test(finalPrompt)) {
          finalPrompt = `${finalPrompt}\n${buildCharacterProportionLock({ ageHint: finalPrompt })}`;
        }
      } else if (!/构图硬锁|严禁漫画分格|单帧电影/.test(finalPrompt)) {
        finalPrompt = `${finalPrompt}\n${singleFrameLock}`;
      }
      await ctx.progress(
        multiGrid
          ? `AI 生图中（${grid.label}）…`
          : isCharacterSheet
            ? '角色设定板生成中…'
            : refs.length
              ? '图生图中…'
              : 'AI 生图中…',
      );
      const negativePrompt = isCharacterSheet
        ? buildCharacterSheetNegative()
        : buildImageGridNegative(grid.rows, grid.cols);
      const rows = await ctx.services.ai.generateImage(finalPrompt, {
        model,
        signal: ctx.signal,
        size,
        referenceImage: refs[0] || undefined,
        referenceImages: refs.length ? refs : undefined,
        negativePrompt,
      });
      const first = rows?.[0];
      // 优先 https 在线链接（Hub / Seedream）；无 URL 再用 b64
      let imageUrl = asText(first?.url);
      if (!imageUrl && first?.b64_json) {
        imageUrl = `data:image/png;base64,${first.b64_json}`;
      }
      if (!imageUrl) throw new Error('AI 生图未返回图片');
      if (ctx.projectId) {
        const assetName = asText(ctx.params.name) || nameFromPrompt(prompt, '图片');
        const assetType = resolveImageAssetType(asText(ctx.params.assetType), assetName);
        const asset = await ctx.services.assets.createGenerationAsset(ctx.projectId, {
          type: assetType,
          name: assetName,
          url: imageUrl,
          prompt: finalPrompt,
          meta: workflowAssetMeta(ctx, {
            node: 'ai.image',
            model: model || '',
            refCount: refs.length,
            assetType,
          }),
        });
        const prefer = ctx.services.assets.resolveMediaUrl(asset);
        if (!prefer) {
          throw new Error('生图结果未能入库对象存储，请检查 MinIO 配置后重试');
        }
        return {
          image: prefer,
          assetRef: asset.id,
          name: asset.name || assetName,
          // 生图接口实际传入（含构图硬锁），供「生成信息」展示；勿回填输入框
          prompt: finalPrompt.trim(),
        };
      }
      return {
        image: imageUrl,
        name: asText(ctx.params.name) || nameFromPrompt(prompt, '图片'),
        prompt: finalPrompt.trim(),
      };
    },
  },
  {
    type: 'ai.video',
    title: 'AI 视频',
    category: 'AI',
    description: '图+文生视频：节点上写提示词，可连参考图/首帧（豆包 Seedance）',
    inputs: [
      port('prompt', '提示词', 'text', true),
      port('image', '参考图', 'image', true),
      port('endImage', '尾帧', 'image', true),
      port('video', '参考视频', 'video', true),
    ],
    outputs: [port('video', '视频', 'video')],
    defaultParams: {
      model: '',
      durationSec: 5,
      name: 'workflow-video',
      prompt: '',
      referenceImage: '',
      endImage: '',
      /** 与 ai.image 默认宽高比保持一致 */
      aspect: '16:9',
      resolution: '480p',
      imageSize: '',
      /** text=文生视频；frames=首尾帧；omni=全能参考（全部 reference_image） */
      refMode: 'text',
    },
    paramSchema: [
      { key: 'name', label: '名称', type: 'string' },
      { key: 'model', label: '模型', type: 'string', placeholder: '留空用默认' },
      { key: 'prompt', label: '提示词', type: 'textarea', placeholder: '在节点弹框中填写' },
      { key: 'referenceImage', label: '参考图 URL', type: 'image' },
      {
        key: 'refMode',
        label: '参考模式',
        type: 'select',
        options: [
          { label: '文生视频', value: 'text' },
          { label: '首尾帧', value: 'frames' },
          { label: '全能参考', value: 'omni' },
        ],
      },
      { key: 'durationSec', label: '时长(秒)', type: 'number', min: 1, max: 30, step: 1 },
      { key: 'aspect', label: '比例', type: 'string' },
      { key: 'resolution', label: '清晰度', type: 'string' },
      { key: 'imageSize', label: '尺寸', type: 'string' },
      { key: 'endImage', label: '尾帧 URL', type: 'image' },
    ],
    async execute(ctx) {
      // 输入框自定义优先；未填时才用上游连线文案兜底
      let prompt = htmlToPlainText(ctx.params.prompt || ctx.inputs.prompt);
      if (!prompt.trim() && Array.isArray(ctx.inputs.prompt)) {
        prompt = (ctx.inputs.prompt as unknown[])
          .map((x) => htmlToPlainText(x))
          .filter(Boolean)
          .join('\n');
      }
      if (!prompt.trim()) throw new Error('ai.video 需要提示词（在弹框中填写，或连接文本节点）');

      const citedImages = parseUrlListParam(ctx.params.citedImageUrls);
      const citedVideos = parseUrlListParam(ctx.params.citedVideoUrls);
      const connectedImages = collectImageUrls(ctx.inputs);
      const connectedVideos = collectVideoUrls(ctx.inputs).slice(0, 3);
      const paramRef = asText(ctx.params.referenceImage).trim();
      const imageList = citedImages.length
        ? citedImages
        : (() => {
            const list = [...connectedImages];
            if (paramRef && !list.includes(paramRef)) list.unshift(paramRef);
            return list;
          })();
      const videoList = citedVideos.length ? citedVideos.slice(0, 3) : connectedVideos;
      const refMode = asText(ctx.params.refMode).trim().toLowerCase() || 'text';
      const textOnly =
        refMode === 'text' || refMode === 't2v' || refMode === '文生' || refMode === '文生视频';
      const omniRef =
        !textOnly && (refMode === 'omni' || refMode === '全能' || refMode === '全能参考');

      let image = imageList[0] || '';
      let endImage = '';
      let referenceImageUrls: string[] = [];
      let referenceVideoUrls: string[] = [];

      if (textOnly) {
        // 文生视频：忽略参考图/首尾帧
        image = '';
        endImage = '';
        referenceImageUrls = [];
        referenceVideoUrls = [];
      } else if (omniRef) {
        // 全能参考：全部进 reference_image / reference_video，不走首尾帧；图≤9、视频≤3
        image = '';
        endImage = '';
        referenceImageUrls = imageList.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 9);
        referenceVideoUrls = videoList;
        if (!referenceImageUrls.length && !referenceVideoUrls.length) {
          throw new Error('全能参考模式需要至少 1 张参考图或 1 段参考视频');
        }
      } else {
        const endFromPort = asText(ctx.inputs.endImage) || asText(ctx.params.endImage) || '';
        // 尾帧口优先；未接尾帧且参考口恰有 2 张时，第二张仍当尾帧（兼容旧图）
        endImage = endFromPort || (imageList.length === 2 ? imageList[1] : '') || '';
        // 有独立尾帧时：参考口第 2 张起作中景等动作参考
        referenceImageUrls = endFromPort
          ? imageList
              .slice(1)
              .map((u) => String(u || '').trim())
              .filter((u) => u && u !== endImage)
          : [];
      }
      // 不要把图片 URL 拼进 prompt（尤其是 data URL），会导致豆包 400
      const finalPrompt = prompt;

      const model = asText(ctx.params.model) || undefined;
      const durationSec = asNumber(ctx.params.durationSec, 5);
      const resolution = asText(ctx.params.resolution).trim() || '480p';
      const aspect = asText(ctx.params.aspect).trim() || '16:9';
      const imageSize =
        asText(ctx.params.imageSize).trim() ||
        (resolution === '480p'
          ? /9\s*[:/]\s*16/.test(aspect)
            ? '480x854'
            : /1\s*[:/]\s*1/.test(aspect)
              ? '640x640'
              : '854x480'
          : resolution === '720p'
            ? /9\s*[:/]\s*16/.test(aspect)
              ? '720x1280'
              : /1\s*[:/]\s*1/.test(aspect)
                ? '720x720'
                : '1280x720'
            : /9\s*[:/]\s*16/.test(aspect)
              ? '1080x1920'
              : /1\s*[:/]\s*1/.test(aspect)
                ? '1080x1080'
                : '1920x1080');
      await ctx.progress(
        textOnly
          ? '文生视频中…'
          : omniRef
            ? `全能参考生视频中（图 ${referenceImageUrls.length} · 视频 ${referenceVideoUrls.length}）…`
            : endImage && referenceImageUrls.length
              ? '首尾帧+动作参考生视频中…'
              : endImage
                ? '首尾帧生视频中…'
                : image
                  ? '图生视频中…'
                  : '文生视频中…',
      );
      const out = await ctx.services.ai.generateVideo(finalPrompt, {
        model,
        signal: ctx.signal,
        imageUrl: image || undefined,
        endImageUrl: endImage || undefined,
        referenceImageUrls: referenceImageUrls.length ? referenceImageUrls : undefined,
        referenceVideoUrls: referenceVideoUrls.length ? referenceVideoUrls : undefined,
        omniRef,
        durationSec,
        imageSize,
        resolution,
        onProgress: async (msg) => ctx.progress(msg),
      });
      const videoUrl = asText(out?.url);
      if (!videoUrl) throw new Error('AI 视频未返回地址');
      if (ctx.projectId) {
        const asset = await ctx.services.assets.createGenerationAsset(ctx.projectId, {
          type: 'video',
          name: asText(ctx.params.name) || nameFromPrompt(prompt, '视频'),
          url: videoUrl,
          prompt: finalPrompt,
          meta: workflowAssetMeta(ctx, {
            node: 'ai.video',
            model: model || '',
            refMode: textOnly ? 'text' : omniRef ? 'omni' : 'frames',
            hasStartFrame: Boolean(image),
            hasEndFrame: Boolean(endImage),
            midRefCount: referenceImageUrls.length,
            refCount: imageList.length + (endImage && !imageList.includes(endImage) ? 1 : 0),
          }),
        });
        const prefer = ctx.services.assets.resolveMediaUrl(asset);
        if (!prefer) {
          throw new Error('视频结果未能入库对象存储，请检查 MinIO 配置后重试');
        }
        const posterUrl = String((asset.meta as any)?.posterUrl || '').trim();
        return {
          video: prefer,
          ...(posterUrl ? { poster: posterUrl, image: posterUrl } : {}),
          assetRef: asset.id,
          name: asset.name || asText(ctx.params.name) || nameFromPrompt(prompt, '视频'),
          prompt: String(finalPrompt || '').trim(),
        };
      }
      return {
        video: videoUrl,
        name: asText(ctx.params.name) || nameFromPrompt(prompt, '视频'),
        prompt: String(finalPrompt || '').trim(),
      };
    },
  },
];

function collectImageUrls(inputs: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const x of v) push(x);
      return;
    }
    const s = asText(v).trim();
    if (s && !out.includes(s)) out.push(s);
  };
  push(inputs.images);
  push(inputs.image);
  return out;
}

function collectVideoUrls(inputs: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const x of v) push(x);
      return;
    }
    const s = asText(v).trim();
    if (s && !out.includes(s)) out.push(s);
  };
  push(inputs.videos);
  push(inputs.video);
  return out;
}

function parseUrlListParam(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => asText(x).trim()).filter(Boolean);
  }
  const s = asText(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => asText(x).trim()).filter(Boolean);
    }
  } catch {
    /* not json */
  }
  return s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function nameFromPrompt(prompt: string, kind: '图片' | '视频') {
  const t = String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  if (!t) return kind;
  return t.length >= 24 ? `${t}…` : t;
}

/** 按节点参数/名称区分角色定妆、场景、关键帧；普通画布生图归「其他」，勿默认分镜 */
function resolveImageAssetType(explicit: string, name: string): AssetType {
  const e = String(explicit || '').trim();
  const n = String(name || '');
  if (/竖版定妆|半身定妆|character_bust/i.test(n) || e === 'character_bust') {
    return 'other';
  }
  if (e === 'scene_ref') return 'scene';
  if (
    e === 'character_ref' ||
    e === 'scene' ||
    e === 'keyframe' ||
    e === 'storyboard' ||
    e === 'cover' ||
    e === 'other'
  ) {
    return e;
  }
  // 名称含「场景」优先于设定板误判（旧画布 title 可能只有地点名）
  if (/^场景|场景图|场景底图|scene/i.test(n) && !/关键帧|分镜|4宫格|宫格/.test(n)) {
    return 'scene';
  }
  if (/场景4宫格|4宫格·|剧情宫格|plot.?grid|storyboard.?grid|分镜/i.test(n)) {
    return 'storyboard';
  }
  if (/设定板|character\s*sheet|concept design/i.test(n)) return 'character_ref';
  if (/定妆|角色定妆|portrait|character/i.test(n)) return 'character_ref';
  if (/关键帧|keyframe|首帧|尾帧/i.test(n)) return 'keyframe';
  // 画布普通生图（图片1 / 提示词截断名等）→ 其他，避免全进「分镜」
  return 'other';
}
