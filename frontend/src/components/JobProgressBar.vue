<template>
  <div
    class="job-progress"
    :class="{
      'is-indeterminate': indeterminate,
      'is-active': active,
      'is-fail': tone === 'fail',
      'is-ok': tone === 'ok',
      'is-muted': tone === 'muted',
    }"
  >
    <div class="job-progress-track">
      <div
        class="job-progress-fill"
        :style="indeterminate ? undefined : { width: `${clamped}%` }"
      />
    </div>
    <div v-if="showLabel" class="job-progress-label">
      <span class="job-progress-msg">{{ displayMessage }}</span>
      <span v-if="!indeterminate && clamped > 0" class="job-progress-pct">
        {{ Math.round(clamped) }}%
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    progress?: number;
    message?: string;
    indeterminate?: boolean;
    showLabel?: boolean;
    /** 运行中 / 排队中：轨道高亮 */
    active?: boolean;
    tone?: 'ok' | 'fail' | 'muted' | '';
  }>(),
  {
    progress: 0,
    indeterminate: false,
    showLabel: true,
    active: false,
    tone: '',
  },
);

const clamped = computed(() => Math.max(0, Math.min(100, Number(props.progress) || 0)));

const displayMessage = computed(() => {
  if (props.message?.trim()) return props.message.trim();
  if (props.indeterminate) return props.active ? '处理中…' : '等待中…';
  return '处理中…';
});
</script>

<style scoped>
.job-progress {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  min-width: 0;
  color: inherit;
}

.job-progress-track {
  position: relative;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 12%, var(--surface));
  overflow: hidden;
  flex-shrink: 0;
}

.job-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, currentColor 70%, transparent),
    currentColor
  );
  transition: width 0.25s var(--ease);
}

.job-progress.is-active .job-progress-track {
  background: color-mix(in srgb, currentColor 16%, var(--surface));
}

.job-progress.is-indeterminate .job-progress-fill {
  width: 36%;
  animation: job-progress-slide 1.15s var(--ease) infinite;
}

.job-progress-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  line-height: 1.3;
}

.job-progress-msg {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-progress-pct {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  opacity: 0.7;
}

@keyframes job-progress-slide {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(320%);
  }
}
</style>
