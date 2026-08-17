<template>
  <Teleport to="body">
    <aside
      v-if="open"
      class="crp"
      :class="size"
      role="dialog"
      :aria-label="title"
    >
      <header class="crp-head">
        <div class="crp-title">
          <strong>{{ title }}</strong>
          <slot name="title-extra" />
        </div>
        <div class="crp-ops">
          <slot name="ops" />
          <button type="button" class="crp-x" title="关闭" aria-label="关闭" @click="emit('close')">
            ×
          </button>
        </div>
      </header>
      <div v-if="$slots.tabs" class="crp-tabs">
        <slot name="tabs" />
      </div>
      <div class="crp-body">
        <slot />
      </div>
      <footer v-if="$slots.foot" class="crp-foot">
        <slot name="foot" />
      </footer>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** md 350；lg 略宽（素材库） */
    size?: 'md' | 'lg';
  }>(),
  { size: 'md' },
);

const emit = defineEmits<{ close: [] }>();
</script>

<style scoped>
.crp {
  position: fixed;
  left: 70px;
  top: 64px;
  bottom: 18px;
  z-index: 55;
  width: 350px;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--studio-panel) 92%, transparent);
  backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--studio-glass-3);
  border-radius: 24px;
  overflow: hidden;
  color: var(--studio-text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  animation: crp-in 0.18s ease-out;
}
.crp.lg {
  width: min(420px, calc(100vw - 90px));
}
.crp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 14px 10px;
  flex-shrink: 0;
}
.crp-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.crp-title strong {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.crp-ops {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.crp-ops :deep(button) {
  border: 0 !important;
  outline: none;
  box-shadow: none;
  appearance: none;
  -webkit-appearance: none;
}
.crp-x {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-text-soft);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.crp-x:hover {
  background: var(--studio-glass-2);
  color: #fff;
}
.crp-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 14px;
  border-bottom: 1px solid var(--studio-glass-2);
  flex-shrink: 0;
}
.crp-tabs :deep(.crp-tab) {
  padding: 8px 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--studio-text-faint);
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
}
.crp-tabs :deep(.crp-tab:hover) {
  color: var(--studio-text-strong);
}
.crp-tabs :deep(.crp-tab.on) {
  color: #fff;
  border-bottom-color: #fff;
}
.crp-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
}
.crp-foot {
  flex-shrink: 0;
  padding: 10px 14px;
  border-top: 1px solid var(--studio-glass-2);
  font-size: 11px;
  color: var(--studio-text-faint);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  justify-content: space-between;
}
.crp-foot :deep(kbd) {
  font: inherit;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--studio-line-strong);
  color: var(--studio-text-soft);
}
@keyframes crp-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
