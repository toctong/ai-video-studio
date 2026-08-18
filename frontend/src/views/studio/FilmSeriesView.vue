<template>
  <div class="series-page">
    <header class="series-head">
      <div class="crumb">
        <button type="button" class="crumb-link" @click="$router.push('/productions')">我的项目</button>
        <span class="sep">›</span>
        <strong>{{ collection?.name || '合集' }}</strong>
      </div>
      <div class="head-actions">
        <el-select v-model="sortKey" size="default" style="width: 140px">
          <el-option label="更新时间倒序" value="updated" />
          <el-option label="集数正序" value="index" />
        </el-select>
        <button
          v-if="isSeriesCollection"
          type="button"
          class="pill-btn"
          @click="outlineDialogVisible = true"
        >
          合集大纲
        </button>
        <button type="button" class="pill-btn" @click="renameCollection">全剧设置</button>
        <button type="button" class="pill-btn" disabled title="二期支持">导入剧集</button>
        <button type="button" class="pill-btn primary" @click="createEpisode">
          <UiIcon name="plus" :size="14" />
          创建一集
        </button>
      </div>
    </header>

    <el-dialog
      v-model="outlineDialogVisible"
      title="合集大纲"
      width="640px"
      class="outline-dialog"
      append-to-body
    >
      <p class="outline-hint">由第 1 集生成或导入剧集时自动识别，供后续剧集创作参考。</p>
      <UiScroll v-if="hasOutline" class="outline-scroll" always :max-height="'min(60vh, 480px)'">
        <div class="outline-body">{{ seriesOutlineText }}</div>
      </UiScroll>
      <div v-else class="outline-empty">暂无大纲。创建或导入第 1 集后会自动生成。</div>
    </el-dialog>

    <div v-loading="loading" class="series-body">
      <template v-if="!loading && !sortedEpisodes.length">
        <div class="empty-state">
          <div class="empty-art" aria-hidden="true">
            <UiIcon name="clapperboard" :size="56" />
          </div>
          <p>还没有剧集，点击以下按钮添加吧</p>
          <div class="empty-actions">
            <button
              type="button"
              class="pill-btn wide"
              disabled
              title="二期支持"
            >
              导入剧集
            </button>
            <button type="button" class="pill-btn wide accent" @click="createEpisode">
              创建第1集
            </button>
          </div>
        </div>
      </template>

      <div v-else class="ep-grid">
        <article
          v-for="ep in sortedEpisodes"
          :key="ep.id"
          class="ep-tile"
          @click="openEpisode(ep.id)"
        >
          <div class="ep-cover" :class="{ empty: !ep.thumbUrl }">
            <LazyCoverImage v-if="ep.thumbUrl" :src="ep.thumbUrl" :alt="ep.name" />
            <UiIcon v-else name="film" :size="28" />
            <span class="ep-badge">第{{ ep.meta?.episodeIndex || '?' }}集</span>
          </div>
          <div class="ep-ops" @click.stop>
            <button type="button" title="重命名" @click="renameEpisode(ep)">
              <UiIcon name="pencil" :size="14" />
            </button>
            <button type="button" title="删除" class="danger" @click="removeEpisode(ep)">
              <UiIcon name="trash" :size="14" />
            </button>
          </div>
          <div class="ep-meta">
            <strong>{{ ep.name || `第${ep.meta?.episodeIndex || 1}集` }}</strong>
            <em>步骤 {{ Number(ep.meta?.currentStep) || 1 }}/6</em>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import UiIcon from '@/components/icons/UiIcon.vue';
import LazyCoverImage from '@/components/LazyCoverImage.vue';
import { UiScroll } from '@/components/ui';
import {
  createFilmEpisode,
  fetchFilmCollection,
  fetchFilmEpisodes,
  removeFilmProject,
  updateFilmProject,
  type FilmCollection,
  type FilmProject,
} from '@/api/film-projects';

const route = useRoute();
const router = useRouter();

const collectionId = computed(() => String(route.params.collectionId || ''));
const collection = ref<FilmCollection | null>(null);
const episodes = ref<FilmProject[]>([]);
const loading = ref(false);
const sortKey = ref<'updated' | 'index'>('updated');
const outlineDialogVisible = ref(false);

const isSeriesCollection = computed(() => {
  const mode = collection.value?.meta?.entryMode;
  if (mode === 'standalone') return false;
  // 未标记时按合集页进入视为系列
  return mode === 'series' || mode == null;
});

const seriesOutlineText = computed(() =>
  String(collection.value?.meta?.seriesOutline || '').trim(),
);
const hasOutline = computed(() => !!seriesOutlineText.value);

const sortedEpisodes = computed(() => {
  const list = [...episodes.value];
  if (sortKey.value === 'index') {
    return list.sort(
      (a, b) => Number(a.meta?.episodeIndex || 0) - Number(b.meta?.episodeIndex || 0),
    );
  }
  return list.sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(
      String(a.updatedAt || a.createdAt || ''),
    ),
  );
});

function openEpisode(id: string) {
  router.push(`/films/${id}?step=1`);
}

