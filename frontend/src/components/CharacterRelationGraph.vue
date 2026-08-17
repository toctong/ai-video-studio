<template>
  <div ref="wrapRef" class="graph-wrap">
    <svg
      class="graph-svg"
      :viewBox="`0 0 ${graph.width} ${graph.height}`"
      role="img"
      aria-label="角色关系图"
    >
      <defs>
        <filter id="node-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.12" />
        </filter>
        <linearGradient id="zone-ally" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" class="zone-stop-ally" stop-opacity="0.07" />
          <stop offset="100%" class="zone-stop-ally" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="zone-rival" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" class="zone-stop-rival" stop-opacity="0.08" />
          <stop offset="100%" class="zone-stop-rival" stop-opacity="0" />
        </linearGradient>
        <marker
          id="arrow-rival"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" class="arrow-rival-fill" />
        </marker>
      </defs>

      <!-- 氛围分区 -->
      <ellipse
        v-if="graph.zones.party"
        class="zone-blob"
        :cx="graph.cx * 0.42"
        :cy="graph.cy * 1.05"
        :rx="graph.width * 0.22"
        :ry="graph.height * 0.32"
        fill="url(#zone-ally)"
      />
      <ellipse
        v-if="graph.zones.antagonist"
        class="zone-blob"
        :cx="graph.cx * 1.55"
        :cy="graph.cy"
        :rx="graph.width * 0.2"
        :ry="graph.height * 0.34"
        fill="url(#zone-rival)"
      />

      <text
        v-if="graph.zones.party"
        class="zone-caption"
        :x="graph.cx * 0.28"
        :y="graph.cy * 0.42"
      >
        同伴
      </text>
      <text
        v-if="graph.zones.antagonist"
        class="zone-caption rival"
        :x="graph.cx * 1.72"
        :y="graph.cy * 0.42"
      >
        对立
      </text>

      <g class="edges">
        <g
          v-for="e in visibleEdges"
          :key="e.id"
          class="edge"
          :class="[e.kind, { dim: selectedId && !edgeTouchesSelection(e) }]"
        >
          <path :d="edgePath(e)" fill="none" :marker-end="e.kind === 'rival' ? 'url(#arrow-rival)' : undefined" />
          <text
            v-if="showEdgeLabel(e) && edgeLabelPos(e)"
            :x="edgeLabelPos(e)!.x"
            :y="edgeLabelPos(e)!.y"
            class="edge-label"
          >
            {{ e.label }}
          </text>
        </g>
      </g>

      <g class="nodes">
        <g
          v-for="n in graph.nodes"
          :key="n.id"
          class="node"
          :class="[`tier-${n.tier}`, { active: n.id === selectedId, dim: selectedId && n.id !== selectedId && !linkedToSelected(n.id) }]"
          :transform="`translate(${n.x}, ${n.y})`"
          @click.stop="$emit('select', n.id)"
          @dblclick.stop="$emit('open', n.id)"
        >
          <rect
            class="node-card"
            :x="-n.w / 2"
            :y="-n.h / 2"
            :width="n.w"
            :height="n.h"
            :rx="n.h / 2"
            filter="url(#node-shadow)"
          />
          <circle class="node-dot" :cx="-n.w / 2 + 16" cy="0" r="5" />
          <text class="node-name" :x="2" y="-2">{{ shortName(n.name) }}</text>
          <text class="node-role" :x="2" y="13">{{ n.roleLabel }}</text>
        </g>
      </g>
    </svg>

    <div v-if="!graph.nodes.length" class="graph-empty">暂无角色可绘制关系图</div>

    <aside v-if="selected" class="graph-panel">
      <div class="panel-head">
        <div>
          <div class="panel-badges">
            <span class="pb" :class="`tier-${selected.tier}`">{{ selected.roleLabel }}</span>
            <span class="pb camp" :class="campClass(selected.campLabel)">{{ selected.campLabel }}</span>
          </div>
          <div class="panel-name">{{ selected.name }}</div>
        </div>
        <button type="button" class="panel-close" title="关闭" @click="$emit('select', '')">×</button>
      </div>
      <p v-if="selected.occupation" class="panel-occ">{{ selected.occupation }}</p>
      <p class="panel-desc">{{ selected.description || '暂无简介' }}</p>
      <div class="panel-links">
        <span v-for="link in selectedLinks" :key="link.id" class="panel-link" :class="link.kind">
          {{ link.dir }}{{ link.peer }} · {{ link.label }}
        </span>
        <span v-if="!selectedLinks.length" class="panel-link muted">暂无连线</span>
      </div>
      <div class="panel-actions">
        <el-button size="small" type="primary" @click="$emit('open', selected.id)">编辑</el-button>
      </div>
      <p class="panel-tip">双击节点打开编辑</p>
    </aside>

    <div class="graph-legend">
      <span class="lg tier-lead">主角</span>
      <span class="lg tier-party">主角团</span>
      <span class="lg tier-support">配角</span>
      <span class="lg tier-antagonist">对手</span>
      <span class="sep" />
      <span class="lg edge-ally">同伴线</span>
      <span class="lg edge-rival">对立线</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import {
  buildCharacterGraph,
  edgeEndpoints,
  type CharGraphEdge,
  type CharGraphNode,
} from '@/utils/character-relations';

