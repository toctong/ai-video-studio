<template>
  <div class="page assets-browser comfy-assets">
    <header class="topbar">
      <div class="topbar-left">
        <div class="crumb">
          <strong class="page-title">资产</strong>
          <span class="crumb-sep">/</span>
          <strong>{{ crumbLabel }}</strong>
          <em class="crumb-count">{{ assetsTotal }}</em>
        </div>
        <div class="source-tabs" role="tablist" aria-label="资产来源">
          <button type="button" class="source-tab on">生成</button>
        </div>
      </div>
      <div class="topbar-right">
        <button type="button" class="ghost-btn" :disabled="loading" @click="load">刷新</button>
        <button type="button" class="ghost-btn" @click="$router.push('/productions')">项目</button>
      </div>
    </header>

    <div class="layout">
      <aside class="side">
        <div class="side-head">
          <span>{{ sourceMode === 'generate' ? '对话' : '工作流' }}</span>
          <em>{{ sideNav.length }}</em>
        </div>
        <label class="side-search">
          <input
            v-model="wfKeyword"
            type="search"
            :placeholder="sourceMode === 'generate' ? '筛选对话…' : '筛选…'"
          />
        </label>
        <nav class="tree">
          <UiScroll class="tree-scroll" always>
            <button
              v-for="w in sideNav"
              :key="w.id"
              type="button"
              class="tree-item"
              :class="{ on: selectedSideId === w.id, muted: !w.count }"
              @click="selectedSideId = w.id"
            >
              <span class="folder-ico" aria-hidden="true">{{
                w.id === ALL ? '◈' : w.id === UNASSIGNED ? '∅' : sourceMode === 'generate' ? '◎' : '▸'
              }}</span>
              <span class="tree-name" :title="w.name">{{ w.name }}</span>
              <span class="tree-count">{{ w.count }}</span>
            </button>
          </UiScroll>
        </nav>
        <p v-if="!loading && !sideNav.length" class="side-empty">
          {{ sourceMode === 'generate' ? '暂无生成资产' : '暂无工作流' }}
        </p>
      </aside>

      <section class="main">
        <div class="toolbar">
          <div class="type-chips" role="tablist">
            <button
              type="button"
              class="chip"
              :class="{ on: !typeFilter }"
              @click="typeFilter = ''"
            >
              全部
            </button>
            <button
              v-for="t in activeTypeOptions"
              :key="t.value"
              type="button"
              class="chip"
              :class="{ on: typeFilter === t.value }"
              @click="typeFilter = t.value"
            >
              {{ t.label }}
            </button>
          </div>
          <div class="toolbar-end">
            <div class="size-toggle" title="缩略图大小">
              <button
                type="button"
                class="size-btn"
                :class="{ on: thumbSize === 'sm' }"
                @click="thumbSize = 'sm'"
              >
                S
              </button>
              <button
                type="button"
                class="size-btn"
                :class="{ on: thumbSize === 'md' }"
                @click="thumbSize = 'md'"
              >
                M
              </button>
              <button
                type="button"
                class="size-btn"
                :class="{ on: thumbSize === 'lg' }"
                @click="thumbSize = 'lg'"
              >
                L
              </button>
            </div>
            <template v-if="selectMode">
              <span class="select-count">已选 {{ selectedIds.size }}</span>
              <button
                type="button"
                class="btn-ghost"
                :disabled="batchBusy || !selectedIds.size"
                @click="batchExport"
              >
                批量导出
              </button>
              <button
                type="button"
                class="btn-ghost danger"
                :disabled="batchBusy || !selectedIds.size"
                @click="batchDelete"
              >
                批量删除
              </button>
              <button type="button" class="btn-ghost" @click="exitSelectMode">取消</button>
            </template>
            <button
              v-else
              type="button"
              class="btn-ghost"
              title="多选"
              @click="enterSelectMode"
            >
              多选
            </button>
            <label class="search">
              <input
                v-model="keyword"
                type="search"
                :placeholder="sourceMode === 'generate' ? '搜索提示词…' : '搜索文件名…'"
              />
            </label>
            <router-link
              v-if="sourceMode === 'workflow' && selectedSideId !== UNASSIGNED && selectedSideId !== ALL"
              class="open-wf"
              :to="`/w/${selectedSideId}`"
            >
              打开画布
            </router-link>
            <router-link
              v-else-if="sourceMode === 'generate' && selectedSideId !== ALL"
              class="open-wf"
              :to="{ path: '/generate', query: { session: selectedSideId } }"
            >
              打开对话
            </router-link>
          </div>
        </div>

        <div class="main-split" v-loading="loading">
          <UiScroll class="asset-scroll" always>
            <VirtualCardGrid
              class="asset-grid"
              :class="[`size-${thumbSize}`, { 'select-mode': selectMode }]"
              :items="assets"
              :min-column-width="thumbPx"
              :gap="thumbSize === 'sm' ? 12 : thumbSize === 'lg' ? 18 : 16"
              :estimate-size="thumbPx + 56"
              :padding-x="16"
              :has-more="assetsHasMore"
              :loading-more="loadingMore"
              :total="assetsTotal"
              :get-key="(a) => a.id"
              @end-reached="loadMoreAssets"
            >
              <template #default="{ item: a }">
                <article
                  class="tile"
                  :class="{ checked: selectMode && selectedIds.has(a.id) }"
                  @mouseenter="isVideo(a) && a.url && warmVideoUrl(a.url)"
                  @click="onTileClick(a, $event)"
                >
                  <div class="thumb-wrap" :style="thumbBoxStyle">
                    <label v-if="selectMode" class="check" @click.stop>
                      <input
                        type="checkbox"
                        :checked="selectedIds.has(a.id)"
                        @change="toggleSelect(a.id)"
                      />
                    </label>
                    <img
                      v-if="isImage(a)"
                      class="thumb-media"
                      :src="a.url"
                      :alt="a.name"
                      loading="lazy"
                      decoding="async"
                      :width="thumbPx"
                      :height="thumbPx"
                    />
                    <LazyVideoThumb
                      v-else-if="isVideo(a)"
                      class="thumb-media"
                      :src="a.url || ''"
                      :poster-url="posterOf(a)"
                      :width="thumbPx"
                      :height="thumbPx"
                    />
                    <div v-else class="thumb-media fallback">
                      {{ (a.type || 'F').slice(0, 1).toUpperCase() }}
                    </div>
                    <div class="hover-bar" @click.stop>
                      <button type="button" class="ico-btn" title="预览" @click="previewAsset(a)">
                        ◉
                      </button>
                      <button
                        type="button"
                        class="ico-btn danger"
                        :title="isUsedOnCanvas(a) ? '已用于画布，删除需确认' : '删除'"
                        :disabled="deletingId === a.id"
                        @click="deleteAsset(a)"
                      >
                        <el-icon :size="15"><Delete /></el-icon>
                      </button>
                      <button
                        type="button"
                        class="ico-btn"
                        title="导出"
                        :disabled="!a.url"
                        @click="exportAsset(a)"
                      >
                        <el-icon :size="15"><Download /></el-icon>
                      </button>
                    </div>
                    <span v-if="isVideo(a)" class="badge-vid">视频</span>
                  </div>
                  <div class="caption">
                    <strong :title="a.name">{{ a.name || a.id.slice(0, 8) }}</strong>
                    <span>{{
                      sourceMode === 'generate'
                        ? `${typeLabel(a.type)}${a.meta?.sessionTitle ? ` · ${a.meta.sessionTitle}` : ''}`
                        : typeLabel(a.type)
                    }}</span>
                  </div>
                </article>
              </template>
            </VirtualCardGrid>

            <div v-if="!loading && !assets.length" class="empty">
              <p>{{ sourceMode === 'generate' ? '该对话暂无图片/视频' : '该工作流暂无资产' }}</p>
              <span>{{
                sourceMode === 'generate'
                  ? '在「生成」页对话产出的图片与视频会出现在这里'
                  : '运行画布后，生成的图片与视频会出现在这里'
              }}</span>
            </div>
          </UiScroll>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Delete, Download } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '@/api';
