<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import TimelineEditor, {
  type TimelineAction,
  type TimelineEffect,
  type TimelineOptions,
  type TimelineRow,
} from 'vue-timeline-editor';
import 'vue-timeline-editor/style.css';
import UiIcon from '@/components/icons/UiIcon.vue';
import type { FilmShotVideo, FilmStoryboardShot } from '@/api/film-projects';

const props = withDefaults(
  defineProps<{
    shots: FilmStoryboardShot[];
    shotVideos: FilmShotVideo[];
    defaultDurationSec?: number;
    aspect?: string;
    musicTitle?: string;
  }>(),
  {
    defaultDurationSec: 10,
    aspect: '16:9',
    musicTitle: '背景音乐',
  },
);

const emit = defineEmits<{
  dirty: [];
  'edit-shot': [shotId: string];
}>();

type ClipMeta = {
  shotId: string;
  videoId?: string;
  url?: string;
  label: string;
  index: number;
};

const timelineRef = ref<InstanceType<typeof TimelineEditor> | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const rows = ref<TimelineRow[]>([]);
const currentTime = ref(0);
const playing = ref(false);
const activeClipId = ref('');
const scrubbing = ref(false);

const effects: Record<string, TimelineEffect> = {
  video: { id: 'video', name: '视频' },
  voice: { id: 'voice', name: '配音' },
  subtitle: { id: 'subtitle', name: '字幕' },
  music: { id: 'music', name: '音乐' },
};

const options = computed<TimelineOptions>(() => ({
  scale: 1,
  scaleWidth: 100,
  scaleSplitCount: 10,
  startLeft: 12,
  rowHeight: 52,
  minScaleCount: 8,
  maxScaleCount: 200,
  duration: Math.max(totalDuration.value, 20),
  gridSnap: true,
  dragLine: true,
  enableRowDrag: false,
  backgroundColor: '#111111',
  contentBackgroundColor: '#161616',
  borderColor: 'rgba(255,255,255,0.08)',
  gridColor: 'rgba(255,255,255,0.06)',
  cursorColor: '#34d399',
  actionColor: '#2f6fed',
  snapLineColor: '#34d399',
}));

