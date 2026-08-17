import api from '@/api';
import type { CatalogSkill, SkillCategory } from '@/utils/skill-catalog';
import { setRuntimeSkillCatalog } from '@/utils/skill-catalog';
import { sanitizePromptTags } from '@/utils/prompt-plaza-filters';

/** 技能广场条目（与外部接口约定字段对齐；现称提示词广场） */
export type PlazaSkillDto = {
  id: string;
  name: string;
  desc: string;
  prompt: string;
  category: SkillCategory;
  official?: boolean;
  author: string;
  likes: number;
  /** Hub 使用次数（downloadCount） */
  uses?: number;
  mode?: 'agent' | 'image' | 'video';
  starter?: string;
  slash?: string;
  /** 封面分类提示，供本地 cover 映射 */
  coverHint?: string;
  /** 封面图 URL（外部接口可直接下发） */
  coverUrl?: string;
  /** 外部接口可能下发的其它封面字段名 */
  coverImage?: string;
  cover?: string;
  imageUrl?: string;
  thumbnail?: string;
  thumbUrl?: string;
  /** Hub 使用次数（旧字段名） */
  downloadCount?: number;
  /** 题材标签（人像写真等）；不含图片/视频类型 */
  tags?: string[];
};

export type PlazaFilterDto = {
  id: string;
  label: string;
};

export type SkillPlazaPayload = {
  version: number;
  source?: string;
  filters: PlazaFilterDto[];
  skills: PlazaSkillDto[];
};

/** 兼容旧配置：直接指向 Hub 广场 URL */
const REMOTE_PLAZA_URL = String(import.meta.env.VITE_SKILL_PLAZA_URL || '').trim();

let cache: SkillPlazaPayload | null = null;
let inflight: Promise<SkillPlazaPayload> | null = null;

const EMPTY_PAYLOAD: SkillPlazaPayload = {
  version: 0,
  source: 'empty',
  filters: [],
  skills: [],
};

function normalizePayload(raw: unknown, sourceHint?: string): SkillPlazaPayload {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<SkillPlazaPayload> & {
    skills?: Array<PlazaSkillDto & Record<string, unknown>>;
  };
  const skills = Array.isArray(data.skills) ? data.skills : [];
  const filters = Array.isArray(data.filters) ? (data.filters as PlazaFilterDto[]) : [];
  return {
    version: Number(data.version) || 0,
    source: data.source || sourceHint || (REMOTE_PLAZA_URL ? 'remote' : 'empty'),
    // Hub 设置里可能仍残留「图片/视频」旧 filters；前端以题材重建，这里仅透传备用
    filters: filters.filter(
      (f) =>
        f &&
        f.id &&
        f.label &&
        !['image', 'video', 'prompt', 'story', 'tool', 'produce', 'character'].includes(f.id) &&
        !['图片', '视频', '图片生成', '视频生成', '提示词', '创意策划', 'AI工具', '视频制作', '角色'].includes(
          f.label,
        ),
    ),
    skills: skills
      .filter((s) => s && typeof s.id === 'string' && s.name)
      .map((s) => {
        const cover =
          s.coverUrl ||
          s.coverImage ||
          s.cover ||
          s.imageUrl ||
          s.thumbnail ||
          s.thumbUrl;
        const usesRaw = s.uses ?? s.downloadCount;
        const uses = Number(usesRaw);
        return {
          ...s,
          coverUrl: cover != null && String(cover).trim() ? String(cover).trim() : undefined,
          tags: sanitizePromptTags(s.tags),
          uses: Number.isFinite(uses) ? uses : undefined,
          mode:
            s.mode === 'video' || s.mode === 'image' || s.mode === 'agent'
              ? s.mode
              : undefined,
        };
      }),
  };
}

async function fetchRemote(url: string): Promise<unknown> {
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`skill plaza ${res.status}`);
    return res.json();
  }
  const { data } = await api.get(url);
  return data;
}

/**
 * 拉取提示词广场数据。
 * 优先级：本机 Hub 同步缓存 → VITE_SKILL_PLAZA_URL → 空（不回填本地 JSON）
 */
export async function fetchSkillPlaza(force = false): Promise<SkillPlazaPayload> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      let hub: unknown;
      try {
        hub = await api.get('/hub/prompts/plaza').then((r) => r.data);
      } catch {
        hub = null;
      }
      if (hub) {
        const normalized = normalizePayload(hub, 'lumina-hub');
        if (normalized.skills.length > 0 || Number(normalized.version) > 0) {
          cache = normalized;
          setRuntimeSkillCatalog(normalized.skills.map(toCatalogSkill));
          return cache;
        }
      }
    } catch {
      /* Hub 未同步 → 继续 */
    }

    if (REMOTE_PLAZA_URL) {
      try {
        cache = normalizePayload(await fetchRemote(REMOTE_PLAZA_URL), 'remote');
        setRuntimeSkillCatalog(cache.skills.map(toCatalogSkill));
        return cache;
      } catch {
        /* 外部失败 → 空 */
      }
    }

    cache = EMPTY_PAYLOAD;
    setRuntimeSkillCatalog([]);
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** @deprecated 本地模板已移除，恒返回空 */
export function getLocalPlazaSkills(): CatalogSkill[] {
  return [];
}

/** @deprecated 本地模板已移除，恒返回空 */
export function getLocalPlazaFilters(): PlazaFilterDto[] {
  return [];
}

export function toCatalogSkill(s: PlazaSkillDto): CatalogSkill {
  return {
    id: s.id,
    name: s.name,
    desc: s.desc,
    prompt: s.prompt || '',
    category: s.category,
    official: !!s.official,
    author: s.author || '未知',
    likes: Number(s.likes) || 0,
    mode: s.mode,
    starter: s.starter,
    slash: s.slash,
    coverUrl: s.coverUrl ? String(s.coverUrl) : undefined,
  };
}

export function clearSkillPlazaCache() {
  cache = null;
  setRuntimeSkillCatalog([]);
}

export type SubmitCommunityPromptBody = {
  title: string;
  prompt: string;
  description?: string;
  coverUrl?: string;
  mode?: 'image' | 'video' | string;
  category?: string;
  tags?: string[];
  slug?: string;
  authorName?: string;
};

export type SubmitCommunityPromptResult = {
  ok: boolean;
  slug: string;
  status: string;
  id?: string | null;
  coverOmitted?: boolean;
  autoApproved?: boolean;
};

/** 投稿提示词到 Hub 社区（审核/自动通过后进提示词广场） */
export async function submitCommunityPrompt(
  body: SubmitCommunityPromptBody,
): Promise<SubmitCommunityPromptResult> {
  const { data } = await api.post('/hub/resources/submit', body);
  return data;
}

export type ReportHubResourceUseResult = {
  ok: boolean;
  id?: string;
  slug?: string | null;
  uses?: number | null;
  downloadCount?: number | null;
};

/**
 * 广场点「使用」上报 Hub（downloadCount/uses +1，非幂等）。
 * 失败不抛给业务主流程：调用方应 fire-and-forget。
 */
export async function reportHubResourceUse(
  id: string,
  kind?: 'prompt' | 'skill' | 'workflow' | string,
): Promise<ReportHubResourceUseResult | null> {
  const resourceId = String(id || '').trim();
  if (!resourceId) return null;
  try {
    const { data } = await api.post(
      `/hub/resources/${encodeURIComponent(resourceId)}/use`,
      kind ? { kind } : {},
    );
    return data;
  } catch {
    return null;
  }
}
