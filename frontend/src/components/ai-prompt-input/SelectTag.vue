<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3';
import { computed, ref, watch } from 'vue';
import type { NodeViewProps } from '@tiptap/core';
import type { SelectTagOption } from './types';

const props = defineProps<NodeViewProps>();

const options = ref<SelectTagOption[]>(
  Array.isArray(props.node.attrs.options) ? props.node.attrs.options : [],
);
const selectedValue = ref(
  String(props.node.attrs.value || options.value[0]?.value || ''),
);

const isStatic = computed(() => options.value.length <= 1);

const displayLabel = computed(() => {
  const v = selectedValue.value;
  const hit = options.value.find((o) => o.value === v);
  return hit?.label || v || options.value[0]?.label || '';
});

watch(
  () => props.node.attrs,
  (attrs) => {
    options.value = Array.isArray(attrs.options) ? attrs.options : [];
    if (attrs.value) selectedValue.value = String(attrs.value);
  },
  { deep: true },
);

function onSelectChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  selectedValue.value = value;
  props.updateAttributes({ value });
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="select-tag"
    :class="{ static: isStatic, skill: isStatic }"
    contenteditable="false"
    :title="isStatic ? `技能：${displayLabel}` : displayLabel"
  >
    <!-- 单选项 / 技能名称：纯 chip，避免原生 select 弹出系统下拉层 -->
    <template v-if="isStatic">
      <span class="skill-ico" aria-hidden="true">⚒</span>
      <span class="static-label">{{ displayLabel }}</span>
    </template>
    <select
      v-else
      v-model="selectedValue"
      class="custom-select"
      @change="onSelectChange"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </NodeViewWrapper>
</template>

<style scoped>
.select-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: min(280px, 70vw);
  background: var(--prompt-tag-bg, rgba(125, 211, 232, 0.18));
  border: 1px solid color-mix(in srgb, var(--prompt-tag-fg, #7dd3e8) 45%, transparent);
  border-radius: 999px;
  padding: 2px 10px 2px 8px;
  margin: 0 4px 0 0;
  min-height: 1.65em;
  line-height: 1.2;
  word-break: break-word;
  box-sizing: border-box;
  vertical-align: baseline;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.select-tag:not(.static) {
  padding: 2px 6px 2px 10px;
  border-radius: 10px;
}

.select-tag.skill {
  background: rgba(125, 211, 232, 0.2);
  border-color: rgba(159, 224, 239, 0.55);
  color: #dff7fc;
}

.skill-ico {
  flex: none;
  font-size: 11px;
  line-height: 1;
  opacity: 0.9;
  color: #9fe0ef;
}

.static-label {
  min-width: 0;
  font-size: 13px;
  color: var(--prompt-tag-fg, #9fe0ef);
  font-weight: 650;
  font-family: inherit;
  letter-spacing: 0.01em;
  user-select: none;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-tag.skill .static-label {
  color: #e8f7fb;
}

.custom-select {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--prompt-tag-fg, #9fe0ef);
  font-weight: 650;
  cursor: pointer;
  padding: 0 16px 0 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239fe0ef'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: 100% center;
  background-size: 14px;
  font-family: inherit;
  max-width: 100%;
}

.custom-select:focus {
  outline: none;
}
</style>
