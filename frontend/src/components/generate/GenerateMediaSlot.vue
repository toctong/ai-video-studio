<template>
  <div class="media-card" :class="[tone === 'dark' ? 'media-card--dark' : '', `media-card--${kind}`]">
    <!-- 多图：进度格 + 结果网格 -->
    <div v-if="useGrid" class="result-grid">
      <button
        v-for="(slot, i) in gridSlots"
        :key="`${slot.url || 'slot'}-${i}`"
        type="button"
        class="grid-cell"
        :class="{
          pending: !slot.url && isLive,
          error: !slot.url && status === 'error',
          done: !!slot.url,
        }"
        :style="{ aspectRatio }"
        :title="slot.url ? `图 ${i + 1}（单击预览）` : isLive ? '生成中' : status === 'error' ? '失败' : ''"
        :disabled="!slot.url && !canPreviewEmpty"
        @click="onCellClick(i, slot.url)"
      >
        <img v-if="slot.url" :src="slot.url" alt="" />
        <div v-else-if="isLive" class="cell-skel" aria-busy="true" aria-label="生成中">
          <div class="sk-wash" />
        </div>
        <div v-else-if="status === 'error'" class="cell-err">
          <span>{{ errorMessage || '失败' }}</span>
        </div>
        <div v-else class="cell-skel idle" aria-hidden="true">
          <div class="sk-wash" />
        </div>
        <span v-if="slot.url && gridSlots.length > 1" class="grid-idx">{{ i + 1 }}</span>
        <div v-if="slot.url && status === 'done'" class="cell-tools" @click.stop>
          <button
            type="button"
            class="tool-btn"
            :class="{ done: quotedUrls.has(slot.url) }"
            :title="quotedUrls.has(slot.url) ? '已引用' : '参考图'"
            :aria-label="quotedUrls.has(slot.url) ? '已引用' : '参考图'"
            @click="onQuote(slot.url)"
          >
            <UiIcon :name="quotedUrls.has(slot.url) ? 'check' : 'quote'" :size="14" />
          </button>
          <button
            type="button"
            class="tool-btn"
            title="基于此图"
            aria-label="基于此图"
            @click="emit('editFrom', slot.url)"
          >
            <UiIcon name="wand" :size="14" />
          </button>
          <button
            type="button"
            class="tool-btn"
            :class="{ done: downloadedUrls.has(slot.url) }"
            :title="downloadedUrls.has(slot.url) ? '已下载' : '下载'"
            :aria-label="downloadedUrls.has(slot.url) ? '已下载' : '下载'"
            @click="onDownloadAt(i)"
          >
            <UiIcon :name="downloadedUrls.has(slot.url) ? 'check' : 'download'" :size="14" />
          </button>
        </div>
      </button>
    </div>

    <!-- 单图 / 视频 -->
    <div
      v-else
      class="media-frame"
      :class="{ previewable: canPreview }"
      :style="{ aspectRatio }"
      role="button"
      :tabindex="canPreview ? 0 : -1"
      :aria-label="canPreview ? (kind === 'video' ? '预览视频' : '预览图片') : undefined"
      @mouseenter="onHoverIn"
      @click="onPreview"
      @keydown.enter.prevent="onPreview"
      @keydown.space.prevent="onPreview"
    >
      <template v-if="isLive">
        <div class="media-skeleton" aria-busy="true" aria-label="生成中">
          <div class="sk-wash" />
          <div class="sk-grid" aria-hidden="true" />
          <div class="sk-core">
            <span class="sk-ring" />
            <span class="sk-ring delay" />
            <span class="sk-orb" />
          </div>
        </div>
      </template>
      <template v-else-if="status === 'error'">
        <div class="media-error">
          <p>{{ errorMessage || '生成失败' }}</p>
        </div>
      </template>
      <template v-else-if="activeUrl && kind === 'video'">
        <LazyVideoThumb class="media-el lazy-el" :src="activeUrl" :poster-url="posterUrl" />
        <span class="play-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M8 5.5v13l11-6.5L8 5.5z" />
          </svg>
        </span>
      </template>
      <template v-else-if="activeUrl">
        <img class="media-el" :src="activeUrl" alt="" />
      </template>
      <div v-if="activeUrl && status === 'done'" class="frame-tools" @click.stop>
        <button
          v-if="kind === 'image'"
          type="button"
          class="tool-btn"
          title="参考图"
          aria-label="参考图"
          :class="{ done: quotedUrls.has(activeUrl) }"
          @click="onQuote(activeUrl)"
        >
          <UiIcon :name="quotedUrls.has(activeUrl) ? 'check' : 'quote'" :size="14" />
        </button>
        <button
          v-if="kind === 'image'"
          type="button"
          class="tool-btn"
          title="基于此图"
          aria-label="基于此图"
          @click="emit('editFrom', activeUrl)"
        >
          <UiIcon name="wand" :size="14" />
        </button>
        <button
          v-else
          type="button"
          class="tool-btn"
          title="引用"
          aria-label="引用"
          :class="{ done: quotedUrls.has(activeUrl) }"
          @click="onQuote(activeUrl)"
        >
          <UiIcon :name="quotedUrls.has(activeUrl) ? 'check' : 'quote'" :size="14" />
        </button>
        <button
          type="button"
          class="tool-btn"
          :class="{ done: downloadedUrls.has(activeUrl) }"
          :title="downloadedUrls.has(activeUrl) ? '已下载' : '下载'"
          :aria-label="downloadedUrls.has(activeUrl) ? '已下载' : '下载'"
          @click="onDownload"
        >
          <UiIcon :name="downloadedUrls.has(activeUrl) ? 'check' : 'download'" :size="14" />
        </button>
      </div>
    </div>

    <!-- 底部仅保留文案操作；参考/基于此图在图上 hover -->
    <div v-if="actionsVisible" class="media-actions">
      <button type="button" class="act" @click="emit('reedit')">
        <UiIcon name="pencil" :size="14" />
        <span>重新编辑</span>
      </button>
      <button
        type="button"
        class="act"
        :disabled="status === 'error' && !activeUrl"
        @click="emit('regenerate')"
      >
        <UiIcon name="refresh" :size="14" />
        <span>再次生成</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import UiIcon from '@/components/icons/UiIcon.vue';
