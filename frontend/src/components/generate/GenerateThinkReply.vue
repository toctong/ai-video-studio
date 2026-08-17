<template>
  <div class="think-reply" :class="{ live: streaming, done: !streaming }">
    <!-- 流式中：标题 + 正文同步展开 -->
    <template v-if="streaming">
      <div class="think-live-head" aria-live="polite">
        <span class="bulb" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <path
              d="M8 1.5A4.2 4.2 0 0 0 3.8 5.7c0 1.6.8 2.7 1.7 3.6.4.4.7.9.7 1.5v.2h3.6v-.2c0-.6.3-1.1.7-1.5.9-.9 1.7-2 1.7-3.6A4.2 4.2 0 0 0 8 1.5Z"
              stroke="currentColor"
              stroke-width="1.35"
            />
            <path d="M6.4 13.2h3.2M6.8 14.5h2.4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" />
          </svg>
        </span>
        <span class="live-text">正在思考</span>
        <span class="live-dots" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div v-if="hasSource" class="think-body">
        <UiScroll class="think-scroll" always :max-height="thinkMaxH">
          <div class="think-content muted">
            <GenerateMarkdown :tone="theme.isDark ? 'dark' : 'light'" :source="displaySource" />
          </div>
        </UiScroll>
      </div>
    </template>

    <!-- 完成后：默认收起，可展开查看 -->
    <template v-else-if="hasSource">
      <button
        type="button"
        class="think-toggle"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span class="toggle-label">已深度思考</span>
        <span v-if="durationLabel" class="toggle-dur">{{ durationLabel }}</span>
        <span class="toggle-chev" :class="{ open }" aria-hidden="true">▾</span>
      </button>
      <div v-show="open" class="think-body">
        <UiScroll class="think-scroll" always :max-height="thinkMaxH">
          <div class="think-content muted">
            <slot>
              <GenerateMarkdown :tone="theme.isDark ? 'dark' : 'light'" :source="displaySource" />
            </slot>
          </div>
        </UiScroll>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import GenerateMarkdown from '@/components/generate/GenerateMarkdown.vue';
import { UiScroll } from '@/components/ui';
import { useThemeStore } from '@/stores/theme';

const theme = useThemeStore();

const props = withDefaults(
  defineProps<{
    source?: string;
    streaming?: boolean;
    /** 思考耗时毫秒 */
    thinkMs?: number;
  }>(),
  {
    source: '',
    streaming: false,
    thinkMs: 0,
  },
);

/** 完成后默认收起（主流：思考完折叠，正文在下方） */
const open = ref(false);
const thinkMaxH = 'min(280px, 40vh)';

watch(
  () => props.streaming,
  (live, prev) => {
    if (prev && !live) open.value = false;
  },
);

const hasSource = computed(() => !!String(props.source || '').trim());

const displaySource = computed(() => String(props.source || ''));

const durationLabel = computed(() => {
  const ms = Number(props.thinkMs) || 0;
  if (ms < 200) return '';
  const sec = ms / 1000;
  if (sec < 10) return `${sec.toFixed(1)}s`;
  return `${Math.round(sec)}s`;
});
</script>

<style scoped>
.think-reply {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-width: 0;
  max-width: none;
}

.think-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  color: var(--studio-text-faint);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}

.think-toggle:hover {
  color: var(--studio-text-strong);
}

.toggle-label {
  font-weight: 500;
}

.toggle-dur {
  color: var(--studio-line-bright);
  font-variant-numeric: tabular-nums;
}

.toggle-chev {
  display: inline-block;
  font-size: 11px;
  transform: rotate(-90deg);
  transition: transform 0.18s ease;
  opacity: 0.8;
}

.toggle-chev.open {
  transform: rotate(0deg);
}

.think-live-head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--studio-text-strong);
  font-size: 13px;
}

.think-live-head .bulb {
  color: #fbbf24;
  display: grid;
  place-items: center;
  animation: bulb-pulse 1.2s ease-in-out infinite;
}

.live-text {
  background: linear-gradient(
    90deg,
    var(--studio-text-faint) 0%,
    var(--studio-ink) 45%,
    var(--studio-text-faint) 90%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: shimmer-text 1.4s linear infinite;
  font-weight: 500;
}

.live-dots {
  display: inline-flex;
  gap: 3px;
  margin-left: 2px;
}

.live-dots i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--studio-text-faint);
  animation: dot-bounce 1s ease-in-out infinite;
}

.live-dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.live-dots i:nth-child(3) {
  animation-delay: 0.3s;
}

.think-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  border-left: 2px solid var(--studio-glass-2);
  margin-left: 5px;
  padding-left: 12px;
}

.think-scroll {
  height: auto !important;
  width: 100%;
}

.think-scroll :deep(.el-scrollbar) {
  height: auto;
}

.think-scroll :deep(.el-scrollbar__wrap) {
  max-height: min(280px, 40vh);
}

.think-content {
  min-width: 0;
  padding-right: 6px;
  color: var(--studio-text-strong);
  font-size: 13px;
  line-height: 1.55;
}

.think-content.muted {
  color: var(--studio-text-soft);
}

.think-content.muted :deep(.gen-md) {
  opacity: 0.92;
}

@keyframes bulb-pulse {
  0%,
  100% {
    opacity: 0.65;
    transform: scale(0.96);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

@keyframes shimmer-text {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

@keyframes dot-bounce {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
</style>
