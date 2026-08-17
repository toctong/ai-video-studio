<template>
  <Teleport to="body">
    <div v-if="open" class="log-mask" @mousedown.self="close">
      <div class="log-panel" role="dialog" aria-label="运行日志" @keydown.esc="close">
        <header class="log-head">
          <div class="head-left">
            <strong>运行日志</strong>
            <span v-if="run" class="st" :class="run.status">{{ statusLabel(run.status) }}</span>
            <span v-if="summary?.meta" class="head-meta">{{ summary.meta }}</span>
          </div>
          <div class="head-actions">
            <button
              v-if="run && (run.status === 'queued' || run.status === 'active')"
              type="button"
              class="pill-btn danger"
              @click="onCancel"
            >
              取消
            </button>
            <button
              v-if="run && (run.status === 'failed' || run.status === 'cancelled')"
              type="button"
              class="pill-btn primary"
              :disabled="retrying"
              @click="onRetry"
            >
              {{ retrying ? '重试中…' : '重试' }}
            </button>
            <button
              type="button"
              class="icon-btn"
              title="刷新"
              :disabled="loading || historyLoading"
              @click="refresh"
            >
              <UiIcon name="refresh" :size="15" :class="{ spinning: loading || historyLoading }" />
            </button>
            <button type="button" class="icon-btn" title="关闭" @click="close">
              <UiIcon name="x" :size="15" />
            </button>
          </div>
        </header>

        <div
          v-if="run && (run.status === 'queued' || run.status === 'active')"
          class="prog-track"
          aria-hidden="true"
        >
          <div class="prog-fill" :style="{ width: `${progressPct}%` }" />
        </div>

        <div v-if="summary && (summary.reason || summary.tip)" class="alert" :class="summary.tone">
          <div v-if="summary.reason" class="alert-reason">{{ summary.reason }}</div>
          <div v-if="summary.tip" class="alert-tip">建议：{{ summary.tip }}</div>
          <details
            v-if="summary.raw && summary.raw !== summary.reason"
            class="alert-raw"
            open
          >
            <summary>上游原文</summary>
            <pre>{{ summary.raw }}</pre>
          </details>
        </div>

        <div class="log-body">
          <!-- 历史运行 -->
          <aside class="col-hist" v-loading="historyLoading">
            <div class="col-label">历史</div>
            <div v-if="history.length" class="hist-list">
              <button
                v-for="r in history"
                :key="r.id"
                type="button"
                class="hist-item"
                :class="{ on: r.id === run?.id, [r.status]: true }"
                @click="selectHistory(r.id)"
              >
                <span class="hist-dot" :class="r.status" />
                <div class="hist-text">
                  <div class="hist-top">
                    <span class="hist-status">{{ statusLabel(r.status) }}</span>
                    <time>{{ formatDate(r.createdAt) }}</time>
                  </div>
                  <div v-if="histHint(r)" class="hist-hint">{{ histHint(r) }}</div>
                </div>
              </button>
            </div>
            <p v-else-if="!historyLoading" class="col-empty">暂无记录</p>
          </aside>

          <!-- 步骤轨 -->
          <section class="col-steps" ref="listEl" v-loading="loading && !run">
            <div class="col-label">
              节点
              <span v-if="nodeCards.length" class="col-count">{{ nodeCards.length }}</span>
            </div>
            <div v-if="nodeCards.length" class="step-list">
              <button
                v-for="card in nodeCards"
                :key="card.id"
                type="button"
                class="step"
                :class="[card.statusClass, { on: card.id === selectedId }]"
                @click="selectNode(card.id)"
              >
                <span class="step-dot" :class="card.statusClass" aria-hidden="true" />
                <div class="step-body">
                  <div class="step-row">
                    <strong class="step-name">{{ card.title }}</strong>
                    <span class="status-txt" :class="card.statusClass">{{ card.statusLabel }}</span>
                  </div>
                  <div class="step-sub">
                    <span>{{ card.kind }}</span>
                    <span v-if="card.duration">· {{ card.duration }}</span>
                    <span v-if="card.model">· {{ card.model }}</span>
                    <span v-if="card.thumbs.length">· {{ card.thumbs.length }} 产出</span>
                  </div>
                  <div v-if="card.error" class="step-err">{{ card.error.reason }}</div>
                </div>
              </button>
            </div>
            <div v-else class="col-empty tall">
              {{ loading ? '加载中…' : '暂无节点详情。运行后会显示在这里。' }}
            </div>
          </section>

          <!-- 详情 -->
          <section class="col-detail">
            <template v-if="selected">
              <div class="detail-head">
                <div class="detail-title">
                  {{ selected.title }}
                  <span class="status-txt" :class="selected.statusClass">{{ selected.statusLabel }}</span>
                </div>
                <div class="detail-sub">
                  <span>{{ selected.kind }}</span>
                  <span v-if="selected.duration">· {{ selected.duration }}</span>
                  <span v-if="selected.model">· {{ selected.model }}</span>
                  <span v-if="selected.sizeBit">· {{ selected.sizeBit }}</span>
                </div>
              </div>

              <div class="detail-scroll">
                <div v-if="selected.error" class="fail-block">
                  <div>原因：{{ selected.error.reason }}</div>
                  <div v-if="selected.error.tip" class="tip">建议：{{ selected.error.tip }}</div>
                  <details
                    v-if="selected.error.raw && selected.error.raw !== selected.error.reason"
                    class="fail-raw"
                    open
                  >
                    <summary>上游原文</summary>
                    <pre>{{ selected.error.raw }}</pre>
                  </details>
                </div>

                <div v-if="selected.thumbs.length" class="media-row">
                  <button
                    v-for="(th, i) in selected.thumbs"
                    :key="i"
                    type="button"
                    class="media-thumb"
                    :title="th.kind === 'image' ? '预览图片' : '预览视频'"
                    @click="previewThumb(selected, i)"
                  >
                    <img v-if="th.kind === 'image'" :src="th.url" alt="" />
                    <LazyVideoThumb
                      v-else
                      :src="th.url"
                      :poster-url="th.poster || ''"
                    />
                  </button>
                </div>

                <div v-if="selected.prompt" class="field">
                  <div class="lab">提示词</div>
                  <pre class="plain">{{ selected.prompt }}</pre>
                </div>

                <div v-if="selected.inputs.length" class="field">
                  <div class="lab">输入</div>
                  <ul>
                    <li v-for="(inp, i) in selected.inputs" :key="i">{{ inp }}</li>
                  </ul>
                </div>

                <div v-if="selected.outputs.length" class="field">
                  <div class="lab">产出</div>
                  <div v-for="(o, i) in selected.outputs" :key="i" class="out-row">
                    <span class="out-kind">{{
                      o.kind === 'image' ? '图' : o.kind === 'video' ? '视频' : o.kind === 'text' ? '文' : '项'
                    }}</span>
                    <code>{{ o.label }}</code>
                    <button
                      v-if="o.preview"
                      type="button"
                      class="link-btn"
                      @click="previewOutput(o)"
                    >
                      预览
                    </button>
                    <button type="button" class="link-btn" @click="copyText(o.url)">复制</button>
                  </div>
                </div>

                <div v-if="selected.tech.length" class="field muted">
                  <div class="lab">技术细节</div>
                  <ul>
                    <li v-for="(t, i) in selected.tech" :key="i">{{ t }}</li>
                  </ul>
                </div>

                <div v-if="techLines.length" class="field muted">
                  <div class="lab">本次运行</div>
                  <ul>
                    <li v-for="(t, i) in techLines" :key="i">{{ t }}</li>
                  </ul>
                </div>
              </div>
            </template>
            <div v-else class="col-empty tall">选择左侧节点查看详情</div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  cancelWorkflowRun,
  fetchWorkflowRun,
  fetchWorkflowRuns,
  retryWorkflowRun,
  type WorkflowRunRow,
} from '@/api/workflows';
import {
  openImagePreview,
  openVideoPreview,
} from '@/composables/useMediaPreview';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import { explainRunError, type FriendlyError } from '@/utils/run-errors';

