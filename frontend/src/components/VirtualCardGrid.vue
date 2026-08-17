<template>
  <div ref="rootRef" class="virtual-card-grid" :class="gridClass">
    <div
      v-if="items.length"
      class="vcg-spacer"
      :style="{ height: `${totalSize}px` }"
    >
      <div
        v-for="row in virtualRows"
        :key="String(row.key)"
        class="vcg-row"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          // 行盒子只占卡片高度；行间距由虚拟步长 (estimateSize+gap) 空出来，与左右 gap 一致
          height: `${Math.max(1, row.size - gap)}px`,
          transform: `translateY(${row.start}px)`,
          display: 'grid',
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          columnGap: `${gap}px`,
          alignContent: 'stretch',
          boxSizing: 'border-box',
          padding: rowPaddingStyle,
        }"
      >
        <template v-for="(item, col) in rowItems(row.index)" :key="itemKey(item, row.index, col)">
          <div class="vcg-cell">
            <slot :item="item" :index="row.index * columnCount + col" />
          </div>
        </template>
      </div>
    </div>

    <div
      v-if="hasMore || (showDone && items.length > 0)"
      ref="sentinelRef"
      class="vcg-footer"
      aria-live="polite"
    >
      <template v-if="hasMore">
        <span class="hint">{{ loadingMore ? '加载中…' : '向下滚动加载更多' }}</span>
        <span v-if="total > 0" class="count">已显示 {{ items.length }} / {{ total }}</span>
      </template>
      <span v-else-if="showDone" class="hint muted">已全部加载 · {{ items.length }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';

const props = withDefaults(
  defineProps<{
    items: any[];
    /** 列最小宽度，用于估算列数 */
    minColumnWidth?: number;
    gap?: number;
    /** 单行卡片内容高度（不含行间距；行间距与左右共用 gap） */
    estimateSize?: number;
    overscan?: number;
    /** 显式滚动容器；默认向上查找 el-scrollbar__wrap */
    scrollElement?: HTMLElement | null;
    /** 是否还有更多（服务端分页） */
    hasMore?: boolean;
    loadingMore?: boolean;
    total?: number;
    showDone?: boolean;
    gridClass?: string;
    /** 外层 padding，写入每行以免虚拟行贴边 */
    paddingX?: number;
    getKey?: (item: any, index: number) => string | number;
  }>(),
  {
    minColumnWidth: 280,
    gap: 16,
    estimateSize: 180,
    overscan: 4,
    hasMore: false,
    loadingMore: false,
    total: 0,
    showDone: true,
    paddingX: 0,
  },
);

const emit = defineEmits<{
  'end-reached': [];
}>();

const rootRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
const containerWidth = ref(960);
const scrollEl = ref<Element | null>(null);

const columnCount = computed(() => {
  const w = Math.max(0, containerWidth.value - props.paddingX * 2);
  const unit = props.minColumnWidth + props.gap;
  return Math.max(1, Math.floor((w + props.gap) / unit));
});

const rowCount = computed(() =>
  props.items.length ? Math.ceil(props.items.length / columnCount.value) : 0,
);

/** 行步长 = 卡片高度 + 间隙（与左右 columnGap 同一数值） */
const rowStride = computed(() => Math.max(1, props.estimateSize + props.gap));

const rowPaddingStyle = computed(() =>
  props.paddingX > 0 ? `0 ${props.paddingX}px` : '0',
);

function findScrollRoot(el: HTMLElement | null): Element | null {
  if (props.scrollElement) return props.scrollElement;
  let cur: HTMLElement | null = el?.parentElement || null;
  while (cur) {
    if (cur.classList.contains('el-scrollbar__wrap')) return cur;
    const oy = getComputedStyle(cur).overflowY;
    if (
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      cur.scrollHeight > cur.clientHeight + 8
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function resolveScrollElement(): Element | null {
  return scrollEl.value || findScrollRoot(rootRef.value);
}

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rowCount.value,
    getScrollElement: () => resolveScrollElement(),
    estimateSize: () => rowStride.value,
    overscan: props.overscan,
    // 列数 / 行距变化时重建测量
    getItemKey: (index: number) => `${columnCount.value}:${rowStride.value}:${index}`,
  })),
) as Ref<{
  getTotalSize: () => number;
  getVirtualItems: () => Array<{
    key: string | number | bigint;
    index: number;
    start: number;
    size: number;
  }>;
  measure: () => void;
}>;

