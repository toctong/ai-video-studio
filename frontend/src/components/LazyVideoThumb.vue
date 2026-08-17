<script setup lang="ts">
/**
 * 视频缩略图：优先独立 JPG 封面；无封面时用 video + preload=metadata 展示首帧（兼容旧资产）。
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 视频地址；无封面时用于首帧预览 */
    src?: string;
    /** 独立封面图 URL */
    posterUrl?: string;
    width?: number | string;
    height?: number | string;
    alt?: string;
  }>(),
  {
    src: '',
    posterUrl: '',
    width: undefined,
    height: undefined,
    alt: '',
  },
);

const poster = computed(() => String(props.posterUrl || '').trim());
const videoSrc = computed(() => String(props.src || '').trim());
const hasPoster = computed(() => !!poster.value);
/** 无封面时挂 #t=0.001，促使多数浏览器画出首帧 */
const videoPreviewSrc = computed(() => {
  const u = videoSrc.value;
  if (!u) return '';
  if (/[?#]/.test(u)) return u;
  return `${u}#t=0.001`;
});
</script>

<template>
  <div class="lazy-vid-thumb">
    <img
      v-if="hasPoster"
      class="poster"
      :src="poster"
      :alt="alt || '视频封面'"
      loading="lazy"
      decoding="async"
      :width="width"
      :height="height"
      draggable="false"
    />
    <video
      v-else-if="videoPreviewSrc"
      class="poster vid"
      :src="videoPreviewSrc"
      muted
      playsinline
      preload="metadata"
      :width="width"
      :height="height"
      draggable="false"
      aria-hidden="true"
    />
    <div v-else class="ph" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28">
        <path
          fill="currentColor"
          d="M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm3.2 3.6v6.8L15.6 12 10.2 8.6z"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.lazy-vid-thumb {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--studio-panel);
  overflow: hidden;
}

.poster {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--studio-inset);
  pointer-events: none;
}

.vid {
  /* 列表里只当静帧预览，不响应点击播放 */
  object-fit: cover;
}

.ph {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--studio-line-bright);
  background:
    radial-gradient(ellipse 80% 60% at 50% 40%, var(--studio-glass-2), transparent),
    var(--studio-panel);
}
</style>
