<template>
  <div ref="rootEl" class="scroll-load-more" aria-live="polite">
    <template v-if="hasMore">
      <span class="hint">{{ busy ? '加载中…' : '向下滚动加载更多' }}</span>
      <span class="count">已显示 {{ loaded }} / {{ total }}</span>
    </template>
    <template v-else-if="showDone && total > 0">
      <span class="hint muted">已全部加载 · {{ total }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    hasMore: boolean;
    loaded?: number;
    total?: number;
    /** 是否显示「已全部加载」 */
    showDone?: boolean;
    /** 距底部提前触发的边距 */
    rootMargin?: string;
  }>(),
  {
    loaded: 0,
    total: 0,
    showDone: true,
    rootMargin: '240px 0px',
  },
);

const emit = defineEmits<{
  'load-more': [];
}>();

const rootEl = ref<HTMLElement | null>(null);
const busy = ref(false);
let observer: IntersectionObserver | null = null;
let unlockTimer: number | undefined;

function findScrollRoot(el: HTMLElement | null): Element | null {
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

function teardown() {
  observer?.disconnect();
  observer = null;
  if (unlockTimer) window.clearTimeout(unlockTimer);
}

function setup() {
  teardown();
  const el = rootEl.value;
  if (!el || !props.hasMore) return;

  const root = findScrollRoot(el);
  observer = new IntersectionObserver(
    (entries) => {
      if (!props.hasMore || busy.value) return;
      if (!entries.some((e) => e.isIntersecting)) return;
      busy.value = true;
      emit('load-more');
      // 防抖：等下一批 DOM 挂上再允许下一次
      unlockTimer = window.setTimeout(() => {
        busy.value = false;
      }, 120);
    },
    { root, rootMargin: props.rootMargin, threshold: 0 },
  );
  observer.observe(el);
}

onMounted(setup);
onUnmounted(teardown);
watch(
  () => [props.hasMore, props.total, props.loaded] as const,
  () => setup(),
);
</script>

<style scoped>
.scroll-load-more {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 20px 12px 28px;
  grid-column: 1 / -1;
  width: 100%;
}
.hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.02em;
}
.hint.muted {
  color: rgba(255, 255, 255, 0.28);
}
.count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.28);
  font-variant-numeric: tabular-nums;
}
</style>
