import { chatCompletion } from '@/api/ai-chat';
import type { WorkflowDocument } from '@ai-video-studio/shared';
import { normalizeVideoDuration, VIDEO_DURATION_DEFAULT } from '@/components/ai-prompt-input/prefs';

export type HomeAgentKind = 'image' | 'video' | 'pipeline';

export type HomeAgentPlan = {
  title: string;
  summary: string;
  kind: HomeAgentKind;
  style: string;
  imagePrompt: string;
  videoPrompt: string;
  aspect: string;
  durationSec: number;
  refMode: 'text' | 'frames' | 'omni';
};

function clampDuration(n: unknown, fallback: number = VIDEO_DURATION_DEFAULT) {
  return normalizeVideoDuration(n, fallback);
}

function normalizeKind(raw: unknown): HomeAgentKind {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'image' || s === 'img' || s === '图片' || s === '生图') return 'image';
  if (s === 'video' || s === 'vid' || s === '视频' || s === '文生视频') return 'video';
  return 'pipeline';
}

function normalizeRefMode(
  raw: unknown,
  hasReferenceImage: boolean,
): HomeAgentPlan['refMode'] {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'frames' || s === '首尾帧') return 'frames';
  if (s === 'text' || s === '文生' || s === '文生视频') return 'text';
  if (s === 'omni' || s === '全能' || s === '全能参考') return 'omni';
  return hasReferenceImage ? 'omni' : 'frames';
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence?.[1] || raw).trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* try brace slice */
  }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(body.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function fallbackPlan(
  prompt: string,
  opts?: { hasReferenceImage?: boolean; aspect?: string; durationSec?: number },
): HomeAgentPlan {
  const text = String(prompt || '').trim() || '根据参考创作短视频';
  const hasRef = !!opts?.hasReferenceImage;
  return {
    title: text.slice(0, 40),
    summary: '按默认管线理解：先出关键视觉，再生成成片视频。',
    kind: 'pipeline',
    style: '',
    imagePrompt: text,
    videoPrompt: text,
    aspect: opts?.aspect || '16:9',
    durationSec: clampDuration(opts?.durationSec, 10),
    refMode: hasRef ? 'omni' : 'frames',
  };
}

const SYSTEM_PROMPT = `你是 AI 漫剧工作流规划助手。用户会给出创作想法（可能含参考图说明）。
你的任务：先理解意图，再规划一条可在画布上执行的规范工作流。

只能输出一个 JSON 对象（不要 markdown 解释），字段如下：
{
  "title": "项目短标题，≤20字",
  "summary": "用 1～2 句中文说明你对用户意图的理解",
  "kind": "image | video | pipeline",
  "style": "风格关键词，可空",
  "imagePrompt": "规范的生图提示词（中文为主，含主体/场景/构图/光影；若 kind=video 可与 videoPrompt 相同）",
  "videoPrompt": "规范的视频提示词（含镜头运动与节奏；若 kind=image 可与 imagePrompt 相同）",
  "aspect": "21:9|16:9|4:3|1:1|3:4|9:16",
  "durationSec": 5|10|15|30（默认10）,
  "refMode": "text|frames|omni"
}

kind 选择规则：
- image：用户只要静帧/立绘/海报/设定图
- video：用户只要成片视频，且不必先生关键
- pipeline：默认；先关键视觉再视频（漫剧/短视频/角色动起来等）

refMode：
- 有参考图倾向 omni；纯文案文生视频用 text；明确首尾帧用 frames。`;

/** 调用对话模型理解用户意图，产出工作流规划 */
export async function planHomeAgentWorkflow(input: {
  prompt: string;
  hasReferenceImage?: boolean;
  aspect?: string;
  durationSec?: number;
  model?: string;
  /** 关闭「自动」时强制管线类型；开启自动时不传，由 AI 判断 */
  forceKind?: HomeAgentKind;
}): Promise<HomeAgentPlan> {
  const prompt = String(input.prompt || '').trim();
  const base = fallbackPlan(prompt, input);
  if (input.forceKind === 'image' || input.forceKind === 'video' || input.forceKind === 'pipeline') {
    base.kind = input.forceKind;
  }
  if (!prompt) return base;

  const user = [
    `用户需求：\n${prompt}`,
    input.hasReferenceImage ? '用户已上传参考图。' : '用户未上传参考图。',
    input.aspect ? `用户偏好比例：${input.aspect}` : '',
    input.durationSec ? `用户偏好时长：${input.durationSec}s` : '',
    input.forceKind
      ? `用户已指定工作流类型：${input.forceKind === 'image' ? '仅图片' : input.forceKind === 'video' ? '仅视频' : '生图到视频'}，请按此类型规划，不要改 kind。`
      : '请自行判断应生成图片、视频，还是生图→视频管线（kind）。',
    '请输出 JSON。',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      input.model,
    );
    const obj = extractJsonObject(raw);
    if (!obj) return base;

    const imagePrompt = String(obj.imagePrompt || obj.prompt || prompt).trim() || prompt;
    const videoPrompt = String(obj.videoPrompt || obj.prompt || imagePrompt).trim() || imagePrompt;
    const title = String(obj.title || '').trim() || prompt.slice(0, 40);
    const summary = String(obj.summary || obj.understanding || '').trim() || base.summary;
    const aspect = String(obj.aspect || input.aspect || '16:9').trim() || '16:9';
    const kind = input.forceKind || normalizeKind(obj.kind);

    return {
      title: title.slice(0, 40),
      summary: summary.slice(0, 240),
      kind,
      style: String(obj.style || '').trim().slice(0, 80),
      imagePrompt: imagePrompt.slice(0, 2000),
      videoPrompt: videoPrompt.slice(0, 2000),
      aspect,
      durationSec: clampDuration(obj.durationSec ?? input.durationSec, base.durationSec),
      refMode: normalizeRefMode(obj.refMode, !!input.hasReferenceImage),
    };
  } catch {
    return base;
  }
}

