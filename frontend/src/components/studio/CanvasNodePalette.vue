<template>
  <aside
    v-show="!hideToggle || !collapsed"
    class="palette"
    :class="{ collapsed, 'rail-panel': hideToggle }"
    @mousedown.stop
  >
    <button
      v-if="!hideToggle"
      type="button"
      class="palette-toggle"
      :title="collapsed ? '展开面板' : '收起面板'"
      @click="collapsed = !collapsed"
    >
      <svg v-if="collapsed" viewBox="0 0 24 24" width="14" height="14">
        <path fill="currentColor" d="M9.3 6.3 14.9 12l-5.6 5.7 1.4 1.4L17.7 12 10.7 4.9z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="14" height="14">
        <path fill="currentColor" d="M14.7 6.3 9.1 12l5.6 5.7-1.4 1.4L6.3 12l7-7.1z" />
      </svg>
    </button>

    <div v-show="!collapsed || hideToggle" class="palette-body">
    <header v-if="hideToggle" class="rail-head-bar">
      <strong>媒体 / 节点</strong>
      <button type="button" class="rail-x" title="关闭" @click="collapsed = true">×</button>
    </header>
    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ on: tab === 'nodes' }"
        @click="tab = 'nodes'"
      >
        节点
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ on: tab === 'assets' }"
        @click="switchAssets"
      >
        媒体
      </button>
    </div>

    <!-- 节点目录 -->
    <template v-if="tab === 'nodes'">
      <div class="ph">
        <input v-model="q" type="search" placeholder="搜索节点…" />
      </div>
      <div class="groups">
        <section v-for="g in groups" :key="g.name">
          <button type="button" class="g-title" @click="toggle(g.name)">
            <span class="chev">{{ open[g.name] === false ? '▸' : '▾' }}</span>
            <span class="g-dot" :style="{ background: catColor(g.name) }" />
            {{ g.name }}
            <em>{{ g.items.length }}</em>
          </button>
          <div v-show="open[g.name] !== false" class="g-list">
            <button
              v-for="item in g.items"
              :key="item.type"
              type="button"
              class="item"
              draggable="true"
              :title="item.description || item.title"
              @click="emit('add', item.type)"
              @dragstart="onDragNode($event, item.type)"
            >
              <span class="dot" :style="{ background: catColor(item.category) }" />
              <span class="name">{{ item.title }}</span>
            </button>
          </div>
        </section>
        <p v-if="!groups.length" class="empty">无匹配节点</p>
      </div>
    </template>

    <!-- 资产轨：按制作角色筛选 · 拖到节点参考口 / 画布 -->
    <template v-else>
      <div class="ph assets-ph">
        <div class="rail-head">
          <strong>资产轨</strong>
          <span>拖到参考口或空白处</span>
        </div>
        <div class="scope-row" role="tablist">
          <button
            type="button"
            class="scope"
            :class="{ on: assetScope === 'canvas' }"
            @click="assetScope = 'canvas'"
          >
            本画布
            <em>{{ canvasCount }}</em>
          </button>
          <button
            type="button"
            class="scope"
            :class="{ on: assetScope === 'global' }"
            @click="assetScope = 'global'"
          >
            全部
            <em>{{ globalCount }}</em>
          </button>
        </div>
        <input v-model="assetQ" type="search" placeholder="搜索资产…" />
        <div class="asset-filters roles">
          <button
            v-for="r in roleFilters"
            :key="r.id"
            type="button"
            class="af"
            :class="{ on: assetRole === r.id }"
            @click="assetRole = r.id"
          >
            {{ r.label }}
          </button>
        </div>
      </div>
      <div class="asset-grid" v-loading="assetLoading">
        <div
          v-for="a in filteredAssets"
          :key="a.id"
          class="asset-tile"
          draggable="true"
          :title="`${a.name || a.id} · ${roleLabel(a)} · 拖到画布`"
          @dragstart="onDragAsset($event, a)"
          @click.prevent
        >
          <div class="athumb">
            <img v-if="isImage(a)" :src="a.url" alt="" loading="lazy" draggable="false" />
            <LazyVideoThumb
              v-else-if="isVideo(a)"
              :src="a.url || ''"
              :poster-url="String(a.meta?.posterUrl || '')"
            />
            <span v-else class="aph">{{ (a.type || '?').slice(0, 1) }}</span>
            <span class="rbadge">{{ roleLabel(a) }}</span>
            <button
              v-if="promptOf(a)"
              type="button"
              class="copy-prompt"
              title="复制提示词"
              @click.stop="copyPrompt(a)"
              @mousedown.stop
            >
              复制
            </button>
          </div>
          <span class="aname">{{ a.name || a.id.slice(0, 8) }}</span>
        </div>
        <p v-if="!assetLoading && !filteredAssets.length" class="empty">
          {{ assetScope === 'canvas' ? '本画布暂无资产' : '暂无资产' }}
          <br />
          <span class="hint">运行节点后自动入库，可拖回参考口</span>
        </p>
      </div>
      <div class="asset-foot">
        <button type="button" class="linkish" :disabled="assetLoading" @click="loadAssets">
          刷新
        </button>
        <button type="button" class="linkish" @click="emit('open-assets')">资产中心</button>
      </div>
    </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { WorkflowNodeCatalogItem } from '@ai-video-studio/shared';
