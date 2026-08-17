<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Artplayer from 'artplayer';
import { closeMediaPreview, mediaPreview } from '@/composables/useMediaPreview';

/** 自动开播前最少缓冲秒数；用户手动点播放不受此限制 */
const START_BUFFER_SEC = 3;

const containerRef = ref<HTMLDivElement | null>(null);
const player = shallowRef<Artplayer | null>(null);
const shellAlive = ref(false);
const stickyUrl = ref('');
const stickyPoster = ref('');
const playerReady = ref(false);
const mediaKey = ref(0);

const loading = ref(false);
const loadError = ref('');
/** 已允许自动开播 / 用户已点过播放 */
const unlocked = ref(false);
/** 用户主动播放中：禁止再 pause 抢控制权 */
const userControl = ref(false);
const bufferedPct = ref(-1);
const aheadSec = ref(0);

const videoOpen = computed(() => mediaPreview.value?.kind === 'video');

const playUrl = computed(() => {
  if (mediaPreview.value?.kind === 'video') return mediaPreview.value.url;
  return stickyUrl.value;
});

const playPoster = computed(() => {
  if (mediaPreview.value?.kind === 'video') return mediaPreview.value.poster || '';
  return stickyPoster.value;
});

const showCover = computed(() => (!unlocked.value && loading.value) || !!loadError.value);

const coverTitle = computed(() => {
  if (loadError.value) return '加载失败';
  return '预缓冲中';
});

const coverSub = computed(() => {
  if (loadError.value) return loadError.value;
  if (aheadSec.value > 0 || bufferedPct.value >= 0) {
    const parts: string[] = [];
    if (aheadSec.value > 0) parts.push(`已缓冲 ${aheadSec.value.toFixed(1)}s`);
    if (bufferedPct.value >= 0) parts.push(`${bufferedPct.value}%`);
    return `${parts.join(' · ')} · 也可直接点播放`;
  }
  return '正在连接资源…也可直接点播放';
});