const totalSize = computed(() => virtualizer.value.getTotalSize());
const virtualRows = computed(() => virtualizer.value.getVirtualItems());

function rowItems(rowIndex: number): any[] {
  const start = rowIndex * columnCount.value;
  return props.items.slice(start, start + columnCount.value);
}

function itemKey(item: any, rowIndex: number, col: number) {
  const index = rowIndex * columnCount.value + col;
  if (props.getKey) return props.getKey(item, index);
  const rec = item as { id?: string | number };
  return rec?.id != null ? String(rec.id) : index;
}

let resizeObs: ResizeObserver | null = null;
let endObs: IntersectionObserver | null = null;
let endBusy = false;

function measureWidth() {
  const el = rootRef.value;
  if (!el) return;
  const w = el.clientWidth || el.getBoundingClientRect().width;
  if (w > 0) containerWidth.value = w;
}

function setupEndObserver() {
  endObs?.disconnect();
  endObs = null;
  const sentinel = sentinelRef.value;
  if (!sentinel || !props.hasMore) return;
  const root = resolveScrollElement();
  endObs = new IntersectionObserver(
    (entries) => {
      if (!props.hasMore || props.loadingMore || endBusy) return;
      if (!entries.some((e) => e.isIntersecting)) return;
      endBusy = true;
      emit('end-reached');
      window.setTimeout(() => {
        endBusy = false;
      }, 200);
    },
    { root, rootMargin: '320px 0px', threshold: 0 },
  );
  endObs.observe(sentinel);
}

onMounted(async () => {
  await nextTick();
  scrollEl.value = findScrollRoot(rootRef.value);
  measureWidth();
  resizeObs = new ResizeObserver(() => {
    measureWidth();
    virtualizer.value.measure();
  });
  if (rootRef.value) resizeObs.observe(rootRef.value);
  setupEndObserver();
});

onUnmounted(() => {
  resizeObs?.disconnect();
  endObs?.disconnect();
});

watch(
  () => [props.items.length, props.hasMore, props.loadingMore, columnCount.value] as const,
  async () => {
    await nextTick();
    scrollEl.value = findScrollRoot(rootRef.value);
    virtualizer.value.measure();
    setupEndObserver();
  },
);

watch(
  () => props.scrollElement,
  () => {
    scrollEl.value = props.scrollElement || findScrollRoot(rootRef.value);
    virtualizer.value.measure();
    setupEndObserver();
  },
);
</script>

<style scoped>
.virtual-card-grid {
  position: relative;
  width: 100%;
  min-width: 0;
}
.vcg-spacer {
  position: relative;
  width: 100%;
}
.vcg-row {
  will-change: transform;
}
.vcg-cell {
  min-width: 0;
  height: 100%;
  /* 不在此裁切，避免描述被行高估矮时硬切断；圆角由卡片自身 overflow 处理 */
  overflow: visible;
}
.vcg-cell > :deep(*) {
  height: 100%;
  max-height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}
.vcg-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 20px 12px 28px;
  width: 100%;
}
.hint {
  font-size: 12px;
  color: var(--studio-text-faint);
  letter-spacing: 0.02em;
}
.hint.muted {
  color: var(--studio-line-bright);
}
.count {
  font-size: 11px;
  color: var(--studio-line-bright);
  font-variant-numeric: tabular-nums;
}
</style>