import api from '@/api';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';
import { resolveAssetProjectId } from '@/constants/studio';
import { copyText } from '@/utils/clipboard';
import {
  ASSET_ROLE_LABEL,
  inferAssetRole,
  type AssetRole,
} from '@/utils/node-spec';

export type PaletteAsset = {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
};

const props = withDefaults(
  defineProps<{
    catalog: WorkflowNodeCatalogItem[];
    workflowId?: string;
    /** 资产桶 projectId（制作单/工作流优先） */
    projectId?: string;
    /** 由左侧工具轨控制时，隐藏旧折叠钮并右移面板 */
    hideToggle?: boolean;
  }>(),
  { hideToggle: false },
);

const emit = defineEmits<{
  add: [type: string];
  'open-assets': [];
}>();

const tab = ref<'nodes' | 'assets'>('nodes');
const collapsed = ref(true);
const q = ref('');
const assetQ = ref('');
const assetScope = ref<'canvas' | 'global'>('canvas');
const assetRole = ref<AssetRole | 'all'>('all');
const open = reactive<Record<string, boolean>>({});
const assets = ref<PaletteAsset[]>([]);
const assetLoading = ref(false);
let assetsLoadedOnce = false;

const roleFilters: { id: AssetRole | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'portrait', label: '定妆' },
  { id: 'sheet', label: '设定板' },
  { id: 'scene', label: '场景' },
  { id: 'grid', label: '宫格' },
  { id: 'video', label: '成片' },
];

const CAT_ORDER = ['输入', 'AI', '资产', '文本', '输出', '镜头库', '其他'];

const groups = computed(() => {
  const query = q.value.trim().toLowerCase();
  const map = new Map<string, WorkflowNodeCatalogItem[]>();
  for (const item of props.catalog || []) {
    if (
      query &&
      !item.title.toLowerCase().includes(query) &&
      !item.type.toLowerCase().includes(query) &&
      !(item.category || '').toLowerCase().includes(query)
    ) {
      continue;
    }
    const cat = item.category || '其他';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  }
  return [...map.entries()]
    .sort((a, b) => {
      const ia = CAT_ORDER.indexOf(a[0]);
      const ib = CAT_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([name, items]) => ({ name, items }));
});

function workflowIdOf(a: PaletteAsset) {
  return String(a.meta?.workflowId || '').trim();
}

function isCanvasAsset(a: PaletteAsset) {
  const wid = props.workflowId || '';
  if (!wid) return false;
  return workflowIdOf(a) === wid;
}

const withUrl = computed(() => assets.value.filter((a) => !!a.url));

const canvasCount = computed(() => withUrl.value.filter(isCanvasAsset).length);
const globalCount = computed(() => withUrl.value.length);

const filteredAssets = computed(() => {
  const qstr = assetQ.value.trim().toLowerCase();
  return withUrl.value.filter((a) => {
    if (assetScope.value === 'canvas') {
      if (!isCanvasAsset(a)) return false;
    }
    if (assetRole.value !== 'all' && inferAssetRole(a) !== assetRole.value) return false;
    if (
      qstr &&
      !(a.name || '').toLowerCase().includes(qstr) &&
      !a.id.toLowerCase().includes(qstr) &&
      !(a.type || '').toLowerCase().includes(qstr) &&
      !roleLabel(a).includes(qstr)
    ) {
      return false;
    }
    return true;
  });
});

function roleLabel(a: PaletteAsset) {
  return ASSET_ROLE_LABEL[inferAssetRole(a)];
}

function promptOf(a: PaletteAsset) {
  const m = a.meta || {};
  return String(m.prompt || m.imagePrompt || m.portraitPrompt || m.sheetPrompt || '').trim();
}

async function copyPrompt(a: PaletteAsset) {
  const text = promptOf(a);
  if (!text) return;
  const ok = await copyText(text);
  if (ok) ElMessage.success('已复制提示词');
  else ElMessage.error('复制失败');
}

function toggle(name: string) {
  open[name] = open[name] === false ? true : false;
}

function catColor(cat?: string) {
  if (cat === 'AI') return '#60a5fa';
  if (cat === '输入') return '#a3e635';
  if (cat === '输出') return '#f472b6';
  if (cat === '资产') return '#fbbf24';
  if (cat === '文本') return '#38bdf8';
  if (cat === '镜头库') return '#c084fc';
  if (cat === '漫剧') return '#fb923c';
  return '#94a3b8';
}

function isImage(a: PaletteAsset) {
  return (
    /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url || '') ||
    /storyboard|scene|character|cover|image/i.test(String(a.type || ''))
  );
}