const props = defineProps<{
  characters: any[];
  leadId?: string;
  selectedId?: string;
}>();

defineEmits<{
  select: [id: string];
  open: [id: string];
}>();

const wrapRef = ref<HTMLElement | null>(null);
const size = ref({ width: 920, height: 560 });

const graph = computed(() =>
  buildCharacterGraph(props.characters || [], {
    leadId: props.leadId,
    width: size.value.width,
    height: size.value.height,
  }),
);

const nodeMap = computed(() => {
  const m: Record<string, CharGraphNode> = {};
  for (const n of graph.value.nodes) m[n.id] = n;
  return m;
});

const selected = computed(() => graph.value.nodes.find((n) => n.id === props.selectedId) || null);

const selectedLinks = computed(() => {
  const id = props.selectedId;
  if (!id) return [] as Array<{ id: string; label: string; peer: string; dir: string; kind: string }>;
  return graph.value.edges
    .filter((e) => e.from === id || e.to === id)
    .map((e) => {
      const peerId = e.from === id ? e.to : e.from;
      return {
        id: e.id,
        label: e.label,
        peer: nodeMap.value[peerId]?.name || '？',
        dir: e.from === id ? '→ ' : '← ',
        kind: e.kind,
      };
    });
});

/** 默认隐藏「提及」弱边，选中时再显示相关弱边 */
const visibleEdges = computed(() => {
  const id = props.selectedId;
  return graph.value.edges.filter((e) => {
    if (e.kind === 'mention') return !!id && (e.from === id || e.to === id);
    return true;
  });
});

function shortName(name: string) {
  const n = String(name || '');
  return n.length > 5 ? `${n.slice(0, 5)}…` : n;
}

function campClass(camp: string) {
  if (camp === '正派') return 'good';
  if (camp === '反派') return 'evil';
  return 'neutral';
}

function edgeTouchesSelection(e: CharGraphEdge) {
  return e.from === props.selectedId || e.to === props.selectedId;
}

function linkedToSelected(id: string) {
  if (!props.selectedId) return false;
  return graph.value.edges.some(
    (e) =>
      (e.from === props.selectedId && e.to === id) ||
      (e.to === props.selectedId && e.from === id),
  );
}

function showEdgeLabel(e: CharGraphEdge) {
  if (e.kind === 'ally' || e.kind === 'rival') return true;
  if (props.selectedId && edgeTouchesSelection(e)) return true;
  return false;
}

