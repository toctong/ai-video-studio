<template>
  <el-scrollbar
    ref="barRef"
    class="ui-scroll"
    :class="{ 'ui-scroll--always': always, 'ui-scroll--x': horizontal }"
    :native="false"
    :noresize="noresize"
    :max-height="maxHeight"
    :height="height"
    :view-class="viewClass"
    :wrap-class="wrapClass"
    @scroll="onScroll"
  >
    <slot />
  </el-scrollbar>
</template>

<script setup lang="ts">
import { ref, unref } from 'vue';
import type { ScrollbarInstance } from 'element-plus';

/**
 * Element Plus 虚拟滚动条封装（非原生 scrollbar）
 */
withDefaults(
  defineProps<{
    /** 是否始终显示轨道（默认悬停才显） */
    always?: boolean;
    horizontal?: boolean;
    noresize?: boolean;
    maxHeight?: string | number;
    height?: string | number;
    viewClass?: string;
    wrapClass?: string;
  }>(),
  {
    always: false,
    horizontal: false,
    noresize: false,
  },
);

const emit = defineEmits<{
  scroll: [payload: { scrollTop: number; scrollLeft: number }];
}>();

const barRef = ref<ScrollbarInstance>();

function wrapEl(): HTMLElement | undefined {
  return unref(barRef.value?.wrapRef) as HTMLElement | undefined;
}

function onScroll(payload: { scrollTop: number; scrollLeft: number }) {
  emit('scroll', payload);
}

defineExpose({
  wrapEl,
  scrollTo: (options: ScrollToOptions | number, yCoord?: number) => {
    barRef.value?.scrollTo(options as never, yCoord);
  },
  setScrollTop: (n: number) => barRef.value?.setScrollTop(n),
  setScrollLeft: (n: number) => barRef.value?.setScrollLeft(n),
  update: () => barRef.value?.update(),
});
</script>

<style scoped>
.ui-scroll {
  height: 100%;
  width: 100%;
}

:deep(.el-scrollbar__bar) {
  z-index: 20;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.ui-scroll:hover :deep(.el-scrollbar__bar),
.ui-scroll:focus-within :deep(.el-scrollbar__bar),
.ui-scroll--always :deep(.el-scrollbar__bar) {
  opacity: 1;
}

:deep(.el-scrollbar__bar.is-vertical) {
  width: 6px;
  right: 3px;
}
:deep(.el-scrollbar__bar.is-horizontal) {
  height: 6px;
  bottom: 3px;
}

:deep(.el-scrollbar__thumb) {
  background-color: rgba(255, 255, 255, 0.18) !important;
  border-radius: 999px !important;
  opacity: 1 !important;
}
:deep(.el-scrollbar__thumb:hover) {
  background-color: rgba(255, 255, 255, 0.32) !important;
}

/* 彻底藏掉 wrap 上的原生滚动条 */
:deep(.el-scrollbar__wrap) {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
:deep(.el-scrollbar__wrap::-webkit-scrollbar) {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
</style>