function absUrl(url: string) {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

function mediaEl(): HTMLVideoElement | null {
  try {
    return (player.value?.video as HTMLVideoElement) || null;
  } catch {
    return null;
  }
}

function destroyPlayer() {
  try {
    player.value?.destroy(false);
  } catch {
    /* ignore */
  }
  player.value = null;
  playerReady.value = false;
}

function resetLoadUi() {
  loading.value = true;
  loadError.value = '';
  bufferedPct.value = -1;
  aheadSec.value = 0;
  unlocked.value = false;
  userControl.value = false;
}

function bufferedAheadSec(el: HTMLVideoElement): number {
  const t = el.currentTime || 0;
  try {
    const { buffered } = el;
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if (t + 0.05 >= start && t <= end + 0.05) return Math.max(0, end - t);
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function updateBuffered() {
  const el = mediaEl();
  if (!el) return;
  aheadSec.value = bufferedAheadSec(el);
  const dur = el.duration;
  if (!dur || !Number.isFinite(dur) || dur <= 0) return;
  try {
    if (!el.buffered.length) return;
    const end = el.buffered.end(el.buffered.length - 1);
    bufferedPct.value = Math.min(100, Math.max(0, Math.round((end / dur) * 100)));
  } catch {
    /* ignore */
  }
}

function hasEnoughBuffer(el: HTMLVideoElement, needSec: number) {
  const dur = el.duration;
  const ahead = bufferedAheadSec(el);
  if (Number.isFinite(dur) && dur > 0 && dur <= needSec + 1) {
    return el.readyState >= 3 || ahead >= Math.max(0, dur - (el.currentTime || 0) - 0.15);
  }
  if (el.readyState >= 4) return true;
  return ahead >= needSec;
}

async function playVideo() {
  const art = player.value;
  if (!art) return;
  try {
    await art.play();
  } catch {
    /* autoplay may be blocked */
  }
}

/** 仅负责自动开播；用户点播放后不再干预 pause */
function tryAutoStart() {
  if (userControl.value || unlocked.value || loadError.value || !videoOpen.value) return;
  const el = mediaEl();
  const art = player.value;
  if (!el || !art) return;

  const want = absUrl(playUrl.value);
  const cur = el.currentSrc || el.src || '';
  if (want && cur && cur !== want && !cur.includes(playUrl.value)) return;

  updateBuffered();
  if (!hasEnoughBuffer(el, START_BUFFER_SEC)) {
    loading.value = true;
    return;
  }
  unlocked.value = true;
  loading.value = false;
  void playVideo();
}

function bindMediaEvents(art: Artplayer) {
  art.on('video:loadstart', () => {
    if (!unlocked.value && !userControl.value) loading.value = true;
  });
  art.on('video:progress', () => {
    updateBuffered();
    tryAutoStart();
  });
  art.on('video:canplay', () => {
    updateBuffered();
    tryAutoStart();
  });
  art.on('video:canplaythrough', () => {
    updateBuffered();
    tryAutoStart();
  });
  // 用户点播放：立刻交还控制权，绝不再 pause
  art.on('play', () => {
    userControl.value = true;
    unlocked.value = true;
    loading.value = false;
    loadError.value = '';
  });
  art.on('video:playing', () => {
    userControl.value = true;
    unlocked.value = true;
    loading.value = false;
  });
  art.on('video:pause', () => {
    // 用户暂停后仍保持 userControl，避免又被自动逻辑拉去播/停
  });
  art.on('error', () => {
    loading.value = false;
    loadError.value = '视频加载失败，请检查网络或链接是否过期';
  });
  art.on('ready', () => tryAutoStart());
}

async function createPlayer(url: string, poster: string) {
  await nextTick();
  const host = containerRef.value;
  if (!host || !url) return;

  destroyPlayer();
  await nextTick();
  const box = containerRef.value;
  if (!box) return;

  const art = new Artplayer({
    container: box,
    url,
    poster: poster || '',
    theme: '#3b82f6',
    lang: 'zh-cn',
    autoplay: false,
    muted: false,
    volume: 0.85,
    playbackRate: true,
    aspectRatio: true,
    screenshot: true,
    setting: true,
    hotkey: true,
    pip: true,
    fullscreen: true,
    fullscreenWeb: true,
    miniProgressBar: true,
    mutex: true,
    backdrop: true,
    playsInline: true,
    autoOrientation: true,
    moreVideoAttr: {
      playsInline: true,
      preload: 'auto',
      controls: false,
    },
  });

  player.value = art;
  playerReady.value = true;
  bindMediaEvents(art);
  tryAutoStart();
}

async function mountVideo(url: string, poster: string, forceRemount: boolean) {
  shellAlive.value = true;
  stickyUrl.value = url;
  stickyPoster.value = poster;
  resetLoadUi();
  destroyPlayer();
  if (forceRemount) mediaKey.value += 1;
  await createPlayer(url, poster);
}

watch(
  () => mediaPreview.value,
  async (state) => {
    if (state?.kind === 'video') {
      const url = state.url;
      const poster = state.poster || '';
      const same =
        shellAlive.value &&
        stickyUrl.value === url &&
        absUrl(stickyUrl.value) === absUrl(url) &&
        unlocked.value &&
        !!player.value;

      if (same) {
        loadError.value = '';
        loading.value = false;
        userControl.value = true;
        void playVideo();
        return;
      }

      await mountVideo(url, poster, stickyUrl.value !== url || !shellAlive.value);
      return;
    }
    // 关闭预览：销毁播放器，释放解码与缓冲
    destroyPlayer();
    shellAlive.value = false;
    stickyUrl.value = '';
    stickyPoster.value = '';
    loading.value = false;
    loadError.value = '';
    unlocked.value = false;
    userControl.value = false;
  },
);

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && mediaPreview.value?.kind === 'video') {
    closeMediaPreview();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  destroyPlayer();
});
</script>

<template>
  <el-image-viewer
    v-if="mediaPreview?.kind === 'image'"
    :url-list="mediaPreview.urls"
    :initial-index="mediaPreview.index"
    teleported
    hide-on-click-modal
    :z-index="5200"
    @close="closeMediaPreview"
  />

  <Teleport to="body">
    <div
      v-if="shellAlive"
      v-show="videoOpen"
      class="media-preview-mask"
      role="dialog"
      aria-modal="true"
      aria-label="视频预览"
      @mousedown.self="closeMediaPreview"
    >
      <button type="button" class="media-preview-close" title="关闭" @click="closeMediaPreview">
        ×
      </button>
      <div class="media-preview-panel" :class="{ on: playerReady }" @mousedown.stop>
        <div :key="`${mediaKey}-${playUrl}`" ref="containerRef" class="media-preview-art" />

        <Transition name="mp-fade">
          <div
            v-if="showCover"
            class="media-preview-cover"
            :class="{ err: !!loadError }"
            aria-live="polite"
          >
            <div
              v-if="playPoster && !loadError"
              class="cover-poster"
              :style="{ backgroundImage: `url(${playPoster})` }"
            />
            <div class="cover-scrim" />

            <div class="cover-body">
              <template v-if="loadError">
                <div class="err-ico" aria-hidden="true">!</div>
              </template>
              <template v-else>
                <div class="spinner" aria-hidden="true">
                  <span class="ring" />
                  <span class="ring delay" />
                  <span class="orb" />
                </div>
              </template>
              <p class="cover-title">{{ coverTitle }}</p>
              <p class="cover-sub">{{ coverSub }}</p>
              <div v-if="!loadError && bufferedPct >= 0" class="bar" aria-hidden="true">
                <i :style="{ width: `${bufferedPct}%` }" />
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.media-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 5200;
  display: grid;
  place-items: center;
  padding: 48px 24px 32px;
  background: rgba(0, 0, 0, 0.88);
}

