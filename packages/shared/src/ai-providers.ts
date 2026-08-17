/** 能力类型与模型选项形状；具体模型列表由 Hub catalog 提供，不再内置厂商目录。 */

export const AI_PROVIDER_IDS = ['volcengine'] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number] | string;

export const AI_CAPABILITIES = ['chat', 'image', 'video'] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export type AiProviderMeta = {
  id: AiProviderId;
  label: string;
  hint: string;
  defaultBaseUrl: string;
  color: string;
  capabilities?: AiCapability[];
};

export type AiPriceTier = 'cheap' | 'fair' | 'pricey' | 'costly';
export type AiQualityTier = 'basic' | 'balanced';
export type AiBillingType = 'token' | 'fixed';

export type AiPriceLine = {
  label: string;
  pointsText: string;
  cnyText: string;
};

export type AiModelOption = {
  label: string;
  value: string;
  description?: string;
  vendor?: string;
  tags?: string[];
  billingType?: AiBillingType;
  billingLabel?: string;
  priceTier?: AiPriceTier;
  priceLabel?: string;
  priceSummary?: string;
  priceLines?: AiPriceLine[];
  inputPoints?: number;
  outputPoints?: number;
  perUsePoints?: number;
  qualityTier?: AiQualityTier;
  qualityLabel?: string;
  costScore?: number;
  usefulness?: number;
  valueScore?: number;
  recommended?: boolean;
  contextWindow?: string;
  maxInput?: string;
  maxOutput?: string;
  ioInput?: Array<'text' | 'image' | 'video' | 'audio'>;
  ioOutput?: Array<'text' | 'image' | 'video' | 'audio'>;
  extraLimits?: Array<{ label: string; value: string }>;
};

export const VOLCENGINE_ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

/** 本端内置渠道（仅凭证；模型目录走 Hub） */
export const AI_PROVIDER_META: AiProviderMeta[] = [
  {
    id: 'volcengine',
    label: '火山方舟',
    hint: '豆包 Seed / Seedream / Seedance · 对话 · 出图 · 视频',
    defaultBaseUrl: VOLCENGINE_ARK_BASE,
    color: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    capabilities: ['chat', 'image', 'video'],
  },
];

export const RECOMMENDED_IMAGE_MODEL = '';
export const RECOMMENDED_CHAT_MODEL = '';
export const RECOMMENDED_VIDEO_MODEL = '';
export const RECOMMENDED_VOLC_IMAGE_MODEL = '';
/** @deprecated */
export const DEEPSEEK_RECOMMENDED_CHAT_MODEL = '';

export const PROVIDER_CHAT_MODELS: Record<string, AiModelOption[]> = {};
export const PROVIDER_IMAGE_MODELS: Record<string, AiModelOption[]> = {};
export const PROVIDER_VIDEO_MODELS: Record<string, AiModelOption[]> = {};

export const DEFAULT_PROVIDER_MODELS = {
  chat: {} as Record<string, string>,
  image: {} as Record<string, string>,
  video: {} as Record<string, string>,
};

export const LEGACY_DEFAULT_CHAT_MODELS = [] as const;
export const LEGACY_DEFAULT_IMAGE_MODELS = [] as const;
export const LEGACY_DEFAULT_VIDEO_MODELS = [] as const;

export type ProviderModelCapability = keyof typeof DEFAULT_PROVIDER_MODELS;

export function modelsFor(_capability: AiCapability, _provider?: AiProviderId): AiModelOption[] {
  return [];
}

export function modelsForCapability(_capability: AiCapability): AiModelOption[] {
  return [];
}

export function providersForCapability(_capability: AiCapability): AiProviderMeta[] {
  return [];
}

export function defaultProviderFor(_capability: AiCapability): AiProviderId {
  return 'volcengine';
}

export function defaultModelFor(
  _capability: ProviderModelCapability,
  _provider?: AiProviderId,
): string {
  return '';
}

export function providerFieldFor(
  capability: AiCapability,
): 'chatProvider' | 'imageProvider' | 'videoProvider' {
  if (capability === 'image') return 'imageProvider';
  if (capability === 'video') return 'videoProvider';
  return 'chatProvider';
}

export function defaultModelFieldFor(
  capability: AiCapability,
): 'defaultChatModel' | 'defaultImageModel' | 'defaultVideoModel' {
  if (capability === 'image') return 'defaultImageModel';
  if (capability === 'video') return 'defaultVideoModel';
  return 'defaultChatModel';
}

export function normalizeProviderId(raw?: string | null): AiProviderId {
  const n = String(raw || '').trim();
  // 已移除内置 openaiHk；旧设置回落到火山
  if (n === 'openaiHk' || /openai-hk|openaihk/i.test(n)) return 'volcengine';
  return n;
}

export function inferProviderFromBaseUrl(url?: string): AiProviderId {
  const u = String(url || '').toLowerCase();
  if (/volces\.com|volcengine|ark\./.test(u)) return 'volcengine';
  return '';
}

export function inferProviderFromModel(
  _capability: AiCapability,
  modelId: string,
): AiProviderId {
  const id = String(modelId || '').trim();
  if (/seedream|seedance|doubao-seed|deepseek-v4-|ep-/i.test(id)) return 'volcengine';
  return '';
}

export function looksLikeVolcArkApiKey(apiKey?: string | null): boolean {
  const k = String(apiKey || '').trim();
  if (k.length < 16) return false;
  if (/^(enc:|v1:|hk-|sk-proj-)/i.test(k)) return false;
  if (/^sk-[a-zA-Z0-9]{20,}$/i.test(k)) return false;
  return true;
}

export function findModelOption(
  _capability: AiCapability,
  _modelId: string,
): AiModelOption | undefined {
  return undefined;
}

export function isVolcengineImageModel(modelId: string): boolean {
  return /seedream/i.test(String(modelId || ''));
}

/** OpenAI Images 系模型（gpt-image / dall-e 等），需通过 Hub 渠道调用 */
export function isGptImageModel(modelId: string): boolean {
  return /^(gpt-image|chatgpt-image|dall-e)/i.test(String(modelId || '').trim());
}

/** @deprecated 使用 isGptImageModel */
export const isOpenaiHkImageModel = isGptImageModel;
