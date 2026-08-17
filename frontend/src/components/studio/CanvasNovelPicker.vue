<template>
  <Teleport to="body">
    <div v-if="open" class="np-mask" @mousedown.self="close">
      <div class="np-panel" role="dialog" aria-label="从书库选用">
        <header class="np-head">
          <button
            v-if="step === 'chapter'"
            type="button"
            class="back"
            title="返回书目"
            @click="backToBooks"
          >
            ←
          </button>
          <strong>{{ headTitle }}</strong>
          <button type="button" class="x" title="关闭" @click="close">×</button>
        </header>

        <label class="search">
          <span class="search-ico" aria-hidden="true">⌕</span>
          <input
            v-model="keyword"
            type="search"
            :placeholder="step === 'book' ? '搜索书名…' : '搜索章节…'"
          />
        </label>

        <div class="np-body" v-loading="loading">
          <template v-if="step === 'book'">
            <p v-if="!loading && !filteredBooks.length" class="empty">
              书库暂无可用小说，请先在书库创建并写入章节。
            </p>
            <button
              v-for="p in filteredBooks"
              :key="p.id"
              type="button"
              class="row"
              @click="openBook(p)"
            >
              <div class="cover">
                <img v-if="p.coverUrl" :src="p.coverUrl" :alt="p.title" />
                <span v-else>{{ (p.title || '?').slice(0, 1) }}</span>
              </div>
              <div class="meta">
                <strong>{{ p.title || '未命名' }}</strong>
                <span>{{ p.chapterCount || 0 }} 章 · {{ formatWords(p.wordCount) }}字</span>
              </div>
            </button>
          </template>

          <template v-else>
            <p v-if="!loading && !filteredChapters.length" class="empty">
              该作品还没有章节正文。
            </p>
            <button
              v-for="c in filteredChapters"
              :key="c.id"
              type="button"
              class="row chapter"
              :disabled="!chapterHasBody(c)"
              @click="pickChapter(c)"
            >
              <div class="meta">
                <strong>{{ chapterLabel(c) }}</strong>
                <span>
                  {{ chapterHasBody(c) ? `${formatWords(chapterLen(c))}字` : '暂无正文' }}
                </span>
              </div>
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/api';
import { STUDIO_PROJECT_ID } from '@/constants/studio';

export type NovelPickPayload = {
  projectId: string;
  projectTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  body: string;
};

type ProjectRow = {
  id: string;
  title?: string;
  coverUrl?: string;
  chapterCount?: number;
  wordCount?: number;
  archived?: boolean;
};

type ChapterRow = {
  id: string;
  title?: string;
  orderIndex?: number;
  novelBody?: string;
};

const props = defineProps<{
  open: boolean;
  /** 打开时直接进入该书的章节列表（换章继续用） */
  initialProjectId?: string;
}>();
const emit = defineEmits<{
  close: [];
  pick: [payload: NovelPickPayload];
}>();

const loading = ref(false);
const keyword = ref('');
const step = ref<'book' | 'chapter'>('book');
const books = ref<ProjectRow[]>([]);
const chapters = ref<ChapterRow[]>([]);
const activeBook = ref<ProjectRow | null>(null);

const headTitle = computed(() => {
  if (step.value === 'chapter' && activeBook.value) {
    return activeBook.value.title || '选择章节';
  }
  return props.initialProjectId ? '选择章节继续改编' : '从书库选用小说';
});

const filteredBooks = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  const list = books.value;
  if (!q) return list;
  return list.filter((p) => String(p.title || '').toLowerCase().includes(q));
});

const filteredChapters = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  const list = chapters.value;
  if (!q) return list;
  return list.filter((c) => chapterLabel(c).toLowerCase().includes(q));
});

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    step.value = 'book';
    keyword.value = '';
    activeBook.value = null;
    chapters.value = [];
    void loadBooks().then(() => {
      const pid = String(props.initialProjectId || '').trim();
      if (!pid) return;
      const book = books.value.find((b) => b.id === pid);
      if (book) void openBook(book);
    });
  },
);