const props = defineProps<{
  open: boolean;
  runId?: string;
  workflowId?: string;
  liveRun?: WorkflowRunRow | null;
}>();

const emit = defineEmits<{
  close: [];
  'update:runId': [id: string];
  refreshed: [run: WorkflowRunRow];
  retried: [run: WorkflowRunRow];
}>();

const loading = ref(false);
const historyLoading = ref(false);
const retrying = ref(false);
const run = ref<WorkflowRunRow | null>(null);
const history = ref<WorkflowRunRow[]>([]);
const listEl = ref<HTMLElement | null>(null);
const selectedId = ref('');
let pollTimer: ReturnType<typeof setInterval> | null = null;
let autoSelectForRunId = '';

const TYPE_LABEL: Record<string, string> = {
  'ai.image': 'AI 生图',
  'ai.video': 'AI 视频',
  'ai.chat': 'AI 对话',
  'input.text': '文本',
  'input.note': '备注',
  'input.image': '图片输入',
  'input.video': '视频输入',
  'output.preview': '预览',
};

type Thumb = { kind: 'image' | 'video'; url: string; poster?: string };
type OutRow = {
  kind: 'image' | 'video' | 'text' | 'other';
  url: string;
  label: string;
  poster?: string;
  preview?: boolean;
};

type NodeCard = {
  id: string;
  title: string;
  kind: string;
  status: string;
  statusClass: string;
  statusLabel: string;
  duration: string;
  model: string;
  sizeBit: string;
  prompt: string;
  inputs: string[];
  outputs: OutRow[];
  thumbs: Thumb[];
  error: FriendlyError | null;
  tech: string[];
  sort: number;
  executed: boolean;
};

