import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useAuthStore, type AuthUser } from '@/stores/auth';
import { STORAGE_KEYS, writeStorage } from '@/utils/storage';

export type ThemeMode = 'light' | 'dark';

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.style.colorScheme = mode;
}

export const useThemeStore = defineStore('theme', () => {
  /** 产品默认深色；纠正历史 localStorage 浅色，避免各菜单页深浅不一 */
  const mode = ref<ThemeMode>('dark');
  applyTheme('dark');
  writeStorage(STORAGE_KEYS.theme, 'dark');

  const isDark = computed(() => mode.value === 'dark');

  function setTheme(next: ThemeMode, options?: { persist?: boolean }) {
    mode.value = next;
    applyTheme(next);
    writeStorage(STORAGE_KEYS.theme, next);
    if (options?.persist === false) return;
    const auth = useAuthStore();
    if (auth.isAuthenticated) {
      void auth.updateTheme(next).catch(() => {
        /* 本地已切换，失败时下次 hydrate 会纠正 */
      });
    }
  }

  function toggle() {
    setTheme(mode.value === 'dark' ? 'light' : 'dark');
  }

  function syncFromUser(user: AuthUser | null | undefined) {
    if (!user) return;
    // 纳米产品统一深色：登录后把历史 light 一并纠正
    if (user.theme !== 'dark') {
      setTheme('dark');
      return;
    }
    mode.value = 'dark';
    applyTheme('dark');
    writeStorage(STORAGE_KEYS.theme, 'dark');
  }

  watch(
    () => useAuthStore().user,
    (u) => {
      if (u) syncFromUser(u);
    },
  );

  return { mode, isDark, setTheme, toggle, syncFromUser };
});