import {
  deleteGenerateAsset,
  listGenerateAssets,
  listGenerateSessions,
  type GenerateSession,
} from '@/api/generate';
import { resolveAssetProjectId } from '@/constants/studio';
import { fetchWorkflows, type WorkflowRow } from '@/api/workflows';
import {
  openImagePreview,
  openVideoPreview,
  warmVideoUrl,
} from '@/composables/useMediaPreview';
import { UiScroll } from '@/components/ui';
import VirtualCardGrid from '@/components/VirtualCardGrid.vue';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';
import { downloadUrl } from '@/utils/download';

const route = useRoute();
/** 书库项目资产页用真实 projectId；平台资产回退遗留桶 */
const projects = ref<Array<{ id: string; title?: string; name?: string }>>([]);
const selectedProjectId = ref(
  String(route.params.projectId || '').trim() || '_studio',
);
const assetProjectId = computed(() =>
  resolveAssetProjectId({ projectId: selectedProjectId.value }),
);

const UNASSIGNED = '__unassigned__';
const ALL = '__all__';

type SourceMode = 'workflow' | 'generate';

type AssetRow = {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
};

const workflowTypeOptions = [
  { value: 'character_ref', label: '角色' },
  { value: 'scene', label: '场景' },
  { value: 'keyframe', label: '关键帧' },
  { value: 'storyboard', label: '分镜' },
  { value: 'video', label: '视频' },
  { value: 'cover', label: '封面' },
  { value: 'export', label: '导出' },
  { value: 'other', label: '其他' },
];