.media-preview-close {
  position: fixed;
  top: 16px;
  right: 20px;
  z-index: 5201;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-glass-3);
  color: #fff;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.media-preview-close:hover {
  background: var(--studio-line-bright);
}

.media-preview-panel {
  position: relative;
  width: min(960px, 92vw);
  height: min(80vh, 720px);
  border-radius: 12px;
  overflow: hidden;
  background: var(--studio-bg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
}

.media-preview-art {
  width: 100%;
  height: 100%;
  background: #000;
}

/* 只用我们自己的预缓冲层，隐藏 ArtPlayer 自带转圈，避免双 loading */
.media-preview-art :deep(.art-loading),
.media-preview-panel :deep(.art-loading) {
  display: none !important;
}

.media-preview-cover {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  pointer-events: none;
  overflow: hidden;
}

.media-preview-cover.err {
  pointer-events: auto;
}

.cover-poster {
  position: absolute;
  inset: -8%;
  background: center / cover no-repeat;
  filter: blur(18px) saturate(1.05);
  transform: scale(1.08);
  opacity: 0.55;
}

.cover-scrim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 55% at 50% 45%, rgba(20, 20, 20, 0.25), rgba(0, 0, 0, 0.72)),
    linear-gradient(180deg, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.7));
}

.cover-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 24px;
  text-align: center;
  color: #f3f3f3;
}

.spinner {
  position: relative;
  width: 56px;
  height: 56px;
  margin-bottom: 6px;
}

.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: var(--studio-ink);
  border-right-color: rgba(255, 255, 255, 0.25);
  animation: mp-spin 0.9s linear infinite;
}

.ring.delay {
  inset: 8px;
  border-top-color: rgba(96, 165, 250, 0.95);
  border-right-color: rgba(96, 165, 250, 0.2);
  animation-duration: 1.25s;
  animation-direction: reverse;
}

.orb {
  position: absolute;
  inset: 20px;
  border-radius: 50%;
  background: var(--studio-ink);
  box-shadow: 0 0 16px rgba(147, 197, 253, 0.35);
  animation: mp-pulse 1.2s ease-in-out infinite;
}

.cover-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.cover-sub {
  margin: 0;
  font-size: 12px;
  color: var(--studio-text-soft);
  max-width: 300px;
  line-height: 1.45;
}

.bar {
  margin-top: 6px;
  width: min(220px, 56vw);
  height: 3px;
  border-radius: 999px;
  background: var(--studio-glass-3);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #60a5fa, #93c5fd);
  transition: width 0.25s ease;
}

.err-ico {
  width: 44px;
  height: 44px;
  margin-bottom: 4px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  color: #fecaca;
  background: rgba(239, 68, 68, 0.18);
  border: 1px solid rgba(248, 113, 113, 0.35);
}

.mp-fade-enter-active,
.mp-fade-leave-active {
  transition: opacity 0.28s ease;
}

.mp-fade-enter-from,
.mp-fade-leave-to {
  opacity: 0;
}

@keyframes mp-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes mp-pulse {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
