<template>
  <div
    class="wf-group"
    :class="{ selected, ports: true }"
    :style="groupStyle"
  >
    <!-- 选中功能栏 -->
    <div
      v-if="selected"
      class="group-float nodrag nopan"
      @pointerdown.stop
      @mousedown.stop
      @click.stop
    >
      <div class="gf-drop">
        <button
          type="button"
          class="gf-swatch"
          title="分组颜色"
          :style="{ background: currentColor }"
          @click="toggleMenu('color')"
        />
        <div v-if="openMenu === 'color'" class="gf-color-panel">
          <button
            v-for="c in colorOptions"
            :key="c"
            type="button"
            class="gf-color"
            :class="{ on: c.toLowerCase() === currentColor.toLowerCase() }"
            :style="{ background: c }"
            :title="c"
            @click="onSetColor(c)"
          />
        </div>
      </div>

      <div class="gf-drop">
        <button
          type="button"
          class="gf-btn"
          :class="{ on: openMenu === 'arrange' }"
          title="整理组内节点"
          @click="toggleMenu('arrange')"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
            />
          </svg>
          整理
          <span class="chev">{{ openMenu === 'arrange' ? '▴' : '▾' }}</span>
        </button>
        <div v-if="openMenu === 'arrange'" class="gf-menu">
          <button type="button" @click="onArrange('grid')">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
              />
            </svg>
            网格排列
          </button>
          <button type="button" @click="onArrange('row')">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M4 6h4v12H4V6zm6 0h4v12h-4V6zm6 0h4v12h-4V6z" />
            </svg>
            横向排列
          </button>
          <button type="button" @click="onArrange('column')">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M4 4h16v4H4V4zm0 6h16v4H4v-4zm0 6h16v4H4v-4z" />
            </svg>
            纵向排列
          </button>
        </div>
      </div>

      <button type="button" class="gf-btn" title="批量下载组内媒体/文本" @click="onBatchDownload">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M12 16 7 11h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z" />
        </svg>
        批量下载
      </button>
      <button type="button" class="gf-btn" title="取消分组" @click="onUngroup">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7.5 6.5a3 3 0 0 1 4.5 2.6l1.2-.7A4.5 4.5 0 1 0 6.8 12l.7-1.2A3 3 0 0 1 7.5 6.5zm9 11a3 3 0 0 1-4.5-2.6l-1.2.7A4.5 4.5 0 1 0 17.2 12l-.7 1.2a3 3 0 0 1 .0 4.3zM9.2 13.4l1.4-1.4 4.6 4.6-1.4 1.4-4.6-4.6z"
          />
        </svg>
        取消分组
      </button>
    </div>

    <div class="head">
      <input
        v-if="renaming"
        ref="inputRef"
        v-model="draft"
        class="title-input nodrag nopan"
        maxlength="40"
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="commitRename"
      />
      <button
        v-else
        type="button"
        class="title"
        title="拖动移动分组 · 双击重命名"
        @dblclick.stop="startRename"
      >
        {{ data.title || '分组' }}
      </button>
      <span class="count" :title="`${memberCount} 个节点`">{{ memberCount }}</span>
    </div>

    <Handle
      id="image"
      type="target"
      :position="Position.Left"
      class="group-port in"
      :style="portStyle"
      title="图片输入"
    />
    <Handle
      id="image"
      type="source"
      :position="Position.Right"
      class="group-port out"
      :style="portStyle"
      title="图片输出"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { GROUP_COLORS } from '@/utils/workflow-flow';

export type WorkflowGroupNodeData = {
  title: string;
  color?: string;
  /** 显示图片端口（宫格切分组）；普通分组也始终可连线 */
  imagePort?: boolean;
  sourceImageId?: string;
};

export type GroupArrangeMode = 'grid' | 'row' | 'column';

type CanvasGroupApi = {
  renameGroup: (id: string, title: string) => void;
  memberCountOf: (id: string) => number;
  membersTick?: Ref<number>;
  setGroupColor?: (id: string, color: string) => void;
  arrangeGroupMembers?: (id: string, mode?: GroupArrangeMode) => void;
  batchDownloadGroup?: (id: string) => void | Promise<void>;
  ungroupById?: (id: string) => void;
};

const props = defineProps<{
  id: string;
  selected?: boolean;
  data: WorkflowGroupNodeData;
}>();

const canvasApi = inject<CanvasGroupApi | null>('studioCanvasGroups', null);

const renaming = ref(false);
const draft = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const openMenu = ref<'color' | 'arrange' | null>(null);

const colorOptions = GROUP_COLORS;
const currentColor = computed(() => String(props.data?.color || GROUP_COLORS[0] || '#6b6b6b'));
const portStyle = { top: '50%' };

const memberCount = computed(() => {
  void canvasApi?.membersTick?.value;
  return canvasApi?.memberCountOf?.(props.id) ?? 0;
});

