<template>
  <div class="book-detail studio-book" :class="{ workspace: isWorkspace }">
    <header class="book-head">
      <div class="head-left">
        <button type="button" class="back-btn" title="返回书库" @click="$router.push('/books')">
          <UiIcon name="arrow-left" :size="18" />
        </button>
        <div class="head-copy">
          <h1 class="page-title" :title="title">{{ title || '加载中…' }}</h1>
          <p class="page-sub">小说详情</p>
        </div>
      </div>
    </header>

    <nav class="book-tabs" aria-label="小说分区">
      <router-link
        v-for="tab in tabs"
        :key="tab.path"
        :to="tab.path"
        class="tab"
        :class="{ on: isTabActive(tab.match) }"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <div class="book-body">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import UiIcon from '@/components/icons/UiIcon.vue';
import { useProjectStore } from '@/stores/project';

const route = useRoute();
const store = useProjectStore();

const projectId = computed(() => String(route.params.projectId || ''));
const title = computed(() => store.current?.title || '未命名小说');

const tabs = computed(() => {
  const id = projectId.value;
  return [
    { label: '概览', path: `/books/${id}/overview`, match: 'overview' },
    { label: '章节', path: `/books/${id}/chapters`, match: 'chapters' },
    { label: '大纲', path: `/books/${id}/outline`, match: 'outline' },
    { label: '时间线', path: `/books/${id}/timeline`, match: 'timeline' },
    { label: '角色列表', path: `/books/${id}/characters`, match: 'characters' },
  ];
});

const isWorkspace = computed(() =>
  /\/(chapters|outline|timeline|characters)(?:\/|$)/.test(route.path),
);

function isTabActive(match: string) {
  return route.path.includes(`/${match}`);
}

async function load() {
  const id = projectId.value;
  if (!id) return;
  if (!store.current || store.current.id !== id) {
    await store.setCurrent(id);
  }
}

onMounted(load);
watch(projectId, load);
</script>

<style scoped>
.book-detail {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 28px 24px !important;
  box-sizing: border-box;
}
.book-detail.workspace {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.book-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  flex-shrink: 0;
}
.head-left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.back-btn {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #a1a1a1;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.back-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.head-copy {
  min-width: 0;
}
.page-title {
  margin: 0 !important;
  font-size: 18px !important;
  font-weight: 600 !important;
  letter-spacing: -0.02em !important;
  color: #fafafa !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.page-sub {
  margin: 2px 0 0 !important;
  font-size: 12px !important;
  color: #737373 !important;
}

.book-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 18px;
  flex-shrink: 0;
}
.tab {
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: #1a1a1a;
  color: #a1a1a1;
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
}
.tab:hover {
  color: #fff;
  background: #222;
}
.tab.on {
  background: #e5e5e5;
  color: #0a0a0a;
  font-weight: 600;
}

.book-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.book-body > :deep(.page),
.book-body > :deep(.studio-book) {
  flex: 1;
  min-height: 0;
  padding: 0 !important;
  background: transparent !important;
}
</style>
