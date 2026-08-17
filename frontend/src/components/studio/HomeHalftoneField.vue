<template>
  <canvas
    ref="el"
    class="halftone-field"
    :style="{ height: `${height}px` }"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
/**
 * 首页半调粒子场：参考 updream HalftoneCanvas
 * 偏移点阵 + 漂移团簇 + 光环 + 指针吸引（性能不足时自动隐藏）
 */
import { onMounted, onUnmounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    height?: number;
    /** CSS 颜色通道，如 "197, 229, 255" */
    fgRgb?: string;
  }>(),
  {
    height: 700,
    fgRgb: '197, 229, 255',
  },
);

type Cell = {
  x: number;
  y: number;
  driftAmp: number;
  fx: number;
  fy: number;
  phaseX: number;
  phaseY: number;
  gain: number;
};

type Shape = {
  x: number;
  y: number;
  size: number;
  morph: number;
  drift: number;
  freqX: number;
  freqY: number;
  phaseX: number;
  phaseY: number;
  gain: number;
};

type Trail = { x: number; y: number; born: number; weight: number };

const el = ref<HTMLCanvasElement | null>(null);

let raf = 0;
let disposed = false;
let teardown: (() => void) | null = null;

function hash(i: number, j: number) {
  const r = Math.sin((i + 1) * 127.1 + (j + 1) * 311.7) * 43758.5453;
  return r - Math.floor(r);
}