function edgePath(e: CharGraphEdge) {
  const a = nodeMap.value[e.from];
  const b = nodeMap.value[e.to];
  if (!a || !b) return '';
  const { x1, y1, x2, y2 } = edgeEndpoints(a, b);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // 轻微微弯，避免直线扎堆
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const bend = Math.min(36, dist * 0.12) * (e.kind === 'rival' ? 1 : e.kind === 'ally' ? -0.7 : 0.35);
  const cx = mx - (dy / dist) * bend;
  const cy = my + (dx / dist) * bend;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function edgeLabelPos(e: CharGraphEdge) {
  const a = nodeMap.value[e.from];
  const b = nodeMap.value[e.to];
  if (!a || !b) return null;
  const { x1, y1, x2, y2 } = edgeEndpoints(a, b);
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 8 };
}

let ro: ResizeObserver | null = null;
function measure() {
  const el = wrapRef.value;
  if (!el) return;
  const w = Math.max(680, el.clientWidth || 920);
  const h = Math.max(440, el.clientHeight || 560);
  size.value = { width: w, height: h };
}

onMounted(() => {
  measure();
  ro = new ResizeObserver(() => measure());
  if (wrapRef.value) ro.observe(wrapRef.value);
});

onBeforeUnmount(() => {
  ro?.disconnect();
});

watch(
  () => props.characters?.length,
  () => measure(),
);
</script>

<style scoped>
.graph-wrap {
  position: relative;
  flex: 1;
  min-height: 440px;
  height: min(64vh, 680px);
  border: 0;
  border-radius: 16px;
  background:
    radial-gradient(ellipse 55% 50% at 50% 52%, color-mix(in srgb, var(--accent-soft) 55%, transparent), transparent 72%),
    var(--surface);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--line) 88%, transparent);
  overflow: hidden;
}
.graph-wrap:hover {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, var(--line));
}
.zone-stop-ally {
  stop-color: var(--ok);
}
.zone-stop-rival {
  stop-color: var(--danger);
}
.arrow-rival-fill {
  fill: var(--danger);
}
.graph-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.zone-blob {
  pointer-events: none;
}
.zone-caption {
  fill: color-mix(in srgb, var(--ok) 55%, var(--muted));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-anchor: middle;
  opacity: 0.75;
  pointer-events: none;
}
.zone-caption.rival {
  fill: color-mix(in srgb, var(--danger) 55%, var(--muted));
}

.edge path {
  stroke: color-mix(in srgb, var(--muted) 38%, transparent);
  stroke-width: 1.5;
  stroke-linecap: round;
  transition: opacity 0.18s var(--ease), stroke-width 0.18s var(--ease);
}
.edge.ally path {
  stroke: color-mix(in srgb, var(--ok) 65%, var(--muted));
  stroke-width: 2;
}
.edge.rival path {
  stroke: color-mix(in srgb, var(--danger) 75%, var(--muted));
  stroke-width: 2;
  stroke-dasharray: 6 5;
}
.edge.link path {
  stroke: color-mix(in srgb, var(--accent) 45%, var(--muted));
  stroke-width: 1.4;
  stroke-opacity: 0.75;
}
.edge.mention path {
  stroke: color-mix(in srgb, var(--muted) 40%, transparent);
  stroke-dasharray: 2 5;
  stroke-width: 1.2;
}
.edge.dim {
  opacity: 0.18;
}
.edge-label {
  fill: var(--muted);
  font-size: 10px;
  font-weight: 650;
  text-anchor: middle;
  pointer-events: none;
  paint-order: stroke;
  stroke: var(--surface);
  stroke-width: 3px;
}

.node {
  cursor: pointer;
  transition: opacity 0.18s var(--ease);
}
.node.dim {
  opacity: 0.28;
}
.node-card {
  fill: var(--surface);
  stroke: var(--line-strong);
  stroke-width: 1.5;
  transition: stroke 0.15s var(--ease), fill 0.15s var(--ease), transform 0.15s var(--ease);
}
.node-dot {
  fill: var(--muted);
}
.node-name {
  fill: var(--ink);
  font-size: 12px;
  font-weight: 750;
  text-anchor: middle;
  pointer-events: none;
}
.node-role {
  fill: var(--muted);
  font-size: 10px;
  font-weight: 600;
  text-anchor: middle;
  pointer-events: none;
}

