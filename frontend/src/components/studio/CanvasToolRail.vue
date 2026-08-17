<template>
  <div class="tool-rail" @mousedown.stop>
    <button
      type="button"
      class="rail-btn"
      :class="{ on: libraryOpen }"
      title="素材库"
      aria-label="素材库"
      @click="emit('library')"
    >
      <UiIcon name="folder" :size="18" />
    </button>
    <button
      type="button"
      class="rail-btn"
      :class="{ on: historyOpen }"
      title="历史"
      aria-label="历史"
      @click="emit('history')"
    >
      <UiIcon name="clock" :size="18" />
    </button>
  </div>
</template>

<script setup lang="ts">
import UiIcon from '@/components/icons/UiIcon.vue';

defineProps<{
  libraryOpen?: boolean;
  historyOpen?: boolean;
}>();

const emit = defineEmits<{
  library: [];
  history: [];
}>();
</script>

<style scoped>
.tool-rail {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--studio-panel) 90%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px);
  pointer-events: auto;
}
.rail-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-strong);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.rail-btn:hover {
  background: var(--studio-glass-2);
  color: #fff;
}
.rail-btn.on {
  background: var(--studio-ink);
  color: var(--studio-inset);
}
</style>
