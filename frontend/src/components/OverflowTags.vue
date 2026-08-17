<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

export type OverflowTagItem = {
  text: string;
  solid?: boolean;
  status?: string;
};

const props = defineProps<{
  items: OverflowTagItem[];
}>();

const root = ref<HTMLElement | null>(null);
const visibleCount = ref(props.items.length);
let ro: ResizeObserver | null = null;
let scheduled = false;
let running = false;

const visibleItems = computed(() => props.items.slice(0, visibleCount.value));
const rest = computed(() => Math.max(0, props.items.length - visibleCount.value));
const hiddenTitle = computed(() =>
  props.items
    .slice(visibleCount.value)
    .map((x) => x.text)
    .join('、'),
);

function fits(el: HTMLElement) {
  return el.scrollWidth <= el.clientWidth + 1;
}

async function recompute() {
  const el = root.value;
  if (!el || running) return;
  running = true;
  try {
    const total = props.items.length;
    if (!total) {
      visibleCount.value = 0;
      return;
    }

    visibleCount.value = total;
    await nextTick();
    if (fits(el)) return;

    for (let n = total - 1; n >= 1; n--) {
      visibleCount.value = n;
      await nextTick();
      if (fits(el)) return;
    }
    visibleCount.value = 1;
  } finally {
    running = false;
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    void recompute();
  });
}

watch(
  () => props.items.map((i) => `${i.text}|${i.solid ? 1 : 0}|${i.status || ''}`).join('\0'),
  () => schedule(),
  { immediate: true },
);

onMounted(() => {
  schedule();
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => schedule());
    if (root.value) ro.observe(root.value);
  }
});

onUnmounted(() => {
  ro?.disconnect();
  ro = null;
});
</script>

<template>
  <div ref="root" class="overflow-tags" role="list">
    <span
      v-for="(t, i) in visibleItems"
      :key="`${t.text}-${i}`"
      class="tag"
      :class="{ solid: t.solid }"
      :data-status="t.status"
      :title="t.text"
      role="listitem"
    >
      {{ t.text }}
    </span>
    <span v-if="rest > 0" class="tag more" role="listitem" :title="hiddenTitle">+{{ rest }}</span>
  </div>
</template>

<style scoped>
/* 参考：轻底色胶囊、单行不换行，溢出用 +N */
.overflow-tags {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

.tag {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  max-width: 8.5em;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1;
  color: color-mix(in srgb, var(--ink) 72%, var(--muted));
  background: var(--surface-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-sizing: border-box;
}

.tag.solid {
  max-width: none;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
}

.tag.solid[data-status='idle'] {
  background: var(--line-hover);
  color: var(--accent-ink);
}

.tag.solid[data-status='archived'] {
  background: var(--muted);
  color: var(--accent-ink);
}

.tag.more {
  max-width: none;
  min-width: 26px;
  justify-content: center;
  padding: 0 8px;
  color: color-mix(in srgb, var(--ink) 55%, var(--muted));
  background: var(--surface-2);
  font-variant-numeric: tabular-nums;
}
</style>
