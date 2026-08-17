<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3';
import { computed } from 'vue';
import type { NodeViewProps } from '@tiptap/core';

const props = defineProps<NodeViewProps>();

const label = computed(() => String(props.node.attrs.label || '').trim());
const url = computed(() => String(props.node.attrs.url || '').trim());
const mediaKind = computed(() => String(props.node.attrs.mediaKind || '').trim());
const expandText = computed(() => String(props.node.attrs.expandText || '').trim());

const showThumb = computed(
  () =>
    !!url.value &&
    (mediaKind.value === 'image' || !mediaKind.value || mediaKind.value === 'video'),
);

const displayLabel = computed(() => {
  if (!label.value) return '@参考';
  return label.value.startsWith('@') ? label.value : `@${label.value}`;
});

function stopEdit(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}
</script>

<template>
  <NodeViewWrapper
    as="span"
    class="mention-tag"
    :class="{ media: showThumb }"
    contenteditable="false"
    :title="expandText || displayLabel"
    @mousedown="stopEdit"
    @click="stopEdit"
  >
    <span v-if="showThumb" class="mention-thumb" aria-hidden="true">
      <img :src="url" alt="" />
    </span>
    <span class="mention-label">{{ displayLabel }}</span>
  </NodeViewWrapper>
</template>

<style scoped>
.mention-tag {
  position: relative;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  max-width: min(220px, 100%);
  margin: 0 3px;
  padding: 1px 8px;
  border-radius: 8px;
  background: rgba(96, 165, 250, 0.22);
  color: #93c5fd;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  vertical-align: baseline;
  user-select: none;
  /* flex 子项默认 min-width:auto，不设 0 时长文案会撑破再换行 */
  min-width: 0;
}
.mention-tag.media {
  padding-left: 4px;
  gap: 6px;
}
.mention-thumb {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  overflow: hidden;
  flex: 0 0 auto;
  background: var(--studio-panel);
}
.mention-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mention-label {
  display: block;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
