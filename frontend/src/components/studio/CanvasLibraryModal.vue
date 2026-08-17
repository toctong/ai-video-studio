<template>
  <CanvasRailPanel :open="open" title="素材库" size="lg" @close="close">
    <template #ops>
      <button
        type="button"
        class="lib-ico"
        title="上传"
        aria-label="上传"
        :disabled="uploading"
        @click.stop="uploadAssets"
      >
        <UiIcon name="upload" :size="16" />
      </button>
      <div class="sort-wrap">
        <button
          type="button"
          class="lib-ico"
          title="排序"
          aria-label="排序"
          @click.stop="sortOpen = !sortOpen"
        >
          <UiIcon name="arrow-up-down" :size="16" />
        </button>
        <div v-if="sortOpen" class="sort-menu" @mousedown.stop>
          <button
            v-for="opt in sortOptions"
            :key="opt.id"
            type="button"
            class="sort-row"
            :class="{ on: sortBy === opt.id }"
            @click="setSort(opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </template>

    <div class="lib-panel">
      <div class="scope-row" role="tablist" aria-label="素材范围">
        <button
          v-for="s in scopeTabs"
          :key="s.id"
          type="button"
          class="scope-tab"
          :class="{ on: scopeTab === s.id }"
          role="tab"
          :aria-selected="scopeTab === s.id"
          @click="scopeTab = s.id"
        >
          {{ s.label }}
          <em v-if="scopeCounts[s.id]">{{ scopeCounts[s.id] }}</em>
        </button>
      </div>

      <label class="search">
        <UiIcon name="search" :size="14" />
        <input v-model="keyword" type="search" :placeholder="searchPlaceholder" />
      </label>

      <div class="type-row" role="tablist" aria-label="素材类型">
        <button
          v-for="t in typeFilters"
          :key="t.id"
          type="button"
          class="type-pill"
          :class="{ on: typeFilter === t.id }"
          role="tab"
          :aria-selected="typeFilter === t.id"
          @click="typeFilter = t.id"
        >
          {{ t.label }}
          <em v-if="typeCounts[t.id]">{{ typeCounts[t.id] }}</em>
        </button>
      </div>

      <div class="asset-grid" v-loading="assetsLoading">
        <div
          v-for="a in visibleAssets"
          :key="a.id"
          class="asset-card"
          :class="{ 'menu-on': assetMoreFor === a.id }"
          draggable="true"
          :title="assetCardTitle(a)"
          @dragstart="onAssetDragStart($event, a)"
          @click.prevent
          @contextmenu.prevent="openAssetMore($event, a)"
        >
          <div class="asset-thumb">
            <img v-if="isImage(a)" :src="a.url" alt="" draggable="false" />
            <LazyVideoThumb
              v-else-if="isVideo(a)"
              :src="a.url || ''"
              :poster-url="String(a.meta?.posterUrl || '')"
            />
            <div v-else class="ph">{{ (a.type || '?').slice(0, 1) }}</div>
            <span v-if="isVideo(a)" class="badge-type video">视频</span>
            <span v-else-if="isImage(a)" class="badge-type image">图片</span>
            <span v-else-if="isAudio(a)" class="badge-type audio">音频</span>
            <button
              type="button"
              class="asset-del"
              title="删除"
              :disabled="deletingId === a.id"
              @click.stop="deleteAsset(a)"
              @mousedown.stop
              @dragstart.prevent
            >
              <UiIcon name="trash" :size="13" />
            </button>
          </div>
          <div class="asset-meta">
            <strong>{{ a.name || a.id.slice(0, 8) }}</strong>
            <span v-if="scopeTab === 'other' && assetSourceLabel(a)" class="asset-src">
              {{ assetSourceLabel(a) }}
            </span>
          </div>
        </div>

        <div v-if="!assetsLoading && !visibleAssets.length" class="empty">
          <UiIcon name="image" :size="36" />
          <strong>{{ emptyTitle }}</strong>
          <p>{{ emptyHint }}</p>
          <button
            v-if="scopeTab === 'current'"
            type="button"
            class="empty-upload"
            :disabled="uploading"
            @click="uploadAssets"
          >
            {{ uploading ? '上传中…' : '上传文件' }}
          </button>
        </div>
      </div>
    </div>

    <template #foot>
      <span class="hint">拖到画布添加 · 悬停或右键可删除</span>
    </template>
  </CanvasRailPanel>

  <Teleport to="body">
    <div
      v-if="assetMoreFor"
      class="more-root"
      @mousedown.self="assetMoreFor = null"
      @contextmenu.prevent
    >
      <div class="more-menu" :style="assetMoreStyle" @mousedown.stop @click.stop>
        <button
          type="button"
          class="more-row danger"
          :disabled="deletingId === assetMoreFor"
          @click="deleteAssetFromMenu()"
        >
          <UiIcon name="trash" :size="14" />
          删除文件
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { AssetType } from '@ai-video-studio/shared';
import api from '@/api';
import type { LibraryKind } from '@/libraries';
import CanvasRailPanel from '@/components/studio/CanvasRailPanel.vue';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import { pickLocalFile, uploadProjectAsset } from '@/utils/upload-asset';