const generateTypeOptions = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
];

const sourceMode = ref<SourceMode>('generate');
const typeFilter = ref('');
const keyword = ref('');
const wfKeyword = ref('');
const loading = ref(false);
const loadingMore = ref(false);
const assets = ref<AssetRow[]>([]);
const assetsTotal = ref(0);
const assetsHasMore = ref(false);
const facets = ref<{
  totalWithUrl: number;
  byWorkflowId: Record<string, number>;
  unassigned: number;
}>({ totalWithUrl: 0, byWorkflowId: {}, unassigned: 0 });
const generateFacets = ref<{
  totalWithMedia: number;
  bySessionId: Record<string, number>;
}>({ totalWithMedia: 0, bySessionId: {} });
const PAGE_SIZE = 48;
const workflows = ref<WorkflowRow[]>([]);
const generateSessions = ref<GenerateSession[]>([]);
const selectedSideId = ref(ALL);
const activeTypeOptions = computed(() =>
  sourceMode.value === 'generate' ? generateTypeOptions : workflowTypeOptions,
);
const thumbSize = ref<'sm' | 'md' | 'lg'>('md');
/** 固定像素边长，避免百分比/aspect-ratio 被全局样式压扁 */
const THUMB_PX = { sm: 120, md: 168, lg: 220 } as const;
const thumbPx = computed(() => THUMB_PX[thumbSize.value]);
/** 高度固定；宽度交给网格 1fr 均分 */
const thumbBoxStyle = computed(() => ({
  width: '100%',
  height: `${thumbPx.value}px`,
  minHeight: `${thumbPx.value}px`,
  maxHeight: `${thumbPx.value}px`,
}));
const deletingId = ref('');
const selectMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());
const batchBusy = ref(false);

function workflowIdOf(a: AssetRow): string {
  return String(a.meta?.workflowId || '').trim();
}

function normalizeAssetUrl(url?: string) {
  return String(url || '')
    .trim()
    .split('?')[0]
    .replace(/\/+$/, '');
}

/** 已写入任意工作流图 params / 封面的资产视为「应用到画布」 */
const canvasAssetRefs = computed(() => {
  const ids = new Set<string>();
  const urls = new Set<string>();
  const urlKeys = [
    'url',
    'referenceImage',
    'endImage',
    'lastImage',
    'lastVideo',
    'localUrl',
  ] as const;
  for (const w of workflows.value) {
    const thumb = normalizeAssetUrl(w.thumbUrl);
    if (thumb) urls.add(thumb);
    const nodes = (w.graph as { nodes?: any[] })?.nodes || [];
    for (const n of nodes) {
      const data = (n?.data || {}) as Record<string, unknown>;
      const p = {
        ...((n?.params || {}) as Record<string, unknown>),
        ...((data.params || {}) as Record<string, unknown>),
      };
      const assetId = String(p.assetId || p.assetRef || data.assetRef || '').trim();
      if (assetId) ids.add(assetId);
      for (const k of urlKeys) {
        const u = normalizeAssetUrl(String(p[k] || ''));
        if (u) urls.add(u);
      }
      const pi = normalizeAssetUrl(String(data.previewImage || n?.previewImage || ''));
      const pv = normalizeAssetUrl(String(data.previewVideo || n?.previewVideo || ''));
      if (pi) urls.add(pi);
      if (pv) urls.add(pv);
    }
  }
  return { ids, urls };
});

function isUsedOnCanvas(a: AssetRow) {
  if (sourceMode.value === 'generate') return false;
  const { ids, urls } = canvasAssetRefs.value;
  if (ids.has(a.id)) return true;
  const candidates = [
    a.url,
    String(a.meta?.remoteUrl || ''),
    String(a.meta?.sourceUrl || ''),
  ];
  return candidates.some((raw) => {
    const u = normalizeAssetUrl(raw);
    return !!u && urls.has(u);
  });
}

function workflowLabelOf(a: AssetRow): string {
  return String(a.meta?.workflowName || '').trim();
}

function sessionIdOf(a: AssetRow): string {
  return String(a.meta?.sessionId || '').trim();
}

function typeLabel(type?: string) {
  const opts = sourceMode.value === 'generate' ? generateTypeOptions : workflowTypeOptions;
  return opts.find((t) => t.value === type)?.label || type || '文件';
}

/** 资产中心展示全部可预览文件（含 AI 生成；libraryHidden 只用于画布素材库） */
const libraryAssets = computed(() => assets.value.filter((a) => !!a.url));

