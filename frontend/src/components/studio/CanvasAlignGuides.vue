<template>
  <canvas ref="canvasRef" class="align-guides" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useVueFlow } from '@vue-flow/core';

const props = defineProps<{
  horizontal?: number;
  vertical?: number;
}>();

const { viewport, dimensions } = useVueFlow({ id: 'studio-canvas' });
const canvasRef = ref<HTMLCanvasElement | null>(null);

const width = computed(() => Number(dimensions.value?.width) || 0);
const height = computed(() => Number(dimensions.value?.height) || 0);
const vx = computed(() => Number(viewport.value?.x) || 0);
const vy = computed(() => Number(viewport.value?.y) || 0);
const zoom = computed(() => Number(viewport.value?.zoom) || 1);

function paint() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = width.value;
  const h = height.value;
  if (w <= 0 || h <= 0) return;

  const dpi = window.devicePixelRatio || 1;
  canvas.width = Math.floor(w * dpi);
  canvas.height = Math.floor(h * dpi);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const hasV = typeof props.vertical === 'number';
  const hasH = typeof props.horizontal === 'number';
  if (!hasV && !hasH) return;

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  if (hasV) {
    const x = (props.vertical as number) * zoom.value + vx.value;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  if (hasH) {
    const y = (props.horizontal as number) * zoom.value + vy.value;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

watch(
  () => [width.value, height.value, vx.value, vy.value, zoom.value, props.horizontal, props.vertical],
  () => paint(),
  { immediate: true },
);
</script>

<style scoped>
.align-guides {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 8;
  pointer-events: none;
}
</style>
