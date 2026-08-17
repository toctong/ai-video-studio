<script setup lang="ts">
import * as echarts from 'echarts';
import 'echarts-liquidfill';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 0–100 */
    percent: number;
    size?: number;
    /** neon = 概览暗色青绿波 */
    tone?: 'default' | 'neon';
  }>(),
  { size: 128, tone: 'default' },
);

const elRef = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let ro: ResizeObserver | null = null;

const fill = computed(() => Math.max(0, Math.min(1, props.percent / 100)));

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function palette() {
  if (props.tone === 'neon') {
    return {
      accent: '#5eead4',
      accent2: '#22d3ee',
      ink: '#f8fafc',
      soft: 'rgba(34, 211, 238, 0.12)',
      glow: 'rgba(94, 234, 212, 0.45)',
    };
  }
  const accent = cssVar('--accent', '#2563eb');
  const accent2 = cssVar('--accent-2', '#1d4ed8');
  return {
    accent,
    accent2,
    ink: cssVar('--ink', '#111827'),
    soft: cssVar('--accent-soft', 'rgba(37, 99, 235, 0.12)'),
    glow: 'rgba(37, 99, 235, 0.25)',
  };
}

function buildOption(): echarts.EChartsCoreOption {
  const c = palette();
  const v = fill.value;
  const waves =
    v <= 0
      ? [0]
      : [v, Math.max(0, v - 0.06), Math.max(0, v - 0.12)].map((n) =>
          Math.min(1, Math.max(0.02, n)),
        );

  return {
    series: [
      {
        type: 'liquidFill',
        data: waves,
        radius: '92%',
        center: ['50%', '50%'],
        color: [c.accent, c.accent2, c.accent],
        backgroundStyle: {
          color: c.soft,
        },
        outline: {
          show: true,
          borderDistance: 3,
          itemStyle: {
            borderWidth: props.tone === 'neon' ? 2.5 : 2,
            borderColor: c.accent,
            shadowBlur: props.tone === 'neon' ? 14 : 8,
            shadowColor: c.glow,
          },
        },
        itemStyle: {
          opacity: 0.92,
          shadowBlur: props.tone === 'neon' ? 16 : 12,
          shadowColor: c.glow,
        },
        label: {
          show: true,
          color: c.ink,
          fontSize: 22,
          fontWeight: 800,
          formatter: () => `${Math.round(props.percent)}%`,
        },
        emphasis: {
          itemStyle: { opacity: 0.95 },
        },
        waveAnimation: v > 0,
        animationDuration: 1800,
        animationDurationUpdate: 900,
        amplitude: v > 0 ? 6 : 0,
      },
    ],
  };
}

function render() {
  if (!chart) return;
  chart.setOption(buildOption(), true);
}

function init() {
  if (!elRef.value) return;
  chart?.dispose();
  chart = echarts.init(elRef.value);
  render();
}

onMounted(async () => {
  await nextTick();
  init();
  if (elRef.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => chart?.resize());
    ro.observe(elRef.value);
  }
});

onUnmounted(() => {
  ro?.disconnect();
  ro = null;
  chart?.dispose();
  chart = null;
});

watch(
  () => [props.percent, props.size, props.tone] as const,
  async () => {
    await nextTick();
    if (!chart && elRef.value) init();
    else render();
    chart?.resize();
  },
);
</script>

<template>
  <div
    ref="elRef"
    class="liquid-fill-gauge"
    :class="{ neon: tone === 'neon' }"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    :aria-label="`成书进度 ${Math.round(percent)}%`"
  />
</template>

<style scoped>
.liquid-fill-gauge {
  margin: 4px auto 8px;
  pointer-events: none;
}
</style>