const workflowNav = computed(() => {
  const map = new Map<string, number>(Object.entries(facets.value.byWorkflowId || {}));
  const unassigned = facets.value.unassigned || 0;
  const rows = workflows.value.map((w) => ({
    id: w.id,
    name: w.name || '未命名工作流',
    count: map.get(w.id) || 0,
    updatedAt: w.updatedAt,
  }));
  for (const [id, count] of map) {
    if (!rows.some((r) => r.id === id)) {
      const sample = assets.value.find((a) => workflowIdOf(a) === id);
      rows.push({
        id,
        name: (sample && workflowLabelOf(sample)) || `工作流 ${id.slice(0, 8)}`,
        count,
        updatedAt: sample?.createdAt || '',
      });
    }
  }
  rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const withAssets = rows.filter((w) => w.count > 0);
  const total = facets.value.totalWithUrl || 0;
  withAssets.unshift({ id: ALL, name: '全部工作流', count: total, updatedAt: '' });
  if (unassigned > 0) {
    withAssets.push({ id: UNASSIGNED, name: '未归属', count: unassigned, updatedAt: '' });
  }
  const q = wfKeyword.value.trim().toLowerCase();
  if (!q) return withAssets;
  return withAssets.filter(
    (w) =>
      w.id === UNASSIGNED ||
      w.id === ALL ||
      w.name.toLowerCase().includes(q) ||
      w.id.includes(q),
  );
});

const generateNav = computed(() => {
  const map = new Map<string, number>(Object.entries(generateFacets.value.bySessionId || {}));
  const titleMap = new Map(generateSessions.value.map((s) => [s.id, s.title || '新对话']));
  const rows: { id: string; name: string; count: number; updatedAt: string }[] = [];
  for (const [id, count] of map) {
    if (!count) continue;
    const sample = assets.value.find((a) => sessionIdOf(a) === id);
    const session = generateSessions.value.find((s) => s.id === id);
    rows.push({
      id,
      name: titleMap.get(id) || String(sample?.meta?.sessionTitle || '') || `对话 ${id.slice(0, 8)}`,
      count,
      updatedAt: session?.updatedAt || sample?.createdAt || '',
    });
  }
  rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const total = generateFacets.value.totalWithMedia || 0;
  rows.unshift({ id: ALL, name: '全部对话', count: total, updatedAt: '' });
  const q = wfKeyword.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((w) => w.id === ALL || w.name.toLowerCase().includes(q) || w.id.includes(q));
});

const sideNav = computed(() =>
  sourceMode.value === 'generate' ? generateNav.value : workflowNav.value,
);

const crumbLabel = computed(() => {
  const hit = sideNav.value.find((w) => w.id === selectedSideId.value);
  if (hit?.name) return hit.name;
  return sourceMode.value === 'generate' ? '全部对话' : '全部工作流';
});

function setSourceMode(mode: SourceMode) {
  if (sourceMode.value === mode) return;
  sourceMode.value = mode;
  typeFilter.value = '';
  keyword.value = '';
  wfKeyword.value = '';
  selectedSideId.value = ALL;
  if (selectMode.value) exitSelectMode();
  void load();
}

/** 当前已加载列表即服务端筛选结果 */
const filtered = computed(() => libraryAssets.value);

function isImage(a: AssetRow) {
  return (
    /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url || '') ||
    a.type === 'image' ||
    a.type === 'storyboard' ||
    a.type === 'keyframe' ||
    a.type === 'scene' ||
    a.type === 'character_ref' ||
    a.type === 'cover'
  );
}

function isVideo(a: AssetRow) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(a.url || '') || a.type === 'video';
}

/** 独立封面 JPG；无封面不回退拉视频 */
function posterOf(a: AssetRow) {
  return String(a.meta?.posterUrl || '').trim();
}

/** 当前筛选范围内、未关联任何画布的图片资产 */
const orphanImages = computed(() =>
  filtered.value.filter((a) => isImage(a) && !isUsedOnCanvas(a)),
);

function bumpGenerateFacetsOnDelete(a: AssetRow) {
  const sid = sessionIdOf(a);
  const nextMap = { ...generateFacets.value.bySessionId };
  if (sid) nextMap[sid] = Math.max(0, (nextMap[sid] || 0) - 1);
  generateFacets.value = {
    totalWithMedia: Math.max(0, generateFacets.value.totalWithMedia - 1),
    bySessionId: nextMap,
  };
}

function bumpWorkflowFacetsOnDelete(a: AssetRow) {
  const wid = workflowIdOf(a);
  if (!wid) {
    facets.value = {
      ...facets.value,
      unassigned: Math.max(0, facets.value.unassigned - 1),
      totalWithUrl: Math.max(0, facets.value.totalWithUrl - 1),
    };
  } else {
    const nextMap = { ...facets.value.byWorkflowId };
    nextMap[wid] = Math.max(0, (nextMap[wid] || 0) - 1);
    facets.value = {
      ...facets.value,
      byWorkflowId: nextMap,
      totalWithUrl: Math.max(0, facets.value.totalWithUrl - 1),
    };
  }
}

