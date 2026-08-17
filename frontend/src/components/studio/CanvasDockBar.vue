<template>
  <div class="dock-root">
    <div class="dock-bar" @mousedown.stop>
      <button
        type="button"
        class="dock-btn"
        :class="{ active: !panMode }"
        title="选中模式"
        aria-label="选中模式"
        @click="emit('update:panMode', false)"
      >
        <UiIcon name="mouse-pointer" :size="18" />
      </button>
      <button
        type="button"
        class="dock-btn"
        :class="{ active: panMode }"
        title="拖动模式 Space"
        aria-label="拖动模式"
        @click="emit('update:panMode', true)"
      >
        <UiIcon name="hand" :size="18" />
      </button>

      <span class="dock-sep" aria-hidden="true" />

      <button type="button" class="dock-btn sm" title="缩小" aria-label="缩小" @click="emit('zoom-out')">
        <UiIcon name="minus" :size="16" />
      </button>
      <span class="zoom-label" title="当前缩放">{{ zoomLabel }}</span>
      <button type="button" class="dock-btn sm" title="放大" aria-label="放大" @click="emit('zoom-in')">
        <UiIcon name="plus" :size="16" />
      </button>
      <button type="button" class="dock-btn" title="适应屏幕" aria-label="适应屏幕" @click="emit('fit')">
        <UiIcon name="maximize" :size="17" />
      </button>

      <span class="dock-sep" aria-hidden="true" />

      <button
        type="button"
        class="dock-btn"
        :class="{ active: hideEdges }"
        title="隐藏连线"
        aria-label="隐藏连线"
        @click="emit('update:hideEdges', !hideEdges)"
      >
        <UiIcon name="eye-off" :size="17" />
      </button>
      <button
        type="button"
        class="dock-btn"
        title="撤销"
        aria-label="撤销"
        :disabled="!canUndo"
        @click="emit('undo')"
      >
        <UiIcon name="undo" :size="17" />
      </button>
      <button
        type="button"
        class="dock-btn"
        title="重做"
        aria-label="重做"
        :disabled="!canRedo"
        @click="emit('redo')"
      >
        <UiIcon name="redo" :size="17" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import UiIcon from '@/components/icons/UiIcon.vue';

const props = defineProps<{
  zoom?: number;
  panMode?: boolean;
  hideEdges?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
}>();

const emit = defineEmits<{
  fit: [];
  'zoom-in': [];
  'zoom-out': [];
  undo: [];
  redo: [];
  'update:panMode': [value: boolean];
  'update:hideEdges': [value: boolean];
}>();

const zoomLabel = ref('100%');
watch(
  () => props.zoom,
  (z) => {
    zoomLabel.value = `${Math.round((z || 1) * 100)}%`;
  },
  { immediate: true },
);

defineExpose({
  closePanels() {
    /* dock no longer hosts panels */
  },
});
</script>

<style scoped>
.dock-root {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 6;
}
.dock-bar {
  pointer-events: auto;
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--studio-panel) 90%, transparent);
  border: 1px solid var(--studio-glass-2);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px);
}
.dock-sep {
  width: 1px;
  height: 22px;
  margin: 0 4px;
  background: var(--studio-glass-3);
  flex-shrink: 0;
}
.dock-btn {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-strong);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.dock-btn.sm {
  width: 30px;
  height: 30px;
}
.dock-btn:hover {
  background: var(--studio-glass-3);
  color: #fff;
}
.dock-btn.active {
  background: var(--studio-ink);
  color: var(--studio-inset);
}
.dock-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.zoom-label {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--studio-text-soft);
  user-select: none;
}
</style>