const progressPct = computed(() => {
  const r = run.value;
  if (!r) return 0;
  const pct = Math.max(0, Math.min(100, Math.round(Number(r.progress) || 0)));
  if (r.status === 'queued') return Math.max(pct, 4);
  if (r.status === 'active') return Math.max(pct, 8);
  return pct;
});

const runContext = computed(() => {
  const r = run.value;
  if (!r) return null;
  const graphNodes: any[] = Array.isArray((r.graphSnapshot as any)?.nodes)
    ? ((r.graphSnapshot as any).nodes as any[])
    : [];
  const promptNodes = r.promptSnapshot?.nodes || {};
  const states = r.nodeStates || {};
  const nodeById = new Map(graphNodes.map((n) => [String(n.id), n]));
  const scope = (r.inputs as any)?._runScope || {};
  const onlyNodeId = String(scope.onlyNodeId || '').trim();
  const fromNodeId = String(scope.fromNodeId || '').trim();
  const created = Date.parse(r.createdAt || '') || Date.now();
  const updated = Date.parse(r.updatedAt || '') || created;

  const titleOf = (id: string) => {
    const n = nodeById.get(id);
    const p = promptNodes[id];
    const type = String(n?.type || p?.type || '');
    return String(
      n?.label ||
        n?.params?.name ||
        p?.params?.name ||
        TYPE_LABEL[type] ||
        type ||
        shortId(id),
    );
  };
  const typeOf = (id: string) => {
    const n = nodeById.get(id);
    const p = promptNodes[id];
    return String(n?.type || p?.type || '');
  };

  return {
    r,
    graphNodes,
    promptNodes,
    states,
    nodeById,
    onlyNodeId,
    fromNodeId,
    created,
    updated,
    titleOf,
    typeOf,
  };
});

const nodeCards = computed((): NodeCard[] => {
  const ctx = runContext.value;
  if (!ctx) return [];
  const { r, promptNodes, states, nodeById, onlyNodeId, fromNodeId, created, titleOf, typeOf } =
    ctx;

  const allIds = new Set<string>([
    ...ctx.graphNodes.map((n) => String(n.id)),
    ...Object.keys(promptNodes),
    ...Object.keys(states),
  ]);

  const orderedIds = [...allIds].sort((a, b) => {
    const sa = states[a];
    const sb = states[b];
    const ta = Date.parse(sa?.startedAt || sa?.finishedAt || '') || Number.MAX_SAFE_INTEGER;
    const tb = Date.parse(sb?.startedAt || sb?.finishedAt || '') || Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  });

  const cards: NodeCard[] = [];

  for (const id of orderedIds) {
    const type = typeOf(id);
    if (type === 'input.note' || type === 'group') continue;
    const st = states[id];
    if (!st && onlyNodeId && id !== onlyNodeId && !fromNodeId) continue;

    const title = titleOf(id);
    const kind = TYPE_LABEL[type] || type || '节点';
    const pNode = promptNodes[id];
    const params = { ...(pNode?.params || {}), ...(nodeById.get(id)?.params || {}) };
    const status = String(
      st?.status || (onlyNodeId && id !== onlyNodeId ? 'skipped' : 'pending'),
    );
    const msg = String(st?.error || st?.message || '').trim();
    const started = Date.parse(st?.startedAt || '') || 0;
    const finished = Date.parse(st?.finishedAt || '') || 0;
    const reused = status === 'completed' && /复用|跳过/.test(msg);

    let statusClass = 'pending';
    let statusLabelText = statusLabel(status, msg);
    if (status === 'failed') statusClass = 'failed';
    else if (status === 'cancelled') statusClass = 'cancelled';
    else if (status === 'skipped' || reused) statusClass = 'reused';
    else if (status === 'completed') statusClass = 'completed';
    else if (['running', 'active', 'queued'].includes(status)) statusClass = 'active';

    const model = String(params.model || '').trim() || '（系统默认）';
    const aspect = String(params.aspect || '').trim();
    const size = String(params.size || params.imageSize || '').trim();
    const sizeBit = [aspect, size].filter(Boolean).join(' / ');
    const promptText = String(params.prompt || params.value || '').trim();
    const outputs = buildOutputs(st?.outputs);
    const thumbs = outputs
      .filter((o) => o.preview)
      .map((o) => ({
        kind: o.kind as 'image' | 'video',
        url: o.url,
        poster: o.poster,
      }));

    const tech: string[] = [];
    tech.push(`节点 ${shortId(id)}`);
    if (model) tech.push(`模型 ${model}`);
    if (st?.outputs?.assetRef) tech.push(`素材 ${String(st.outputs.assetRef)}`);
    if (started) tech.push(`开始 ${formatTime(started)}`);
    if (finished) tech.push(`结束 ${formatTime(finished)}`);

    cards.push({
      id,
      title,
      kind,
      status,
      statusClass,
      statusLabel: reused ? '复用' : statusLabelText,
      duration: durationText(started, finished),
      model: shortModel(model === '（系统默认）' ? '' : model) || (type.startsWith('ai.') ? '系统默认' : ''),
      sizeBit,
      prompt: promptText,
      inputs: summarizeInputsList(pNode?.inputs, states, titleOf),
      outputs,
      thumbs,
      error: status === 'failed' ? explainRunError(msg || r.error || '失败') : null,
      tech,
      sort: started || finished || created,
      executed: !['pending', 'skipped'].includes(status) || reused,
    });
  }

  return cards;
});