function isVideo(a: PaletteAsset) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(a.url || '') || /video/i.test(String(a.type || ''));
}

function onDragNode(ev: DragEvent, type: string) {
  ev.dataTransfer?.setData('application/x-workflow-node', type);
  ev.dataTransfer!.effectAllowed = 'copy';
}

function onDragAsset(ev: DragEvent, a: PaletteAsset) {
  ev.dataTransfer?.setData('application/x-studio-asset', JSON.stringify(a));
  ev.dataTransfer!.effectAllowed = 'copy';
  // 拖拽预览更清晰
  const thumb = (ev.currentTarget as HTMLElement)?.querySelector('.athumb') as HTMLElement | null;
  if (thumb && ev.dataTransfer) {
    try {
      ev.dataTransfer.setDragImage(thumb, 40, 40);
    } catch {
      /* ignore */
    }
  }
}

async function loadAssets() {
  assetLoading.value = true;
  try {
    const pid = resolveAssetProjectId({ projectId: props.projectId });
    const { data } = await api.get(`/projects/${pid}/assets`);
    const rows = Array.isArray(data) ? data : data?.items || [];
    assets.value = rows;
    assetsLoadedOnce = true;
  } catch {
    assets.value = [];
  } finally {
    assetLoading.value = false;
  }
}

function switchAssets() {
  tab.value = 'assets';
  if (!assetsLoadedOnce) void loadAssets();
}

watch(
  () => props.workflowId,
  () => {
    if (tab.value === 'assets') void loadAssets();
  },
);

defineExpose({
  openAssets(scope?: 'canvas' | 'global') {
    collapsed.value = false;
    if (scope === 'canvas' || scope === 'global') assetScope.value = scope;
    switchAssets();
  },
  expand() {
    collapsed.value = false;
  },
  collapse() {
    collapsed.value = true;
  },
  toggle() {
    collapsed.value = !collapsed.value;
    return !collapsed.value;
  },
  isOpen() {
    return !collapsed.value;
  },
  refreshAssets() {
    if (tab.value === 'assets' || assetsLoadedOnce) void loadAssets();
  },
});
</script>

