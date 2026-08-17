<template>
  <CanvasRailPanel :open="open" title="历史记录" @close="close">
    <template #tabs>
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        class="crp-tab"
        :class="{ on: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </template>

    <div class="hist-toolbar">
      <button type="button" class="refresh" @click="load">刷新</button>
      <span class="count">{{ filtered.length }} 项</span>
    </div>

    <div class="hist-body" v-loading="loading">
      <button
        v-for="a in filtered"
        :key="a.id"
        type="button"
        class="card"
        @click="pick(a)"
      >
        <div class="thumb">
          <img v-if="isImage(a)" :src="a.url" alt="" />
          <LazyVideoThumb
            v-else-if="isVideo(a)"
            :src="a.url || ''"
            :poster-url="String(a.meta?.posterUrl || '')"
          />
          <div v-else class="ph">{{ (a.type || '?').slice(0, 1) }}</div>
        </div>
        <div class="meta">
          <strong>{{ a.name || a.id.slice(0, 8) }}</strong>
          <span>{{ a.type || 'asset' }}</span>
        </div>
      </button>
      <div v-if="!loading && !filtered.length" class="empty">暂无记录</div>
    </div>

    <template #foot>
      <span>点击条目可将图片/视频加入画布</span>
    </template>
  </CanvasRailPanel>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import api from '@/api';
import CanvasRailPanel from '@/components/studio/CanvasRailPanel.vue';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';

export type HistoryAsset = {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
};

const props = defineProps<{
  open: boolean;
  projectId: string;
  workflowId?: string;
}>();

const emit = defineEmits<{
  close: [];
  pick: [asset: HistoryAsset];
}>();

const tabs = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
];

const tab = ref('all');
const loading = ref(false);
const rows = ref<HistoryAsset[]>([]);

const filtered = computed(() => {
  if (tab.value === 'image') return rows.value.filter(isImage);
  if (tab.value === 'video') return rows.value.filter(isVideo);
  if (tab.value === 'audio') return rows.value.filter(isAudio);
  return rows.value;
});

function isImage(a: HistoryAsset) {
  return (
    /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url || '') ||
    ['storyboard', 'keyframe', 'scene', 'character_ref', 'cover', 'image'].includes(
      String(a.type || ''),
    )
  );
}
function isVideo(a: HistoryAsset) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(a.url || '') || a.type === 'video';
}
function isAudio(a: HistoryAsset) {
  return /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(a.url || '') || a.type === 'audio';
}

async function load() {
  if (!props.projectId) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/projects/${props.projectId}/assets`);
    const list: HistoryAsset[] = Array.isArray(data) ? data : data?.items || [];
    const wid = String(props.workflowId || '').trim();
    rows.value = wid
      ? list.filter((a) => String(a.meta?.workflowId || '') === wid)
      : list;
  } catch {
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function pick(a: HistoryAsset) {
  emit('pick', a);
  emit('close');
}

function close() {
  emit('close');
}

watch(
  () => props.open,
  (v) => {
    if (v) void load();
  },
);
</script>

<style scoped>
.hist-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.refresh {
  border: 1px solid var(--studio-glass-3);
  background: transparent;
  color: var(--studio-text-soft);
  border-radius: 8px;
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.refresh:hover {
  color: #fff;
  border-color: var(--studio-line-bright);
}
.count {
  font-size: 12px;
  color: var(--studio-line-bright);
}
.hist-body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
  min-height: 200px;
}
.card {
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-glass);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  color: inherit;
  padding: 0;
  font: inherit;
}
.card:hover {
  border-color: var(--studio-line-bright);
  background: rgba(255, 255, 255, 0.07);
}
.thumb {
  aspect-ratio: 1;
  background: rgba(0, 0, 0, 0.25);
}
.thumb img,
.thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--studio-line-bright);
  font-size: 18px;
}
.meta {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.meta strong {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta span {
  font-size: 10px;
  color: var(--studio-text-faint);
}
.empty {
  grid-column: 1 / -1;
  padding: 48px 12px;
  text-align: center;
  color: var(--studio-line-bright);
  font-size: 13px;
}
</style>