async function load() {
  const cid = collectionId.value;
  if (!cid) return;
  loading.value = true;
  try {
    collection.value = await fetchFilmCollection(cid);
    episodes.value = await fetchFilmEpisodes(cid);
    // 单集项目：不进合集文件夹页，直接进制作
    if (collection.value.meta?.entryMode === 'standalone' && episodes.value.length) {
      const ep = [...episodes.value].sort(
        (a, b) => Number(a.meta?.episodeIndex || 0) - Number(b.meta?.episodeIndex || 0),
      )[0];
      if (ep) {
        await router.replace(`/films/${ep.id}?step=1`);
        return;
      }
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function createEpisode() {
  const cid = collectionId.value;
  if (!cid) return;
  const nextIndex =
    episodes.value.reduce((m, e) => Math.max(m, Number(e.meta?.episodeIndex) || 0), 0) + 1;
  const defaultName = `第${nextIndex}集`;
  try {
    const { value } = await ElMessageBox.prompt('输入本集名称', '创建一集', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValue: defaultName,
      inputValidator: (v) => (String(v || '').trim() ? true : '名称不能为空'),
    });
    const ep = await createFilmEpisode({
      collectionId: cid,
      name: String(value).trim(),
      episodeIndex: nextIndex,
      sourceBookId: String(collection.value?.meta?.sourceBookId || ''),
      sourceBookTitle: String(collection.value?.meta?.sourceBookTitle || ''),
      outlineSnapshot: seriesOutlineText.value,
      adaptedFrom: collection.value?.meta?.sourceBookId ? 'novel' : 'blank',
      entryMode: isSeriesCollection.value ? 'series' : 'standalone',
    });
    ElMessage.success(nextIndex === 1 ? '已创建第1集' : '已创建剧集');
    openEpisode(ep.id);
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  }
}

async function renameCollection() {
  if (!collection.value) return;
  try {
    const { value } = await ElMessageBox.prompt('合集名称', '全剧设置', {
      inputValue: collection.value.name || '未命名合集',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (v) => (String(v || '').trim() ? true : '名称不能为空'),
    });
    await updateFilmProject(collection.value.id, { name: String(value).trim() });
    ElMessage.success('已保存');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '保存失败');
  }
}

async function renameEpisode(ep: FilmProject) {
  try {
    const { value } = await ElMessageBox.prompt('剧集名称', '重命名', {
      inputValue: ep.name || '第1集',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (v) => (String(v || '').trim() ? true : '名称不能为空'),
    });
    await updateFilmProject(ep.id, { name: String(value).trim() });
    ElMessage.success('已重命名');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '重命名失败');
  }
}

async function removeEpisode(ep: FilmProject) {
  try {
    await ElMessageBox.confirm(`确定删除「${ep.name || '本集'}」？`, '删除剧集', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await removeFilmProject(ep.id);
    ElMessage.success('已删除');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  }
}

watch(collectionId, load);
onMounted(load);
</script>

<style scoped>
.series-page {
  min-height: 100%;
  padding: 20px 28px 48px;
  box-sizing: border-box;
  background: var(--studio-bg);
  color: var(--studio-ink);
}

.series-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
}

.crumb-link {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  cursor: pointer;
  padding: 0;
}
.crumb-link:hover {
  color: var(--studio-ink);
}

.sep {
  color: var(--studio-faint);
}

.crumb strong {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pill-btn {
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--studio-line-bright);
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pill-btn:hover:not(:disabled) {
  background: var(--studio-glass-2);
}
.pill-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pill-btn.primary {
  border: 0;
  background: var(--studio-ink);
  color: var(--studio-bg);
  font-weight: 600;
  border-radius: 10px;
}
.pill-btn.wide {
  min-width: 160px;
  height: 42px;
  justify-content: center;
  border-radius: 999px;
}
.pill-btn.wide.accent {
  border-color: var(--studio-ink);
  color: var(--studio-ink);
}

.outline-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--studio-faint);
  line-height: 1.5;
}

.outline-scroll {
  min-height: 0;
}

.outline-body {
  max-height: none;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.65;
  color: var(--studio-ink);
}

.outline-empty {
  padding: 28px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--studio-faint);
}

.series-body {
  min-height: 320px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 64px 24px;
  text-align: center;
}

.empty-art {
  width: 120px;
  height: 120px;
  border-radius: 24px;
  background: var(--studio-inset);
  display: grid;
  place-items: center;
  color: var(--studio-muted);
}

.empty-state p {
  margin: 0;
  font-size: 15px;
  color: var(--studio-muted);
}

.empty-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 8px;
}

.ep-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.ep-tile {
  position: relative;
  cursor: pointer;
  border: 0;
  background: transparent;
  padding: 0;
}

.ep-cover {
  aspect-ratio: 16 / 9;
  background: var(--studio-inset);
  display: grid;
  place-items: center;
  color: var(--studio-muted);
  overflow: hidden;
  position: relative;
}
.ep-cover.empty {
  background: var(--studio-inset-2);
}
.ep-cover :deep(.lazy-cover),
.ep-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ep-badge {
  position: absolute;
  left: 8px;
  top: 8px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}

.ep-ops {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.ep-tile:hover .ep-ops {
  opacity: 1;
}
.ep-ops button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.ep-ops button.danger:hover {
  background: rgba(220, 38, 38, 0.75);
}

.ep-meta {
  padding: 10px 2px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ep-meta strong {
  font-size: 14px;
  font-weight: 600;
}
.ep-meta em {
  font-style: normal;
  font-size: 12px;
  color: var(--studio-faint);
}
</style>