function smoothstep(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function ringField(
  dist: number,
  center: number,
  width: number,
  t: number,
  speed: number,
  gain: number,
) {
  const wobble = Math.abs(dist - (center + Math.sin(t * speed) * width * 0.6));
  if (wobble > width) return 0;
  const k = 1 - wobble / width;
  return k * k * gain;
}

function sdCircle(x: number, y: number, r: number) {
  return Math.hypot(x, y) - r;
}

function sdBox(x: number, y: number, r: number) {
  const dx = Math.abs(x) - r;
  const dy = Math.abs(y) - r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

onMounted(() => {
  const canvas = el.value;
  if (!canvas) return;

  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    canvas.style.display = 'none';
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cfg = {
    dpr: 1,
    width: 0,
    height: 0,
    spacing: 9,
    radius: 340,
    strength: 0.07,
    pointerEase: 0.06,
    cellDensity: 32000,
    cellSigma: 1.05,
    cellSize: 0.26,
    cellGain: 0.13,
    ringWidth: 7.5,
    ringGain: 0.29,
    shapeCount: 1,
    shapeSize: 0.014,
    shapeGain: 0.9,
    morphSpeed: 0.9,
    trailLife: 0.35,
    trailSigma: 19,
    dotMin: 0.009,
    dotMax: 0.26,
    drawThreshold: 0.01,
    t: 0,
    lastTime: performance.now(),
    fgRGB: props.fgRgb,
  };

  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  const trail: Trail[] = [];
  const cells: Cell[] = [];
  const shapes: Shape[] = [];

  const OPACITY_BUCKETS = 10;
  const buckets = Array.from({ length: OPACITY_BUCKETS }, () => new Float32Array(4096));
  const bucketLen = new Array<number>(OPACITY_BUCKETS).fill(0);

  type CellCache = { cx: number; cy: number; gain: number };
  type ShapeCache = { sx: number; sy: number; half: number; mixT: number; gain: number };
  const cellCache: CellCache[] = [];
  const shapeCache: ShapeCache[] = [];

  let cellRad2 = 0;
  let cellSigma2 = 0;
  let shapeSigma2 = 0;
  let trailSigma2 = 0;
  let trailRad2 = 0;
  let pointerSigma2 = 0;
  let pointerGain = 0;
  let ringCx = 0;
  let ringCy = -200;

  function makeCell(i: number): Cell {
    return {
      x: hash(i, 0),
      y: hash(i, 1),
      driftAmp: 0.02 + hash(i, 2) * 0.028,
      fx: 0.25 + hash(i, 3) * 0.9,
      fy: 0.25 + hash(i, 4) * 0.9,
      phaseX: hash(i, 5) * Math.PI * 2,
      phaseY: hash(i, 6) * Math.PI * 2,
      gain: 0.18 + hash(i, 7) * 0.28,
    };
  }

  function resize() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    cfg.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cfg.width = rect.width;
    cfg.height = rect.height;
    canvas.width = Math.floor(cfg.width * cfg.dpr);
    canvas.height = Math.floor(cfg.height * cfg.dpr);
    ctx.setTransform(cfg.dpr, 0, 0, cfg.dpr, 0, 0);
  }

  function syncCells() {
    const n = Math.max(8, Math.round((cfg.width * cfg.height) / cfg.cellDensity));
    if (cells.length < n) {
      for (let i = cells.length; i < n; i += 1) cells.push(makeCell(i));
    } else if (cells.length > n) {
      cells.length = n;
    }
  }

  function syncShapes() {
    const count = Math.round(cfg.shapeCount);
    if (shapes.length === count) return;
    const minSide = Math.min(cfg.width, cfg.height);
    const orbit = minSide * 0.34;
    const arc = (Math.PI * 2 * orbit) / Math.max(1, count);
    const size = Math.min(cfg.shapeSize, (arc * 0.38) / minSide);
    shapes.length = 0;
    for (let i = 0; i < count; i += 1) {
      const base = (Math.PI * 2 * i) / Math.max(1, count) - Math.PI * 0.5;
      const jitter = (Math.random() - 0.5) * (Math.PI / Math.max(6, count));
      const radial = orbit * (Math.random() - 0.5) * 0.18;
      const ang = base + jitter;
      const r = orbit + radial;
      shapes.push({
        x: 0.5 + (Math.cos(ang) * r) / cfg.width,
        y: 0.5 + (Math.sin(ang) * r) / cfg.height,
        size: Math.max(0.004, size),
        morph: Math.random() * Math.PI * 2,
        drift: 0.003 + Math.random() * 0.006,
        freqX: 0.16 + Math.random() * 0.52,
        freqY: 0.16 + Math.random() * 0.52,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        gain: 0.2 + Math.random() * 0.4,
      });
    }
  }

  function easePointer() {
    if (!pointer.active) {
      pointer.tx = cfg.width * 0.5 + Math.cos(cfg.t * 1.8e-4) * cfg.width * 0.12;
      pointer.ty = cfg.height * 0.5 + Math.sin(cfg.t * 2.3e-4) * cfg.height * 0.1;
    }
    pointer.x += (pointer.tx - pointer.x) * cfg.pointerEase;
    pointer.y += (pointer.ty - pointer.y) * cfg.pointerEase;
  }

  function pruneTrail(now: number) {
    const life = Math.max(0.3, cfg.trailLife + 0.35);
    while (trail.length && now - trail[0]!.born > life) trail.shift();
    if (trail.length > 120) trail.splice(0, trail.length - 120);
  }

  function prepare(now: number) {
    const ge = (cfg.cellSigma + cfg.spacing * 1.2) * cfg.cellSize;
    cellRad2 = ge * 2.8 * (ge * 2.8);
    cellSigma2 = 2 * ge * ge;

    while (cellCache.length < cells.length) cellCache.push({ cx: 0, cy: 0, gain: 0 });
    cellCache.length = cells.length;
    for (let i = 0; i < cells.length; i += 1) {
      const c = cells[i]!;
      const cache = cellCache[i]!;
      cache.cx = (c.x + Math.sin(now * c.fx + c.phaseX) * c.driftAmp) * cfg.width;
      cache.cy = (c.y + Math.cos(now * c.fy + c.phaseY) * c.driftAmp) * cfg.height;
      cache.gain = c.gain;
    }

    const shapeR = cfg.spacing * 0.7;
    shapeSigma2 = 2 * shapeR * shapeR;
    while (shapeCache.length < shapes.length) {
      shapeCache.push({ sx: 0, sy: 0, half: 0, mixT: 0, gain: 0 });
    }
    shapeCache.length = shapes.length;
    const minSide = Math.min(cfg.width, cfg.height);
    for (let i = 0; i < shapes.length; i += 1) {
      const s = shapes[i]!;
      const cache = shapeCache[i]!;
      cache.sx = (s.x + Math.sin(now * s.freqX + s.phaseX) * s.drift) * cfg.width;
      cache.sy = (s.y + Math.cos(now * s.freqY + s.phaseY) * s.drift) * cfg.height;
      cache.half = s.size * minSide;
      cache.mixT = 0.5 + 0.5 * Math.sin(now * cfg.morphSpeed + s.morph);
      cache.gain = s.gain;
    }

    const trailS = cfg.trailSigma + cfg.strength * 14;
    trailSigma2 = 2 * trailS * trailS;
    trailRad2 = trailS * 3 * (trailS * 3);
    const pS = Math.max(24, cfg.radius * 0.36);
    pointerSigma2 = 2 * pS * pS;
    pointerGain = 0.6 + cfg.strength * 0.4;
    ringCx = cfg.width * 0.5;
    ringCy = -180;
  }

  function sample(x: number, y: number, now: number) {
    const nx = x / cfg.width;
    const ny = y / cfg.height;
    const noise =
      0.28 * Math.sin((nx * 6.7 + now * 0.45) * 1.5) +
      0.24 * Math.cos((ny * 6.2 - now * 0.38) * 1.7) +
      0.2 * Math.sin((nx + ny) * 14 - now * 0.8);

    let cellSum = 0;
    for (let i = 0; i < cellCache.length; i += 1) {
      const c = cellCache[i]!;
      const dx = x - c.cx;
      const dy = y - c.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > cellRad2) continue;
      cellSum += Math.exp(-d2 / cellSigma2) * c.gain;
    }

    const ringDist = Math.hypot(x - ringCx, y - ringCy);
    const ringA = ringField(
      ringDist,
      cfg.width * 0.18,
      cfg.spacing * cfg.ringWidth,
      now,
      1.1,
      cfg.ringGain,
    );
    const ringB = ringField(
      ringDist,
      cfg.width * 0.31,
      cfg.spacing * (cfg.ringWidth + 1.1),
      now,
      0.8,
      cfg.ringGain * 0.85,
    );

    let shapeSum = 0;
    for (let i = 0; i < shapeCache.length; i += 1) {
      const s = shapeCache[i]!;
      const dx = x - s.sx;
      const dy = y - s.sy;
      const circle = sdCircle(dx, dy, s.half * 0.8);
      const box = sdBox(dx, dy, s.half);
      const d = circle + (box - circle) * s.mixT;
      shapeSum += Math.exp(-(d * d) / shapeSigma2) * s.gain;
    }

    let trailSum = 0;
    for (let i = trail.length - 1; i >= 0; i -= 1) {
      const p = trail[i]!;
      const age = now - p.born;
      if (age > cfg.trailLife) break;
      const dx = x - p.x;
      const dy = y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > trailRad2) continue;
      trailSum += Math.exp(-d2 / trailSigma2) * Math.exp(-age * 3) * 0.95 * p.weight;
    }

    const px = x - pointer.x;
    const py = y - pointer.y;
    const pointerField = Math.exp(-(px * px + py * py) / pointerSigma2) * pointerGain;

    return smoothstep(
      0.13 +
        noise * 0.22 +
        cellSum * cfg.cellGain +
        ringA +
        ringB +
        shapeSum * cfg.shapeGain +
        trailSum +
        pointerField,
    );
  }

  const frameMin = 1000 / 30;
  let frames = 0;
  let probeStart = performance.now();
  let probed = false;

  function frame(nowMs: number) {
    if (disposed) return;
    if (!canvas || !ctx) return;

    if (!probed) {
      frames += 1;
      const elapsed = nowMs - probeStart;
      if (elapsed >= 2000) {
        probed = true;
        if ((frames / elapsed) * 1000 < 45) {
          canvas.style.display = 'none';
          return;
        }
      }
    }

    const dt = nowMs - cfg.lastTime;
    if (dt < frameMin) {
      raf = requestAnimationFrame(frame);
      return;
    }
    cfg.t = nowMs;
    const now = nowMs * 0.001;
    cfg.lastTime = nowMs - (dt % frameMin);

    ctx.clearRect(0, 0, cfg.width, cfg.height);
    syncCells();
    syncShapes();
    easePointer();
    pruneTrail(now);
    prepare(now);

    for (let i = 0; i < OPACITY_BUCKETS; i += 1) bucketLen[i] = 0;

    const spacing = cfg.spacing;
    for (let row = 0, y = spacing * 0.5; y < cfg.height; row += 1, y += spacing) {
      const x0 = spacing * 0.5 + (row % 2 ? spacing * 0.5 : 0);
      for (let x = x0; x < cfg.width; x += spacing) {
        const field = sample(x, y, now);
        if (field < cfg.drawThreshold) continue;
        const radius = Math.max(0.18, spacing * (cfg.dotMin + field * cfg.dotMax));
        const alpha = Math.min(0.7, 0.05 + field * 0.55);
        const bi = Math.min(OPACITY_BUCKETS - 1, Math.floor((alpha / 0.7) * OPACITY_BUCKETS));
        let len = bucketLen[bi]!;
        let buf = buckets[bi]!;
        if (len + 3 > buf.length) {
          const next = new Float32Array(buf.length * 2);
          next.set(buf);
          buckets[bi] = next;
          buf = next;
        }
        buf[len] = x;
        buf[len + 1] = y;
        buf[len + 2] = radius;
        bucketLen[bi] = len + 3;
      }
    }

    for (let i = 0; i < OPACITY_BUCKETS; i += 1) {
      const len = bucketLen[i]!;
      if (!len) continue;
      const alpha = (((i + 0.5) / OPACITY_BUCKETS) * 0.7).toFixed(3);
      ctx.fillStyle = `rgba(${cfg.fgRGB},${alpha})`;
      ctx.beginPath();
      const buf = buckets[i]!;
      for (let j = 0; j < len; j += 3) {
        const x = buf[j]!;
        const y = buf[j + 1]!;
        const r = buf[j + 2]!;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
  }

  function onPointerMove(e: PointerEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
      pointer.active = false;
      return;
    }
    pointer.tx = x;
    pointer.ty = y;
    pointer.active = true;
    trail.push({ x, y, born: performance.now() * 0.001, weight: 1 });
  }

  function onPointerLeave() {
    pointer.active = false;
  }

  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      return;
    }
    cfg.lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  resize();
  pointer.x = cfg.width * 0.5;
  pointer.y = cfg.height * 0.5;
  pointer.tx = pointer.x;
  pointer.ty = pointer.y;

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  raf = requestAnimationFrame(frame);

  teardown = () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
  };
});

onUnmounted(() => {
  teardown?.();
  teardown = null;
});
</script>

<style scoped>
.halftone-field {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  pointer-events: none;
  z-index: 2;
  display: block;
  mask-image: linear-gradient(to bottom, #000 0%, #000 75%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 75%, transparent 100%);
}
</style>
