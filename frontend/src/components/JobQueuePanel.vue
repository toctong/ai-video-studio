<template>
  <div class="job-queue" :class="{ 'job-queue--compact': compact }" ref="rootEl">
    <button
      type="button"
      class="job-trigger"
      :class="{ on: open, warn: redisWarn, ok: redisOk }"
      title="任务队列"
      aria-label="任务队列"
      @click="toggle"
    >
      <UiIcon name="list-todo" :size="16" />
      <span v-if="liveCount > 0" class="job-badge">{{ liveCount > 99 ? '99+' : liveCount }}</span>
    </button>

    <div v-if="open" class="job-pop" role="dialog" aria-label="任务队列">
      <div class="pop-head">
        <div class="pop-title">
          <strong>任务队列</strong>
          <span class="mode-pill" :class="modeClass">{{ modeLabel }}</span>
        </div>
        <div class="pop-actions">
          <button
            type="button"
            class="icon-btn"
            title="清空已结束"
            :disabled="loading || clearing"
            @click="onClear"
          >
            <UiIcon name="trash" :size="14" />
          </button>
          <button type="button" class="icon-btn" title="刷新" :disabled="loading" @click="() => refresh()">
            <UiIcon name="refresh" :size="14" />
          </button>
        </div>
      </div>

      <div class="status-card" :class="modeClass">
        <p class="status-summary">{{ health?.jobs?.summary || '加载中…' }}</p>
        <div class="status-meta">
          <span>并发 {{ health?.jobs?.concurrency ?? '—' }}</span>
          <span v-if="health?.jobs?.redisConfigured">
            Redis {{ health.jobs.redisConnected ? '已连接' : '未连通' }}
          </span>
          <span v-else>未使用 Redis</span>
        </div>
        <p v-if="health?.jobs?.redisTarget && health.jobs.redisConfigured" class="status-target">
          {{ health.jobs.redisTarget }}
        </p>
        <p v-if="health?.jobs?.lastError" class="status-err">{{ health.jobs.lastError }}</p>
      </div>

      <div class="list-head">
        <span>最近任务</span>
        <span class="muted">{{ rows.length }} 条</span>
      </div>

      <div class="list-scroll">
        <UiScroll :max-height="320">
          <div v-if="loading && !rows.length" class="empty">加载中…</div>
          <div v-else-if="!rows.length" class="empty">暂无任务</div>
          <ul v-else class="job-list">
            <li v-for="j in rows" :key="j.id" class="job-row">
              <span class="st" :class="j.status">{{ statusLabel(j.status) }}</span>
              <div class="job-text">
                <strong>
                  <span v-if="isGenerateJob(j)" class="src-tag">生成</span>
                  {{ jobTitle(j) }}
                </strong>
                <em>{{ j.message || j.error || '—' }}</em>
              </div>
              <time>{{ formatTime(j.updatedAt || j.createdAt) }}</time>
            </li>
          </ul>
        </UiScroll>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import UiIcon from '@/components/icons/UiIcon.vue';
import { UiScroll } from '@/components/ui';
import {
  clearFinishedJobs,
  fetchJobQueueHealth,
  fetchJobs,
  onJobsChanged,
  type JobQueueHealth,
  type JobRunRow,
} from '@/api/jobs';
import { useAuthStore } from '@/stores/auth';

withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  { compact: false },
);

const auth = useAuthStore();
const open = ref(false);
const loading = ref(false);
const clearing = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const health = ref<JobQueueHealth | null>(null);
const rows = ref<JobRunRow[]>([]);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let stopJobsListener: (() => void) | null = null;
const seenStatus = new Map<string, string>();
let statusPrimed = false;

const liveCount = computed(
  () => rows.value.filter((j) => j.status === 'queued' || j.status === 'active').length,
);

const redisOk = computed(
  () => health.value?.jobs?.mode === 'bullmq' && health.value?.jobs?.redisConnected === true,
);
const redisWarn = computed(
  () =>
    Boolean(health.value?.jobs?.redisConfigured) && health.value?.jobs?.redisConnected !== true,
);

