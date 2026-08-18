import api from '@/api';
import type { AiCapability, AiModelOption } from '@/constants/ai-providers';

export type HubChannelDto = {
  id?: string;
  slug: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  category?: string;
  endpointType?: string;
  baseUrlHint?: string;
  website?: string;
  apiPrefix?: string;
  apiStyle?: string;
  paths?: Record<string, string>;
  modelCount?: number;
  official?: boolean;
  group?: string;
  sort?: number;
  pulledAt?: string;
  updatedAt?: string;
};

export type HubModelDto = {
  id?: string;
  slug?: string;
  title?: string;
  label?: string;
  modelId: string;
  channelSlug: string;
  channelTitle?: string;
  channelLogo?: string | null;
  coverUrl?: string | null;
  category?: string;
  endpointType?: string;
  baseUrlHint?: string;
  apiStyle?: string;
  modalities?: string[];
  enabled?: boolean;
  recommended?: boolean;
  contextWindow?: number | string | null;
  pulledAt?: string;
  updatedAt?: string;
};

/** 移除本端渠道及其模型快照 */
export async function removeLocalHubChannel(slug: string) {
  const { data } = await api.delete(`/settings/channels/${encodeURIComponent(slug)}`);
  return data;
}

export function hubModelToOption(m: HubModelDto): AiModelOption & {
  source: 'hub';
  channelSlug: string;
} {
  const mods = m.modalities || [];
  const ioOut: Array<'text' | 'image' | 'video' | 'audio'> = [];
  if (mods.includes('text')) ioOut.push('text');
  if (mods.includes('image')) ioOut.push('image');
  if (mods.includes('video')) ioOut.push('video');
  return {
    source: 'hub',
    channelSlug: m.channelSlug,
    label: m.label || m.title || m.modelId,
    value: m.modelId,
    description: m.channelTitle
      ? `${m.channelTitle}${m.apiStyle ? ` · ${m.apiStyle}` : ''}`
      : `渠道 ${m.channelSlug}`,
    vendor: m.channelTitle || m.channelSlug,
    tags: m.apiStyle ? [m.apiStyle] : [],
    recommended: !!m.recommended,
    contextWindow: m.contextWindow != null ? String(m.contextWindow) : undefined,
    ioInput: ['text'],
    ioOutput: ioOut.length ? ioOut : ['text'],
  };
}

export function filterHubModelsForCapability(
  items: HubModelDto[],
  capability: AiCapability,
  configuredSlugs?: Set<string>,
): Array<AiModelOption & { source: 'hub'; channelSlug: string }> {
  const need =
    capability === 'chat' ? 'text' : capability === 'image' ? 'image' : 'video';
  return items
    .filter((m) => m.enabled !== false)
    .filter((m) => (m.modalities || []).includes(need) || !(m.modalities || []).length)
    .filter((m) => !configuredSlugs || configuredSlugs.has(m.channelSlug))
    .map(hubModelToOption);
}
