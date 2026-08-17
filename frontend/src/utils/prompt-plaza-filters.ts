/** 与 Hub catalog-meta.PROMPT_SUBCATEGORIES 对齐：题材进 tags，顶栏不再用「图片/视频」 */

export type PromptSubjectFilter = { id: string; label: string };

/** 图片题材 */
export const PROMPT_IMAGE_SUBJECTS: PromptSubjectFilter[] = [
  { id: 'portrait', label: '人像写真' },
  { id: 'character', label: '角色立绘' },
  { id: 'anime', label: '二次元' },
  { id: 'commerce', label: '电商带货' },
  { id: 'poster', label: '海报广告' },
  { id: 'scene', label: '场景街拍' },
  { id: 'product', label: '产品静物' },
  { id: 'design', label: '设计平面' },
  { id: 'style', label: '风格艺术' },
  { id: 'other-image', label: '其他' },
];

/** 视频题材 */
export const PROMPT_VIDEO_SUBJECTS: PromptSubjectFilter[] = [
  { id: 'narrative', label: '叙事短片' },
  { id: 'commercial', label: '商业广告' },
  { id: 'anime-video', label: '动漫游戏' },
  { id: 'lifestyle', label: '生活记录' },
  { id: 'trailer', label: '预告片头' },
  { id: 'other-video', label: '其他' },
];

/** 顶栏展示顺序：图题材 → 视频题材（同名「其他」合并为一个） */
export const PROMPT_SUBJECT_ORDER: PromptSubjectFilter[] = (() => {
  const seen = new Set<string>();
  const out: PromptSubjectFilter[] = [];
  for (const f of [...PROMPT_IMAGE_SUBJECTS, ...PROMPT_VIDEO_SUBJECTS]) {
    if (f.label === '其他') {
      if (seen.has('其他')) continue;
      seen.add('其他');
      out.push({ id: 'other', label: '其他' });
      continue;
    }
    if (seen.has(f.label)) continue;
    seen.add(f.label);
    out.push(f);
  }
  return out;
})();

/** Hub / 历史残留：不应再作为提示词广场筛选项 */
export const PROMPT_TYPE_FILTER_IDS = new Set([
  'image',
  'video',
  'prompt',
  'story',
  'tool',
  'produce',
  'character',
]);

const PROMPT_TYPE_FILTER_LABELS = new Set([
  '图片',
  '视频',
  '图片生成',
  '视频生成',
  '提示词',
  '创意策划',
  'AI工具',
  '视频制作',
  '角色',
]);

export function isPromptTypeTag(tag: string): boolean {
  const t = String(tag || '').trim();
  return ['图片', '视频', '角色', 'image', 'video', 'agent', '提示词'].includes(t);
}

export function isLegacyPromptTypeFilter(f: { id?: string; label?: string }): boolean {
  const id = String(f.id || '').trim();
  const label = String(f.label || '').trim();
  return PROMPT_TYPE_FILTER_IDS.has(id) || PROMPT_TYPE_FILTER_LABELS.has(label);
}

/** 清洗题材 tags：去掉图片/视频类型标签 */
export function sanitizePromptTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => String(t || '').trim())
    .filter((t) => t && !isPromptTypeTag(t));
}

/**
 * 顶栏：全部 + 题材。
 * 「我的收藏」在「我的提示词」页展示，广场不再放收藏筛选项。
 * 优先用 Hub 下发的题材 filters；若仍是旧「图片/视频生成」则按数据 tags 重建。
 */
export function resolvePromptPlazaFilters(
  hubFilters: Array<{ id: string; label: string }> | null | undefined,
  skills: Array<{ tags?: string[] | null }>,
): PromptSubjectFilter[] {
  const fromHub = (hubFilters || []).filter(
    (f) =>
      f &&
      f.id &&
      f.label &&
      f.id !== 'all' &&
      f.id !== 'fav' &&
      !isLegacyPromptTypeFilter(f),
  );
  if (fromHub.length) {
    const used = new Set<string>();
    const subjects = fromHub.map((f) => {
      let id = String(f.id);
      // Hub 曾把「二次元」「动漫游戏」都写成 id=anime，导致双高亮
      if (used.has(id)) id = String(f.label);
      used.add(id);
      return { id, label: String(f.label) };
    });
    return [{ id: 'all', label: '全部' }, ...subjects];
  }
  return buildPromptPlazaFilters(skills);
}

/**
 * 仅按当前列表里出现的题材重建（Hub filters 不可用时）。
 */
export function buildPromptPlazaFilters(
  skills: Array<{ tags?: string[] | null }>,
): PromptSubjectFilter[] {
  const present = new Set<string>();
  for (const s of skills) {
    for (const t of sanitizePromptTags(s.tags)) present.add(t);
  }
  const known = PROMPT_SUBJECT_ORDER.filter((f) => present.has(f.label));
  const knownLabels = new Set(known.map((f) => f.label));
  const extras = [...present]
    .filter((t) => !knownLabels.has(t))
    .sort((a, b) => a.localeCompare(b, 'zh'))
    .map((t) => ({ id: t, label: t }));
  return [{ id: 'all', label: '全部' }, ...known, ...extras];
}

export function skillMatchesPromptFilter(
  skill: { id: string; tags?: string[] | null },
  filterId: string,
  _isFav?: (id: string) => boolean,
): boolean {
  if (!filterId || filterId === 'all' || filterId === 'fav') return true;
  // 旧类型筛选项已废弃：不按它过滤（视为全部）
  if (PROMPT_TYPE_FILTER_IDS.has(filterId)) return true;
  const tags = sanitizePromptTags(skill.tags);
  const hit = PROMPT_SUBJECT_ORDER.find((f) => f.id === filterId);
  const label = hit?.label || filterId;
  return tags.some((t) => t === label || t === filterId);
}
