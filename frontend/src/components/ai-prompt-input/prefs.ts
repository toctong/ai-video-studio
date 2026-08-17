export type PromptMediaKind = 'image' | 'video';

export type PromptPrefOption = {
  label: string;
  value: string;
  icon?: string;
  description?: string;
  tags?: string[];
  recommended?: boolean;
  vendor?: string;
  /** New / Beta 等角标 */
  badge?: string;
  disabled?: boolean;
};

export type PromptGenPrefs = {
  /** 自动模式：由系统决定比例等 */
  auto: boolean;
  mediaKind: PromptMediaKind;
  /** 'auto' | '21:9' | '16:9' | ... */
  aspectRatio: string;
  /** 真实 model id，须来自 shared 模型表 */
  model: string;
  /** 清晰度档位：1k | 2k | 4k | 720p | 1080p 等 */
  quality: string;
  /** 生成数量 */
  count: number;
  /** 视频时长（秒） */
  durationSec: number;
  /** 视频参考模式：text | frames | omni */
  refMode: 'text' | 'frames' | 'omni';
};

export type PromptModeOption = {
  label: string;
  value: string;
  icon?: string;
  disabled?: boolean;
};

export const ASPECT_RATIO_OPTIONS: Array<{
  value: string;
  label: string;
  /** 预览框宽高比，用于画小图标 */
  w: number;
  h: number;
}> = [
  { value: '21:9', label: '21:9', w: 22, h: 10 },
  { value: '16:9', label: '16:9', w: 20, h: 11 },
  { value: '4:3', label: '4:3', w: 16, h: 12 },
  { value: '1:1', label: '1:1', w: 14, h: 14 },
  { value: '3:4', label: '3:4', w: 12, h: 16 },
  { value: '9:16', label: '9:16', w: 11, h: 20 },
];

/** 将 shared AiModelOption 转为底栏选项（勿手写假模型） */
export function aiModelsToPrefOptions(
  models: Array<{
    label: string;
    value: string;
    description?: string;
    tags?: string[];
    recommended?: boolean;
    vendor?: string;
  }>,
): PromptPrefOption[] {
  return models.map((m) => {
    const tags = Array.isArray(m.tags) ? m.tags : [];
    let badge = '';
    if (m.recommended || tags.includes('推荐')) badge = '荐';
    else if (tags.includes('旗舰') || tags.includes('New') || tags.includes('新')) badge = 'New';
    return {
      label: m.label,
      value: m.value,
      description: m.description,
      tags,
      recommended: !!m.recommended,
      vendor: m.vendor,
      badge: badge || undefined,
    };
  });
}

export const DEFAULT_QUALITY_OPTIONS: PromptPrefOption[] = [
  { label: '1K', value: '1k' },
  { label: '1.5K', value: '1.5k' },
  { label: '2K', value: '2k' },
  { label: '4K', value: '4k' },
];

export const VIDEO_QUALITY_OPTIONS: PromptPrefOption[] = [
  { label: '480P', value: '480p' },
  { label: '720P', value: '720p' },
  { label: '1080P', value: '1080p' },
];

/** 参考模式：已接入能力可点；其余仅展示（与画布一致） */
export const VIDEO_REF_MODE_OPTIONS: PromptPrefOption[] = [
  { label: '全能参考', value: 'omni', icon: '∞', description: '多模态参考生成' },
  { label: '首尾帧', value: 'frames', icon: '▤', description: '指定首帧与尾帧' },
  { label: '文生视频', value: 'text', icon: 'T', description: '纯文本生成' },
  {
    label: '智能多帧',
    value: 'multiframe',
    icon: '▣',
    badge: 'Beta',
    disabled: true,
    description: '即将支持',
  },
  {
    label: '智能编辑',
    value: 'edit',
    icon: '✎',
    badge: 'Beta',
    disabled: true,
    description: '即将支持',
  },
  {
    label: '超长视频',
    value: 'long',
    icon: '♪',
    badge: 'Beta',
    disabled: true,
    description: '即将支持',
  },
];

