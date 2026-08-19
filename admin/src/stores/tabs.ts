import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { RouteLocationNormalized } from 'vue-router';

export type TabItem = {
  path: string;
  fullPath: string;
  title: string;
  affix?: boolean;
};

const AFFIX_PATH = '/dashboard';

export const useTabsStore = defineStore('tabs', () => {
  const tabList = ref<TabItem[]>([
    { path: AFFIX_PATH, fullPath: AFFIX_PATH, title: '工作台', affix: true },
  ]);

  function addTab(route: RouteLocationNormalized) {
    if (route.meta?.public) return;
    const path = route.path;
    if (!path || path === '/login') return;
    const title = String(route.meta?.title || '未命名');
    const exist = tabList.value.find((t) => t.path === path);
    if (exist) {
      exist.fullPath = route.fullPath;
      exist.title = title;
      return;
    }
    tabList.value.push({
      path,
      fullPath: route.fullPath,
      title,
      affix: path === AFFIX_PATH,
    });
  }

  function close(type: 'current' | 'left' | 'right' | 'other' | 'all', path?: string) {
    const target = path || '';
    if (type === 'all') {
      tabList.value = tabList.value.filter((t) => t.affix);
      return;
    }
    const idx = tabList.value.findIndex((t) => t.path === target);
    if (idx < 0) return;
    if (type === 'current') {
      const item = tabList.value[idx];
      if (item?.affix) return;
      tabList.value.splice(idx, 1);
      return;
    }
    if (type === 'left') {
      tabList.value = tabList.value.filter((t, i) => t.affix || i >= idx);
      return;
    }
    if (type === 'right') {
      tabList.value = tabList.value.filter((t, i) => t.affix || i <= idx);
      return;
    }
    if (type === 'other') {
      tabList.value = tabList.value.filter((t) => t.affix || t.path === target);
    }
  }

  return { tabList, addTab, close };
});
