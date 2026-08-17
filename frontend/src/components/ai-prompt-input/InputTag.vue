<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { NodeViewProps } from '@tiptap/core';

const props = defineProps<NodeViewProps>();

const labelWidth = ref('auto');
const measureLabelRef = ref<HTMLSpanElement | null>(null);
const showLabel = ref(true);

const tagLabel = computed(() => String(props.node.attrs.label || ''));

function measure() {
  nextTick(() => {
    if (measureLabelRef.value) {
      labelWidth.value = `${measureLabelRef.value.offsetWidth + 24}px`;
    }
  });
}

function syncShowLabel() {
  const text = props.node.textContent.replace(/\uFEFF/g, '').trim();
  showLabel.value = !text;
}

watch(tagLabel, measure, { immediate: true });
watch(
  () => props.node.textContent,
  () => syncShowLabel(),
  { immediate: true },
);

onMounted(() => {
  measure();
  syncShowLabel();
});
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="placeholder-tag"
    :style="{ minWidth: showLabel ? labelWidth : 'auto' }"
  >
    <span ref="measureLabelRef" class="measure-label">{{ tagLabel }}</span>
    <div v-show="showLabel" contenteditable="false" class="start-point">
      <div class="placeholder">{{ tagLabel }}</div>
    </div>
    <NodeViewContent as="span" class="editable-content" />
  </NodeViewWrapper>
</template>

<style lang="scss" scoped>
.placeholder-tag {
  position: relative;
  box-sizing: border-box;
  display: inline-block;
  padding: 2px 6px;
  margin: 2px 3px;
  border-radius: var(--radius);
  background: var(--prompt-tag-bg, var(--accent-soft));
  font-weight: 600;
  line-height: 150%;
  word-break: break-word;
  vertical-align: baseline;
}

.start-point {
  display: inline-block;
  pointer-events: none;
  opacity: 0.7;
  position: absolute;
  top: 2px;
  left: 0;
}

.placeholder {
  pointer-events: none;
  color: var(--prompt-tag-fg, var(--accent));
  opacity: 0.55;
  display: inline-block;
  white-space: nowrap;
  padding: 0 12px;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}

.editable-content {
  display: inline-block;
  min-width: 100%;
  position: relative;
  z-index: 1;
  color: var(--prompt-tag-fg, var(--accent));
  font-size: 16px;
  font-weight: 600;
  line-height: 150%;
}

.measure-label {
  visibility: hidden;
  position: absolute;
  white-space: nowrap;
  font-size: 16px;
}
</style>
