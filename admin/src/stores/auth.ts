import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/api';
import { fallbackMenusAsTree, type ApiMenuNode } from '@/config/menu';

const TOKEN_KEY = 'avs_admin_token';

export type AdminUser = {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  role: string;
  theme: string;
  totpEnabled?: boolean;
  roleId?: string;
  deptId?: string;
};

function canEnterAdmin(role: string) {
  return role === 'admin' || role === 'ops';
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '');
  const user = ref<AdminUser | null>(null);
  const hydrated = ref(false);
  const menus = ref<ApiMenuNode[]>([]);
  const permissions = ref<string[]>([]);
  const roleName = ref('');
  const deptName = ref('');

  const isAuthenticated = computed(() => Boolean(token.value));
  const isAdmin = computed(() => user.value?.role === 'admin');
  const isSuper = computed(
    () => user.value?.role === 'admin' || permissions.value.includes('*:*:*'),
  );

  function setSession(nextToken: string, nextUser: AdminUser) {
    token.value = nextToken;
    user.value = nextUser;
    localStorage.setItem(TOKEN_KEY, nextToken);
  }

  function logout() {
    token.value = '';
    user.value = null;
    menus.value = [];
    permissions.value = [];
    roleName.value = '';
    deptName.value = '';
    localStorage.removeItem(TOKEN_KEY);
  }

  async function loadAccess() {
    try {
      const { data } = await api.get('/admin/me/access');
      menus.value = Array.isArray(data?.menus) ? data.menus : [];
      permissions.value = Array.isArray(data?.permissions) ? data.permissions : [];
      roleName.value = data?.roleName || '';
      deptName.value = data?.deptName || '';
    } catch (e) {
      if (user.value?.role === 'admin') {
        menus.value = fallbackMenusAsTree();
        permissions.value = ['*:*:*'];
        return;
      }
      throw e;
    }
    if (!menus.value.length) {
      if (user.value?.role === 'admin') {
        menus.value = fallbackMenusAsTree();
        permissions.value = ['*:*:*'];
      } else {
        throw new Error('当前角色无后台菜单权限');
      }
    }
  }

  async function login(username: string, password: string, totpCode = '') {
    const { data } = await api.post('/auth/login', { username, password, totpCode });
    if (data?.totpSetupRequired) {
      throw new Error('请先在前台完成验证器绑定后再登录后台');
    }
    if (!data?.token || !data?.user) throw new Error('登录失败');
    if (!canEnterAdmin(String(data.user.role || ''))) {
      throw new Error('当前账号无权进入后台（需要 admin / ops 角色）');
    }
    setSession(data.token, data.user);
    await loadAccess();
    return data.user as AdminUser;
  }

  async function hydrate() {
    if (hydrated.value) return;
    hydrated.value = true;
    if (!token.value) return;
    try {
      const { data } = await api.post('/auth/me');
      const profile = data?.user || data;
      if (!profile || !canEnterAdmin(String(profile.role || ''))) {
        logout();
        return;
      }
      user.value = profile;
      await loadAccess();
    } catch {
      logout();
    }
  }

  function hasPerm(code: string) {
    if (isSuper.value) return true;
    return permissions.value.includes(code);
  }

  return {
    token,
    user,
    hydrated,
    menus,
    permissions,
    roleName,
    deptName,
    isAuthenticated,
    isAdmin,
    isSuper,
    login,
    logout,
    hydrate,
    setSession,
    loadAccess,
    hasPerm,
  };
});
