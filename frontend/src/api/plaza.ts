import api from '@/api';

/** Hub Skill（Agent）广场条目 */
export type AgentPlazaItem = {
  id: string;
  name: string;
  desc: string;
  prompt?: string;
  author: string;
  likes: number;
  /** Hub 使用次数（downloadCount） */
  uses?: number;
  coverUrl?: string;
  slash?: string;
  mode?: string;
  category?: string;
  tags?: string[];
  visibility?: 'official' | 'community' | 'private' | string;
};

/** Hub Workflow 广场条目 */
export type WorkflowPlazaItem = {
  id: string;
  name: string;
  desc: string;
  author: string;
  likes: number;
  /** Hub 使用次数（downloadCount） */
  uses?: number;
  coverUrl?: string;
  category?: string;
  tags?: string[];
  /** 工作流图 JSON；Hub 就绪后再解析落地 */
  graph?: unknown;
  visibility?: 'official' | 'community' | 'private' | string;
};

export type PlazaListPayload<T> = {
  version: number;
  source: string;
  filters: { id: string; label: string }[];
  items: T[];
};

const EMPTY_AGENTS: PlazaListPayload<AgentPlazaItem> = {
  version: 0,
  source: 'empty',
  filters: [],
  items: [],
};

const EMPTY_WORKFLOWS: PlazaListPayload<WorkflowPlazaItem> = {
  version: 0,
  source: 'empty',
  filters: [],
  items: [],
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Skill（Agent）广场 — 仅走 Hub。
 * 后端缓存自 Hub `GET /skills/plaza`（mode=agent），经 `/hub/agents/plaza` 暴露。
 */
export async function fetchAgentsPlaza(): Promise<PlazaListPayload<AgentPlazaItem>> {
  try {
    const { data } = await api.get('/hub/agents/plaza');
    const items = asArray<Record<string, unknown>>(data?.items || data?.skills || data?.agents);
    const filters = asArray<{ id: string; label: string }>(data?.filters);
    return {
      version: Number(data?.version) || 0,
      source: String(data?.source || 'lumina-hub'),
      filters,
      items: items
        .map((x) => ({
          id: String(x.id || x.slug || ''),
          name: String(x.name || x.title || ''),
          desc: String(x.desc || x.description || ''),
          prompt: x.prompt != null ? String(x.prompt) : undefined,
          author: String(x.author || x.authorName || '社区'),
          likes: Number(x.likes || x.likeCount) || 0,
          uses: Number(x.uses ?? x.downloadCount) || 0,
          coverUrl: x.coverUrl ? String(x.coverUrl) : undefined,
          slash: x.slash != null ? String(x.slash) : undefined,
          mode: x.mode != null ? String(x.mode) : undefined,
          category: x.category != null ? String(x.category) : undefined,
          tags: Array.isArray(x.tags) ? x.tags.map(String) : undefined,
          visibility: x.visibility != null ? String(x.visibility) : undefined,
        }))
        .filter((x) => x.id && x.name),
    };
  } catch {
    return EMPTY_AGENTS;
  }
}

/**
 * Workflow 广场 — 仅走 Hub。
 * 约定：`/hub/workflows/plaza`（Hub 侧待补）；未就绪时返回空列表，不回填本地模板。
 */
export async function fetchWorkflowsPlaza(): Promise<PlazaListPayload<WorkflowPlazaItem>> {
  try {
    const { data } = await api.get('/hub/workflows/plaza');
    const items = asArray<Record<string, unknown>>(data?.items || data?.workflows);
    const filters = asArray<{ id: string; label: string }>(data?.filters);
    return {
      version: Number(data?.version) || 0,
      source: String(data?.source || 'lumina-hub'),
      filters,
      items: items
        .map((x) => ({
          id: String(x.id || x.slug || ''),
          name: String(x.name || x.title || ''),
          desc: String(x.desc || x.description || ''),
          author: String(x.author || x.authorName || '社区'),
          likes: Number(x.likes || x.likeCount) || 0,
          uses: Number(x.uses ?? x.downloadCount) || 0,
          coverUrl: x.coverUrl ? String(x.coverUrl) : undefined,
          category: x.category != null ? String(x.category) : undefined,
          tags: Array.isArray(x.tags) ? x.tags.map(String) : undefined,
          graph: x.graph ?? x.payload,
          visibility: x.visibility != null ? String(x.visibility) : undefined,
        }))
        .filter((x) => x.id && x.name),
    };
  } catch {
    return EMPTY_WORKFLOWS;
  }
}
