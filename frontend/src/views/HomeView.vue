<template>
  <div class="projects-page">
    <header class="projects-head">
      <div class="head-left">
        <button type="button" class="back-btn" title="返回首页" @click="$router.push('/home')">
          <UiIcon name="arrow-left" :size="18" />
        </button>
        <h1>我的小说</h1>
      </div>
      <div class="head-right">
        <label class="search-pill">
          <UiIcon name="search" :size="15" />
          <input v-model="keyword" type="search" placeholder="搜索" />
        </label>
      </div>
    </header>

    <div class="project-grid" v-loading="loading">
      <button type="button" class="proj-card create" @click="openCreate()">
        <UiIcon name="plus" :size="32" />
        <span>新建小说</span>
      </button>

      <article
        v-for="p in filtered"
        :key="p.id"
        class="proj-card item"
        @click="open(p.id)"
      >
        <div class="thumb" :class="{ empty: !p.coverUrl }">
          <img v-if="p.coverUrl" :src="p.coverUrl" :alt="p.title" loading="lazy" />
          <div class="card-ops" @click.stop>
            <button type="button" title="重命名" :disabled="busyId === p.id" @click="renameBook(p)">
              <UiIcon name="pencil" :size="16" />
            </button>
            <button
              type="button"
              title="删除"
              class="danger"
              :disabled="busyId === p.id"
              @click="removeBook(p)"
            >
              <UiIcon name="trash" :size="16" />
            </button>
          </div>
        </div>
        <div class="meta">
          <strong :title="p.title">{{ p.title || '未命名小说' }}</strong>
          <em>
            <template v-if="p.chapterCount">{{ p.chapterCount }} 章 · </template>
            编辑于 {{ relativeTime(p) }}
          </em>
        </div>
      </article>
    </div>

    <p v-if="!loading && filtered.length" class="end-hint">没有更多小说了</p>
    <p v-else-if="!loading && !filtered.length" class="end-hint">
      {{ keyword.trim() ? '没有匹配的作品' : '还没有小说，点「新建小说」开始' }}
    </p>

    <ProjectCreateDialog
      v-model="showCreate"
      :initial-mode="createInitialMode"
      @created="onCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '@/api';
import ProjectCreateDialog from '@/components/ProjectCreateDialog.vue';
import UiIcon from '@/components/icons/UiIcon.vue';

type ProjectRow = {
  id: string;
  title: string;
  description?: string;
  styleBrief?: string;
  archived?: boolean;
  coverUrl?: string;
  updatedAt?: string;
  createdAt?: string;
  chapterCount?: number;
  wordCount?: number;
};

const router = useRouter();
const route = useRoute();
const projects = ref<ProjectRow[]>([]);
const loading = ref(false);
const busyId = ref('');
const showCreate = ref(false);
const createInitialMode = ref<'choose' | 'quick' | 'assemble'>('choose');
const keyword = ref('');

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  let list = projects.value
    .filter((p) => !p.archived)
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
    );
  if (!q) return list;
  return list.filter((p) =>
    `${p.title} ${p.description || ''} ${p.styleBrief || ''}`.toLowerCase().includes(q),
  );
});

function relativeTime(p: ProjectRow) {
  const raw = p.updatedAt || p.createdAt;
  if (!raw) return '刚刚';
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return '刚刚';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

function open(id: string) {
  router.push(`/books/${id}/overview`);
}

function openCreate(mode: 'choose' | 'quick' | 'assemble' = 'choose') {
  createInitialMode.value = mode;
  showCreate.value = true;
}

function consumeCreateQuery() {
  const q = String(route.query.create || '');
  if (q === 'assemble') {
    openCreate('assemble');
    router.replace({ query: { ...route.query, create: undefined } });
  } else if (q === 'quick' || q === '1') {
    openCreate(q === 'quick' ? 'quick' : 'choose');
    router.replace({ query: { ...route.query, create: undefined } });
  }
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/projects', { params: { archived: '1' } });
    projects.value = data || [];
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function onCreated(projectId?: string) {
  showCreate.value = false;
  if (projectId) open(projectId);
  try {
    await load();
  } catch {
    /* ignore */
  }
}

async function renameBook(p: ProjectRow) {
  try {
    const { value } = await ElMessageBox.prompt('输入新的书名', '重命名', {
      inputValue: p.title || '未命名小说',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (v) => (!!String(v || '').trim() ? true : '名称不能为空'),
    });
    busyId.value = p.id;
    await api.put(`/projects/${p.id}`, { title: String(value).trim() });
    ElMessage.success('已重命名');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '重命名失败');
  } finally {
    busyId.value = '';
  }
}

async function removeBook(p: ProjectRow) {
  try {
    await ElMessageBox.confirm(`确定删除「${p.title || '未命名'}」？此操作不可恢复。`, '删除小说', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    busyId.value = p.id;
    await api.delete(`/projects/${p.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  } finally {
    busyId.value = '';
  }
}

onMounted(async () => {
  await load();
  consumeCreateQuery();
});

watch(
  () => route.query.create,
  () => consumeCreateQuery(),
);
</script>

<style scoped>
.projects-page {
  min-height: 100%;
  overflow: visible;
  padding: 20px 28px 48px;
  box-sizing: border-box;
  background: var(--studio-bg);
  color: var(--studio-ink);
}

.projects-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}

.head-left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.head-left h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.back-btn {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.back-btn:hover {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.search-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  min-width: 200px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--studio-panel);
  color: var(--studio-faint);
}
.search-pill input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.search-pill input::placeholder {
  color: var(--studio-faint);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}

.proj-card {
  border: 1px solid transparent;
  border-radius: 16px;
  background: var(--studio-panel);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  transition: border-color 0.15s ease, background 0.15s ease;
  box-sizing: border-box;
}
.proj-card.create {
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--studio-muted);
  border-color: transparent;
  background: var(--studio-panel);
}
.proj-card.create:hover:not(:disabled) {
  background: var(--studio-panel-3);
  color: var(--studio-ink);
  border-color: var(--studio-line-bright);
}
.proj-card.create:disabled {
  opacity: 0.6;
  cursor: wait;
}
.proj-card.create span {
  font-size: 14px;
  font-weight: 500;
}

.proj-card.item {
  padding: 10px 10px 0;
}
.proj-card.item:hover {
  border-color: var(--studio-line-bright);
  background: var(--studio-panel-2);
}
.proj-card.item:hover .card-ops {
  opacity: 1;
}

.thumb {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: 12px;
  background: var(--studio-inset);
  overflow: hidden;
}
.thumb.empty {
  background: var(--studio-inset-2);
  box-shadow: inset 0 0 0 1px var(--studio-glass);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.card-ops {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}
.proj-card.item:hover .card-ops {
  pointer-events: auto;
}
.card-ops button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.65));
}
.card-ops button:hover {
  opacity: 0.85;
}
.card-ops button:disabled {
  opacity: 0.4;
  cursor: wait;
}
.card-ops button.danger:hover {
  color: #fca5a5;
}

.meta {
  padding: 10px 4px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.meta strong {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta em {
  font-style: normal;
  font-size: 12px;
  color: var(--studio-faint);
}

.end-hint {
  margin: 36px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--studio-muted);
}
</style>
