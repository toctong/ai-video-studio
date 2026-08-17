<template>
  <div class="projects-page">
    <header class="projects-head">
      <div class="head-left">
        <h1>制作大片</h1>
        <p>创建项目，从剧本到成片一气呵成</p>
      </div>
      <div class="head-right">
        <label class="search-pill">
          <UiIcon name="search" :size="15" />
          <input v-model="keyword" type="search" placeholder="搜索项目" />
        </label>
        <button type="button" class="head-btn ghost" @click="openCreateCollection">创建合集</button>
        <button type="button" class="head-btn ghost" @click="openCreateFromNovel">从小说创建</button>
        <button type="button" class="head-btn primary" @click="openCreateEpisode">
          <UiIcon name="plus" :size="15" />
          创建项目
        </button>
      </div>
    </header>

    <div class="filter-tabs" role="tablist" aria-label="项目类型">
      <button
        v-for="tab in listTabs"
        :key="tab.key"
        type="button"
        class="filter-tab"
        :class="{ on: listFilter === tab.key }"
        role="tab"
        :aria-selected="listFilter === tab.key"
        @click="listFilter = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="project-grid" v-loading="loading">
      <button type="button" class="proj-card create" @click="openCreateEpisode">
        <span class="create-plus">+</span>
        <strong>创建项目</strong>
        <em>空白项目，进入六步流水线</em>
      </button>

      <article
        v-for="c in filtered"
        :key="c.id"
        class="proj-card item"
        :class="{ series: !isStandalone(c) }"
        @click="openCollectionOrProject(c)"
      >
        <div class="cover" :class="{ empty: !c.thumbUrl }">
          <img v-if="c.thumbUrl" :src="c.thumbUrl" :alt="c.name" loading="lazy" />
          <span v-else class="cover-placeholder">{{ coverInitial(c) }}</span>
          <span class="cover-badge">{{ isStandalone(c) ? '单集' : `${episodeCount(c.id)} 集` }}</span>
        </div>
        <div class="card-ops" @click.stop>
          <button type="button" title="重命名" @click="rename(c)">
            <UiIcon name="pencil" :size="15" />
          </button>
          <button type="button" title="删除" class="danger" @click="remove(c)">
            <UiIcon name="trash" :size="15" />
          </button>
        </div>
        <div class="meta">
          <strong :title="c.name">{{ c.name || (isStandalone(c) ? '未命名项目' : '未命名合集') }}</strong>
          <span>{{ sourceLabel(c) }} · {{ relativeTime(c) }}</span>
        </div>
      </article>
    </div>

    <p v-if="!loading && !filtered.length" class="empty-hint">
      {{ keyword.trim() ? '没有匹配的项目' : '还没有项目，点击「创建项目」开始制作' }}
    </p>

    <Teleport to="body">
      <div v-if="novelOpen" class="novel-mask" @mousedown.self="novelOpen = false">
        <div class="novel-panel" role="dialog" aria-label="选择小说">
          <header class="novel-head">
            <strong>选择要改编的小说</strong>
            <button type="button" class="x" @click="novelOpen = false">×</button>
          </header>
          <label class="search-pill novel-search">
            <UiIcon name="search" :size="15" />
            <input v-model="novelKeyword" type="search" placeholder="搜索书名" />
          </label>
          <div v-loading="novelLoading" class="novel-list">
            <button
              v-for="b in filteredNovels"
              :key="b.id"
              type="button"
              class="novel-row"
              :disabled="creating"
              @click="createFromBook(b)"
            >
              <div class="n-cover">
                <img v-if="b.coverUrl" :src="b.coverUrl" :alt="b.title" />
                <span v-else>{{ (b.title || '?').slice(0, 1) }}</span>
              </div>
              <div class="n-meta">
                <strong>{{ b.title || '未命名' }}</strong>
                <span>{{ b.chapterCount || 0 }} 章</span>
              </div>
            </button>
            <p v-if="!novelLoading && !filteredNovels.length" class="empty-inline">
              暂无小说，请先到书库创建作品并写章节。
            </p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import UiIcon from '@/components/icons/UiIcon.vue';
import {
  createFilmCollection,
  createFilmFromNovel,
  createFilmProject,
  fetchFilmCollections,
  fetchFilmEpisodes,
  isFilmEpisode,
  removeFilmCollection,
  updateFilmProject,
  type FilmCollection,
  type FilmProject,
} from '@/api/film-projects';
import { fetchProductions } from '@/api/productions';
import {
  fetchNovelOutline,
  listNovelBooks,
  type NovelBookRow,
} from '@/utils/film-novel';

const router = useRouter();
const collections = ref<FilmCollection[]>([]);
const episodes = ref<FilmProject[]>([]);
const loading = ref(false);
const keyword = ref('');
const listFilter = ref<'all' | 'solo' | 'series'>('all');
const novelOpen = ref(false);
const novelLoading = ref(false);
const novelKeyword = ref('');
const novels = ref<NovelBookRow[]>([]);
const creating = ref(false);

