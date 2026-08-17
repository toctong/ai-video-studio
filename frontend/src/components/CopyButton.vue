<template>
  <button
    type="button"
    class="copy-btn"
    :class="{ quiet, sm }"
    :disabled="!text?.trim() || busy"
    :title="title"
    :aria-label="ariaLabel || title"
    @click.stop="onCopy"
  >
    <slot>{{ label }}</slot>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { copyText } from '@/utils/clipboard';

const props = withDefaults(
  defineProps<{
    text?: string;
    title?: string;
    ariaLabel?: string;
    label?: string;
    successMsg?: string;
    quiet?: boolean;
    sm?: boolean;
  }>(),
  {
    text: '',
    title: '复制',
    label: '复制',
    successMsg: '已复制',
    quiet: false,
    sm: false,
  },
);

const busy = ref(false);

async function onCopy() {
  const value = String(props.text || '').trim();
  if (!value || busy.value) return;
  busy.value = true;
  try {
    const ok = await copyText(value);
    if (ok) ElMessage.success(props.successMsg);
    else ElMessage.error('复制失败，请检查浏览器权限');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  background: var(--bg-1, rgba(255, 255, 255, 0.06));
  color: var(--ink, inherit);
  font-size: 12px;
  cursor: pointer;
}
.copy-btn:hover:not(:disabled) {
  border-color: var(--accent, #5b8cff);
}
.copy-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.copy-btn.quiet {
  border-color: transparent;
  background: transparent;
}
.copy-btn.sm {
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
}
</style>