const selected = computed(() => nodeCards.value.find((c) => c.id === selectedId.value) || null);

const summary = computed(() => {
  const ctx = runContext.value;
  if (!ctx) return null;
  const { r, states, created, updated, onlyNodeId, fromNodeId, titleOf } = ctx;
  const cards = nodeCards.value;
  const ok = cards.filter((c) => c.statusClass === 'completed').length;
  const failCards = cards.filter((c) => c.statusClass === 'failed');
  const reused = cards.filter((c) => c.statusClass === 'reused').length;
  const active = cards.find((c) => c.statusClass === 'active');
  const dur = formatDuration(created, updated);

  let scope = '整图执行';
  if (onlyNodeId) scope = `单节点 · ${titleOf(onlyNodeId)}`;
  else if (fromNodeId) scope = `续跑 · ${titleOf(fromNodeId)}`;

  if (r.status === 'failed' || failCards.length) {
    const primary =
      failCards[0]?.error || explainRunError(r.error || failCards[0]?.error?.raw || '运行失败');
    return {
      tone: 'failed' as const,
      title: '运行失败',
      meta: `${scope} · 耗时 ${dur}`,
      reason: primary.reason,
      tip: primary.tip,
      raw: primary.raw,
    };
  }
  if (r.status === 'cancelled') {
    return {
      tone: 'cancelled' as const,
      title: '运行已取消',
      meta: `耗时 ${dur}`,
      reason: '',
      tip: '',
      raw: '',
    };
  }
  if (r.status === 'queued' || r.status === 'active') {
    return {
      tone: 'active' as const,
      title: active ? `正在执行：${active.title}` : '运行中',
      meta: `${scope}${progressPct.value ? ` · ${progressPct.value}%` : ''}`,
      reason: String(r.message || '').trim(),
      tip: '',
      raw: '',
    };
  }
  if (r.status === 'completed') {
    return {
      tone: 'ok' as const,
      title: '运行完成',
      meta: `${ok} 个节点成功${reused ? ` · ${reused} 个复用` : ''} · 耗时 ${dur}`,
      reason: '',
      tip: '',
      raw: '',
    };
  }
  if (!Object.keys(states).length) {
    return {
      tone: 'warn' as const,
      title: '暂无节点详情',
      meta: scope,
      reason: '未记录到节点状态。可点刷新重试。',
      tip: '',
      raw: '',
    };
  }
  return {
    tone: 'ok' as const,
    title: statusLabel(r.status),
    meta: `${scope} · ${Object.keys(states).length} 个节点`,
    reason: '',
    tip: '',
    raw: '',
  };
});

const techLines = computed(() => {
  const ctx = runContext.value;
  if (!ctx) return [] as string[];
  const { r, onlyNodeId, fromNodeId, created, updated, titleOf } = ctx;
  const lines: string[] = [];
  lines.push(`运行 ${r.id}`);
  if (r.jobRunId) lines.push(`任务 ${r.jobRunId}`);
  lines.push(`创建 ${formatDate(r.createdAt)} · 耗时 ${formatDuration(created, updated)}`);
  if (onlyNodeId) lines.push(`范围：单节点 ${titleOf(onlyNodeId)}`);
  else if (fromNodeId) lines.push(`范围：从 ${titleOf(fromNodeId)} 续跑`);
  else lines.push('范围：整图');
  return lines;
});

function buildOutputs(outputs: Record<string, unknown> | undefined): OutRow[] {
  if (!outputs || typeof outputs !== 'object') return [];
  const rows: OutRow[] = [];
  const image = String(outputs.image || '').trim();
  const video = String(outputs.video || '').trim();
  const posterRaw = String(outputs.poster || '').trim();
  const poster =
    posterRaw && !/\.(mp4|webm|mov)(\?|$)/i.test(posterRaw) ? posterRaw : '';
  if (image) {
    rows.push({ kind: 'image', url: image, label: shortUrl(image), preview: true });
  }
  if (video) {
    rows.push({ kind: 'video', url: video, label: shortUrl(video), poster, preview: true });
  }
  if (outputs.text != null && String(outputs.text).trim()) {
    const t = String(outputs.text);
    rows.push({ kind: 'text', url: t, label: clip(t, 80), preview: false });
  }
  if (outputs.assetRef) {
    rows.push({
      kind: 'other',
      url: String(outputs.assetRef),
      label: `素材 ${shortId(String(outputs.assetRef))}`,
      preview: false,
    });
  }
  return rows;
}

