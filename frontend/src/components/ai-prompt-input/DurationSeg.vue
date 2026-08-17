<script setup lang="ts">
import { computed } from 'vue';
import {
  VIDEO_DURATION_STEPS,
  normalizeVideoDuration,
  type VideoDurationSec,
} from './prefs';

const props = defineProps<{
  modelValue: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: VideoDurationSec];
}>();

const active = computed(() => normalizeVideoDuration(props.modelValue));

const activeIndex = computed(() => {
  const idx = VIDEO_DURATION_STEPS.indexOf(active.value);
  return idx < 0 ? 1 : idx;
});

/** 进度条走到当前档位圆点中心 */
const fillPercent = computed(() => {
  const max = VIDEO_DURATION_STEPS.length - 1;
  if (max <= 0) return '0%';
  return `${(activeIndex.value / max) * 100}%`;
});

function stepLeft(index: number) {
  const max = VIDEO_DURATION_STEPS.length - 1;
  if (max <= 0) return '0%';
  return `${(index / max) * 100}%`;
}

function pick(sec: VideoDurationSec) {
  if (props.disabled) return;
  emit('update:modelValue', sec);
}
</script>

<template>
  <div class="dur-seg" :class="{ disabled }">
    <div class="dur-head">
      <span class="dur-label">视频时长</span>
      <span class="dur-value">{{ active }}s</span>
    </div>

    <div class="dur-rail" role="group" aria-label="视频时长">
      <div class="dur-line">
        <div class="dur-track" aria-hidden="true">
          <div class="dur-fill" :style="{ width: fillPercent }" />
        </div>
        <button
          v-for="(sec, i) in VIDEO_DURATION_STEPS"
          :key="sec"
          type="button"
          class="dur-step"
          :class="{ on: active === sec }"
          :style="{ left: stepLeft(i) }"
          :disabled="disabled"
          :aria-pressed="active === sec"
          :aria-label="`${sec}秒`"
          @click="pick(sec)"
        >
          <span class="dur-dot" aria-hidden="true" />
        </button>
      </div>

      <div class="dur-labels" aria-hidden="true">
        <span
          v-for="(sec, i) in VIDEO_DURATION_STEPS"
          :key="`l-${sec}`"
          class="dur-sec"
          :class="{ on: active === sec }"
          :style="{ left: stepLeft(i) }"
        >
          {{ sec }}s
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.dur-seg {
  width: 100%;
  padding: 4px 2px 2px;
  color: var(--ink);
}

.dur-seg.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.dur-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.dur-label {
  font-size: 12px;
  color: var(--muted);
  line-height: 1;
}

.dur-value {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  line-height: 1;
  letter-spacing: 0.01em;
}

.dur-rail {
  padding: 0 2px;
}

.dur-line {
  position: relative;
  height: 22px;
  /* 左右各留半个圆点，让 0%/100% 落在首尾圆点中心 */
  margin: 0 7px;
}

.dur-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 4px;
  margin-top: -2px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
  pointer-events: none;
}

.dur-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.18s var(--ease, ease);
}

.dur-step {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 1;
}

.dur-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--surface, #1c1c20);
  border: 2px solid color-mix(in srgb, var(--muted) 55%, transparent);
  box-sizing: border-box;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.dur-step:hover:not(:disabled) .dur-dot {
  border-color: var(--accent);
  transform: scale(1.08);
}

.dur-step.on .dur-dot {
  width: 14px;
  height: 14px;
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);
}

.dur-labels {
  position: relative;
  height: 16px;
  margin: 8px 8px 0;
}

.dur-sec {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
}

.dur-sec.on {
  color: var(--accent);
  font-weight: 700;
}
</style>