/** 按规划生成规范工作流：文本理解 →（可选）生图 →（可选）视频 */
export function buildHomeAgentWorkflowGraph(
  plan: HomeAgentPlan,
  opts?: {
    referenceImage?: string;
    imageModel?: string;
    videoModel?: string;
    quality?: string;
    count?: number;
  },
): WorkflowDocument {
  const referenceImage = String(opts?.referenceImage || '').trim();
  const aspect = plan.aspect || '16:9';
  const quality = String(opts?.quality || '').trim().toLowerCase();
  const size =
    quality === '4k'
      ? '4K'
      : quality === '2k' || quality === '1.5k'
        ? '2K'
        : quality === '1k'
          ? '1K'
          : '2K';
  const resolution = quality === '1080p' ? '1080p' : quality === '720p' ? '720p' : '480p';
  const count = Math.min(4, Math.max(1, Number(opts?.count) || 1));
  const imageModel = String(opts?.imageModel || '').trim();
  const videoModel = String(opts?.videoModel || '').trim();

  const brief = [
    plan.summary ? `【意图理解】${plan.summary}` : '',
    plan.style ? `【风格】${plan.style}` : '',
    `【管线】${
      plan.kind === 'image' ? '文生图' : plan.kind === 'video' ? '文生视频' : '生图 → 视频'
    }`,
    '',
    plan.kind === 'video' ? plan.videoPrompt : plan.imagePrompt,
  ]
    .filter(Boolean)
    .join('\n');

  const textNode = {
    id: 'txt',
    type: 'input.text' as const,
    label: '需求理解',
    position: { x: 40, y: 140 },
    params: {
      value: brief,
      inputKey: '',
      referenceImage: '',
    },
    mode: 'active' as const,
  };

  const imgNode = {
    id: 'img',
    type: 'ai.image' as const,
    label: '关键视觉',
    position: { x: 340, y: 100 },
    params: {
      model: imageModel,
      name: '',
      prompt: plan.imagePrompt,
      referenceImage,
      aspect,
      size,
      imageGrid: String(count),
      assetType: '',
    },
    mode: 'active' as const,
  };

  const vidRefMode =
    referenceImage && plan.refMode === 'text' ? 'frames' : plan.refMode || 'omni';

  const vidNode = {
    id: 'vid',
    type: 'ai.video' as const,
    label: '成片视频',
    position: { x: 640, y: 100 },
    params: {
      model: videoModel,
      durationSec: plan.durationSec || 10,
      name: '',
      prompt: plan.videoPrompt,
      endImage: '',
      referenceImage: plan.kind === 'video' ? referenceImage : '',
      aspect,
      resolution,
      refMode: plan.kind === 'pipeline' ? 'frames' : vidRefMode,
    },
    mode: 'active' as const,
  };

  if (plan.kind === 'image') {
    return {
      schemaVersion: 2,
      nodes: [textNode, { ...imgNode, position: { x: 360, y: 100 } }],
      edges: [
        {
          id: 'e_txt_img',
          source: 'txt',
          sourceHandle: 'text',
          target: 'img',
          targetHandle: 'image',
        },
      ],
      groups: [],
      meta: {
        kind: 'home_agent',
        agentKind: 'image',
        summary: plan.summary,
        title: plan.title,
      },
    };
  }

  if (plan.kind === 'video') {
    return {
      schemaVersion: 2,
      nodes: [textNode, { ...vidNode, position: { x: 360, y: 100 } }],
      edges: [
        {
          id: 'e_txt_vid',
          source: 'txt',
          sourceHandle: 'text',
          target: 'vid',
          targetHandle: 'image',
        },
      ],
      groups: [],
      meta: {
        kind: 'home_agent',
        agentKind: 'video',
        summary: plan.summary,
        title: plan.title,
      },
    };
  }

  // pipeline：文本 → 关键 → 视频（图作首帧）
  return {
    schemaVersion: 2,
    nodes: [textNode, imgNode, vidNode],
    edges: [
      {
        id: 'e_txt_img',
        source: 'txt',
        sourceHandle: 'text',
        target: 'img',
        targetHandle: 'image',
      },
      {
        id: 'e_img_vid',
        source: 'img',
        sourceHandle: 'image',
        target: 'vid',
        targetHandle: 'image',
      },
    ],
    groups: [],
    meta: {
      kind: 'home_agent',
      agentKind: 'pipeline',
      summary: plan.summary,
      title: plan.title,
    },
  };
}
