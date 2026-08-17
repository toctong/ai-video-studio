<template>
  <Teleport to="body">
    <div v-if="open" class="ui-sheet-mask" :class="size" @mousedown.self="emit('close')">
      <div
        class="ui-sheet"
        :class="size"
        role="dialog"
        aria-modal="true"
        :aria-label="title || '面板'"
      >
        <header v-if="title || $slots.head" class="ui-sheet-head">
          <slot name="head">
            <strong>{{ title }}</strong>
          </slot>
          <button type="button" class="icon-btn" title="关闭" @click="emit('close')">×</button>
        </header>
        <div class="ui-sheet-body">
          <slot />
        </div>
        <footer v-if="$slots.foot" class="ui-sheet-foot">
          <slot name="foot" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    /** md 默认；lg 宽面板（历史/库） */
    size?: 'md' | 'lg';
  }>(),
  { size: 'md' },
);

const emit = defineEmits<{ close: [] }>();
</script>

<style scoped>
.ui-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: color-mix(in srgb, var(--ink) 28%, transparent);
  backdrop-filter: blur(3px);
  animation: ui-fade var(--dur-fast) var(--ease) both;
}
.ui-sheet {
  width: min(520px, 100%);
}
.ui-sheet.lg {
  width: min(880px, 100%);
  max-height: min(72vh, 640px);
  display: flex;
  flex-direction: column;
}
.ui-sheet.lg > .ui-sheet-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.ui-sheet-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--line);
  flex-shrink: 0;
}
</style>