function summarizeInputsList(
  inputs: Record<string, unknown> | undefined,
  states: Record<string, any>,
  titleOf: (id: string) => string,
) {
  if (!inputs || typeof inputs !== 'object') return [] as string[];
  const bits: string[] = [];
  for (const [port, linkOrArr] of Object.entries(inputs)) {
    const links = Array.isArray(linkOrArr) ? linkOrArr : linkOrArr ? [linkOrArr] : [];
    for (const link of links as any[]) {
      const nid = String(link?.nodeId || '');
      if (!nid) continue;
      const outs = states[nid]?.outputs || {};
      const from = titleOf(nid);
      if (outs.image) bits.push(`${port} ← 图片（${from}）`);
      else if (outs.video) bits.push(`${port} ← 视频（${from}）`);
      else if (outs.text != null) bits.push(`${port} ← 文本（${from}：${clip(String(outs.text), 32)}）`);
      else bits.push(`${port} ← ${from}`);
    }
  }
  return bits.slice(0, 12);
}

function shortModel(model: string) {
  if (!model) return '';
  if (model.length <= 36) return model;
  return clip(model, 36);
}

function durationText(started: number, finished: number) {
  if (!started || !finished || finished < started) return '';
  return formatDuration(started, finished);
}

function clip(s: string, n: number) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n)}…`;
}

function formatDuration(from: number, to: number) {
  const ms = Math.max(0, to - from);
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m${rs}s`;
}

function shortUrl(url: string) {
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.origin : 'http://local');
    const name = u.pathname.split('/').filter(Boolean).pop() || u.host;
    return clip(decodeURIComponent(name), 48);
  } catch {
    return clip(url, 48);
  }
}

function statusLabel(s?: string, message?: string) {
  if (message && /复用|跳过/.test(message) && (s === 'completed' || s === 'skipped')) {
    return '复用';
  }
  const map: Record<string, string> = {
    queued: '排队',
    active: '执行中',
    running: '运行中',
    completed: '完成',
    failed: '失败',
    cancelled: '已取消',
    pending: '待跑',
    skipped: '跳过',
  };
  return map[s || ''] || s || '—';
}

function histHint(r: WorkflowRunRow) {
  if (r.status === 'failed') return clip(explainRunError(r.error).reason, 28);
  if (r.status === 'cancelled') return '已取消';
  if (r.status === 'completed') {
    const n = Object.values(r.nodeStates || {}).filter((s: any) => s?.status === 'completed')
      .length;
    return n ? `${n} 节点` : '';
  }
  return '';
}

function shortId(id?: string) {
  return id ? id.slice(0, 8) : '';
}

function formatDate(v?: string) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return v;
  }
}

function formatTime(at: number) {
  if (!at) return '--:--:--';
  try {
    return new Date(at).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--:--';
  }
}

function selectNode(id: string) {
  selectedId.value = id;
}

function previewThumb(card: NodeCard, index: number) {
  const th = card.thumbs[index];
  if (!th) return;
  if (th.kind === 'image') {
    const imgs = card.thumbs.filter((t) => t.kind === 'image').map((t) => t.url);
    openImagePreview(imgs, Math.max(0, imgs.indexOf(th.url)));
  } else {
    openVideoPreview(th.url, th.poster ? { poster: th.poster } : undefined);
  }
}