const modeLabel = computed(() => {
  const m = health.value?.jobs?.mode;
  if (m === 'bullmq') return 'Redis 队列';
  if (m === 'in-process') return '进程内';
  return '—';
});

const modeClass = computed(() => {
  if (redisOk.value) return 'ok';
  if (redisWarn.value) return 'warn';
  return 'muted';
});

function statusLabel(status: string) {
  const map: Record<string, string> = {
    queued: '排队',
    active: '执行中',
    completed: '完成',
    failed: '失败',
    cancelled: '已取消',
  };
  return map[status] || status;
}

function isAgentGenerateJob(j: JobRunRow) {
  const via = String(j.payload?.via || '').trim();
  if (via === 'agent') return true;
  if (j.payload?.agentRouted === true || j.payload?.agentConfirmed === true) return true;
  return false;
}

function isGenerateJob(j: JobRunRow) {
  if (isAgentGenerateJob(j)) return false;
  return (
    j.kind === 'studio_generate_image' ||
    j.kind === 'studio_generate_video' ||
    String(j.payload?.source || '') === 'generate'
  );
}

function jobTitle(j: JobRunRow) {
  const label = String(j.payload?.label || j.payload?.name || '').trim();
  if (label) return label;
  const kindMap: Record<string, string> = {
    workflow_run: '工作流运行',
    cover_generate: '封面生成',
    studio_generate_image: '生成页出图',
    studio_generate_video: '生成页出视频',
    script_generate: '脚本生成',
    chapter_generate: '章节生成',
    chapter_deai: '章节去 AI 味',
    timeline_export: '时间轴导出',
  };
  return kindMap[j.kind] || j.kind || '任务';
}

function formatTime(raw: string) {
  const t = Date.parse(raw);
  if (!t) return '';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function refresh(opts?: { quiet?: boolean }) {
  if (!auth.isAuthenticated) {
    health.value = null;
    rows.value = [];
    return;
  }
  if (!opts?.quiet) loading.value = true;
  try {
    const [h, list] = await Promise.all([fetchJobQueueHealth(), fetchJobs()]);
    health.value = h;
    // Agent 对话触发的出图/出视频不进顶栏队列，只展示图片/视频模式直出及其它任务
    const next = list.filter((j) => !isAgentGenerateJob(j)).slice(0, 40);
    notifyStatusChanges(next);
    rows.value = next;
  } catch (e: any) {
    if (!opts?.quiet) ElMessage.error(e?.message || '加载任务队列失败');
  } finally {
    if (!opts?.quiet) loading.value = false;
  }
}

function notifyStatusChanges(list: JobRunRow[]) {
  const prefs = auth.user?.notifyPrefs;
  for (const j of list) {
    const prev = seenStatus.get(j.id);
    seenStatus.set(j.id, j.status);
    if (!statusPrimed || !prev || prev === j.status) continue;
    if (j.status === 'completed' && prefs?.jobDone !== false) {
      ElMessage.success(`${jobTitle(j)} 已完成`);
    } else if (j.status === 'failed' && prefs?.jobFail !== false) {
      ElMessage.error(`${jobTitle(j)} 失败${j.error ? `：${j.error}` : ''}`);
    }
  }
  statusPrimed = true;
}

async function onClear() {
  const finished = rows.value.filter((j) =>
    ['completed', 'failed', 'cancelled'].includes(j.status),
  ).length;
  if (!finished) {
    ElMessage.info('没有可清空的已结束任务');
    return;
  }
  try {
    await ElMessageBox.confirm(`将删除 ${finished} 条已结束任务（完成/失败/已取消），不影响进行中。`, '清空最近任务', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  clearing.value = true;
  try {
    const r = await clearFinishedJobs();
    ElMessage.success(r.count ? `已清空 ${r.count} 条` : '已清空');
    await refresh();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '清空失败');
  } finally {
    clearing.value = false;
  }
}

function startPoll() {
  stopPoll();
  if (!auth.isAuthenticated) return;
  pollTimer = setInterval(() => {
    void refresh({ quiet: true });
  }, open.value ? 3000 : 5000);
}

function stopPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function toggle() {
  open.value = !open.value;
  if (open.value) void refresh();
  startPoll();
}

function onDocClick(e: MouseEvent) {
  if (!open.value || !rootEl.value) return;
  if (!rootEl.value.contains(e.target as Node)) {
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onDocClick);
  stopJobsListener = onJobsChanged(() => {
    if (!auth.isAuthenticated) return;
    void refresh({ quiet: true });
  });
  if (auth.isAuthenticated) {
    void refresh({ quiet: true }).finally(() => startPoll());
  }
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocClick);
  stopPoll();
  stopJobsListener?.();
  stopJobsListener = null;
});
</script>

