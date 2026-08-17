/** 轻量本地持久化（仅存非敏感或已有服务端副本的缓存） */

export function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function writeStorage(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* private mode / quota */
  }
}

export function removeStorage(key: string) {
  writeStorage(key, '');
}

export const STORAGE_KEYS = {
  authToken: 'acd_token',
  theme: 'acd_theme',
  lastUsername: 'acd_last_username',
} as const;
