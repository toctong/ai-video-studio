import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '@/api';
import { readStorage, removeStorage, STORAGE_KEYS, writeStorage } from '@/utils/storage';

export type AuthUser = {
  id?: number;
  username: string;
  nickname?: string;
  avatar?: string;
  theme?: 'light' | 'dark';
  role: string;
  totpEnabled?: boolean;
  notifyPrefs?: {
    jobDone?: boolean;
    jobFail?: boolean;
    systemAnnounce?: boolean;
  };
  createdAt?: string | Date;
};

export const useAuthStore = defineStore('auth', () => {
  /**
   * 双通道：
   * - HttpOnly Cookie（后端）主通道，防 XSS 读 token
   * - localStorage 缓存 Bearer，保证刷新后 axios 仍能带 Authorization（Cookie 异常时兜底）
   */
  const token = ref(readStorage(STORAGE_KEYS.authToken));
  const user = ref<AuthUser | null>(null);
  const avatarRevision = ref(0);
  const hydrated = ref(false);
  let hydratePromise: Promise<AuthUser | null> | null = null;

  const displayName = computed(
    () => user.value?.nickname?.trim() || user.value?.username || '作者',
  );

  const avatarUrl = computed(() => {
    const raw = user.value?.avatar?.trim();
    if (!raw) return '';
    const sep = raw.includes('?') ? '&' : '?';
    return `${raw}${sep}v=${avatarRevision.value}`;
  });

  const isAuthenticated = computed(() => !!user.value);
  const isAdmin = computed(() => user.value?.role === 'admin');

  function setUser(u: AuthUser | null, options?: { bumpAvatar?: boolean }) {
    user.value = u;
    if (options?.bumpAvatar) avatarRevision.value += 1;
  }

  function applyUserProfile(profile: AuthUser, options?: { bumpAvatar?: boolean }) {
    setUser({ ...profile }, options);
  }

  function applyToken(next: string) {
    token.value = next || '';
    writeStorage(STORAGE_KEYS.authToken, token.value);
  }

  function clearSession() {
    token.value = '';
    removeStorage(STORAGE_KEYS.authToken);
    setUser(null);
    avatarRevision.value = 0;
    hydrated.value = true;
  }

  async function login(username: string, password: string, totpCode = '') {
    const { data } = await api.post('/auth/login', {
      username,
      password,
      totpCode: String(totpCode || '').trim(),
    });
    applyToken(data.token || '');
    setUser(data.user, { bumpAvatar: true });
    writeStorage(STORAGE_KEYS.lastUsername, String(username || '').trim());
    hydrated.value = true;
    return data;
  }

  /** 用 Cookie / 本地 token 恢复会话（刷新后走后端） */
  async function hydrate(force = false) {
    if (!force && hydrated.value) return user.value;
    if (!force && hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      try {
        // 刷新后 Pinia 重建；先把本地 token 灌回内存，方便 Bearer 兜底
        if (!token.value) {
          const cached = readStorage(STORAGE_KEYS.authToken);
          if (cached) token.value = cached;
        }
        const { data } = await api.post('/auth/me');
        if (data?.user) setUser(data.user, { bumpAvatar: true });
        else clearSession();
      } catch {
        clearSession();
      } finally {
        hydrated.value = true;
        hydratePromise = null;
      }
      return user.value;
    })();
    return hydratePromise;
  }

  async function ensureUser(force = false) {
    if (force || !user.value) return hydrate(force);
    return user.value;
  }

  async function updateNickname(nickname: string) {
    const { data } = await api.put('/auth/profile', { nickname });
    applyUserProfile(data);
    return data as AuthUser;
  }

  async function updateTheme(theme: 'light' | 'dark') {
    const { data } = await api.put('/auth/profile', { theme });
    applyUserProfile(data);
    return data as AuthUser;
  }

  async function updateUsername(username: string, oldPassword: string) {
    const { data } = await api.put('/auth/username', { username, oldPassword });
    if (data?.token) applyToken(data.token);
    if (data?.user) applyUserProfile(data.user);
    if (data?.user?.username) writeStorage(STORAGE_KEYS.lastUsername, data.user.username);
    return data as { user: AuthUser; token: string };
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    const { data } = await api.post('/auth/change-password', { oldPassword, newPassword });
    return data;
  }

  async function uploadAvatar(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/auth/avatar', fd);
    applyUserProfile(data, { bumpAvatar: true });
    return data as AuthUser;
  }

  async function applyLibraryAvatar(previewUrl: string) {
    const { data } = await api.post('/auth/avatar-library', { previewUrl });
    applyUserProfile(data, { bumpAvatar: true });
    return data as AuthUser;
  }

  async function updateNotifyPrefs(prefs: {
    jobDone?: boolean;
    jobFail?: boolean;
    systemAnnounce?: boolean;
  }) {
    const { data } = await api.put('/auth/notify-prefs', prefs);
    applyUserProfile(data);
    return data as AuthUser;
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clearSession();
  }

  return {
    token,
    user,
    avatarRevision,
    hydrated,
    displayName,
    avatarUrl,
    isAuthenticated,
    isAdmin,
    login,
    logout,
    hydrate,
    ensureUser,
    clearSession,
    applyUserProfile,
    updateNickname,
    updateTheme,
    updateUsername,
    changePassword,
    uploadAvatar,
    applyLibraryAvatar,
    updateNotifyPrefs,
  };
});