type MediaAsset = {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
};

const props = defineProps<{
  open: boolean;
  projectId?: string;
  workflowId?: string;
  workflowName?: string;
  /** @deprecated 不再按库分类打开 */
  initialTab?: LibraryKind;
  applyMode?: 'auto' | 'script' | 'node-prompt';
}>();

const emit = defineEmits<{
  close: [];
  apply: [payload: Record<string, unknown>];
  pick: [asset: MediaAsset];
}>();

type SortId = 'time-desc' | 'time-asc' | 'name-asc' | 'name-desc';
type MediaFilter = 'all' | 'image' | 'video';
type ScopeId = 'current' | 'other';

const sortOptions: { id: SortId; label: string }[] = [
  { id: 'time-desc', label: '时间新 → 旧' },
  { id: 'time-asc', label: '时间旧 → 新' },
  { id: 'name-asc', label: '名称 A → Z' },
  { id: 'name-desc', label: '名称 Z → A' },
];

const scopeTabs: { id: ScopeId; label: string }[] = [
  { id: 'current', label: '本项目' },
  { id: 'other', label: '其他项目' },
];

const typeFilters: { id: MediaFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
];

const keyword = ref('');
const scopeTab = ref<ScopeId>('current');
const typeFilter = ref<MediaFilter>('all');
const projectAssets = ref<MediaAsset[]>([]);
const assetsLoading = ref(false);
const uploading = ref(false);
const assetMoreFor = ref<string | null>(null);
const assetMorePos = reactive({ x: 0, y: 0 });
const deletingId = ref('');
const sortOpen = ref(false);
const sortBy = ref<SortId>('time-desc');

const sortStorageKey = computed(
  () => `lumina-lib-sort-${props.projectId || props.workflowId || 'global'}`,
);

const assetMoreTarget = computed(
  () => projectAssets.value.find((a) => a.id === assetMoreFor.value) || null,
);
const assetMoreStyle = computed(() => ({
  left: `${assetMorePos.x}px`,
  top: `${assetMorePos.y}px`,
}));

const currentWorkflowId = computed(() => String(props.workflowId || '').trim());

function assetWorkflowId(a: MediaAsset) {
  return String(a.meta?.workflowId || '').trim();
}

function assetSourceLabel(a: MediaAsset) {
  const name = String(a.meta?.workflowName || '').trim();
  if (name) return name;
  const wid = assetWorkflowId(a);
  return wid ? `工作流 ${wid.slice(0, 8)}` : '';
}

function isCurrentProjectAsset(a: MediaAsset) {
  const wid = currentWorkflowId.value;
  const aw = assetWorkflowId(a);
  // 无 workflow 标记的视为本项目可用；有标记则必须匹配当前工作流
  if (!wid) return !aw;
  return !aw || aw === wid;
}

function isOtherProjectAsset(a: MediaAsset) {
  const wid = currentWorkflowId.value;
  const aw = assetWorkflowId(a);
  if (!aw) return false;
  return !wid || aw !== wid;
}

const mediaAssets = computed(() => projectAssets.value.filter((a) => isMedia(a)));

const scopedMediaAssets = computed(() =>
  mediaAssets.value.filter((a) =>
    scopeTab.value === 'current' ? isCurrentProjectAsset(a) : isOtherProjectAsset(a),
  ),
);

