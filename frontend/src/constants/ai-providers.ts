import {
  AI_PROVIDER_META,
  PROVIDER_CHAT_MODELS,
  PROVIDER_IMAGE_MODELS,
  PROVIDER_VIDEO_MODELS,
  RECOMMENDED_CHAT_MODEL,
  RECOMMENDED_IMAGE_MODEL,
  RECOMMENDED_VIDEO_MODEL,
  VOLCENGINE_ARK_BASE,
  defaultModelFieldFor,
  defaultModelFor,
  defaultProviderFor,
  inferProviderFromModel,
  modelsFor,
  modelsForCapability,
  normalizeProviderId,
  providerFieldFor,
  providersForCapability,
  type AiCapability,
  type AiModelOption,
  type AiProviderId,
} from '@ai-video-studio/shared';

export {
  AI_PROVIDER_META,
  PROVIDER_CHAT_MODELS,
  PROVIDER_IMAGE_MODELS,
  PROVIDER_VIDEO_MODELS,
  RECOMMENDED_CHAT_MODEL,
  RECOMMENDED_IMAGE_MODEL,
  RECOMMENDED_VIDEO_MODEL,
  VOLCENGINE_ARK_BASE,
  defaultModelFieldFor,
  defaultModelFor,
  defaultProviderFor,
  inferProviderFromModel,
  modelsFor,
  modelsForCapability,
  normalizeProviderId,
  providerFieldFor,
  providersForCapability,
};

export type { AiCapability, AiModelOption, AiProviderId };

export const CAPABILITY_TABS: Array<{ id: AiCapability; label: string; hint: string }> = [
  { id: 'chat', label: '对话写作', hint: '大纲、章节正文与润色' },
  { id: 'image', label: '图像生成', hint: '封面、角色定妆、章节分镜' },
  { id: 'video', label: '视频生成', hint: '镜头图生视频' },
];

export function providerLabel(id: AiProviderId) {
  return AI_PROVIDER_META.find((m) => m.id === id)?.label || id;
}