function previewOutput(o: OutRow) {
  if (o.kind === 'image') openImagePreview([o.url], 0);
  else if (o.kind === 'video') {
    openVideoPreview(o.url, o.poster ? { poster: o.poster } : undefined);
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

function mergeRun(base: WorkflowRunRow | null, incoming: WorkflowRunRow): WorkflowRunRow {
  if (!base || base.id !== incoming.id) return incoming;
  const inStates = incoming.nodeStates || {};
  const baseStates = base.nodeStates || {};
  const preferIncomingStates = Object.keys(inStates).length >= Object.keys(baseStates).length;
  return {
    ...base,
    ...incoming,
    nodeStates: preferIncomingStates ? inStates : baseStates,
    graphSnapshot: incoming.graphSnapshot || base.graphSnapshot,
    promptSnapshot: incoming.promptSnapshot || base.promptSnapshot,
    result:
      incoming.result && Object.keys(incoming.result).length ? incoming.result : base.result,
  };
}

function close() {
  stopPoll();
  emit('close');
}

function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function startPoll(id: string) {
  stopPoll();
  pollTimer = setInterval(async () => {
    if (!props.open) {
      stopPoll();
      return;
    }
    if (!run.value || run.value.status === 'queued' || run.value.status === 'active') {
      try {
        const r = await fetchWorkflowRun(id);
        run.value = mergeRun(run.value, r);
        emit('refreshed', run.value);
        if (r.status !== 'queued' && r.status !== 'active') stopPoll();
      } catch {
        /* ignore */
      }
    } else {
      stopPoll();
    }
  }, 1500);
}

async function loadRun(id: string) {
  if (!id) {
    run.value = null;
    return;
  }
  loading.value = true;
  try {
    const r = await fetchWorkflowRun(id);
    run.value = mergeRun(run.value, r);
    emit('refreshed', run.value);
    if (run.value.status === 'queued' || run.value.status === 'active') startPoll(id);
    else stopPoll();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载运行失败');
  } finally {
    loading.value = false;
  }
}

async function loadHistory() {
  if (!props.workflowId) {
    history.value = [];
    return;
  }
  historyLoading.value = true;
  try {
    history.value = await fetchWorkflowRuns({ workflowId: props.workflowId });
  } catch {
    history.value = [];
  } finally {
    historyLoading.value = false;
  }
}

async function refresh() {
  await Promise.all([
    props.runId || run.value?.id ? loadRun(props.runId || run.value!.id) : Promise.resolve(),
    loadHistory(),
  ]);
}

function selectHistory(id: string) {
  autoSelectForRunId = '';
  selectedId.value = '';
  emit('update:runId', id);
  void loadRun(id);
}

async function onCancel() {
  const id = run.value?.id;
  if (!id) return;
  try {
    run.value = await cancelWorkflowRun(id);
    emit('refreshed', run.value);
    ElMessage.info('已取消');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '取消失败');
  }
}

async function onRetry() {
  const id = run.value?.id;
  if (!id) return;
  retrying.value = true;
  try {
    const { workflowRun } = await retryWorkflowRun(id);
    run.value = workflowRun;
    autoSelectForRunId = '';
    selectedId.value = '';
    emit('update:runId', workflowRun.id);
    emit('retried', workflowRun);
    startPoll(workflowRun.id);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '重试失败');
  } finally {
    retrying.value = false;
  }
}

function pickDefaultNode(cards: NodeCard[]): string {
  const failed = cards.find((c) => c.statusClass === 'failed');
  if (failed) return failed.id;
  const active = cards.find((c) => c.statusClass === 'active');
  if (active) return active.id;
  const withMedia = [...cards].reverse().find((c) => c.thumbs.length);
  if (withMedia) return withMedia.id;
  const done = [...cards].reverse().find((c) => c.statusClass === 'completed');
  if (done) return done.id;
  return cards[0]?.id || '';
}

function applyAutoSelect(cards: NodeCard[], runId: string) {
  const stillValid = selectedId.value && cards.some((c) => c.id === selectedId.value);
  if (autoSelectForRunId === runId && stillValid) {
    // 运行中跟随当前执行节点
    const active = cards.find((c) => c.statusClass === 'active');
    if (active && selectedId.value !== active.id) {
      const cur = cards.find((c) => c.id === selectedId.value);
      if (!cur || cur.statusClass === 'active' || cur.statusClass === 'pending') {
        selectedId.value = active.id;
      }
    }
    return;
  }
  autoSelectForRunId = runId;
  selectedId.value = pickDefaultNode(cards);
}

async function scrollToFocus() {
  await nextTick();
  const el = listEl.value;
  if (!el) return;
  const on = el.querySelector('.step.on') as HTMLElement | null;
  const fail = el.querySelector('.step.failed') as HTMLElement | null;
  const active = el.querySelector('.step.active') as HTMLElement | null;
  (on || fail || active)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

watch(
  () => [props.open, props.runId] as const,
  ([open, runId]) => {
    if (!open) {
      stopPoll();
      autoSelectForRunId = '';
      selectedId.value = '';
      return;
    }
    if (runId && runId !== autoSelectForRunId) autoSelectForRunId = '';
    void loadHistory();
    if (runId) {
      if (props.liveRun && props.liveRun.id === runId) {
        run.value = mergeRun(run.value, props.liveRun);
      }
      void loadRun(runId);
    } else if (props.liveRun?.id) {
      run.value = props.liveRun;
      void loadRun(props.liveRun.id);
    } else {
      run.value = null;
    }
  },
);

watch(
  () => props.liveRun,
  (live) => {
    if (!props.open || !live) return;
    if (!props.runId || live.id === props.runId || live.id === run.value?.id) {
      run.value = mergeRun(run.value, live);
      if (live.status === 'queued' || live.status === 'active') startPoll(live.id);
    }
  },
);

watch(
  () => [run.value?.id, nodeCards.value] as const,
  ([id, cards]) => {
    if (!id || !cards?.length) return;
    applyAutoSelect(cards as NodeCard[], String(id));
    void scrollToFocus();
  },
);
</script>

<style scoped>
.log-mask {
  --run-bg: var(--studio-bg);
  --run-panel: var(--studio-panel);
  --run-line: var(--studio-panel-3);
  --run-text: var(--studio-text);
  --run-muted: var(--studio-muted);
  --run-faint: #6b6b6b;
  --el-bg-color: var(--studio-panel);
  --el-bg-color-overlay: var(--studio-panel);
  --el-fill-color-blank: var(--studio-panel);
  --el-fill-color-light: var(--studio-panel);
  --el-text-color-primary: var(--studio-text);
  --el-text-color-regular: var(--studio-text);
  --el-border-color: var(--studio-panel-3);
  --el-mask-color: rgba(0, 0, 0, 0.55);
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 20px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.62);
}