const scopeCounts = computed(() => ({
  current: mediaAssets.value.filter((a) => isCurrentProjectAsset(a)).length,
  other: mediaAssets.value.filter((a) => isOtherProjectAsset(a)).length,
}));

const typeCounts = computed(() => {
  const list = scopedMediaAssets.value;
  return {
    all: list.length,
    image: list.filter((a) => isImage(a)).length,
    video: list.filter((a) => isVideo(a)).length,
  };
});

const searchPlaceholder = computed(() =>
  scopeTab.value === 'current' ? '搜索本项目素材' : '搜索其他项目素材',
);

const emptyTitle = computed(() => {
  if (scopeTab.value === 'other') {
    if (typeFilter.value === 'image') return '暂无其他项目图片';
    if (typeFilter.value === 'video') return '暂无其他项目视频';
    return '暂无其他项目素材';
  }
  if (typeFilter.value === 'image') return '暂无本项目图片';
  if (typeFilter.value === 'video') return '暂无本项目视频';
  return '暂无本项目素材';
});

const emptyHint = computed(() => {
  if (scopeTab.value === 'other') return '其他工作流产生的图/视频会出现在这里，可拖到当前画布复用';
  if (typeFilter.value === 'image') return '上传图片后，可拖到画布使用';
  if (typeFilter.value === 'video') return '上传视频后，可拖到画布使用';
  return '点击右上角上传，再拖到画布使用';
});

const visibleAssets = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  let list = scopedMediaAssets.value;
  if (typeFilter.value === 'image') list = list.filter((a) => isImage(a));
  else if (typeFilter.value === 'video') list = list.filter((a) => isVideo(a));
  if (kw) {
    list = list.filter((a) => {
      const src = assetSourceLabel(a);
      return `${a.name || ''} ${a.type || ''} ${src}`.toLowerCase().includes(kw);
    });
  }
  return sortAssets(list);
});

function assetCardTitle(a: MediaAsset) {
  const src = scopeTab.value === 'other' ? assetSourceLabel(a) : '';
  const base = a.name || a.id;
  return src ? `${base} · ${src} · 拖到画布` : `${base} · 拖到画布`;
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    keyword.value = '';
    scopeTab.value = 'current';
    typeFilter.value = 'all';
    assetMoreFor.value = null;
    sortOpen.value = false;
    loadSort();
    void loadAssets();
  },
);

watch(scopeTab, () => {
  keyword.value = '';
  typeFilter.value = 'all';
  assetMoreFor.value = null;
});

function loadSort() {
  try {
    const s = localStorage.getItem(sortStorageKey.value) as SortId | null;
    if (s && sortOptions.some((o) => o.id === s)) sortBy.value = s;
  } catch {
    /* ignore */
  }
}

function setSort(id: SortId) {
  sortBy.value = id;
  sortOpen.value = false;
  try {
    localStorage.setItem(sortStorageKey.value, id);
  } catch {
    /* ignore */
  }
}

async function loadAssets() {
  if (!props.projectId) {
    projectAssets.value = [];
    return;
  }
  assetsLoading.value = true;
  try {
    const { data } = await api.get(`/projects/${props.projectId}/assets`);
    const list: MediaAsset[] = Array.isArray(data) ? data : data?.items || [];
    projectAssets.value = list;
  } catch {
    projectAssets.value = [];
  } finally {
    assetsLoading.value = false;
  }
}

function isMedia(a: MediaAsset) {
  return isVideo(a) || isAudio(a) || isImage(a);
}

function isVideo(a: MediaAsset) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(a.url || '') || a.type === 'video';
}

function isAudio(a: MediaAsset) {
  return /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(a.url || '') || a.type === 'bgm' || a.type === 'sfx';
}

function isImage(a: MediaAsset) {
  if (isVideo(a) || isAudio(a)) return false;
  return (
    /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url || '') ||
    ['storyboard', 'keyframe', 'scene', 'character_ref', 'cover', 'style', 'other'].includes(
      String(a.type || ''),
    )
  );
}