<style scoped>
.palette {
  position: absolute;
  left: 10px;
  top: 52px;
  bottom: 72px;
  width: 236px;
  z-index: 16;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--ink);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
  min-height: 0;
  transition: width 0.18s ease, border-color 0.18s ease, background 0.18s ease, left 0.18s ease;
}
.palette.rail-panel {
  position: fixed;
  left: 70px;
  top: 64px;
  bottom: 18px;
  width: 350px;
  z-index: 55;
  border-radius: 24px;
  background: color-mix(in srgb, var(--studio-panel) 92%, transparent);
  border: 1px solid var(--studio-glass-3);
  color: var(--studio-text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px) saturate(140%);
  animation: rail-in 0.18s ease-out;
}
.palette.rail-panel .tabs {
  padding: 0 10px;
  border-bottom: 1px solid var(--studio-glass-2);
  gap: 0;
}
.palette.rail-panel .tab {
  color: var(--studio-text-faint);
  border-radius: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
}
.palette.rail-panel .tab.on {
  color: #fff;
  background: transparent;
  border-bottom-color: #fff;
}
.palette.rail-panel .ph input,
.palette.rail-panel .assets-ph input {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--studio-glass-3);
  color: var(--studio-text);
}
.palette.rail-panel .item:hover,
.palette.rail-panel .g-title:hover {
  background: var(--studio-glass-2);
}
.rail-head-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 6px;
  flex-shrink: 0;
}
.rail-head-bar strong {
  font-size: 15px;
  font-weight: 650;
}
.rail-x {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-text-soft);
  font-size: 18px;
  cursor: pointer;
}
.rail-x:hover {
  background: var(--studio-glass-2);
  color: #fff;
}
@keyframes rail-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.palette.collapsed {
  width: 0;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  overflow: visible;
  pointer-events: none;
}

.palette-toggle {
  position: absolute;
  top: 10px;
  right: -15px;
  z-index: 2;
  width: 28px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: var(--shadow-sm);
}

.palette.collapsed .palette-toggle {
  left: 0;
  right: auto;
}

.palette-toggle:hover {
  color: var(--ink);
  border-color: var(--accent);
}

.palette-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  border-radius: 14px;
}

.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.tab {
  height: 36px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.tab:hover {
  color: var(--text);
  background: var(--bg-1);
}

.tab.on {
  color: var(--ink);
  border-bottom-color: var(--accent);
  background: var(--bg-1);
}

.ph {
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.ph input {
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--bg-1);
  color: var(--ink);
  padding: 0 10px;
  font-size: 12px;
  outline: none;
}

.ph input:focus {
  border-color: var(--line-strong);
}

.scope-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.scope {
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.scope em {
  font-style: normal;
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.scope.on {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent-ring);
}

.asset-filters {
  display: flex;
  gap: 4px;
}

.af {
  flex: 1;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}

.af.on {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent-ring);
}

.rail-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.rail-head strong {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
}

.rail-head span {
  font-size: 10px;
  color: var(--muted);
}

.asset-filters.roles {
  flex-wrap: wrap;
}

.asset-filters.roles .af {
  flex: 0 0 auto;
  padding: 0 7px;
}

.groups {
  flex: 1;
  overflow: auto;
  padding: 6px 8px 12px;
  min-height: 0;
}

.g-title {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  padding: 8px 6px 6px;
  cursor: pointer;
  text-align: left;
}

.g-title em {
  margin-left: auto;
  font-style: normal;
  opacity: 0.7;
}

.chev {
  width: 10px;
  font-size: 10px;
}

.g-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.g-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 2px;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  padding: 7px 8px;
  font-size: 12px;
  cursor: grab;
  text-align: left;
}

.item:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  margin: 28px 8px;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
  line-height: 1.5;
}

.hint {
  font-size: 11px;
  opacity: 0.8;
}

.asset-grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  align-content: start;
}

.asset-tile {
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  padding: 0;
  cursor: grab;
  text-align: left;
  color: var(--text);
  min-width: 0;
  user-select: none;
}

.asset-tile:active {
  cursor: grabbing;
}

.asset-tile:hover {
  border-color: var(--line-strong);
  background: var(--bg-1);
}

.athumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-0);
  border: 1px solid var(--line);
}

.athumb img,
.athumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.aph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--muted);
}

.rbadge {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  max-width: calc(100% - 8px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-prompt {
  position: absolute;
  right: 4px;
  bottom: 4px;
  height: 20px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.asset-tile:hover .copy-prompt {
  opacity: 1;
}

.copy-prompt:hover {
  background: var(--accent);
}

.aname {
  display: block;
  margin-top: 4px;
  padding: 0 2px;
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-foot {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--line);
}

.linkish {
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.linkish:disabled {
  opacity: 0.5;
  cursor: default;
}

.linkish:hover:not(:disabled) {
  text-decoration: underline;
}
</style>