.log-panel {
  width: min(1120px, calc(100vw - 28px));
  height: min(86vh, 860px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--run-line);
  background: var(--run-panel);
  color: var(--run-text);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.5);
}

.log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--run-line);
  background: var(--run-bg);
  flex-shrink: 0;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.head-left strong {
  font-size: 13.5px;
  font-weight: 650;
}

.head-meta {
  font-size: 12px;
  color: var(--run-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.pill-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  border: 0;
  background: transparent;
  color: var(--studio-text-strong);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
}
.pill-btn:hover:not(:disabled) {
  background: var(--studio-glass-2);
  color: #fff;
}
.pill-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pill-btn.primary {
  background: var(--studio-text);
  color: var(--studio-bg);
}
.pill-btn.primary:hover:not(:disabled) {
  background: var(--studio-text);
  color: var(--studio-bg);
}
.pill-btn.danger {
  color: #fca5a5;
}
.pill-btn.danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.08);
}

.icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 0;
  background: transparent;
  color: var(--studio-text-soft);
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) {
  background: var(--studio-glass-2);
  color: #fff;
}
.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.icon-btn .spinning {
  animation: icon-spin 0.8s linear infinite;
}
@keyframes icon-spin {
  to {
    transform: rotate(360deg);
  }
}

.st {
  font-size: 12px;
  font-weight: 550;
  color: var(--run-muted);
}
.st.completed {
  color: #86efac;
}
.st.failed {
  color: #fca5a5;
}
.st.active,
.st.running,
.st.queued {
  color: var(--studio-text);
}
.st.cancelled {
  color: #fcd34d;
}

.prog-track {
  height: 1px;
  background: var(--studio-panel);
  flex-shrink: 0;
}
.prog-fill {
  height: 100%;
  background: var(--studio-text);
  transition: width 0.35s ease;
}

.alert {
  margin: 0;
  padding: 8px 14px;
  border-bottom: 1px solid var(--run-line);
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1.45;
}
.alert.failed {
  color: #fecaca;
  border-left: 2px solid #f87171;
}
.alert.active {
  color: var(--run-muted);
}
.alert.warn,
.alert.cancelled {
  color: #fde68a;
  border-left: 2px solid #fbbf24;
}
.alert-tip {
  margin-top: 2px;
  color: var(--run-faint);
}
.alert-raw {
  margin-top: 6px;
}
.alert-raw summary {
  cursor: pointer;
  font-size: 11px;
  color: var(--run-faint);
}
.alert-raw pre {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11.5px;
  color: #fecaca;
}

.log-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 188px minmax(240px, 300px) 1fr;
  background: var(--run-bg);
}

.col-hist,
.col-steps,
.col-detail {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--run-bg);
}

.col-hist,
.col-steps {
  border-right: 1px solid var(--run-line);
}

.col-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px 6px;
  font-size: 11px;
  font-weight: 550;
  color: var(--run-faint);
  flex-shrink: 0;
}
.col-count {
  font-variant-numeric: tabular-nums;
  color: var(--run-muted);
}

.col-empty {
  margin: 12px;
  font-size: 12px;
  color: var(--run-faint);
  line-height: 1.5;
}
.col-empty.tall {
  margin: auto;
  padding: 20px;
  text-align: center;
}

.hist-list,
.step-list,
.detail-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--studio-line-strong) transparent;
}

.hist-list {
  padding: 0 0 8px;
}