function formatWords(n?: number) {
  const v = Number(n) || 0;
  if (v >= 10000) return `${(v / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  return String(v);
}

function chapterLen(c: ChapterRow) {
  return String(c.novelBody || '').trim().length;
}

function chapterHasBody(c: ChapterRow) {
  return chapterLen(c) > 0;
}

function chapterLabel(c: ChapterRow) {
  const ord = Number(c.orderIndex) || 0;
  const title = String(c.title || '').trim() || '未命名章节';
  return `第${ord || '?'}章 · ${title}`;
}

async function loadBooks() {
  loading.value = true;
  try {
    const { data } = await api.get('/projects', { params: { archived: '1' } });
    const rows = (Array.isArray(data) ? data : []) as ProjectRow[];
    books.value = rows.filter(
      (p) => !p.archived && p.id !== STUDIO_PROJECT_ID && (p.chapterCount || 0) > 0,
    );
  } catch (e: any) {
    books.value = [];
    ElMessage.error(e?.response?.data?.message || e?.message || '加载书库失败');
  } finally {
    loading.value = false;
  }
}

async function openBook(p: ProjectRow) {
  activeBook.value = p;
  step.value = 'chapter';
  keyword.value = '';
  loading.value = true;
  try {
    const { data } = await api.get(`/projects/${p.id}/chapters`);
    chapters.value = (Array.isArray(data) ? data : []) as ChapterRow[];
  } catch (e: any) {
    chapters.value = [];
    ElMessage.error(e?.response?.data?.message || e?.message || '加载章节失败');
  } finally {
    loading.value = false;
  }
}

function backToBooks() {
  step.value = 'book';
  keyword.value = '';
  activeBook.value = null;
  chapters.value = [];
}

function pickChapter(c: ChapterRow) {
  const body = String(c.novelBody || '').trim();
  if (!body) {
    ElMessage.warning('该章节暂无正文');
    return;
  }
  const book = activeBook.value;
  if (!book) return;
  emit('pick', {
    projectId: book.id,
    projectTitle: String(book.title || '未命名'),
    chapterId: c.id,
    chapterTitle: String(c.title || '').trim() || '未命名章节',
    chapterOrder: Number(c.orderIndex) || 0,
    body,
  });
  emit('close');
}

function close() {
  emit('close');
}
</script>

<style scoped>
.np-mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: color-mix(in srgb, #000 45%, transparent);
  display: grid;
  place-items: center;
  padding: 20px;
}

.np-panel {
  width: min(440px, 100%);
  max-height: min(72vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  color: var(--ink);
  box-shadow:
    0 12px 40px color-mix(in srgb, #000 18%, transparent),
    0 2px 10px color-mix(in srgb, #000 8%, transparent);
  overflow: hidden;
}

.np-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
}

.np-head strong {
  flex: 1;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.back,
.x {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.back:hover,
.x:hover {
  background: var(--hover-bg);
  color: var(--ink);
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 14px 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--bg-3);
  border: 1px solid var(--line);
}

.search-ico {
  color: var(--muted);
  font-size: 13px;
}

.search input {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--ink);
  outline: none;
  font-size: 13px;
}

.search input::placeholder {
  color: var(--muted);
}

.np-body {
  flex: 1;
  overflow: auto;
  padding: 10px 10px 14px;
  min-height: 180px;
}

.empty {
  margin: 28px 12px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  background: transparent;
  color: var(--ink);
  padding: 10px;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.row:hover:not(:disabled) {
  background: var(--hover-bg);
}

.row:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cover {
  width: 44px;
  height: 58px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--muted);
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta span {
  font-size: 12px;
  color: var(--muted);
}

.row.chapter .meta {
  width: 100%;
}
</style>
