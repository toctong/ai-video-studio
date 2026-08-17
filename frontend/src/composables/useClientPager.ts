import { computed, ref, watch, type Ref } from 'vue';

export const PAGE_SIZES = [10, 20, 30, 50];

/** Client-side pagination for local table arrays. */
export function useClientPager<T>(source: Ref<T[]>, defaultSize = 20) {
  const page = ref(1);
  const pageSize = ref(defaultSize);
  const pageSizes = PAGE_SIZES;

  const total = computed(() => source.value.length);

  const paged = computed(() => {
    const start = (page.value - 1) * pageSize.value;
    return source.value.slice(start, start + pageSize.value);
  });

  watch(pageSize, () => {
    page.value = 1;
  });

  watch(total, (n) => {
    const maxPage = Math.max(1, Math.ceil(n / pageSize.value) || 1);
    if (page.value > maxPage) page.value = maxPage;
  });

  return { page, pageSize, pageSizes, total, paged };
}
