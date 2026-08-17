/** 我的提示词：收藏仍本地；自建条目已迁到后端 `/user-prompts` */

export const MY_PROMPT_FAV_KEY = 'lumina.skill.favorites';
/** @deprecated 自建已迁后端；仅用于一次性迁移 */
export const MY_PROMPT_CUSTOM_KEY = 'lumina.my.prompts';
export const MY_PROMPT_MIGRATED_KEY = 'lumina.my.prompts.migrated';

export function loadFavoriteIds(): string[] {
  try {
    const raw = localStorage.getItem(MY_PROMPT_FAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export function saveFavoriteIds(ids: string[]) {
  localStorage.setItem(MY_PROMPT_FAV_KEY, JSON.stringify(ids));
}

export function toggleFavoriteId(id: string): string[] {
  const cur = loadFavoriteIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  saveFavoriteIds(next);
  return next;
}

export function isFavoriteId(id: string): boolean {
  return loadFavoriteIds().includes(id);
}

export type LegacyLocalPrompt = {
  id: string;
  name: string;
  desc: string;
  prompt: string;
  mode: string;
  coverUrl?: string;
};

/** 读取尚未迁移的本地自建提示词 */
export function loadLegacyLocalPrompts(): LegacyLocalPrompt[] {
  try {
    if (localStorage.getItem(MY_PROMPT_MIGRATED_KEY) === '1') return [];
    const raw = localStorage.getItem(MY_PROMPT_CUSTOM_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.id === 'string' && x.name && x.prompt)
      .map((x) => ({
        id: String(x.id),
        name: String(x.name || '未命名'),
        desc: String(x.desc || ''),
        prompt: String(x.prompt || ''),
        mode: x.mode === 'video' ? 'video' : 'image',
        coverUrl: x.coverUrl ? String(x.coverUrl) : undefined,
      }));
  } catch {
    return [];
  }
}

export function markLocalPromptsMigrated() {
  localStorage.setItem(MY_PROMPT_MIGRATED_KEY, '1');
  localStorage.removeItem(MY_PROMPT_CUSTOM_KEY);
}