const aspectCss = computed(() => {
  const raw = String(props.aspect || '16:9');
  const m = raw.match(/(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return { w: 16, h: 9, css: '16 / 9' };
  const w = Number(m[1]);
  const h = Number(m[2]);
  return { w, h, css: `${w} / ${h}` };
});

const playerStyle = computed(() => ({
  aspectRatio: aspectCss.value.css,
  width: `min(100cqw, calc(100cqh * ${aspectCss.value.w} / ${aspectCss.value.h}))`,
  height: `min(100cqh, calc(100cqw * ${aspectCss.value.h} / ${aspectCss.value.w}))`,
}));

const clips = computed(() => {
  const list: Array<ClipMeta & { start: number; end: number; dur: number }> = [];
  let t = 0;
  const ordered = props.shots.length
    ? props.shots
    : props.shotVideos.map(
        (v, i) =>
          ({
            id: v.shotId || v.id,
            index: i + 1,
            shot: v.shotLabel || `分镜${i + 1}`,
            description: '',
            durationSec: props.defaultDurationSec,
          }) as FilmStoryboardShot,
      );

  for (const shot of ordered) {
    const video =
      props.shotVideos.find((v) => v.shotId === shot.id) ||
      props.shotVideos.find((v) => v.shotLabel === shot.shot);
    const dur = Math.max(
      1,
      Number(shot.durationSec) || Number(props.defaultDurationSec) || 10,
    );
    list.push({
      shotId: shot.id,
      videoId: video?.id,
      url: video?.url || '',
      label: shot.shot || `分镜${shot.index}`,
      index: shot.index,
      start: t,
      end: t + dur,
      dur,
    });
    t += dur;
  }
  return list;
});

const totalDuration = computed(() =>
  clips.value.length ? clips.value[clips.value.length - 1].end : 0,
);

const activeClip = computed(() => {
  const id = activeClipId.value;
  if (id) {
    const hit = clips.value.find((c) => c.shotId === id || c.videoId === id);
    if (hit) return hit;
  }
  const t = currentTime.value;
  return (
    clips.value.find((c) => t >= c.start && t < c.end) ||
    clips.value[clips.value.length - 1] ||
    null
  );
});

const previewUrl = computed(() => activeClip.value?.url || '');

const trackLabels = [
  { id: 'row-video', label: '视频' },
  { id: 'row-voice', label: '配音' },
  { id: 'row-subtitle', label: '字幕' },
  { id: 'row-music', label: '音乐' },
];

function buildRows() {
  const videoActions: TimelineAction[] = clips.value.map((c) => ({
    id: `v-${c.shotId}`,
    start: c.start,
    end: c.end,
    effectId: 'video',
    flexible: true,
    movable: true,
    classNames: ['fpw-act-video'],
    data: {
      kind: 'video',
      shotId: c.shotId,
      url: c.url,
      label: c.label,
      index: c.index,
    },
  }));

  const voiceActions: TimelineAction[] = clips.value.map((c) => ({
    id: `a-${c.shotId}`,
    start: c.start,
    end: c.end,
    effectId: 'voice',
    flexible: true,
    movable: true,
    classNames: ['fpw-act-voice'],
    data: { kind: 'voice', label: '无配音', shotId: c.shotId },
  }));

  const subActions: TimelineAction[] = clips.value.map((c) => ({
    id: `s-${c.shotId}`,
    start: c.start,
    end: c.end,
    effectId: 'subtitle',
    flexible: true,
    movable: true,
    classNames: ['fpw-act-sub'],
    data: { kind: 'subtitle', label: '提取字幕', shotId: c.shotId },
  }));

  const musicEnd = Math.max(totalDuration.value, props.defaultDurationSec || 10);
  const musicActions: TimelineAction[] = [
    {
      id: 'music-1',
      start: 0,
      end: musicEnd,
      effectId: 'music',
      flexible: true,
      movable: true,
      classNames: ['fpw-act-music'],
      data: { kind: 'music', label: props.musicTitle || '背景音乐' },
    },
  ];

  rows.value = [
    {
      id: 'row-video',
      rowHeight: 64,
      classNames: ['fpw-row-video'],
      data: { label: '视频' },
      actions: videoActions,
    },
    {
      id: 'row-voice',
      rowHeight: 44,
      classNames: ['fpw-row-voice'],
      data: { label: '配音' },
      actions: voiceActions,
    },
    {
      id: 'row-subtitle',
      rowHeight: 44,
      classNames: ['fpw-row-sub'],
      data: { label: '字幕' },
      actions: subActions,
    },
    {
      id: 'row-music',
      rowHeight: 48,
      classNames: ['fpw-row-music'],
      data: { label: '音乐' },
      actions: musicActions,
    },
  ];

  if (!activeClipId.value && clips.value[0]) {
    activeClipId.value = clips.value[0].shotId;
  }
}

function formatTime(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

function syncActiveFromTime(time: number) {
  currentTime.value = time;
  const hit = clips.value.find((c) => time >= c.start && time < c.end);
  if (hit && hit.shotId !== activeClipId.value) {
    const prevUrl = previewUrl.value;
    activeClipId.value = hit.shotId;
    void nextTick(() => {
      const el = videoEl.value;
      if (!el) return;
      if (hit.url && hit.url !== prevUrl) {
        const local = Math.max(0, time - hit.start);
        el.currentTime = local;
        if (playing.value) void el.play().catch(() => undefined);
      }
    });
  }
}

function onTimeUpdate(time: number) {
  if (scrubbing.value) return;
  syncActiveFromTime(time);
  const clip = activeClip.value;
  const el = videoEl.value;
  if (!el || !clip?.url) return;
  const local = Math.max(0, time - clip.start);
  if (Math.abs(el.currentTime - local) > 0.35) {
    el.currentTime = local;
  }
}

function onClickTime(time: number) {
  scrubbing.value = true;
  syncActiveFromTime(time);
  timelineRef.value?.setTime(time);
  const clip = activeClip.value;
  const el = videoEl.value;
  if (el && clip?.url) {
    el.currentTime = Math.max(0, time - clip.start);
  }
  window.setTimeout(() => {
    scrubbing.value = false;
  }, 80);
}

function togglePlay() {
  if (playing.value) {
    timelineRef.value?.pause();
    videoEl.value?.pause();
    playing.value = false;
    return;
  }
  if (!clips.value.some((c) => c.url)) {
    ElMessage.warning('暂无分镜视频可预览，请先在「分镜视频」生成');
    return;
  }
  timelineRef.value?.play({ autoEnd: true });
  playing.value = true;
  void videoEl.value?.play().catch(() => undefined);
}

function onTimelinePlay() {
  playing.value = true;
  void videoEl.value?.play().catch(() => undefined);
}

function onTimelinePause() {
  playing.value = false;
  videoEl.value?.pause();
}

function onVideoTimeUpdate() {
  if (!playing.value || scrubbing.value) return;
  const clip = activeClip.value;
  const el = videoEl.value;
  if (!clip || !el) return;
  const global = clip.start + el.currentTime;
  timelineRef.value?.setTime(global);
  currentTime.value = global;
}

function onVideoEnded() {
  const clip = activeClip.value;
  if (!clip) return;
  const next = clips.value.find((c) => c.start >= clip.end - 0.05);
  if (next?.url) {
    activeClipId.value = next.shotId;
    timelineRef.value?.setTime(next.start);
    void nextTick(() => {
      const el = videoEl.value;
      if (!el) return;
      el.currentTime = 0;
      if (playing.value) void el.play().catch(() => undefined);
    });
    return;
  }
  timelineRef.value?.pause();
  playing.value = false;
}

function refreshTimeline() {
  buildRows();
  currentTime.value = 0;
  timelineRef.value?.setTime(0);
  timelineRef.value?.pause();
  playing.value = false;
  ElMessage.success('已更新视频到时间轴');
  emit('dirty');
}

function exportVideo() {
  const urls = clips.value.map((c) => c.url).filter(Boolean) as string[];
  if (!urls.length) {
    ElMessage.warning('没有可导出的分镜视频');
    return;
  }
  if (urls.length === 1) {
    const a = document.createElement('a');
    a.href = urls[0];
    a.download = 'film-preview.mp4';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  ElMessage.info('多镜合成导出二期接通；已按分镜顺序准备时间轴，可先逐镜下载');
}

function onClickAction(
  _ev: MouseEvent,
  params: { action: TimelineAction; row: TimelineRow; time: number },
) {
  const shotId = String(params.action.data?.shotId || '');
  if (shotId) activeClipId.value = shotId;
  onClickTime(params.action.start);
}

function onDoubleClickAction(
  _ev: MouseEvent,
  params: { action: TimelineAction; row: TimelineRow; time: number },
) {
  const shotId = String(params.action.data?.shotId || '');
  if (shotId && params.row.id === 'row-video') {
    emit('edit-shot', shotId);
  }
}

function onRowsChange(next: TimelineRow[]) {
  rows.value = next;
  emit('dirty');
}

watch(
  () => [props.shots, props.shotVideos, props.defaultDurationSec] as const,
  () => buildRows(),
  { deep: true, immediate: true },
);

onBeforeUnmount(() => {
  timelineRef.value?.pause();
  videoEl.value?.pause();
});
</script>

<template>
  <div class="fpw">
    <div class="fpw-toolbar">
      <span class="fpw-stat">
        {{ clips.length }} 镜 · 总时长 {{ formatTime(totalDuration) }}
      </span>
      <div class="fpw-actions">
        <button type="button" class="fpw-btn" @click="refreshTimeline">
          <UiIcon name="refresh" :size="14" />
          更新视频到时间轴
        </button>
        <button type="button" class="fpw-btn primary" @click="exportVideo">
          导出视频
        </button>
      </div>
    </div>

    <div class="fpw-stage">
      <div
        class="fpw-player"
        :class="{ empty: !previewUrl }"
        :style="playerStyle"
        @click="togglePlay"
      >
        <video
          v-if="previewUrl"
          ref="videoEl"
          :src="previewUrl"
          class="fpw-video"
          playsinline
          @timeupdate="onVideoTimeUpdate"
          @ended="onVideoEnded"
          @click.stop="togglePlay"
        />
        <div v-else class="fpw-empty">
          <p>暂无成片预览</p>
          <em>请先在「分镜视频」生成各镜，再点「更新视频到时间轴」</em>
        </div>
        <button
          v-if="previewUrl && !playing"
          type="button"
          class="fpw-play"
          aria-label="播放"
          @click.stop="togglePlay"
        >
          <i class="fpw-tri" />
        </button>
        <div v-if="activeClip" class="fpw-meta">
          <span>{{ String(activeClip.index).padStart(2, '0') }}</span>
          <span>{{ activeClip.label }}</span>
          <span>{{ aspect }}</span>
        </div>
      </div>
    </div>

    <div class="fpw-transport">
      <button type="button" class="fpw-transport-btn" :aria-label="playing ? '暂停' : '播放'" @click="togglePlay">
        <i v-if="!playing" class="fpw-tri sm" />
        <span v-else class="fpw-pause" aria-hidden="true"><i /><i /></span>
      </button>
      <span class="fpw-clock">
        <strong>{{ formatTime(currentTime) }}</strong>
        <em>/</em>
        <span>{{ formatTime(totalDuration) }}</span>
      </span>
      <span v-if="activeClip" class="fpw-now">
        当前镜 {{ String(activeClip.index).padStart(2, '0') }} · {{ activeClip.label }}
      </span>
    </div>

    <div class="fpw-timeline">
      <aside class="fpw-labels" aria-hidden="true">
        <div class="fpw-label-scale" />
        <div
          v-for="t in trackLabels"
          :key="t.id"
          class="fpw-label"
          :class="t.id"
        >
          {{ t.label }}
        </div>
      </aside>
      <div class="fpw-editor">
        <TimelineEditor
          ref="timelineRef"
          v-model="rows"
          :effects="effects"
          :options="options"
          :auto-scroll="true"
          @update:model-value="onRowsChange"
          @time-update="onTimeUpdate"
          @click-time-area="onClickTime"
          @play="onTimelinePlay"
          @pause="onTimelinePause"
          @click-action="onClickAction"
          @double-click-action="onDoubleClickAction"
        >
          <template #action="{ action }">
            <div class="fpw-action" :class="`kind-${action.data?.kind || 'video'}`">
              <template v-if="action.data?.kind === 'video'">
                <div class="fpw-thumb">
                  <video
                    v-if="action.data?.url"
                    :src="String(action.data.url)"
                    muted
                    preload="metadata"
                  />
                  <span v-else class="fpw-thumb-empty">
                    {{ String(action.data?.index || '').padStart(2, '0') }}
                  </span>
                </div>
                <em>{{ action.data?.label || action.id }}</em>
              </template>
              <template v-else-if="action.data?.kind === 'voice'">
                <UiIcon name="music" :size="12" />
                <span>{{ action.data?.label || '无配音' }}</span>
              </template>
              <template v-else-if="action.data?.kind === 'subtitle'">
                <UiIcon name="type" :size="12" />
                <span>{{ action.data?.label || '提取字幕' }}</span>
              </template>
              <template v-else>
                <div class="fpw-wave" aria-hidden="true">
                  <i v-for="n in 24" :key="n" :style="{ height: `${30 + ((n * 37) % 70)}%` }" />
                </div>
                <span>{{ action.data?.label || '音乐' }}</span>
              </template>
            </div>
          </template>
        </TimelineEditor>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fpw {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: 0;
  min-height: 0;
  height: 100%;
  color: #eee;
  background: #111;
}

.fpw-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 20px 8px;
  flex-shrink: 0;
}

.fpw-stat {
  font-size: 13px;
  color: #a3a3a3;
}

.fpw-actions {
  display: flex;
  gap: 8px;
}

.fpw-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #f5f5f5;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}
.fpw-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}
.fpw-btn.primary {
  border: 0;
  background: #10b981;
  color: #052e1c;
  font-weight: 650;
}
.fpw-btn.primary:hover {
  background: #34d399;
}

.fpw-stage {
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 4px 20px 10px;
  container-type: size;
}

.fpw-player {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}
.fpw-player.empty {
  width: min(720px, 100%) !important;
  height: auto !important;
  min-height: min(220px, 100%);
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  background: #0a0a0a;
}

.fpw-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
  background: #000;
  display: block;
}

.fpw-empty {
  text-align: center;
  color: #888;
  padding: 24px;
}
.fpw-empty p {
  margin: 0 0 8px;
  font-size: 15px;
  color: #ccc;
}
.fpw-empty em {
  font-style: normal;
  font-size: 12px;
  color: #777;
}

.fpw-play {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  width: 64px;
  height: 64px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.5);
  display: grid;
  place-items: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.fpw-tri {
  display: block;
  width: 0;
  height: 0;
  margin-left: 4px;
  border-style: solid;
  border-width: 10px 0 10px 16px;
  border-color: transparent transparent transparent #fff;
}
.fpw-tri.sm {
  margin-left: 2px;
  border-width: 6px 0 6px 10px;
}
.fpw-pause {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.fpw-pause i {
  width: 3px;
  height: 12px;
  border-radius: 1px;
  background: #fff;
  display: block;
}

.fpw-meta {
  position: absolute;
  left: 12px;
  top: 12px;
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.55);
  font-size: 12px;
  color: #ddd;
  pointer-events: none;
}

.fpw-transport {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px 10px;
  flex-shrink: 0;
}
.fpw-transport-btn {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.fpw-transport-btn:hover {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(52, 211, 153, 0.45);
}
.fpw-clock {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: #a3a3a3;
}
.fpw-clock strong {
  color: #f5f5f5;
  font-weight: 600;
}
.fpw-clock em {
  font-style: normal;
  color: #525252;
}
.fpw-now {
  margin-left: auto;
  font-size: 12px;
  color: #737373;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 48%;
}

.fpw-timeline {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 0;
  height: 230px;
  flex-shrink: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  background: #141414;
}

.fpw-labels {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: #121212;
}
.fpw-label-scale {
  height: 30px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  box-sizing: border-box;
}
.fpw-label {
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 12px;
  color: #a3a3a3;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  box-sizing: border-box;
}
.fpw-label.row-video {
  height: 64px;
}
.fpw-label.row-voice,
.fpw-label.row-subtitle {
  height: 44px;
}
.fpw-label.row-music {
  height: 48px;
  border-bottom: 0;
}

.fpw-editor {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.fpw-editor :deep(.timeline-editor) {
  height: 100% !important;
  min-height: 0;
  --timeline-header-height: 30px;
  --timeline-bg: #141414;
  --timeline-content-bg: #161616;
  --timeline-border-color: rgba(255, 255, 255, 0.08);
  --timeline-grid-color: rgba(255, 255, 255, 0.06);
  --timeline-cursor-color: #34d399;
  --timeline-action-color: #2f6fed;
  --timeline-snap-line-color: #34d399;
}
.fpw-editor :deep(.timeline-header) {
  box-sizing: border-box;
  height: 30px;
}
.fpw-editor :deep(.timeline-body) {
  overflow-x: auto;
  overflow-y: hidden;
}
.fpw-editor :deep(.timeline-header),
.fpw-editor :deep(.timeline-body),
.fpw-editor :deep(.timeline-content),
.fpw-editor :deep(.timeline-row),
.fpw-editor :deep(.timeline-row-wrapper) {
  background-color: transparent;
}
.fpw-editor :deep(.timeline-action) {
  border-radius: 6px;
  overflow: hidden;
}
.fpw-editor :deep(.timeline-action.selected) {
  background-color: transparent;
  border: 1px solid #34d399;
  box-shadow: 0 0 0 1px rgba(52, 211, 153, 0.25);
}

.fpw-action {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  box-sizing: border-box;
  overflow: hidden;
  font-size: 11px;
  color: #f2f2f2;
}
.fpw-action.kind-video {
  background: linear-gradient(180deg, #243044, #1a222e);
}
.fpw-action.kind-voice {
  background: #2563eb;
}
.fpw-action.kind-subtitle {
  background: #0f766e;
}
.fpw-action.kind-music {
  background: #b45309;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 2px;
}

.fpw-thumb {
  width: 48px;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  background: #111;
  flex-shrink: 0;
}
.fpw-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.fpw-thumb-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 10px;
  color: #888;
}
.fpw-action em {
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fpw-wave {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 18px;
  opacity: 0.9;
}
.fpw-wave i {
  width: 2px;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 1px;
  display: block;
}

@media (max-width: 960px) {
  .fpw-timeline {
    grid-template-columns: 52px minmax(0, 1fr);
  }
  .fpw-now {
    display: none;
  }
}
</style>