const listTabs = [
  { key: 'all' as const, label: '全部' },
  { key: 'solo' as const, label: '单集项目' },
  { key: 'series' as const, label: '合集' },
];

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  let list = [...collections.value].sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(
      String(a.updatedAt || a.createdAt || ''),
    ),
  );
  if (listFilter.value === 'solo') list = list.filter((c) => isStandalone(c));
  if (listFilter.value === 'series') list = list.filter((c) => !isStandalone(c));
  if (!q) return list;
  return list.filter((c) =>
    `${c.name} ${c.description || ''} ${c.meta?.sourceBookTitle || ''}`
      .toLowerCase()
      .includes(q),
  );
});

const filteredNovels = computed(() => {
  const q = novelKeyword.value.trim().toLowerCase();
  if (!q) return novels.value;
  return novels.value.filter((b) => (b.title || '').toLowerCase().includes(q));
});

function episodeCount(collectionId: string) {
  return episodes.value.filter(
    (e) => String(e.meta?.collectionId || e.folderId || '') === collectionId,
  ).length;
}

function sourceLabel(c: FilmCollection) {
  if (c.meta?.sourceBookTitle) return `改编自《${c.meta.sourceBookTitle}》`;
  if (c.meta?.sourceBookId) return '小说改编';
  if (isStandalone(c)) return '空白项目';
  return '空白合集';
}

function isStandalone(c: FilmCollection) {
  return String(c.meta?.entryMode || '') === 'standalone';
}

function coverInitial(c: FilmCollection) {
  return String(c.name || '项').trim().slice(0, 1) || '项';
}

function relativeTime(c: FilmCollection) {
  const raw = c.updatedAt || c.createdAt;
  if (!raw) return '刚刚';
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return '刚刚';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function open(id: string) {
  router.push(`/films/c/${id}`);
}

function openEpisode(id: string) {
  router.push(`/films/${id}?step=1`);
}

function openCollectionOrProject(c: FilmCollection) {
  if (!isStandalone(c)) {
    open(c.id);
    return;
  }
  const eps = episodes.value
    .filter((e) => String(e.meta?.collectionId || e.folderId || '') === c.id)
    .sort(
      (a, b) => Number(a.meta?.episodeIndex || 0) - Number(b.meta?.episodeIndex || 0),
    );
  const ep = eps[0];
  if (ep) openEpisode(ep.id);
  else open(c.id);
}

async function migrateOrphanEpisodes() {
  const rows = await fetchProductions();
  const orphans = rows.filter(
    (r) =>
      isFilmEpisode(r) &&
      !String((r.meta as any)?.collectionId || '').trim() &&
      !String(r.folderId || '').trim(),
  );
  for (const ep of orphans) {
    const col = await createFilmCollection(ep.name || '未命名项目', {
      sourceBookId: String((ep.meta as any)?.sourceBookId || ep.projectId || ''),
      sourceBookTitle: String((ep.meta as any)?.sourceBookTitle || ''),
      entryMode: 'standalone',
    });
    await updateFilmProject(ep.id, {
      name: ep.name || '未命名项目',
      folderId: col.id,
      meta: {
        ...(ep.meta || {}),
        kind: 'film',
        collectionId: col.id,
        episodeIndex: 1,
        entryMode: 'standalone',
      },
    });
  }
}

async function load() {
  loading.value = true;
  try {
    await migrateOrphanEpisodes();
    collections.value = await fetchFilmCollections();
    episodes.value = await fetchFilmEpisodes();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function openCreateCollection() {
  try {
    const { value } = await ElMessageBox.prompt('输入合集名称', '创建合集', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValidator: (v) => (String(v || '').trim() ? true : '名称不能为空'),
    });
    const col = await createFilmCollection(String(value).trim(), {
      entryMode: 'series',
    });
    ElMessage.success('合集已创建');
    open(col.id);
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  }
}

async function openCreateEpisode() {
  try {
    const { value } = await ElMessageBox.prompt('输入项目名称', '创建项目', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValue: '未命名项目',
      inputValidator: (v) => (String(v || '').trim() ? true : '名称不能为空'),
    });
    const name = String(value).trim();
    const project = await createFilmProject(name);
    ElMessage.success('项目已创建');
    openEpisode(project.id);
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  }
}

async function openCreateFromNovel() {
  novelOpen.value = true;
  novelKeyword.value = '';
  novelLoading.value = true;
  try {
    novels.value = await listNovelBooks();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载小说失败');
  } finally {
    novelLoading.value = false;
  }
}

async function createFromBook(b: NovelBookRow) {
  if (creating.value) return;
  creating.value = true;
  try {
    let outline = '';
    try {
      outline = await fetchNovelOutline(b.id);
    } catch {
      outline = '';
    }
    const episode = await createFilmFromNovel({
      bookId: b.id,
      bookTitle: b.title,
      outlineSnapshot: outline,
    });
    novelOpen.value = false;
    ElMessage.success('已创建项目，请选择章节并改编');
    openEpisode(episode.id);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function rename(c: FilmCollection) {
  const isSolo = isStandalone(c);
  try {
    const { value } = await ElMessageBox.prompt(
      isSolo ? '输入新的项目名称' : '输入新的合集名称',
      '重命名',
      {
        inputValue: c.name || (isSolo ? '未命名项目' : '未命名合集'),
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValidator: (v) => (String(v || '').trim() ? true : '名称不能为空'),
      },
    );
    const name = String(value).trim();
    await updateFilmProject(c.id, { name });
    if (isSolo) {
      const eps = episodes.value.filter(
        (e) => String(e.meta?.collectionId || e.folderId || '') === c.id,
      );
      for (const ep of eps) {
        await updateFilmProject(ep.id, {
          name,
          meta: { ...(ep.meta || {}), entryMode: 'standalone', kind: 'film' },
        });
      }
    }
    ElMessage.success('已重命名');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '重命名失败');
  }
}

async function remove(c: FilmCollection) {
  const isSolo = isStandalone(c);
  try {
    await ElMessageBox.confirm(
      isSolo
        ? `确定删除项目「${c.name || '未命名'}」？`
        : `确定删除合集「${c.name || '未命名'}」及其全部剧集？`,
      isSolo ? '删除项目' : '删除合集',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
    await removeFilmCollection(c.id);
    ElMessage.success('已删除');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  }
}

onMounted(load);
</script>

<style scoped>
.projects-page {
  max-width: 1280px;
  margin: 0 auto;
  min-height: 100%;
  padding: 22px 28px 52px;
  box-sizing: border-box;
  color: var(--studio-ink);
}

.projects-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.head-left h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.head-left p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--studio-muted);
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
  height: 36px;
  min-width: 200px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line);
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

.head-btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
}
.head-btn.ghost {
  background: transparent;
  border: 1px solid var(--studio-line-strong);
  color: var(--studio-ink);
}
.head-btn.ghost:hover {
  background: var(--studio-glass-2);
}
.head-btn.primary {
  background: #10b981;
  color: #052e1c;
  font-weight: 650;
}
.head-btn.primary:hover {
  background: #34d399;
}