function sortAssets(list: MediaAsset[]) {
  const mode = sortBy.value;
  const next = [...list];
  if (mode === 'name-asc') {
    next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh'));
  } else if (mode === 'name-desc') {
    next.sort((a, b) => String(b.name || '').localeCompare(String(a.name || ''), 'zh'));
  } else if (mode === 'time-asc') {
    next.sort(
      (a, b) =>
        (Date.parse(String(a.createdAt || '')) || 0) - (Date.parse(String(b.createdAt || '')) || 0),
    );
  } else {
    next.sort(
      (a, b) =>
        (Date.parse(String(b.createdAt || '')) || 0) - (Date.parse(String(a.createdAt || '')) || 0),
    );
  }
  return next;
}

function assetTypeForFile(file: File): AssetType {
  if (file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)) return 'video';
  if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(file.name)) return 'bgm';
  return 'cover';
}

async function uploadAssets() {
  if (!props.projectId) {
    ElMessage.warning('缺少项目，无法上传');
    return;
  }
  const files = await pickLocalFile({ accept: 'image/*,video/*,audio/*', multiple: true });
  if (!files.length) return;
  uploading.value = true;
  try {
    for (const file of files) {
      await uploadProjectAsset(props.projectId, file, {
        type: assetTypeForFile(file),
        name: file.name,
        workflowId: props.workflowId,
        workflowName: props.workflowName,
      });
    }
    ElMessage.success(`已上传 ${files.length} 个文件`);
    await loadAssets();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

function openAssetMore(ev: MouseEvent, a: MediaAsset) {
  assetMoreFor.value = a.id;
  assetMorePos.x = Math.min(ev.clientX, window.innerWidth - 160);
  assetMorePos.y = Math.min(ev.clientY, window.innerHeight - 80);
}

function onAssetDragStart(ev: DragEvent, a: MediaAsset) {
  if (!a?.url) {
    ev.preventDefault();
    return;
  }
  ev.dataTransfer?.setData(
    'application/x-studio-asset',
    JSON.stringify({
      id: a.id,
      name: a.name,
      type: a.type,
      url: a.url,
      createdAt: a.createdAt,
      meta: a.meta,
    }),
  );
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  const thumb = (ev.currentTarget as HTMLElement)?.querySelector(
    '.asset-thumb',
  ) as HTMLElement | null;
  if (thumb && ev.dataTransfer) {
    try {
      ev.dataTransfer.setDragImage(thumb, 40, 40);
    } catch {
      /* ignore */
    }
  }
}

async function deleteAssetFromMenu() {
  const a = assetMoreTarget.value;
  assetMoreFor.value = null;
  if (a) await deleteAsset(a);
}

async function deleteAsset(a: MediaAsset) {
  if (!props.projectId || !a?.id || deletingId.value) return;
  try {
    await ElMessageBox.confirm(
      `确定删除「${a.name || a.id.slice(0, 8)}」吗？将同时删除服务器上的真实文件，且不可恢复。`,
      '删除文件',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    );
  } catch {
    return;
  }
  deletingId.value = a.id;
  try {
    await api.delete(`/projects/${props.projectId}/assets/${a.id}`);
    projectAssets.value = projectAssets.value.filter((x) => x.id !== a.id);
    ElMessage.success('已删除文件');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  } finally {
    deletingId.value = '';
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') {
    assetMoreFor.value = null;
    sortOpen.value = false;
  }
}

function onDocPointerDown(e: MouseEvent) {
  if (!sortOpen.value) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('.sort-wrap')) return;
  sortOpen.value = false;
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('mousedown', onDocPointerDown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('mousedown', onDocPointerDown);
});

function close() {
  emit('close');
}
</script>

<style scoped>
.lib-ico {
  width: 30px;
  height: 30px;
  margin: 0;
  padding: 0;
  border: 0 !important;
  outline: none;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-text-soft);
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: none;
  appearance: none;
  -webkit-appearance: none;
}
.lib-ico:hover:not(:disabled) {
  background: var(--studio-glass-2);
  color: #fff;
}
.lib-ico:disabled {
  opacity: 0.4;
  cursor: default;
}

.sort-wrap {
  position: relative;
}
.sort-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 5;
  min-width: 132px;
  padding: 6px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--studio-panel) 98%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.sort-row {
  border: 0 !important;
  outline: none;
  background: transparent;
  color: var(--studio-text);
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  appearance: none;
}
.sort-row:hover,
.sort-row.on {
  background: var(--studio-glass-2);
}