import { openImagePreview, openVideoPreview, warmVideoUrl } from '@/composables/useMediaPreview';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';
import { downloadUrl as saveMediaUrl } from '@/utils/download';

const props = withDefaults(
  defineProps<{
    kind?: 'image' | 'video';
    url?: string;
    /** 多图候选（优先于 url） */
    urls?: string[];
    /** 预期张数：出图中先铺 N 格骨架 */
    expectedCount?: number;
    posterUrl?: string;
    aspectRatio?: string;
    status?: 'pending' | 'streaming' | 'done' | 'error';
    errorMessage?: string;
    loading?: boolean;
    showActions?: boolean;
    tone?: 'light' | 'dark';
  }>(),
  {
    kind: 'image',
    url: '',
    urls: () => [],
    expectedCount: 1,
    posterUrl: '',
    aspectRatio: '16:9',
    status: 'done',
    errorMessage: '',
    loading: false,
    showActions: true,
    tone: 'dark',
  },
);

/** 本会话内已下载 / 已引用的媒体 URL（跨卡片共享，避免重复操作） */
const downloadedUrls = new Set<string>();
const quotedUrls = new Set<string>();

const emit = defineEmits<{
  quote: [url: string];
  editFrom: [url: string];
  reedit: [];
  regenerate: [];
}>();

const urls = computed(() => {
  const list = (props.urls || []).map((u) => String(u || '').trim()).filter(Boolean);
  if (list.length) return list;
  const one = String(props.url || '').trim();
  return one ? [one] : [];
});

const isLive = computed(
  () => !!props.loading || props.status === 'pending' || props.status === 'streaming',
);

const slotCount = computed(() => {
  const fromUrls = urls.value.length;
  const expect = Math.min(4, Math.max(1, Number(props.expectedCount) || 1));
  if (isLive.value) return Math.max(expect, fromUrls || expect);
  if (fromUrls > 1) return fromUrls;
  if (props.status === 'error' && expect > 1) return expect;
  return Math.max(fromUrls, 1);
});

const useGrid = computed(() => props.kind !== 'video');

/** 固定两列，1～4 张每格同宽，避免 3 列时缩成小图 */
const gridSlots = computed(() => {
  const n = slotCount.value;
  const list = urls.value;
  return Array.from({ length: n }, (_, i) => ({ url: list[i] || '' }));
});

const activeUrl = computed(() => urls.value[0] || String(props.url || '').trim());

const canPreview = computed(
  () => !!activeUrl.value && props.status === 'done' && !props.loading,
);

/** 生成中不展示；完成/失败才出操作 */
const actionsVisible = computed(
  () => props.showActions && !isLive.value && (props.status === 'done' || props.status === 'error'),
);

const canPreviewEmpty = false;

const aspectRatio = computed(() => {
  const raw = String(props.aspectRatio || '16:9').trim();
  if (raw === 'auto' || !raw.includes(':')) return '16 / 9';
  const [a, b] = raw.split(':').map(Number);
  if (!a || !b) return '16 / 9';
  return `${a} / ${b}`;
});

function onCellClick(i: number, url: string) {
  if (!url || props.status !== 'done') return;
  openImagePreview(urls.value, i);
}

function onHoverIn() {
  if (props.kind === 'video' && activeUrl.value) warmVideoUrl(activeUrl.value);
}

function onPreview() {
  if (!canPreview.value) return;
  if (props.kind === 'video') {
    const poster = String(props.posterUrl || '').trim();
    openVideoPreview(activeUrl.value, poster ? { poster } : undefined);
  } else openImagePreview(urls.value, 0);
}

