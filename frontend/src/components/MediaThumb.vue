<template>
  <span v-if="url || poster" class="media-thumb" :class="{ video: isVideo }">
    <img
      v-if="imageSrc"
      :src="imageSrc"
      alt=""
      loading="lazy"
      draggable="false"
    />
    <video
      v-else-if="videoPreviewSrc"
      class="vid"
      :src="videoPreviewSrc"
      muted
      playsinline
      preload="metadata"
      draggable="false"
      aria-hidden="true"
    />
    <span v-else class="ph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path
          fill="currentColor"
          d="M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm3.2 3.6v6.8L15.6 12 10.2 8.6z"
        />
      </svg>
    </span>
    <span v-if="isVideo && showPlay" class="play" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="12" height="12">
        <path fill="currentColor" d="M8 5.5v13l11-6.5L8 5.5z" />
      </svg>
    </span>
  </span>
</template>

<script setup lang="ts">
/**
 * 缩略图：图片直接显示；视频优先封面 JPG，无封面时用 video 首帧兼容。
 */
import { computed } from 'vue';
import { isVideoUrl } from '@/composables/useMediaPreview';

const props = withDefaults(
  defineProps<{
    url?: string | null;
    /** 视频封面图；无则回退到视频首帧 */
    posterUrl?: string | null;
    showPlay?: boolean;
  }>(),
  { url: '', posterUrl: '', showPlay: true },
);

const url = computed(() => String(props.url || '').trim());
const poster = computed(() => String(props.posterUrl || '').trim());
const isVideo = computed(() => isVideoUrl(url.value));

const imageSrc = computed(() => {
  if (isVideo.value) {
    if (poster.value && !isVideoUrl(poster.value)) return poster.value;
    return '';
  }
  return url.value;
});

const videoPreviewSrc = computed(() => {
  if (!isVideo.value || imageSrc.value) return '';
  const u = url.value;
  if (!u) return '';
  if (/[?#]/.test(u)) return u;
  return `${u}#t=0.001`;
});
</script>

<style scoped>
.media-thumb {
  display: block;
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--studio-inset);
}
.media-thumb img,
.media-thumb .vid,
.media-thumb .ph {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  -webkit-user-drag: none;
  user-select: none;
  background: var(--studio-inset);
}
.ph {
  display: grid;
  place-items: center;
  color: var(--studio-line-bright);
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, var(--studio-glass-2), transparent),
    var(--studio-panel);
}
.play {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
</style>
