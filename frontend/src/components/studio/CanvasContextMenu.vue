<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="ctx-root"
      @mousedown.self="close"
      @contextmenu.prevent
    >
      <div
        ref="panelRef"
        class="ctx-panel"
        :style="{ left: `${x}px`, top: `${y}px` }"
        role="menu"
      >
        <button
          v-if="canShowDetail"
          type="button"
          class="row"
          @click.stop.prevent="onDetail"
        >
          <UiIcon name="eye" :size="15" />
          <span class="label">查看图片详情</span>
        </button>
        <button type="button" class="row" @click="emit('duplicate'); close()">
          <UiIcon name="copy" :size="15" />
          <span class="label">{{ isGroup ? '复制分组' : '复制节点' }}</span>
        </button>
        <button
          v-if="!isGroup"
          type="button"
          class="row"
          @click="emit('clone-empty'); close()"
        >
          <UiIcon name="file" :size="15" />
          <span class="label">克隆空节点</span>
        </button>
        <button
          v-if="!isGroup"
          type="button"
          class="row"
          @click="emit('rerun'); close()"
        >
          <UiIcon name="refresh" :size="15" />
          <span class="label">重跑此节点</span>
        </button>
        <div class="sep" />
        <button type="button" class="row danger" @click="emit('delete'); close()">
          <UiIcon name="trash" :size="15" />
          <span class="label">{{ isGroup ? '删除分组' : '删除节点' }}</span>
        </button>
        <p v-if="isGroup" class="hint">将同时删除分组内全部节点</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import UiIcon from '@/components/icons/UiIcon.vue';

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  /** node = 普通节点；group = 分组 */
  mode?: 'node' | 'group';
  /** 图片节点：显示「查看图片详情」 */
  showDetail?: boolean;
  /** 当前右键的节点 id，详情回调带回，避免关菜单后丢 id */
  nodeId?: string;
}>();

const emit = defineEmits<{
  close: [];
  detail: [nodeId: string];
  duplicate: [];
  'clone-empty': [];
  rerun: [];
  delete: [];
}>();

const canShowDetail = computed(() => Boolean(props.showDetail) && props.mode !== 'group');

const panelRef = ref<HTMLElement | null>(null);
const isGroup = computed(() => props.mode === 'group');

function onDetail() {
  const id = String(props.nodeId || '').trim();
  emit('detail', id);
  close();
}

watch(
  () => props.open,
  async (v) => {
    if (!v) return;
    await nextTick();
    const el = panelRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = props.x;
    let top = props.y;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
    if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
    el.style.left = `${Math.max(pad, left)}px`;
    el.style.top = `${Math.max(pad, top)}px`;
  },
);

function close() {
  emit('close');
}
</script>

<style scoped>
.ctx-root {
  position: fixed;
  inset: 0;
  z-index: 70;
}
.ctx-panel {
  position: fixed;
  min-width: 168px;
  padding: 6px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--studio-panel) 75%, transparent);
  backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  color: var(--studio-text);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--studio-glass-3);
}
.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}
.row:hover {
  background: var(--studio-glass-2);
}
.row.danger {
  color: #f87171;
}
.label {
  flex: 1;
}
.hint {
  margin: 2px 10px 6px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--studio-text-faint);
}
</style>
