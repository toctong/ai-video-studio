import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/api';

const TOKEN_KEY = 'avs_admin_token';

export type AdminUser = {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  role: string;
  theme: string;
  totpEnabled?: boolean;
};

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '');
  const user = ref<AdminUser | null>(null);
  const hydrated = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value));
  const isAdmin = computed(() => user.value?.role === 'admin');

  function setSession(nextToken: string, nextUser: AdminUser) {
    token.value = nextToken;
    user.value = nextUser;
    localStorage.setItem(TOKEN_KEY, nextToken);
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  async function login(username: string, password: string, totpCode = '') {
    const { data } = await api.post('/auth/login', { username, password, totpCode });
    if (data?.totpSetupRequired) {
      throw new Error('请先在前台完成验证器绑定后再登录后台');
    }
    if (!data?.token || !data?.user) throw new Error('登录失败');
    if (data.user.role !== 'admin') throw new Error('仅管理员可进入后台');
    setSession(data.token, data.user);
    return data.user as AdminUser;
  }

  async function hydrate() {
    if (hydrated.value) return;
    hydrated.value = true;
    if (!token.value) return;
    try {
      const { data } = await api.post('/auth/me');
      const profile = data?.user || data;
      if (!profile || profile.role !== 'admin') {
        logout();
        return;
      }
      user.value = profile;
    } catch {
      logout();
    }
  }

  return {
    token,
    user,
    hydrated,
    isAuthenticated,
    isAdmin,
    login,
    logout,
    hydrate,
    setSession,
  };
});
