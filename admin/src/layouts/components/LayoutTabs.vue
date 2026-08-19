<template>
  <div class="layout-tabs">
    <a-tabs
      type="card"
      size="medium"
      editable
      hide-content
      :active-key="route.path"
      @tab-click="onTabClick"
      @delete="onDelete"
    >
      <a-tab-pane
        v-for="item in tabs.tabList"
        :key="item.path"
        :title="item.title"
        :closable="!item.affix"
      />
      <template #extra>
        <a-space :size="4">
          <a-tooltip content="刷新当前页">
            <a-button type="text" size="mini" @click="app.reloadPage()">
              <template #icon><icon-refresh /></template>
            </a-button>
          </a-tooltip>
          <a-dropdown trigger="hover">
            <a-button type="text" size="mini">
              <template #icon><icon-more /></template>
            </a-button>
            <template #content>
              <a-doption @click="closeAndGo('other')">关闭其他</a-doption>
              <a-doption @click="closeAndGo('left')">关闭左侧</a-doption>
              <a-doption @click="closeAndGo('right')">关闭右侧</a-doption>
              <a-doption @click="closeAndGo('all')">关闭全部</a-doption>
            </template>
          </a-dropdown>
        </a-space>
      </template>
    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useTabsStore } from '@/stores/tabs';

const route = useRoute();
const router = useRouter();
const app = useAppStore();
const tabs = useTabsStore();

watch(
  () => route.fullPath,
  () => tabs.addTab(route),
  { immediate: true },
);

function onTabClick(key: string | number) {
  const hit = tabs.tabList.find((t) => t.path === key);
  router.push(hit?.fullPath || String(key));
}

function onDelete(key: string | number) {
  const path = String(key);
  const idx = tabs.tabList.findIndex((t) => t.path === path);
  tabs.close('current', path);
  if (route.path === path) {
    const next = tabs.tabList[Math.max(0, idx - 1)] || tabs.tabList[0];
    if (next) router.push(next.fullPath || next.path);
  }
}

function closeAndGo(type: 'left' | 'right' | 'other' | 'all') {
  tabs.close(type, route.path);
  if (!tabs.tabList.some((t) => t.path === route.path)) {
    const next = tabs.tabList[tabs.tabList.length - 1];
    if (next) router.push(next.fullPath || next.path);
  }
}
</script>

<style scoped lang="scss">
.layout-tabs {
  flex-shrink: 0;
  background: var(--color-bg-2);
  border-bottom: 1px solid var(--color-border-2);
  padding: 0 12px 0 8px;

  :deep(.arco-tabs-nav) {
    &::before {
      display: none;
    }
  }

  :deep(.arco-tabs-nav-tab) {
    padding-top: 8px;
    padding-bottom: 0;
  }

  :deep(.arco-tabs-tab) {
    border-radius: 8px 8px 0 0 !important;
    margin-right: 4px;
    padding: 4px 12px !important;
    background: var(--color-fill-1) !important;
    border: 1px solid var(--color-border-2) !important;
    border-bottom: none !important;
  }

  :deep(.arco-tabs-tab-active) {
    background: var(--color-bg-2) !important;
    border-color: var(--color-border-2) !important;
    color: rgb(var(--primary-6)) !important;
  }

  :deep(.arco-tabs-nav-ink) {
    display: none;
  }
}
</style>
