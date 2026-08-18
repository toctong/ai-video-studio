<template>
  <div ref="el" class="lazy-video" :class="{ ready: !!activeSrc }">
    <video
      v-if="activeSrc"
      ref="videoEl"
      class="lazy-video__el"
      :src="activeSrc"
      muted
      playsinline
      :loop="loop"
      preload="none"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useInView } from '@/composables/useInView';

const props = withDefaults(
  defineProps<{
    src?: string;
    /** 仅悬停（或 active）时才挂 src，用于发现卡片 */
    hover?: boolean;
    /** 与 hover 搭配：父级 mouseenter 时为 true */
    active?: boolean;
    loop?: boolean;
    /** 进入视口后自动静音播放（素材库预览） */
    autoplay?: boolean;
  }>(),
  {
    src: '',
    hover: false,
    active: false,
    loop: true,
    autoplay: false,
  },
);

const { el, inView } = useInView({ rootMargin: '120px 0px' });
const videoEl = ref<HTMLVideoElement | null>(null);

const activeSrc = computed(() => {
  const src = String(props.src || '').trim();
  if (!src || !inView.value) return '';
  if (props.hover && !props.active) return '';
  return src;
});

async function tryPlay() {
  await nextTick();
  const v = videoEl.value;
  if (!v || !activeSrc.value) return;
  try {
    await v.play();
  } catch {
    /* 自动播放被拦时仍保留封面 */
  }
}

watch(activeSrc, (src) => {
  if (src && (props.active || props.autoplay || props.hover)) void tryPlay();
});

watch(
  () => props.active,
  (on) => {
    if (on) void tryPlay();
    else if (videoEl.value) {
      videoEl.value.pause();
      videoEl.value.currentTime = 0;
    }
  },
);
</script>

<style scoped>
.lazy-video {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.lazy-video__el {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