.hist-item {
  width: 100%;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  text-align: left;
  border: 0;
  border-left: 2px solid transparent;
  border-radius: 0;
  padding: 8px 12px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.hist-item:hover {
  background: rgba(255, 255, 255, 0.03);
}
.hist-item.on {
  background: var(--studio-glass);
  border-left-color: var(--studio-text);
}

.hist-dot {
  width: 6px;
  height: 6px;
  margin-top: 6px;
  border-radius: 999px;
  flex-shrink: 0;
  background: var(--studio-muted);
}
.hist-dot.completed {
  background: #4ade80;
}
.hist-dot.failed {
  background: #f87171;
}
.hist-dot.cancelled {
  background: #fbbf24;
}
.hist-dot.active,
.hist-dot.queued,
.hist-dot.running {
  background: var(--studio-text);
}

.hist-text {
  min-width: 0;
  flex: 1;
}
.hist-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
.hist-status {
  color: var(--studio-text-strong);
  font-weight: 550;
}
.hist-top time {
  color: var(--run-faint);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.hist-hint {
  margin-top: 2px;
  font-size: 11px;
  color: var(--run-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hist-item.failed .hist-hint {
  color: #fca5a5;
}

.step-list {
  padding: 0 0 8px;
}

.step {
  width: 100%;
  display: flex;
  gap: 9px;
  text-align: left;
  border: 0;
  border-left: 2px solid transparent;
  border-radius: 0;
  padding: 8px 12px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.step:hover {
  background: rgba(255, 255, 255, 0.03);
}
.step.on {
  background: var(--studio-glass);
  border-left-color: var(--studio-text);
}
.step.failed.on {
  border-left-color: #f87171;
}
.step.active.on {
  border-left-color: var(--studio-text);
}

.step-dot {
  width: 6px;
  height: 6px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--studio-muted);
  flex-shrink: 0;
}
.step-dot.completed {
  background: #4ade80;
}
.step-dot.failed {
  background: #f87171;
}
.step-dot.active {
  background: var(--studio-ink);
}
.step-dot.cancelled,
.step-dot.reused {
  background: #fbbf24;
}

.step-body {
  min-width: 0;
  flex: 1;
}
.step-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.step-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--run-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.step-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--run-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.step-err {
  margin-top: 3px;
  font-size: 11px;
  color: #fca5a5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-txt {
  font-size: 11px;
  font-weight: 550;
  color: var(--run-faint);
  flex-shrink: 0;
}
.status-txt.failed {
  color: #fca5a5;
}
.status-txt.completed {
  color: #86efac;
}
.status-txt.active {
  color: var(--studio-text);
}
.status-txt.cancelled,
.status-txt.reused {
  color: #fcd34d;
}

.detail-head {
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--run-line);
  flex-shrink: 0;
}
.detail-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
  font-weight: 650;
}
.detail-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--run-faint);
}

.detail-scroll {
  padding: 12px 16px 18px;
}

.fail-block {
  margin: 0 0 14px;
  padding: 0 0 0 10px;
  border-left: 2px solid #f87171;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--studio-text-strong);
}
.fail-block .tip {
  margin-top: 3px;
  color: var(--run-muted);
}
.fail-raw {
  margin-top: 8px;
}
.fail-raw summary {
  cursor: pointer;
  font-size: 11.5px;
  color: var(--run-faint);
  user-select: none;
}
.fail-block pre {
  margin: 6px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11.5px;
  color: #fca5a5;
}

.media-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.media-thumb {
  width: 88px;
  height: 88px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  overflow: hidden;
  background: #000;
  cursor: zoom-in;
}
.media-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.field {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--run-line);
}
.field:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: 0;
}
.field .lab {
  font-size: 11px;
  font-weight: 550;
  color: var(--run-faint);
  margin-bottom: 5px;
}
.field pre.plain {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--studio-text-strong);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.field ul {
  margin: 0;
  padding-left: 16px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--run-muted);
}
.field.muted {
  opacity: 0.85;
}

.out-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  min-width: 0;
}
.out-kind {
  width: 28px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--run-faint);
}
.out-row code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: #d4d4d8;
  background: transparent;
}
.link-btn {
  border: 0;
  background: transparent;
  color: var(--run-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.link-btn:hover {
  color: #fff;
  text-decoration: underline;
}

.col-hist :deep(.el-loading-mask),
.col-steps :deep(.el-loading-mask) {
  background: rgba(10, 10, 10, 0.55) !important;
}

@media (max-width: 960px) {
  .log-body {
    grid-template-columns: 160px 1fr;
    grid-template-rows: minmax(0, 1fr) minmax(220px, 40%);
  }
  .col-hist {
    grid-row: 1 / -1;
  }
  .col-steps {
    border-right: 0;
    border-bottom: 1px solid var(--run-line);
  }
}

@media (max-width: 720px) {
  .log-mask {
    padding: 0;
  }
  .log-panel {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    border: 0;
  }
  .log-body {
    grid-template-columns: 1fr;
    grid-template-rows: 110px minmax(0, 1fr) minmax(200px, 38%);
  }
  .col-hist {
    grid-row: auto;
    border-right: 0;
    border-bottom: 1px solid var(--run-line);
  }
  .hist-list {
    display: flex;
    overflow-x: auto;
    padding: 0 0 6px;
  }
  .hist-item {
    min-width: 140px;
  }
  .col-steps {
    border-bottom: 1px solid var(--run-line);
  }
  .head-meta {
    max-width: 100%;
  }
}
</style>