async function onDownload() {
  await saveAt(activeUrl.value, 0);
}

async function onDownloadAt(index: number) {
  const url = urls.value[index] || '';
  if (!url) return;
  await saveAt(url, index);
}

async function saveAt(url: string, index = 0) {
  if (!url) return;
  const name =
    props.kind === 'video'
      ? `generate-${Date.now()}.mp4`
      : `generate-${Date.now()}${urls.value.length > 1 ? `-${index + 1}` : ''}.png`;
  const loading = ElMessage({ message: '正在下载…', duration: 0 });
  try {
    await saveMediaUrl(url, name);
    downloadedUrls.add(url);
    loading.close();
    ElMessage.success('下载完成');
  } catch (e: any) {
    loading.close();
    ElMessage.error(String(e?.message || '下载失败'));
  }
}

function onQuote(url: string) {
  if (url) quotedUrls.add(url);
  emit('quote', url);
}
</script>

<style scoped>
.media-card {
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.result-grid {
  /* 固定格宽 + 最多两列：1/2/3/4 张每张同大（3 张为 2+1） */
  --cell: 240px;
  display: grid;
  grid-template-columns: repeat(auto-fit, var(--cell));
  gap: 8px;
  width: fit-content;
  max-width: min(100%, calc(var(--cell) * 2 + 8px));
}

@media (max-width: 560px) {
  .result-grid {
    --cell: min(240px, calc((100% - 8px) / 2));
    width: 100%;
  }
}

.grid-cell {
  position: relative;
  margin: 0;
  padding: 0;
  width: var(--cell);
  max-width: 100%;
  border: 1px solid var(--studio-glass-3);
  border-radius: 12px;
  overflow: hidden;
  background: var(--studio-inset);
  cursor: pointer;
}

.grid-cell:disabled {
  cursor: default;
}

.grid-cell img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.grid-idx {
  position: absolute;
  left: 6px;
  bottom: 6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  line-height: 18px;
  text-align: center;
}

.cell-tools,
.frame-tools {
  position: absolute;
  right: 6px;
  top: 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.grid-cell:hover .cell-tools,
.media-frame:hover .frame-tools {
  opacity: 1;
  pointer-events: auto;
}

.tool-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.tool-btn:hover {
  background: rgba(0, 0, 0, 0.72);
}
.tool-btn.done {
  color: #86efac;
}

.media-frame .tool-btn {
  width: 32px;
  height: 32px;
}

.cell-skel {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 120px;
  display: grid;
  place-items: center;
  background: var(--studio-inset);
  overflow: hidden;
}

.cell-skel.idle {
  opacity: 0.7;
}

.cell-err {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 120px;
  padding: 12px;
  color: #f5a8a8;
  font-size: 12px;
  text-align: center;
}

.media-frame {
  position: relative;
  width: min(360px, 100%);
  max-width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #eceef2;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.media-card--video .media-frame {
  width: min(420px, 100%);
}

.media-frame.previewable {
  cursor: zoom-in;
}

.media-frame.previewable:focus-visible {
  outline: 2px solid rgba(142, 200, 216, 0.55);
  outline-offset: 2px;
}

.media-card--dark .media-frame {
  background: var(--studio-panel-3);
  border-color: var(--studio-glass-2);
}

.media-el {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lazy-el {
  width: 100%;
  height: 100%;
}

.play-badge {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  pointer-events: none;
}

.media-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: min(488px, 100%);
}

.act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-glass);
  color: var(--studio-text-strong);
  font-size: 12px;
  cursor: pointer;
}

.act:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.act:hover:not(:disabled) {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}

.media-error {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 16px;
  color: #f5a8a8;
  font-size: 13px;
  text-align: center;
}

.media-skeleton {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 160px;
  overflow: hidden;
  background: var(--studio-inset);
}

.sk-wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    transparent 30%,
    var(--studio-glass-2) 50%,
    transparent 70%
  );
  background-size: 200% 100%;
  animation: sk-shine 1.6s ease-in-out infinite;
}

.sk-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.5;
}

.sk-core {
  position: absolute;
  left: 50%;
  top: 44%;
  transform: translate(-50%, -50%);
  width: 56px;
  height: 56px;
}

.sk-ring,
.sk-orb {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.sk-ring {
  border: 1.5px solid rgba(142, 200, 216, 0.25);
  animation: sk-pulse 1.8s ease-out infinite;
}

.sk-ring.delay {
  animation-delay: 0.55s;
}

.sk-orb {
  inset: 18px;
  background: radial-gradient(circle, rgba(142, 200, 216, 0.45), transparent 70%);
}

@keyframes sk-shine {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

@keyframes sk-pulse {
  0% {
    transform: scale(0.7);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.35);
    opacity: 0;
  }
}
</style>
