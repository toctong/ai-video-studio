<template>
  <div class="filter-bar">
    <div class="tabs-wrap">
      <button
        v-show="canLeft"
        type="button"
        class="nav-btn left"
        aria-label="向左"
        @click="scrollBy(-1)"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M10 3 L5 8 L10 13"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>

      <div
        ref="scroller"
        class="filter-tabs"
        :class="{ 'fade-left': canLeft, 'fade-right': canRight }"
        role="tablist"
        @wheel.prevent="onWheel"
        @scroll="updateNav"
      >
        <button
          v-for="opt in options"
          :key="opt.value"
          type="button"
          role="tab"
          class="tab"
          :class="{ on: modelValue === opt.value }"
          :aria-selected="modelValue === opt.value"
          @click="emit('update:modelValue', opt.value)"
        >
          <span>{{ opt.label }}</span>
          <em v-if="opt.count != null">{{ opt.count }}</em>
        </button>
      </div>

      <button
        v-show="canRight"
        type="button"
        class="nav-btn right"
        aria-label="向右"
        @click="scrollBy(1)"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M6 3 L11 8 L6 13"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
    <slot name="aside" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export type FilterTabOption = {
  value: string;
  label: string;
  count?: number;
};

const props = defineProps<{
  modelValue: string;
  options: FilterTabOption[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const scroller = ref<HTMLElement | null>(null);
const canLeft = ref(false);
const canRight = ref(false);
let ro: ResizeObserver | null = null;

function updateNav() {
  const el = scroller.value;
  if (!el) {
    canLeft.value = false;
    canRight.value = false;
    return;
  }
  const max = el.scrollWidth - el.clientWidth;
  const overflow = max > 4;
  canLeft.value = overflow && el.scrollLeft > 4;
  canRight.value = overflow && el.scrollLeft < max - 4;
}

function scrollBy(dir: number) {
  const el = scroller.value;
  if (!el) return;
  const step = Math.max(180, Math.floor(el.clientWidth * 0.65));
  el.scrollBy({ left: dir * step, behavior: 'smooth' });
}

function onWheel(e: WheelEvent) {
  const el = scroller.value;
  if (!el) return;
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    el.scrollLeft += e.deltaY;
  } else {
    el.scrollLeft += e.deltaX;
  }
  updateNav();
}

function bind() {
  const el = scroller.value;
  if (!el) return;
  ro?.disconnect();
  ro = new ResizeObserver(() => updateNav());
  ro.observe(el);
  updateNav();
}

onMounted(() => {
  bind();
  window.addEventListener('resize', updateNav);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  window.removeEventListener('resize', updateNav);
});

watch(
  () => props.options,
  async () => {
    await nextTick();
    updateNav();
  },
  { deep: true },
);

watch(
  () => props.modelValue,
  async () => {
    await nextTick();
    const el = scroller.value;
    if (!el) return;
    const active = el.querySelector('.tab.on') as HTMLElement | null;
    active?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    updateNav();
  },
);
</script>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  min-width: 0;
}

.tabs-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.filter-tabs {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 34px;
  scrollbar-width: none;
  scroll-behavior: smooth;
}
.filter-tabs::-webkit-scrollbar {
  display: none;
}
.filter-tabs.fade-left {
  mask-image: linear-gradient(90deg, transparent 0, #000 40px, #000 calc(100% - 40px), transparent);
}
.filter-tabs.fade-right:not(.fade-left) {
  mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 40px), transparent);
}
.filter-tabs.fade-left:not(.fade-right) {
  mask-image: linear-gradient(90deg, transparent 0, #000 40px, #000 100%);
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  background: var(--bg-elevated);
  color: var(--ink);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  box-shadow: var(--shadow-sm);
  transition:
    background 0.15s var(--ease),
    border-color 0.15s var(--ease),
    color 0.15s var(--ease);
}
.nav-btn svg {
  display: block;
  color: inherit;
  opacity: 1;
  pointer-events: none;
}
.nav-btn:hover {
  border-color: var(--accent);
  color: var(--accent-ink);
  background: var(--accent);
}
.nav-btn:hover svg {
  color: var(--accent-ink);
  opacity: 1;
}
.nav-btn.left {
  left: 0;
}
.nav-btn.right {
  right: 0;
}

.tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition:
    color 0.15s var(--ease),
    background 0.15s var(--ease),
    border-color 0.15s var(--ease);
}
.tab:hover {
  color: var(--ink);
  border-color: var(--line-hover);
}
.tab.on {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  font-weight: 700;
}
.tab em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  opacity: 0.65;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
}
.tab.on em {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  opacity: 1;
}
</style>
