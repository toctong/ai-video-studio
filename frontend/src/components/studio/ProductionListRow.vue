<template>
  <div class="prod-row" :class="{ busy: busy }" @click="emit('open')">
    <div class="thumb" :style="thumbStyle">
      <MediaThumb v-if="production.thumbUrl" :url="production.thumbUrl" :show-play="false" />
      <span v-else>{{ initials }}</span>
    </div>
    <div class="body">
      <strong class="title" :title="production.name">{{ production.name || '未命名' }}</strong>
      <span class="meta">
        {{ statusLabel }}
        <em v-if="when">· {{ when }}</em>
        <em v-if="tag">· {{ tag }}</em>
      </span>
    </div>
    <div class="ops" @click.stop>
      <button type="button" class="ico" :disabled="busy" title="画布" aria-label="画布" @click="emit('open')">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7H5zm2 2h4v2H7V9zm0 4h7v2H7v-2z"
          />
        </svg>
      </button>
      <button type="button" class="ico" :disabled="busy" title="对话" aria-label="对话" @click="emit('chat')">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2v9h3v1.6L9.7 16H20V7H4z"
          />
        </svg>
      </button>
      <button type="button" class="ico" :disabled="busy" title="导出" aria-label="导出" @click="emit('export')">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 3v10.2l3.2-3.2 1.4 1.4L12 17l-4.6-5.6 1.4-1.4L11 13.2V3h1zM5 19h14v2H5v-2z"
          />
        </svg>
      </button>
      <button
        v-if="showMore"
        type="button"
        class="ico"
        :disabled="busy"
        title="更多"
        aria-label="更多"
        @click="menuOpen = !menuOpen"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"
          />
        </svg>
      </button>
      <div v-if="menuOpen" class="menu" @mousedown.stop>
        <button type="button" @click="emitMore('publish')">发布发现</button>
        <button type="button" class="danger" @click="emitMore('remove')">删除</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ProductionRow } from '@/api/productions';
import MediaThumb from '@/components/MediaThumb.vue';

const props = withDefaults(
  defineProps<{
    production: ProductionRow;
    busy?: boolean;
    showMore?: boolean;
  }>(),
  { busy: false, showMore: true },
);

const emit = defineEmits<{
  open: [];
  chat: [];
  export: [];
  publish: [];
  remove: [];
}>();

const menuOpen = ref(false);

const initials = computed(() => (props.production.name || '项').slice(0, 2));
const tag = computed(() => props.production.tags?.[0] || '');
const statusLabel = computed(() => {
  const s = props.production.status;
  if (s === 'ready') return '已编译';
  if (s === 'running') return '运行中';
  if (s === 'done') return '已成片';
  return '草稿';
});
const when = computed(() => {
  const v = props.production.updatedAt || props.production.createdAt;
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
});
const thumbStyle = computed(() => {
  if (props.production.thumbUrl) return {};
  const hues = [210, 200, 180, 30, 160];
  const h = hues[(props.production.name?.length || 0) % hues.length];
  return {
    background: `linear-gradient(145deg, hsla(${h},45%,42%,0.28), var(--surface-muted))`,
  };
});

function emitMore(kind: 'publish' | 'remove') {
  menuOpen.value = false;
  if (kind === 'publish') emit('publish');
  else emit('remove');
}

function onDoc(e: MouseEvent) {
  if (!(e.target as HTMLElement)?.closest?.('.ops')) menuOpen.value = false;
}
onMounted(() => document.addEventListener('mousedown', onDoc));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc));
</script>

<style scoped>
.prod-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease);
}
.prod-row:hover,
.prod-row.busy {
  background: var(--hover-bg);
}
.thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
  background: var(--surface-muted);
}
.thumb :deep(.media-thumb) {
  width: 100%;
  height: 100%;
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title {
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta {
  font-size: 11px;
  color: var(--muted);
}
.meta em {
  font-style: normal;
}
.ops {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease);
}
.prod-row:hover .ops,
.prod-row:focus-within .ops {
  opacity: 1;
}
.ico {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}
.ico:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--ink);
}
.ico:disabled {
  opacity: 0.35;
  cursor: default;
}
.menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 120px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow);
  z-index: 5;
  display: flex;
  flex-direction: column;
}
.menu button {
  border: 0;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  color: var(--ink);
  cursor: pointer;
}
.menu button:hover {
  background: var(--hover-bg);
}
.menu button.danger {
  color: var(--danger);
}
</style>
