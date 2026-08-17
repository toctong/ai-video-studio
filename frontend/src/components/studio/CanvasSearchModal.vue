<template>
  <Teleport to="body">
    <div v-if="open" class="cs-overlay" @mousedown.self="close">
      <div
        class="cs-modal"
        role="dialog"
        aria-label="搜索画布"
        @mousedown.stop
        @keydown="onKey"
      >
        <header class="cs-head">
          <div class="cs-tabs" role="tablist">
            <button
              type="button"
              class="cs-tab"
              :class="{ on: field === 'name' }"
              role="tab"
              @click="field = 'name'"
            >
              名称
            </button>
            <button
              type="button"
              class="cs-tab"
              :class="{ on: field === 'prompt' }"
              role="tab"
              @click="field = 'prompt'"
            >
              提示词
            </button>
          </div>
          <div class="cs-input-row">
            <UiIcon name="search" :size="18" />
            <input
              ref="inputRef"
              v-model="q"
              type="search"
              :placeholder="field === 'name' ? '搜索节点名称...' : '搜索提示词...'"
              spellcheck="false"
              autocomplete="off"
              @keydown.esc.prevent="close"
              @keydown.enter.prevent="locateActive"
            />
            <kbd>ESC</kbd>
          </div>
        </header>

        <div class="cs-filters">
          <button
            v-for="f in filters"
            :key="f.id"
            type="button"
            class="cs-chip"
            :class="{ on: kind === f.id }"
            @click="kind = f.id"
          >
            {{ f.label }}
          </button>
        </div>

        <div class="cs-list" role="listbox">
          <button
            v-for="(item, idx) in filtered"
            :key="item.id"
            type="button"
            class="cs-item"
            :class="{ on: idx === activeIndex }"
            role="option"
            :aria-selected="idx === activeIndex"
            @mouseenter="activeIndex = idx"
            @click="locate(item.id)"
          >
            <span class="cs-dot" :class="item.kind" />
            <span class="cs-meta">
              <strong>{{ item.label }}</strong>
              <em>{{ item.sub }}</em>
            </span>
            <span class="cs-type">{{ item.typeLabel }}</span>
          </button>

          <div v-if="!filtered.length" class="cs-empty">
            <UiIcon name="search" :size="40" />
            <p>{{ nodes.length ? '无匹配节点' : '画布中暂无节点' }}</p>
          </div>
        </div>

        <footer class="cs-foot">
          <span>{{ filtered.length }} 个节点</span>
          <span class="hints">
            <kbd>↑↓</kbd> 导航
            <kbd>↵</kbd> 定位
            <kbd>esc</kbd> 关闭
          </span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import UiIcon from '@/components/icons/UiIcon.vue';

export type CanvasSearchNode = {
  id: string;
  label: string;
  type: string;
  prompt?: string;
};

const props = defineProps<{
  open: boolean;
  nodes: CanvasSearchNode[];
}>();

const emit = defineEmits<{
  close: [];
  locate: [id: string];
}>();

type Kind = 'all' | 'image' | 'video' | 'audio' | 'text';
type Field = 'name' | 'prompt';

const filters: { id: Kind; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
  { id: 'text', label: '文字' },
];

const q = ref('');
const field = ref<Field>('name');
const kind = ref<Kind>('all');
const activeIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

function nodeKind(type: string): Kind {
  const t = type.toLowerCase();
  if (/video/.test(t)) return 'video';
  if (/audio|music|sound|tts|voice/.test(t)) return 'audio';
  if (/image|img|render|portrait/.test(t)) return 'image';
  if (/text|note|chat|script|prompt/.test(t)) return 'text';
  return 'text';
}

function typeLabel(type: string) {
  const map: Record<Kind, string> = {
    all: '节点',
    image: '图片',
    video: '视频',
    audio: '音频',
    text: '文字',
  };
  return map[nodeKind(type)];
}

