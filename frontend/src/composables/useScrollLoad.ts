import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

export type UseScrollLoadOptions = {
  /** 首次与每次增量条数，默认 24 */
  pageSize?: number;
};

/**
 * 列表滚动加载：源数据全量在内存过滤，DOM 只挂载 limit 条，触底再追加。
 * 适合广场卡片网格、资产缩略图等「全量接口 + 客户端筛选」场景。
 */
export function useScrollLoad<T>(
  source: MaybeRefOrGetter<T[]>,
  options?: UseScrollLoadOptions,
) {
  const pageSize = Math.max(8, Number(options?.pageSize) || 24);
  const limit = ref(pageSize);

  const list = computed(() => {
    const raw = toValue(source);
    return Array.isArray(raw) ? raw : [];
  });

  // 筛选/关键词变化时重置窗口，避免停在过大的 limit
  watch(
    () => {
      const arr = list.value;
      const head = arr[0] as { id?: string } | undefined;
      return `${arr.length}:${head?.id ?? ''}`;
    },
    () => {
      limit.value = pageSize;
    },
  );

  const visible = computed(() => list.value.slice(0, limit.value));
  const hasMore = computed(() => limit.value < list.value.length);
  const total = computed(() => list.value.length);
  const loaded = computed(() => visible.value.length);

  function loadMore() {
    if (!hasMore.value) return;
    limit.value = Math.min(limit.value + pageSize, list.value.length);
  }

  function reset() {
    limit.value = pageSize;
  }

  return {
    visible,
    hasMore,
    total,
    loaded,
    loadMore,
    reset,
    pageSize,
  };
}