export const HOME_CREATE_MODES: PromptModeOption[] = [
  { label: 'Agent', value: 'agent', icon: '〰' },
  { label: '图片', value: 'image', icon: '🖼' },
  { label: '视频', value: 'video', icon: '▶' },
];

export const VIDEO_DURATION_STEPS = [5, 10, 15, 30] as const;
export type VideoDurationSec = (typeof VIDEO_DURATION_STEPS)[number];
export const VIDEO_DURATION_MIN = VIDEO_DURATION_STEPS[0];
export const VIDEO_DURATION_MAX = VIDEO_DURATION_STEPS[VIDEO_DURATION_STEPS.length - 1];
export const VIDEO_DURATION_DEFAULT = 10 as VideoDurationSec;

/** 吸附到 5 / 10 / 15 / 30 */
export function normalizeVideoDuration(
  n: unknown,
  fallback: number = VIDEO_DURATION_DEFAULT,
): VideoDurationSec {
  const v = Number(n);
  const base = Number.isFinite(v) && v > 0 ? v : fallback;
  let best: VideoDurationSec = VIDEO_DURATION_DEFAULT;
  let bestDiff = Infinity;
  for (const step of VIDEO_DURATION_STEPS) {
    const d = Math.abs(step - base);
    if (d < bestDiff) {
      bestDiff = d;
      best = step;
    }
  }
  return best;
}

/** @deprecated 已废弃：请用 aiModelsToPrefOptions(modelsForCapability(...)) */
export const DEFAULT_IMAGE_MODELS: PromptPrefOption[] = [];
/** @deprecated 已废弃：请用 aiModelsToPrefOptions(modelsForCapability(...)) */
export const DEFAULT_VIDEO_MODELS: PromptPrefOption[] = [];

export const VIDEO_DURATION_OPTIONS: PromptPrefOption[] = VIDEO_DURATION_STEPS.map((s) => ({
  label: `${s}s`,
  value: String(s),
}));

export function createDefaultPrefs(
  partial?: Partial<PromptGenPrefs>,
): PromptGenPrefs {
  const kind = partial?.mediaKind || 'image';
  const base: PromptGenPrefs = {
    auto: true,
    mediaKind: kind,
    aspectRatio: '16:9',
    model: '',
    quality: kind === 'video' ? '480p' : '1.5k',
    count: 1,
    durationSec: VIDEO_DURATION_DEFAULT,
    refMode: 'omni',
  };
  return {
    ...base,
    ...partial,
    model: String(partial?.model || '').trim() || base.model,
    durationSec: normalizeVideoDuration(partial?.durationSec ?? base.durationSec),
  };
}

/** 将比例 + 清晰度映射为 OpenAI 风格 size 字符串 */
export function prefsToImageSize(prefs: PromptGenPrefs): string {
  const ratio = prefs.auto || prefs.aspectRatio === 'auto' ? '1:1' : prefs.aspectRatio;
  const map: Record<string, { base: string; wide: string; tall: string }> = {
    '1:1': { base: '1024x1024', wide: '1024x1024', tall: '1024x1024' },
    '16:9': { base: '1792x1024', wide: '1792x1024', tall: '1024x1792' },
    '9:16': { base: '1024x1792', wide: '1792x1024', tall: '1024x1792' },
    '21:9': { base: '1792x1024', wide: '1792x1024', tall: '1024x1792' },
    '3:2': { base: '1792x1024', wide: '1792x1024', tall: '1024x1792' },
    '4:3': { base: '1024x1024', wide: '1792x1024', tall: '1024x1792' },
    '3:4': { base: '1024x1792', wide: '1792x1024', tall: '1024x1792' },
    '2:3': { base: '1024x1792', wide: '1792x1024', tall: '1024x1792' },
  };
  const entry = map[ratio] || map['1:1'];
  if (ratio === '1:1') return entry.base;
  const [a, b] = ratio.split(':').map(Number);
  if (a > b) return entry.wide;
  if (a < b) return entry.tall;
  return entry.base;
}