<style scoped>
.job-queue {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 36px;
}
.job-queue--compact {
  width: 100%;
  height: auto;
  justify-content: center;
}
.job-queue--compact .job-pop {
  top: auto;
  bottom: calc(100% + 10px);
  left: calc(100% + 10px);
  right: auto;
}

.job-trigger {
  position: relative;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.job-trigger:hover,
.job-trigger.on {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}
.job-trigger.ok {
  color: #86efac;
}
.job-trigger.warn {
  color: #fbbf24;
}

.job-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--studio-ink);
  color: var(--studio-bg);
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.job-pop {
  position: absolute;
  top: calc(100% + 8px);
  right: -40px;
  z-index: 80;
  width: min(340px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  padding: 12px 8px 8px;
  border-radius: 18px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line-strong);
  box-shadow: var(--studio-shadow);
  color: var(--studio-ink);
}

.pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 10px;
  flex-shrink: 0;
}
.pop-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.pop-title strong {
  font-size: 14px;
  font-weight: 650;
  color: var(--studio-ink);
}
.mode-pill {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--studio-panel-3);
  color: var(--studio-muted);
}
.mode-pill.ok {
  background: rgba(134, 239, 172, 0.12);
  color: #86efac;
}
.mode-pill.warn {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
}

.pop-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.icon-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-faint);
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}
.icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.status-card {
  margin: 0 4px 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-line-strong);
  flex-shrink: 0;
}
.status-card.ok {
  border-color: rgba(134, 239, 172, 0.22);
  background: rgba(134, 239, 172, 0.06);
}
.status-card.warn {
  border-color: rgba(251, 191, 36, 0.22);
  background: rgba(251, 191, 36, 0.06);
}
.status-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--studio-text);
  font-weight: 500;
}
.status-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--studio-faint);
}
.status-target {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--studio-muted);
  word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.status-err {
  margin: 6px 0 0;
  font-size: 12px;
  color: #fca5a5;
  word-break: break-word;
}

.list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 10px 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--studio-muted);
  flex-shrink: 0;
}
.list-head .muted {
  color: var(--studio-muted);
  font-weight: 400;
}

.list-scroll {
  min-height: 0;
  margin: 0 0 2px;
}
.list-scroll :deep(.ui-scroll) {
  height: auto;
}

.empty {
  padding: 28px 8px;
  text-align: center;
  font-size: 13px;
  color: var(--studio-faint);
}

.job-list {
  list-style: none;
  margin: 0;
  padding: 0 4px 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.job-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: start;
  padding: 8px 10px;
  border-radius: 12px;
  background: transparent;
  transition: background 0.12s ease;
}
.job-row:hover {
  background: var(--studio-glass);
}
.st {
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 11px;
  font-weight: 560;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--studio-panel-3);
  color: var(--studio-muted);
}
.st.active,
.st.queued {
  background: rgba(125, 211, 252, 0.12);
  color: #7dd3fc;
}
.st.completed {
  background: rgba(134, 239, 172, 0.12);
  color: #86efac;
}
.st.failed {
  background: rgba(248, 113, 113, 0.12);
  color: #fca5a5;
}
.st.cancelled {
  color: var(--studio-faint);
}
.job-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.job-text strong {
  font-size: 13px;
  font-weight: 560;
  color: var(--studio-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.src-tag {
  display: inline-block;
  margin-right: 6px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--studio-glass-2);
  color: var(--studio-muted);
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  vertical-align: 1px;
}
.job-text em {
  font-style: normal;
  font-size: 11px;
  color: var(--studio-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-row time {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 11px;
  color: var(--studio-muted);
  white-space: nowrap;
}
</style>