const indexed = computed(() =>
  props.nodes.map((n) => {
    const k = nodeKind(n.type);
    const prompt = String(n.prompt || '').trim();
    return {
      id: n.id,
      label: n.label || n.type || n.id,
      sub: field.value === 'prompt' ? prompt || '（无提示词）' : n.type,
      prompt,
      type: n.type,
      kind: k,
      typeLabel: typeLabel(n.type),
    };
  }),
);

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return indexed.value.filter((n) => {
    if (kind.value !== 'all' && n.kind !== kind.value) return false;
    if (!needle) return true;
    if (field.value === 'prompt') return n.prompt.toLowerCase().includes(needle);
    return (
      n.label.toLowerCase().includes(needle) ||
      n.type.toLowerCase().includes(needle) ||
      n.id.toLowerCase().includes(needle)
    );
  });
});

watch(
  () => props.open,
  async (v) => {
    if (!v) return;
    q.value = '';
    activeIndex.value = 0;
    await nextTick();
    inputRef.value?.focus();
  },
);

watch([q, field, kind, () => props.nodes], () => {
  activeIndex.value = 0;
});

function close() {
  emit('close');
}

function locate(id: string) {
  emit('locate', id);
  close();
}

function locateActive() {
  const item = filtered.value[activeIndex.value];
  if (item) locate(item.id);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!filtered.value.length) return;
    activeIndex.value = (activeIndex.value + 1) % filtered.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!filtered.value.length) return;
    activeIndex.value =
      (activeIndex.value - 1 + filtered.value.length) % filtered.value.length;
  }
}
</script>

<style scoped>
.cs-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.45);
  animation: cs-fade 0.15s ease-out;
}
.cs-modal {
  width: min(660px, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--studio-panel) 96%, transparent);
  border: 1px solid var(--studio-glass-3);
  border-radius: 16px;
  backdrop-filter: blur(30px) saturate(160%);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.35),
    inset 0 0 0 1px var(--studio-glass-2);
  color: var(--studio-ink);
  animation: cs-up 0.18s ease-out;
  overflow: hidden;
}
.cs-head {
  border-bottom: 1px solid var(--studio-glass-2);
}
.cs-tabs {
  display: flex;
  gap: 0;
  padding: 10px 16px 0;
}
.cs-tab {
  padding: 5px 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--studio-text-faint);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.cs-tab:hover {
  color: var(--studio-text-strong);
}
.cs-tab.on {
  color: #fff;
  border-bottom-color: #fff;
}
.cs-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 12px;
  color: var(--studio-text-faint);
}
.cs-input-row input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  font-size: 15px;
}
.cs-input-row input::placeholder {
  color: var(--studio-line-bright);
}
.cs-input-row kbd,
.cs-foot kbd {
  flex-shrink: 0;
  font: inherit;
  font-size: 11px;
  color: var(--studio-text-faint);
  padding: 2px 6px;
  border: 1px solid var(--studio-glass-3);
  border-radius: 5px;
}
.cs-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 16px;
}
.cs-chip {
  padding: 3px 10px;
  font: inherit;
  font-size: 12px;
  border-radius: 999px;
  border: 1px solid var(--studio-glass-3);
  background: transparent;
  color: var(--studio-text-soft);
  cursor: pointer;
}
.cs-chip:hover {
  color: #fff;
  border-color: var(--studio-line-bright);
}
.cs-chip.on {
  background: var(--studio-ink);
  color: var(--studio-inset);
  border-color: #fff;
}
.cs-list {
  flex: 1;
  min-height: 180px;
  max-height: 42vh;
  overflow: auto;
  padding: 6px;
}
.cs-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.cs-item:hover,
.cs-item.on {
  background: rgba(255, 255, 255, 0.07);
}
.cs-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #888;
}
.cs-dot.image {
  background: #fbbf24;
}
.cs-dot.video {
  background: #a78bfa;
}
.cs-dot.audio {
  background: #34d399;
}
.cs-dot.text {
  background: #60a5fa;
}
.cs-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cs-meta strong {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-meta em {
  font-style: normal;
  font-size: 11px;
  color: var(--studio-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-type {
  font-size: 11px;
  color: var(--studio-line-bright);
  flex-shrink: 0;
}
.cs-empty {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 200px;
  color: var(--studio-line-bright);
}
.cs-empty p {
  margin: 0;
  font-size: 13px;
}
.cs-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--studio-glass-2);
  font-size: 12px;
  color: var(--studio-text-faint);
}
.cs-foot .hints {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
@keyframes cs-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes cs-up {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
