import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

const THEME_KEY = 'avs_admin_theme';
const MENU_COLLAPSE_KEY = 'avs_admin_menu_collapsed';
const MENU_DARK_KEY = 'avs_admin_menu_dark';

export const useAppStore = defineStore('app', () => {
  const theme = ref<'light' | 'dark'>((localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light');
  const menuCollapsed = ref(localStorage.getItem(MENU_COLLAPSE_KEY) === '1');
  const menuDark = ref(localStorage.getItem(MENU_DARK_KEY) !== '0');
  const reloadFlag = ref(true);

  const isDark = computed(() => theme.value === 'dark');

  function applyTheme() {
    document.body.setAttribute('arco-theme', theme.value === 'dark' ? 'dark' : '');
    document.documentElement.setAttribute('data-theme', theme.value);
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  function toggleMenu() {
    menuCollapsed.value = !menuCollapsed.value;
  }

  function toggleMenuDark() {
    menuDark.value = !menuDark.value;
  }

  async function reloadPage() {
    reloadFlag.value = false;
    await Promise.resolve();
    reloadFlag.value = true;
  }

  watch(theme, () => {
    localStorage.setItem(THEME_KEY, theme.value);
    applyTheme();
  }, { immediate: true });

  watch(menuCollapsed, (v) => localStorage.setItem(MENU_COLLAPSE_KEY, v ? '1' : '0'));
  watch(menuDark, (v) => localStorage.setItem(MENU_DARK_KEY, v ? '1' : '0'));

  return {
    theme,
    isDark,
    menuCollapsed,
    menuDark,
    reloadFlag,
    toggleTheme,
    toggleMenu,
    toggleMenuDark,
    reloadPage,
    applyTheme,
  };
});