.lib-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
  color: var(--studio-text);
}

.scope-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--studio-glass-2);
  flex-shrink: 0;
}
.scope-tab {
  height: 32px;
  margin: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--studio-text-faint);
  font: inherit;
  font-size: 12.5px;
  font-weight: 550;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.scope-tab em {
  font-style: normal;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.7;
}
.scope-tab:hover {
  color: var(--studio-text-strong);
}
.scope-tab.on {
  background: var(--studio-glass-3);
  color: #fff;
}
.scope-tab.on em {
  opacity: 0.65;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  height: 36px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--studio-glass-3);
  color: var(--studio-text-faint);
  flex-shrink: 0;
}
.search input {
  flex: 1;
  min-width: 0;
  border: 0 !important;
  background: transparent !important;
  color: var(--studio-text) !important;
  outline: none;
  box-shadow: none !important;
  font: inherit;
  font-size: 13px;
}

.type-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}
.type-pill {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-faint);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.type-pill em {
  font-style: normal;
  font-size: 11px;
  opacity: 0.7;
}
.type-pill:hover {
  color: #fff;
  background: var(--studio-glass-2);
}
.type-pill.on {
  background: var(--studio-ink);
  color: var(--studio-bg);
}
.type-pill.on em {
  opacity: 0.55;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
  flex: 1;
  min-height: 200px;
}

.asset-card {
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-glass);
  border-radius: 12px;
  overflow: hidden;
  cursor: grab;
  text-align: left;
  color: inherit;
  padding: 0;
  font: inherit;
  user-select: none;
}
.asset-card:active {
  cursor: grabbing;
}
.asset-card:hover,
.asset-card.menu-on {
  border-color: var(--studio-line-bright);
  background: var(--studio-glass-2);
}

.asset-thumb {
  position: relative;
  aspect-ratio: 1;
  background: rgba(0, 0, 0, 0.28);
}
.asset-thumb img,
.asset-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.ph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--studio-line-bright);
  font-size: 18px;
}

.badge-type {
  position: absolute;
  left: 6px;
  bottom: 6px;
  height: 20px;
  padding: 0 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  pointer-events: none;
  backdrop-filter: blur(8px);
}
.badge-type.image {
  background: rgba(20, 184, 166, 0.88);
  color: #042f2e;
}
.badge-type.video {
  background: rgba(139, 92, 246, 0.9);
  color: #fff;
}
.badge-type.audio {
  background: rgba(245, 158, 11, 0.9);
  color: #1c1917;
}

.asset-del {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  border: 0 !important;
  outline: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.58);
  color: var(--studio-text-strong);
  display: none;
  place-items: center;
  cursor: pointer;
  appearance: none;
}
.asset-card:hover .asset-del,
.asset-card.menu-on .asset-del {
  display: grid;
}
.asset-del:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.9);
  color: #fff;
}
.asset-del:disabled {
  opacity: 0.45;
  cursor: default;
}

.asset-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  min-width: 0;
}
.asset-meta strong {
  display: block;
  font-size: 12px;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-src {
  font-size: 10.5px;
  color: var(--studio-text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 56px 16px;
  color: var(--studio-line-bright);
  text-align: center;
}
.empty strong {
  color: var(--studio-text-soft);
  font-size: 14px;
  font-weight: 600;
}
.empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}
.empty-upload {
  margin-top: 8px;
  height: 34px;
  padding: 0 16px;
  border: 1px solid var(--studio-line-strong);
  border-radius: 999px;
  background: var(--studio-glass-2);
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.empty-upload:hover:not(:disabled) {
  background: var(--studio-glass-3);
}
.empty-upload:disabled {
  opacity: 0.45;
  cursor: default;
}

.hint {
  font-size: 11px;
  color: var(--studio-text-faint);
  line-height: 1.4;
}

.more-root {
  position: fixed;
  inset: 0;
  z-index: 80;
}
.more-menu {
  position: fixed;
  min-width: 140px;
  padding: 6px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--studio-panel) 96%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  color: var(--studio-text);
}
.more-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0 !important;
  outline: none;
  background: transparent;
  color: inherit;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
  appearance: none;
}
.more-row:hover {
  background: var(--studio-glass-2);
}
.more-row.danger {
  color: #f87171;
}
.more-row:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