const groupStyle = computed(() => {
  const c = currentColor.value;
  return {
    width: '100%',
    height: '100%',
    '--g-color': c,
    '--g-bg': hexToRgba(c, 0.28),
    '--g-border': hexToRgba(c, 0.55),
    '--g-border-on': hexToRgba(c, 0.85),
  } as Record<string, string>;
});

function hexToRgba(hex: string, a: number) {
  const raw = String(hex || '').replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(80,160,160,${a})`;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function toggleMenu(kind: 'color' | 'arrange') {
  openMenu.value = openMenu.value === kind ? null : kind;
}

function closeMenus() {
  openMenu.value = null;
}

function onDocPointerDown(ev: Event) {
  const t = ev.target as HTMLElement | null;
  if (t?.closest?.('.group-float')) return;
  closeMenus();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
});

function startRename() {
  closeMenus();
  draft.value = props.data.title || '分组';
  renaming.value = true;
  void nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
}

function commitRename() {
  if (!renaming.value) return;
  renaming.value = false;
  const title = draft.value.trim() || '分组';
  if (title !== (props.data.title || '分组')) {
    canvasApi?.renameGroup(props.id, title);
  }
}

function cancelRename() {
  renaming.value = false;
}

function onSetColor(color: string) {
  canvasApi?.setGroupColor?.(props.id, color);
  closeMenus();
}

function onArrange(mode: GroupArrangeMode) {
  canvasApi?.arrangeGroupMembers?.(props.id, mode);
  closeMenus();
}

function onBatchDownload() {
  closeMenus();
  void canvasApi?.batchDownloadGroup?.(props.id);
}

function onUngroup() {
  closeMenus();
  canvasApi?.ungroupById?.(props.id);
}
</script>

<style scoped>
.wf-group {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 1px solid var(--g-border, rgba(80, 160, 160, 0.45));
  border-radius: 6px;
  background: var(--g-bg, rgba(80, 160, 160, 0.3));
  pointer-events: all;
  position: relative;
  overflow: visible;
}
.wf-group.selected {
  border-color: var(--g-border-on, rgba(120, 200, 200, 0.75));
  box-shadow: inset 0 0 0 1px var(--studio-glass-2);
}
.group-float {
  position: absolute;
  right: 0;
  top: -44px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--studio-panel) 96%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
}
.gf-btn {
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 0 8px;
}
.gf-btn .chev {
  font-size: 9px;
  opacity: 0.7;
}
.gf-btn:hover,
.gf-btn.on {
  background: var(--studio-glass-3);
  color: #fff;
}
.gf-swatch {
  width: 22px;
  height: 22px;
  margin: 0 4px 0 2px;
  border-radius: 6px;
  border: 1.5px solid var(--studio-text-soft);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.gf-swatch:hover {
  border-color: #fff;
}
.gf-drop {
  position: relative;
}
.gf-menu {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 8;
  min-width: 132px;
  padding: 6px;
  border-radius: 12px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gf-menu button {
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  cursor: pointer;
  text-align: left;
}
.gf-menu button:hover {
  background: var(--studio-glass-3);
  color: #fff;
}
.gf-color-panel {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 8;
  width: 168px;
  padding: 10px;
  border-radius: 12px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}
.gf-color {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1.5px solid transparent;
  cursor: pointer;
  padding: 0;
}
.gf-color.on,
.gf-color:hover {
  border-color: #fff;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 8px 10px 4px;
  cursor: grab;
  border-radius: 6px 6px 0 0;
}
.head:active {
  cursor: grabbing;
}
.title {
  border: 0;
  background: transparent;
  color: var(--studio-ink);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.02em;
  padding: 0;
  cursor: inherit;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  flex: 0 1 auto;
  min-width: 0;
}
.count {
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  background: #262626;
  color: var(--studio-ink);
  font-size: 12px;
  font-weight: 600;
  display: inline-grid;
  place-items: center;
  line-height: 1;
}
.title-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--studio-line-strong);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 6px;
  outline: none;
}
.group-port {
  width: 2px !important;
  height: 2px !important;
  min-width: 2px !important;
  min-height: 2px !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  opacity: 1 !important;
}
.wf-group :deep(.vue-flow__handle-left),
.wf-group :deep(.vue-flow__handle-right) {
  transform: translateY(-50%) !important;
}
.wf-group :deep(.vue-flow__handle-left) {
  left: 0 !important;
  right: auto !important;
}
.wf-group :deep(.vue-flow__handle-right) {
  right: 0 !important;
  left: auto !important;
}
.group-port::after {
  content: '+';
  position: absolute;
  top: 50%;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1.5px solid var(--studio-ink);
  background: var(--studio-panel);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  line-height: 19px;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.group-port.in::after {
  left: 0;
  transform: translate(calc(-100% - 3px), -50%);
}
.group-port.out::after {
  left: 100%;
  transform: translate(3px, -50%);
}
.wf-group:hover .group-port::after,
.wf-group.selected .group-port::after {
  opacity: 1;
}
:global(.vue-flow.connecting) .wf-group .group-port::after {
  opacity: 1;
}
</style>
