import api from '@/api';
import type { AiCapability, AiModelOption } from '@/constants/ai-providers';

export type HubChannelDto = {
  id?: string;
  slug: string;
  title: string;
  description?: string | null;
  /** Hub 常返回相对路径，如 `/vendors/deepseek.svg` */
  coverUrl?: string | null;
  category?: string;
  endpointType?: string;
  baseUrlHint?: string;
  website?: string;
  apiPrefix?: string;
  apiStyle?: string;
  paths?: Record<string, string>;
  modelCount?: number;
  modelMapping?: Record<string, string>;
  official?: boolean;
  featured?: boolean;
  recommended?: boolean;
  group?: string;
  sort?: number;
  hash?: string;
  updatedAt?: string;
  /** 本端拉取时间（本地渠道） */
  pulledAt?: string;
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
  capabilities?: Record<string, unknown>;
  updatedAt?: string;
  /** 本端拉取时间（本地模型） */
  pulledAt?: string;
};

/** 把 Hub 的相对资源路径拼成可访问 URL */
export function resolveHubAssetUrl(
  hubOrigin: string | null | undefined,
  asset: string | null | undefined,
): string {
  const raw = String(asset || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  const origin = String(hubOrigin || '')
    .trim()
    .replace(/\/+$/, '');
  if (!origin) return '';
  if (raw.startsWith('//')) {
    try {
      return `${new URL(origin).protocol}${raw}`;
    } catch {
      return `https:${raw}`;
    }
  }
  if (raw.startsWith('/')) return `${origin}${raw}`;
  return `${origin}/${raw}`;
}

export type HubCatalogPayload<T> = {
  version: number;
  kind?: string;
  updatedAt?: string;
  items: T[];
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export async function fetchChannelsCatalog(): Promise<HubCatalogPayload<HubChannelDto>> {
  try {
    const { data } = await api.get('/hub/channels/catalog');
    return {
      version: Number(data?.version) || 0,
      kind: data?.kind || 'channel',
      updatedAt: data?.updatedAt,
      items: asArray<Record<string, unknown>>(data?.items)
        .map((x) => ({
          id: x.id != null ? String(x.id) : undefined,
          slug: String(x.slug || ''),
          title: String(x.title || x.slug || ''),
          description: x.description != null ? String(x.description) : null,
          coverUrl: x.coverUrl != null ? String(x.coverUrl) : null,
          category: x.category != null ? String(x.category) : undefined,
          endpointType: x.endpointType != null ? String(x.endpointType) : undefined,
          baseUrlHint:
            x.baseUrlHint != null
              ? String(x.baseUrlHint)
              : x.baseUrl != null
                ? String(x.baseUrl)
                : x.endpoint != null
                  ? String(x.endpoint)
                  : undefined,
          website: x.website != null ? String(x.website) : undefined,
          apiPrefix: x.apiPrefix != null ? String(x.apiPrefix) : undefined,
          apiStyle: x.apiStyle != null ? String(x.apiStyle) : undefined,
          paths:
            x.paths && typeof x.paths === 'object'
              ? (x.paths as Record<string, string>)
              : undefined,
          modelCount: Number(x.modelCount) || 0,
          modelMapping:
            x.modelMapping && typeof x.modelMapping === 'object'
              ? (x.modelMapping as Record<string, string>)
              : undefined,
          official: !!x.official,
          featured: !!x.featured,
          recommended: !!x.recommended,
          group: x.group != null ? String(x.group) : undefined,
          sort: Number(x.sort) || 0,
          hash: x.hash != null ? String(x.hash) : undefined,
          updatedAt: x.updatedAt != null ? String(x.updatedAt) : undefined,
        }))
        .filter((x) => x.slug),
    };
  } catch {
    return { version: 0, kind: 'channel', items: [] };
  }
}

export async function fetchModelsCatalog(): Promise<HubCatalogPayload<HubModelDto>> {
  try {
    const { data } = await api.get('/hub/models/catalog');
    return {
      version: Number(data?.version) || 0,
      kind: data?.kind || 'model',
      updatedAt: data?.updatedAt,
      items: asArray<Record<string, unknown>>(data?.items)
        .map((x) => ({
          id: x.id != null ? String(x.id) : undefined,
          slug: x.slug != null ? String(x.slug) : undefined,
          title: x.title != null ? String(x.title) : undefined,
          label: x.label != null ? String(x.label) : undefined,
          modelId: String(x.modelId || ''),
          channelSlug: String(x.channelSlug || x.channel || ''),
          channelTitle: x.channelTitle != null ? String(x.channelTitle) : undefined,
          channelLogo: x.channelLogo != null ? String(x.channelLogo) : null,
          coverUrl: x.coverUrl != null ? String(x.coverUrl) : null,
          category: x.category != null ? String(x.category) : undefined,
          endpointType: x.endpointType != null ? String(x.endpointType) : undefined,
          baseUrlHint: x.baseUrlHint != null ? String(x.baseUrlHint) : undefined,
          apiStyle: x.apiStyle != null ? String(x.apiStyle) : undefined,
          modalities: Array.isArray(x.modalities) ? x.modalities.map(String) : [],
          enabled: x.enabled !== false,
          recommended: !!x.recommended,
          contextWindow: (x.contextWindow as number | string | null) ?? null,
          capabilities:
            x.capabilities && typeof x.capabilities === 'object'
              ? (x.capabilities as Record<string, unknown>)
              : undefined,
          updatedAt: x.updatedAt != null ? String(x.updatedAt) : undefined,
        }))
        .filter((x) => x.modelId && x.channelSlug),
    };
  } catch {
    return { version: 0, kind: 'model', items: [] };
  }
}

/** Hub 参考库目录（同步自 Hub GET /api/v1/libraries/catalog） */
export type HubLibraryItemDto = {
  id: string;
  category: string;
  group?: string;
  label: string;
  title?: string;
  tags?: string[];
  coverUrl?: string | null;
  blurb?: string;
  styleBrief?: string;
  sort?: number;
};

export type HubLibraryFilterDto = {
  id: string;
  label: string;
};

export type HubLibrariesCatalog = HubCatalogPayload<HubLibraryItemDto> & {
  filters: HubLibraryFilterDto[];
  source?: string;
};

export async function fetchLibrariesCatalog(): Promise<HubLibrariesCatalog> {
  try {
    const { data } = await api.get('/hub/libraries/catalog');
    const items = asArray<Record<string, unknown>>(
      data?.items || data?.libraries || data?.data,
    )
      .map((x) => ({
        id: String(x.id || x.slug || ''),
        category: String(x.category || x.kind || ''),
        group: x.group != null ? String(x.group) : undefined,
        label: String(x.label || x.title || x.name || ''),
        title: x.title != null ? String(x.title) : undefined,
        tags: Array.isArray(x.tags) ? x.tags.map(String) : [],
        coverUrl: x.coverUrl != null ? String(x.coverUrl) : null,
        blurb: x.blurb != null ? String(x.blurb) : undefined,
        styleBrief:
          x.styleBrief != null
            ? String(x.styleBrief)
            : x.brief != null
              ? String(x.brief)
              : undefined,
        sort: Number.isFinite(Number(x.sort)) ? Number(x.sort) : undefined,
      }))
      .filter((x) => x.id && x.label);
    const filters = asArray<Record<string, unknown>>(data?.filters)
      .map((f) => ({
        id: String(f.id || f.value || f.label || ''),
        label: String(f.label || f.id || ''),
      }))
      .filter((f) => f.id);
    return {
      version: Number(data?.version) || 0,
      kind: String(data?.kind || 'library'),
      updatedAt: data?.updatedAt != null ? String(data.updatedAt) : undefined,
      source: data?.source != null ? String(data.source) : undefined,
      filters,
      items,
    };
  } catch {
    return { version: 0, kind: 'library', filters: [], items: [] };
  }
}

/** 制作大片画面风格：libraries 中 category=style */
export async function fetchFilmStyleLibrary(): Promise<{
  filters: HubLibraryFilterDto[];
  items: HubLibraryItemDto[];
  version: number;
}> {
  const catalog = await fetchLibrariesCatalog();
  const items = catalog.items
    .filter((x) => String(x.category || '').toLowerCase() === 'style')
    .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
  const filters =
    catalog.filters.length > 0
      ? catalog.filters
      : [
          { id: 'all', label: '全部' },
          { id: '真人', label: '真人' },
          { id: '3D', label: '3D' },
          { id: '2D', label: '2D' },
        ];
  return { filters, items, version: catalog.version };
}

export async function syncHubCatalog() {
  const { data } = await api.post('/hub/sync');
  return data as {
    ok?: boolean;
    message?: string;
    version?: number;
    localModelsRefreshed?: number;
    localChannelsPruned?: number;
    settings?: Record<string, unknown>;
  };
}

/** 将 Hub 渠道 + 模型快照拉取到本端后端 */
export async function pullHubChannelToLocal(slug: string) {
  const { data } = await api.post(`/hub/channels/${encodeURIComponent(slug)}/pull`);
  return data;
}

/** 用最新 Hub 缓存刷新本端已拉取渠道的模型快照 */
export async function refreshLocalModelsFromHub() {
  const { data } = await api.post('/hub/local-models/refresh');
  return data as {
    ok?: boolean;
    refreshed?: number;
    settings?: Record<string, unknown>;
  };
}

/** 移除本端已拉取渠道 */
export async function removeLocalHubChannel(slug: string) {
  const { data } = await api.delete(`/hub/channels/${encodeURIComponent(slug)}/local`);
  return data;
}

/** Hub modality → 本地能力 */
export function hubModalityToCapability(mod: string): AiCapability | null {
  const m = String(mod || '').toLowerCase();
  if (m === 'text' || m === 'chat') return 'chat';
  if (m === 'image') return 'image';
  if (m === 'video') return 'video';
  return null;
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
      ? `Hub · ${m.channelTitle}${m.apiStyle ? ` · ${m.apiStyle}` : ''}`
      : `Hub 渠道 ${m.channelSlug}`,
    vendor: m.channelTitle || m.channelSlug,
    tags: ['Hub', ...(m.apiStyle ? [m.apiStyle] : [])],
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