.node.tier-lead .node-card {
  fill: color-mix(in srgb, var(--warn) 8%, var(--surface));
  stroke: var(--warn);
  stroke-width: 2;
}
.node.tier-lead .node-dot {
  fill: var(--warn);
}
.node.tier-party .node-card {
  fill: color-mix(in srgb, var(--accent-soft) 80%, var(--surface));
  stroke: var(--accent);
}
.node.tier-party .node-dot {
  fill: var(--accent);
}
.node.tier-support .node-card {
  fill: var(--surface);
  stroke: color-mix(in srgb, var(--muted) 55%, var(--line));
}
.node.tier-support .node-dot {
  fill: var(--muted);
}
.node.tier-antagonist .node-card {
  fill: color-mix(in srgb, var(--danger) 8%, var(--surface));
  stroke: var(--danger);
}
.node.tier-antagonist .node-dot {
  fill: var(--danger);
}

.node:hover .node-card,
.node.active .node-card {
  stroke-width: 2.5;
  filter: brightness(1.02);
}
.node.active {
  opacity: 1;
}

.graph-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 13px;
  pointer-events: none;
}

.graph-panel {
  position: absolute;
  right: 14px;
  top: 14px;
  width: min(290px, calc(100% - 28px));
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  backdrop-filter: blur(10px);
  border: 0;
  border-radius: 14px;
  padding: 14px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--line) 88%, transparent);
  animation: panel-in 0.18s var(--ease);
}
.graph-panel:hover {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 24%, var(--line));
}
@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}
.panel-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}
.pb {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--line);
}
.pb.tier-lead {
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 12%, transparent);
  border-color: color-mix(in srgb, var(--warn) 22%, transparent);
}
.pb.tier-party {
  color: var(--accent-2);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 22%, transparent);
}
.pb.tier-antagonist {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--danger) 22%, transparent);
}
.pb.camp.good {
  color: var(--ok);
  background: color-mix(in srgb, var(--ok) 12%, transparent);
  border-color: color-mix(in srgb, var(--ok) 22%, transparent);
}
.pb.camp.evil {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border-color: color-mix(in srgb, var(--danger) 22%, transparent);
}
.pb.camp.neutral {
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 12%, transparent);
  border-color: color-mix(in srgb, var(--warn) 22%, transparent);
}
.panel-name {
  font-weight: 780;
  font-size: 16px;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.panel-close {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
  padding: 0 2px;
  font-family: inherit;
}
.panel-occ {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.panel-desc {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.panel-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.panel-link {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
}
.panel-link.ally {
  color: var(--ok);
  background: color-mix(in srgb, var(--ok) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--ok) 22%, transparent);
}
.panel-link.rival {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 22%, transparent);
}
.panel-link.muted {
  background: transparent;
  padding-left: 0;
}
.panel-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.panel-tip {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--muted);
}

.graph-legend {
  position: absolute;
  left: 12px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: var(--muted);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--line);
}
.sep {
  width: 1px;
  height: 10px;
  background: var(--line);
}
.lg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}
.lg::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: var(--radius-sm);
  background: var(--muted);
}
.lg.tier-lead::before {
  background: var(--warn);
}
.lg.tier-party::before {
  background: var(--accent);
}
.lg.tier-support::before {
  background: var(--muted);
}
.lg.tier-antagonist::before {
  background: var(--danger);
}
.lg.edge-ally::before {
  width: 14px;
  height: 3px;
  border-radius: 2px;
  background: var(--ok);
}
.lg.edge-rival::before {
  width: 14px;
  height: 3px;
  border-radius: 2px;
  background: var(--danger);
}
</style>