.filter-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}
.filter-tab {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.filter-tab:hover {
  color: var(--studio-ink);
  background: var(--studio-glass-2);
}
.filter-tab.on {
  background: var(--studio-panel-3);
  color: var(--studio-ink);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}

.proj-card {
  position: relative;
  border: 1px solid var(--studio-line);
  border-radius: 18px;
  background: var(--studio-panel);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}
.proj-card:hover {
  transform: translateY(-2px);
  border-color: var(--studio-line-bright);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
}
.proj-card.create {
  min-height: 214px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-style: dashed;
  border-color: rgba(52, 211, 153, 0.35);
  background:
    radial-gradient(80% 70% at 50% 0%, rgba(52, 211, 153, 0.12), transparent 65%),
    var(--studio-panel);
  color: var(--studio-muted);
}
.proj-card.create:hover {
  border-color: #34d399;
  color: #ecfdf5;
}
.create-plus {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
  font-size: 28px;
  font-weight: 300;
  line-height: 1;
}
.proj-card.create strong {
  font-size: 15px;
  color: inherit;
}
.proj-card.create em {
  font-style: normal;
  font-size: 12px;
  opacity: 0.75;
}

.cover {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--studio-inset);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cover-placeholder {
  font-size: 36px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.22);
  letter-spacing: -0.04em;
}
.cover-badge {
  position: absolute;
  left: 10px;
  bottom: 10px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
}

.card-ops {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.proj-card.item:hover .card-ops {
  opacity: 1;
}
.card-ops button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.card-ops button.danger:hover {
  background: rgba(220, 38, 38, 0.75);
}

.meta {
  padding: 12px 14px 14px;
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
.meta span {
  font-size: 12px;
  color: var(--studio-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-hint {
  margin: 40px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--studio-muted);
}

.novel-mask {
  position: fixed;
  inset: 0;
  z-index: 4000;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 24px;
}
.novel-panel {
  width: min(520px, 100%);
  max-height: min(70vh, 640px);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line-strong);
  overflow: hidden;
  color: var(--studio-ink);
}
.novel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--studio-line-strong);
}
.novel-head .x {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font-size: 20px;
  cursor: pointer;
}
.novel-search {
  margin: 12px 16px 0;
  width: auto;
  align-self: stretch;
}
.novel-list {
  flex: 1;
  overflow: auto;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.novel-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--studio-inset);
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.novel-row:hover:not(:disabled) {
  border-color: var(--studio-line-bright);
}
.n-cover {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--studio-panel-3);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--studio-muted);
  font-weight: 700;
}
.n-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.n-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.n-meta strong {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.n-meta span,
.empty-inline {
  font-size: 12px;
  color: var(--studio-muted);
}

@media (max-width: 720px) {
  .projects-page {
    padding: 16px 14px 40px;
  }
  .head-left h1 {
    font-size: 22px;
  }
}
</style>
