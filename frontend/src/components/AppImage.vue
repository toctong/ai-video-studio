<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
    /** 预览图册；默认仅当前图 */
    previewList?: string[];
    initialIndex?: number;
  }>(),
  {
    alt: '',
    fit: 'cover',
    initialIndex: 0,
  },
);

const list = computed(() => {
  const fromProp = (props.previewList || []).filter(Boolean);
  if (fromProp.length) return fromProp;
  return props.src ? [props.src] : [];
});

const index = computed(() => {
  if (!list.value.length) return 0;
  const bySrc = list.value.indexOf(props.src);
  if (bySrc >= 0) return bySrc;
  const i = props.initialIndex ?? 0;
  return Math.min(Math.max(0, i), list.value.length - 1);
});
</script>

<template>
  <el-image
    v-if="src"
    :src="src"
    :alt="alt"
    :fit="fit"
    :preview-src-list="list"
    :initial-index="index"
    hide-on-click-modal
    preview-teleported
    class="app-image"
  />
</template>

<style scoped>
.app-image {
  width: 100%;
  height: 100%;
  display: block;
}
.app-image :deep(.el-image__inner) {
  cursor: zoom-in;
}
.app-image :deep(.el-image__wrapper) {
  width: 100%;
  height: 100%;
}
</style>