async function removeAssetRow(a: AssetRow) {
  if (sourceMode.value === 'generate') {
    await deleteGenerateAsset(a.id);
    bumpGenerateFacetsOnDelete(a);
  } else {
    await api.delete(`/projects/${assetProjectId.value}/assets/${a.id}`);
    bumpWorkflowFacetsOnDelete(a);
  }
  assets.value = assets.value.filter((x) => x.id !== a.id);
  assetsTotal.value = Math.max(0, assetsTotal.value - 1);
}

async function deleteAsset(a: AssetRow) {
  if (deletingId.value) return;
  // 已用于画布 → 确认；未使用 → 直接删
  if (isUsedOnCanvas(a)) {
    try {
      await ElMessageBox.confirm(
        `「${a.name || a.id.slice(0, 8)}」已用于画布，删除后节点预览可能失效，是否继续？`,
        '删除资产',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
  } else if (sourceMode.value === 'generate') {
    try {
      await ElMessageBox.confirm(
        `删除「${a.name || a.id.slice(0, 8)}」？对话中的对应消息也会移除。`,
        '删除生成资产',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
  }
  deletingId.value = a.id;
  try {
    await removeAssetRow(a);
    selectedIds.value = new Set([...selectedIds.value].filter((id) => id !== a.id));
    ElMessage.success('已删除');
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (e as Error)?.message ||
      '删除失败';
    ElMessage.error(String(msg));
  } finally {
    deletingId.value = '';
  }
}

async function exportAsset(a: AssetRow | null) {
  const url = a?.url?.trim();
  if (!url) {
    ElMessage.warning('无可导出文件');
    return;
  }
  const name = suggestFilename(a!);
  try {
    await downloadUrl(url, name);
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '导出失败');
  }
}

function suggestFilename(a: AssetRow) {
  const raw = String(a.name || '').trim();
  if (raw && /\.[a-z0-9]{2,5}$/i.test(raw)) return raw;
  const fromUrl = (a.url || '').split('?')[0].split('/').pop() || '';
  if (fromUrl && /\.[a-z0-9]{2,5}$/i.test(fromUrl)) {
    return raw ? `${raw.replace(/\.[a-z0-9]+$/i, '')}.${fromUrl.split('.').pop()}` : fromUrl;
  }
  const ext = isVideo(a) ? 'mp4' : isImage(a) ? 'png' : 'bin';
  return `${raw || a.id.slice(0, 8)}.${ext}`;
}

function onTileClick(a: AssetRow, ev: MouseEvent) {
  if (selectMode.value) {
    toggleSelect(a.id);
    return;
  }
  if (ev.metaKey || ev.ctrlKey) {
    enterSelectMode();
    toggleSelect(a.id);
    return;
  }
  if (isImage(a) || isVideo(a)) {
    previewAsset(a);
  }
}

function enterSelectMode() {
  selectMode.value = true;
}

function exitSelectMode() {
  selectMode.value = false;
  selectedIds.value = new Set();
}

function toggleSelect(id: string) {
  if (!selectMode.value) return;
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function clearSelection() {
  selectedIds.value = new Set();
}

function previewAsset(a: AssetRow | null) {
  if (!a?.url) return;
  if (isVideo(a)) {
    const poster = posterOf(a);
    openVideoPreview(a.url, poster ? { poster } : undefined);
    return;
  }
  if (isImage(a)) {
    openImagePreview(a.url);
  }
}

async function batchExport() {
  const rows = filtered.value.filter((a) => selectedIds.value.has(a.id));
  if (!rows.length) return;
  batchBusy.value = true;
  try {
    for (const a of rows) {
      await exportAsset(a);
    }
    ElMessage.success(`已导出 ${rows.length} 项`);
  } finally {
    batchBusy.value = false;
  }
}

async function batchDeleteOrphans() {
  const rows = orphanImages.value;
  if (!rows.length) {
    ElMessage.info('当前没有未关联画布的图片');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将删除当前列表中 ${rows.length} 张未关联画布的图片，并清除服务器源文件。已用于画布的图片会保留。此操作不可恢复。`,
      '清理未关联图片',
      { type: 'warning', confirmButtonText: '删除源文件', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  batchBusy.value = true;
  try {
    let ok = 0;
    for (const a of rows) {
      await removeAssetRow(a);
      ok += 1;
    }
    clearSelection();
    ElMessage.success(`已删除 ${ok} 张未关联图片（含源文件）`);
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (e as Error)?.message ||
      '删除失败';
    ElMessage.error(String(msg));
  } finally {
    batchBusy.value = false;
  }
}

async function batchDelete() {
  const rows = filtered.value.filter((a) => selectedIds.value.has(a.id));
  if (!rows.length) {
    ElMessage.info('请先选择要删除的资产');
    return;
  }
  const usedCount = rows.filter((a) => isUsedOnCanvas(a)).length;
  // 含画布在用项才确认；全部未用则直接删
  if (usedCount > 0 || sourceMode.value === 'generate') {
    try {
      await ElMessageBox.confirm(
        sourceMode.value === 'generate'
          ? `将删除 ${rows.length} 项生成资产，对话中的对应消息也会移除，是否继续？`
          : `将删除 ${rows.length} 项（其中 ${usedCount} 项已用于画布，节点预览可能失效），是否继续？`,
        '批量删除',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
  }
  batchBusy.value = true;
  try {
    for (const a of rows) {
      await removeAssetRow(a);
    }
    clearSelection();
    ElMessage.success(`已删除 ${rows.length} 项`);
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (e as Error)?.message ||
      '删除失败';
    ElMessage.error(String(msg));
  } finally {
    batchBusy.value = false;
  }
}

function mapGenerateAsset(item: {
  id: string;
  sessionId: string;
  sessionTitle: string;
  kind: 'image' | 'video';
  name: string;
  url: string;
  posterUrl?: string;
  createdAt: string;
}): AssetRow {
  return {
    id: item.id,
    name: item.name,
    type: item.kind,
    url: item.url,
    createdAt: item.createdAt,
    meta: {
      sessionId: item.sessionId,
      sessionTitle: item.sessionTitle,
      source: 'generate',
      ...(item.posterUrl ? { posterUrl: item.posterUrl } : {}),
    },
  };
}

async function fetchGenerateAssetsPage(opts: { append?: boolean } = {}) {
  const skip = opts.append ? assets.value.length : 0;
  const data = await listGenerateAssets({
    take: PAGE_SIZE,
    skip,
    kind: typeFilter.value || undefined,
    q: keyword.value.trim() || undefined,
    sessionId:
      selectedSideId.value && selectedSideId.value !== ALL ? selectedSideId.value : undefined,
  });
  generateFacets.value = {
    totalWithMedia: Number(data.facets.totalWithMedia) || 0,
    bySessionId: data.facets.bySessionId || {},
  };
  const items = data.items.map(mapGenerateAsset);
  if (opts.append) {
    const seen = new Set(assets.value.map((a) => a.id));
    assets.value = [...assets.value, ...items.filter((a) => a?.id && !seen.has(a.id))];
  } else {
    assets.value = items;
  }
  assetsTotal.value = data.total;
  assetsHasMore.value = data.hasMore;
}

async function fetchWorkflowAssetsPage(opts: { append?: boolean } = {}) {
  const pid = assetProjectId.value;
  if (!pid) {
    assets.value = [];
    assetsTotal.value = 0;
    assetsHasMore.value = false;
    return;
  }
  const skip = opts.append ? assets.value.length : 0;
  const params: Record<string, string | number> = {
    take: PAGE_SIZE,
    skip,
  };
  if (typeFilter.value) params.type = typeFilter.value;
  const q = keyword.value.trim();
  if (q) params.q = q;
  if (selectedSideId.value && selectedSideId.value !== ALL) {
    params.workflowId = selectedSideId.value;
  }
  const { data } = await api.get(`/projects/${pid}/assets`, { params });
  const items = (Array.isArray(data) ? data : data?.items || []) as AssetRow[];
  const total = Array.isArray(data) ? items.length : Number(data?.total) || items.length;
  const hasMore = Array.isArray(data)
    ? false
    : Boolean(data?.hasMore ?? skip + items.length < total);
  if (data?.facets) {
    facets.value = {
      totalWithUrl: Number(data.facets.totalWithUrl) || 0,
      byWorkflowId: data.facets.byWorkflowId || {},
      unassigned: Number(data.facets.unassigned) || 0,
    };
  }
  if (opts.append) {
    const seen = new Set(assets.value.map((a) => a.id));
    assets.value = [...assets.value, ...items.filter((a) => a?.id && !seen.has(a.id))];
  } else {
    assets.value = items;
  }
  assetsTotal.value = total;
  assetsHasMore.value = hasMore;
}

async function fetchAssetsPage(opts: { append?: boolean } = {}) {
  if (sourceMode.value === 'generate') {
    await fetchGenerateAssetsPage(opts);
    return;
  }
  await fetchWorkflowAssetsPage(opts);
}

async function load() {
  loading.value = true;
  try {
    if (sourceMode.value === 'generate') {
      generateSessions.value = (await listGenerateSessions()) || [];
    } else {
      if (!projects.value.length) {
        const res = await api.get('/projects');
        projects.value = (Array.isArray(res.data) ? res.data : res.data?.items || []) || [];
      }
      const wfPid =
        selectedProjectId.value !== '_studio' ? selectedProjectId.value : undefined;
      const wfList = await fetchWorkflows(wfPid);
      workflows.value = wfList || [];
    }
    await fetchAssetsPage({ append: false });
    const nav = sideNav.value;
    const stillValid = nav.some((w) => w.id === selectedSideId.value);
    if (!stillValid) {
      selectedSideId.value = ALL;
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
    assets.value = [];
    if (sourceMode.value === 'generate') generateSessions.value = [];
    else workflows.value = [];
    assetsTotal.value = 0;
    assetsHasMore.value = false;
  } finally {
    loading.value = false;
  }
}

/** 切换项目：清空选中并重载工作流与资产 */
async function onProjectChange() {
  selectedSideId.value = ALL;
  workflows.value = [];
  await load();
}

async function loadMoreAssets() {
  if (!assetsHasMore.value || loadingMore.value || loading.value) return;
  loadingMore.value = true;
  try {
    await fetchAssetsPage({ append: true });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载更多失败');
  } finally {
    loadingMore.value = false;
  }
}

async function reloadAssets() {
  if (loading.value) return;
  loading.value = true;
  try {
    await fetchAssetsPage({ append: false });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function applyRouteQuery() {
  const source = String(route.query.source || '').trim();
  if (source === 'generate' || source === 'workflow') {
    sourceMode.value = source;
  }
  const session = String(route.query.session || '').trim();
  if (session && sourceMode.value === 'generate') {
    selectedSideId.value = session;
    return;
  }
  const q = String(route.query.workflowId || '').trim();
  if (q && sourceMode.value === 'workflow') selectedSideId.value = q;
}

let ready = false;
let keywordTimer: number | undefined;

onMounted(async () => {
  applyRouteQuery();
  await load();
  applyRouteQuery();
  ready = true;
});

watch(
  () => [route.query.workflowId, route.query.source, route.query.session],
  () => applyRouteQuery(),
);

watch(selectedSideId, () => {
  if (!ready) return;
  if (selectMode.value) exitSelectMode();
  void reloadAssets();
});

watch(typeFilter, () => {
  if (!ready) return;
  void reloadAssets();
});

watch(keyword, () => {
  if (!ready) return;
  window.clearTimeout(keywordTimer);
  keywordTimer = window.setTimeout(() => {
    void reloadAssets();
  }, 280);
});

watch(assetProjectId, () => {
  if (sourceMode.value === 'workflow') void load();
});
</script>

<style scoped>
.comfy-assets {
  --assets-rail-w: 240px;
  --a-bg: var(--studio-bg);
  --a-surface: var(--studio-panel);
  --a-surface-2: var(--studio-panel-3);
  --a-line: var(--studio-line-strong);
  --a-ink: var(--studio-ink);
  --a-muted: var(--studio-muted);
  --a-dim: var(--studio-faint);
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  min-height: 0;
  padding: 20px 24px 20px !important;
  max-width: none;
  box-sizing: border-box;
  background: var(--a-bg) !important;
  color: var(--a-ink);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.source-tabs {
  display: inline-flex;
  height: 32px;
  padding: 2px;
  border-radius: 999px;
  background: var(--a-surface);
  gap: 2px;
  flex-shrink: 0;
}

.source-tab {
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--a-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}

.source-tab:hover {
  color: var(--a-ink);
}

.source-tab.on {
  background: var(--studio-text);
  color: var(--studio-bg);
  font-weight: 600;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
}

.page-title {
  margin: 0 !important;
  font-size: 18px !important;
  font-weight: 600 !important;
  letter-spacing: -0.02em;
  color: var(--a-ink) !important;
  display: inline !important;
  font-family: inherit !important;
}

.crumb-sep {
  color: var(--a-dim);
}

.crumb strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--a-ink);
}

.crumb-count {
  font-style: normal;
  font-size: 11px;
  color: var(--a-dim);
  background: var(--a-surface);
  border-radius: 999px;
  padding: 2px 8px;
  font-variant-numeric: tabular-nums;
}

.ghost-btn,
.btn-ghost {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--a-surface);
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ghost-btn:hover:not(:disabled),
.btn-ghost:hover:not(:disabled) {
  background: var(--a-surface-2);
  color: var(--studio-ink);
}

.ghost-btn:disabled,
.btn-ghost:disabled {
  opacity: 0.5;
  cursor: default;
}

.ghost-btn.danger {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
}
.ghost-btn.danger:hover:not(:disabled) {
  color: #fecaca;
  background: rgba(248, 113, 113, 0.2);
}

.project-picker {
  display: inline-flex;
  align-items: center;
}
.project-picker select {
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  outline: none;
}
.project-picker select:focus {
  border-color: var(--studio-line-bright);
}

.btn-primary {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-text);
  color: var(--studio-bg);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--studio-ink);
}

.layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--assets-rail-w) minmax(0, 1fr);
  gap: 0;
  border: 1px solid var(--a-line);
  border-radius: 16px;
  overflow: hidden;
  background: var(--a-surface);
}

.side {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--a-line);
  background: var(--studio-panel);
}

.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 8px;
  font-size: 12px;
  color: var(--a-dim);
  font-weight: 600;
}

.side-head em {
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.side-search {
  display: block;
  padding: 0 12px 10px;
}

.side-search input {
  width: 100%;
  box-sizing: border-box;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: var(--a-surface);
  color: var(--a-ink);
  padding: 0 12px;
  font-size: 13px;
  outline: 0;
}

.side-search input::placeholder {
  color: var(--a-dim);
}

.tree {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 8px 12px;
}

.tree-scroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.tree-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: var(--a-muted);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  margin-bottom: 2px;
  font: inherit;
}

.tree-item:hover {
  background: var(--studio-glass);
  color: var(--a-ink);
}

.tree-item.on {
  background: var(--studio-text);
  color: var(--studio-bg);
}

.tree-item.muted .tree-name {
  opacity: 0.55;
}

.tree-item.on.muted .tree-name {
  opacity: 1;
}

.folder-ico {
  width: 12px;
  flex-shrink: 0;
  font-size: 10px;
  opacity: 0.7;
}

.tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.tree-count {
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

.side-empty {
  margin: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--a-dim);
}

.main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--a-bg);
}

.toolbar-end .btn-ghost.danger {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
}

.select-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--a-ink);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.main-split {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.asset-scroll {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-bottom: 1px solid var(--a-line);
  background: var(--studio-panel);
  flex-shrink: 0;
}

.type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.chip {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--a-surface);
  color: var(--a-muted);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}

.chip:hover {
  color: var(--a-ink);
  background: var(--a-surface-2);
}

.chip.on {
  color: var(--studio-bg);
  background: var(--studio-text);
  font-weight: 600;
}

.toolbar-end {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.size-toggle {
  display: inline-flex;
  height: 34px;
  padding: 2px;
  border-radius: 999px;
  background: var(--a-surface);
  gap: 2px;
}

.size-btn {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--a-muted);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.size-btn.on {
  background: var(--studio-text);
  color: var(--studio-bg);
}

.search input {
  width: 180px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  background: var(--a-surface);
  color: var(--a-ink);
  padding: 0 14px;
  font-size: 13px;
  outline: 0;
}

.search input::placeholder {
  color: var(--a-dim);
}

.open-wf {
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--a-surface);
  color: var(--studio-text);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}

.open-wf:hover {
  background: var(--a-surface-2);
  color: var(--studio-ink);
}

.asset-grid {
  padding: 0;
  box-sizing: border-box;
}

.asset-grid.size-sm,
.asset-grid.size-md,
.asset-grid.size-lg {
  /* 列宽由 VirtualCardGrid 按 thumb 估算 */
}

.tile {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--a-surface);
  overflow: hidden;
  cursor: pointer;
  padding: 8px;
  box-sizing: border-box;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.tile:hover,
.tile.checked {
  border-color: var(--studio-line-bright);
  background: var(--studio-panel-2);
}

.thumb-wrap {
  position: relative;
  display: block;
  box-sizing: border-box;
  border-radius: 10px;
  overflow: hidden;
  background: var(--studio-inset);
  flex: none;
}

.thumb-media {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  display: block;
  object-fit: cover;
  object-position: center;
  background: var(--studio-inset);
}

.thumb-media.fallback {
  display: grid;
  place-items: center;
  color: var(--a-dim);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  background: var(--studio-inset-2);
  object-fit: unset;
}

.tile .check {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  background: rgba(10, 10, 10, 0.72);
  border-radius: 6px;
}

.tile .check input {
  margin: 0;
  cursor: pointer;
}

.hover-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 10px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.78));
  opacity: 0;
  transition: opacity 0.12s;
  pointer-events: none;
}

.tile:hover .hover-bar {
  opacity: 1;
  pointer-events: auto;
}

.hover-bar .ico-btn {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  background: var(--studio-line-strong);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.hover-bar .ico-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
}

.hover-bar .ico-btn.danger:hover:not(:disabled) {
  background: rgba(220, 60, 60, 0.85);
}

.hover-bar .ico-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.badge-vid {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
}

.caption {
  display: block;
  padding: 8px 2px 2px;
  min-width: 0;
}
.caption strong,
.caption span {
  display: block;
}

.caption strong {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--a-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caption span {
  font-size: 11px;
  color: var(--a-dim);
}

.empty {
  grid-column: 1 / -1;
  display: grid;
  place-items: center;
  gap: 6px;
  padding: 72px 16px;
  color: var(--a-dim);
  text-align: center;
}

.empty p {
  margin: 0;
  font-size: 14px;
  color: var(--a-ink);
}

.empty span {
  font-size: 12px;
}

@media (max-width: 960px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .side {
    border-right: 0;
    border-bottom: 1px solid var(--a-line);
    max-height: 180px;
  }
}
</style>
