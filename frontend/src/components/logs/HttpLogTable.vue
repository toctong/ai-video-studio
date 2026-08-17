<template>
  <div class="http-logs">
    <div class="toolbar">
      <div class="filters">
        <el-select
          v-model="method"
          placeholder="方法"
          class="f-method"
          effect="dark"
          popper-class="http-logs-popper"
          @change="reload"
        >
          <el-option label="全部" value="all" />
          <el-option v-for="m in methods" :key="m" :label="m" :value="m" />
        </el-select>
        <el-select
          v-model="status"
          placeholder="状态"
          class="f-status"
          effect="dark"
          popper-class="http-logs-popper"
          @change="reload"
        >
          <el-option label="全部" value="all" />
          <el-option label="2xx" value="2xx" />
          <el-option label="4xx" value="4xx" />
          <el-option label="5xx" value="5xx" />
        </el-select>
        <el-input
          v-model="keyword"
          clearable
          placeholder="路径 / requestId"
          class="f-q"
          @keyup.enter="reload"
          @clear="reload"
        >
          <template #prefix>
            <UiIcon name="search" :size="14" />
          </template>
        </el-input>
        <button type="button" class="tool-btn" title="刷新" :disabled="loading" @click="reload">
          <UiIcon name="refresh" :size="15" />
        </button>
      </div>
      <div class="meta">
        <label class="follow">
          <input v-model="follow" type="checkbox" />
          <span>跟随</span>
        </label>
        <span class="count">{{ rows.length }} 条</span>
        <span class="live" :class="{ on: streaming }">{{ streaming ? 'LIVE' : 'IDLE' }}</span>
      </div>
    </div>

    <div class="table-wrap" v-loading="loading && !rows.length">
      <el-table
        :data="displayRows"
        height="100%"
        class="http-table"
        row-key="id"
        highlight-current-row
        empty-text="暂无接口调用记录，操作应用后会出现在这里"
        @row-click="onRowClick"
      >
        <el-table-column label="时间" width="108">
          <template #default="{ row }">
            <span class="mono muted">{{ formatTime(row.ts) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方法" width="78">
          <template #default="{ row }">
            <span class="method" :class="row.method.toLowerCase()">{{ row.method }}</span>
          </template>
        </el-table-column>
        <el-table-column label="路径" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="mono path">{{ row.path }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="76" align="center">
          <template #default="{ row }">
            <span class="status" :class="statusClass(row.statusCode)">{{ row.statusCode }}</span>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="80" align="right">
          <template #default="{ row }">
            <span class="mono muted">{{ row.durationMs }}ms</span>
          </template>
        </el-table-column>
        <el-table-column label="Request ID" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <button type="button" class="rid" title="复制 requestId" @click.stop="copyRid(row)">
              {{ row.requestId }}
            </button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer
      v-model="drawerOpen"
      size="760px"
      direction="rtl"
      :with-header="false"
      class="http-log-drawer"
      append-to-body
      destroy-on-close
    >
      <div v-if="active" class="drawer-body">
        <header class="drawer-head">
          <div class="dh-main">
            <span class="method" :class="active.method.toLowerCase()">{{ active.method }}</span>
            <strong class="dh-path">{{ active.path }}</strong>
          </div>
          <button type="button" class="icon-btn" title="关闭" @click="drawerOpen = false">
            <UiIcon name="x" :size="15" />
          </button>
        </header>

        <div class="chip-row">
          <span class="status" :class="statusClass(active.statusCode)">{{ active.statusCode }}</span>
          <span class="chip">{{ active.durationMs }}ms</span>
          <span class="chip mono">{{ formatFullTime(active.ts) }}</span>
        </div>

        <section class="block">
          <div class="block-title">
            <span>Request ID</span>
            <button type="button" class="link-btn" @click="copyRid(active)">复制</button>
          </div>
          <pre class="code">{{ active.requestId }}</pre>
        </section>

        <section class="block">
          <div class="block-title">
            <span>Query</span>
            <button type="button" class="link-btn" @click="copyJson(active.query)">复制</button>
          </div>
          <JsonEditorPane
            :key="`query-${active.id}-${drawerOpen}`"
            :model-value="active.query ?? {}"
            read-only
            mode="tree"
            :min-height="180"
          />
        </section>

        <section class="block">
          <div class="block-title">
            <span>Request Body</span>
            <button type="button" class="link-btn" @click="copyJson(active.requestBody)">复制</button>
          </div>
          <JsonEditorPane
            :key="`req-${active.id}-${drawerOpen}`"
            :model-value="active.requestBody ?? null"
            read-only
            mode="tree"
            :min-height="220"
          />
        </section>

        <section class="block">
          <div class="block-title">
            <span>Response</span>
            <button type="button" class="link-btn" @click="copyJson(active.responseBody)">复制</button>
          </div>
          <JsonEditorPane
            :key="`res-${active.id}-${drawerOpen}`"
            :model-value="active.responseBody ?? null"
            read-only
            mode="tree"
            :min-height="260"
          />
        </section>

        <section v-if="active.errorMessage" class="block">
          <div class="block-title">
            <span>Error</span>
            <button type="button" class="link-btn" @click="copyJson({ error: active.errorMessage })">
              复制
            </button>
          </div>
          <JsonEditorPane
            :key="`err-${active.id}-${drawerOpen}`"
            :model-value="{ error: active.errorMessage }"
            read-only
            mode="tree"
            :min-height="160"
          />
        </section>

        <section class="block meta-block">
          <div>userId: {{ active.userId ?? '—' }}</div>
          <div>projectId: {{ active.projectId || '—' }}</div>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import UiIcon from '@/components/icons/UiIcon.vue';
import JsonEditorPane from '@/components/logs/JsonEditorPane.vue';
import {
  fetchHttpLogs,
  watchHttpLogs,
  type HttpLogEntry,
} from '@/api/logs';

const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'RUN'] as const;

const loading = ref(false);
const streaming = ref(false);
const follow = ref(true);
const method = ref('all');
const status = ref('all');
const keyword = ref('');
const rows = ref<HttpLogEntry[]>([]);
const drawerOpen = ref(false);
const active = ref<HttpLogEntry | null>(null);

let stopWatch: (() => void) | null = null;
let latestId = 0;

const displayRows = computed(() => [...rows.value].reverse());

function formatTime(ts: number) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatFullTime(ts: number) {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

function statusClass(code: number) {
  if (code >= 500) return 's5';
  if (code >= 400) return 's4';
  if (code >= 300) return 's3';
  if (code >= 200) return 's2';
  return '';
}

/** 统一格式化为可读 JSON 文本（字符串会尝试 parse 后再 pretty） */
function toJsonText(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === '') return '""';
  let data: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      trimmed === 'null' ||
      trimmed === 'true' ||
      trimmed === 'false' ||
      /^-?\d+(\.\d+)?$/.test(trimmed)
    ) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        data = value;
      }
    }
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return JSON.stringify(String(value));
  }
}

async function copyJson(value: unknown) {
  const text = toJsonText(value);
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制 JSON');
  } catch {
    ElMessage.error('复制失败');
  }
}

function matchesFilters(entry: HttpLogEntry) {
  if (method.value && method.value !== 'all' && entry.method !== method.value) return false;
  if (status.value === '2xx' && !(entry.statusCode >= 200 && entry.statusCode < 300)) return false;
  if (status.value === '4xx' && !(entry.statusCode >= 400 && entry.statusCode < 500)) return false;
  if (status.value === '5xx' && !(entry.statusCode >= 500)) return false;
  const q = keyword.value.trim().toLowerCase();
  if (!q) return true;
  if (entry.path.toLowerCase().includes(q) || entry.requestId.toLowerCase().includes(q)) {
    return true;
  }
  try {
    const blob = JSON.stringify({
      query: entry.query,
      requestBody: entry.requestBody,
      responseBody: entry.responseBody,
      errorMessage: entry.errorMessage,
    }).toLowerCase();
    return blob.includes(q);
  } catch {
    return false;
  }
}

function mergeRows(list: HttpLogEntry[]) {
  if (!list.length) return;
  const map = new Map(rows.value.map((r) => [r.id, r]));
  for (const row of list) map.set(row.id, row);
  const next = [...map.values()].sort((a, b) => a.id - b.id);
  if (next.length > 1500) next.splice(0, next.length - 1500);
  rows.value = next;
  latestId = next.length ? next[next.length - 1].id : 0;
}

function startStream() {
  stopStream();
  if (!follow.value) return;
  streaming.value = true;
  // 已有列表时只追增量；空列表时拉全量快照
  const sinceId = rows.value.length ? latestId || undefined : undefined;
  stopWatch = watchHttpLogs(
    {
      onSnapshot: (entries) => {
        // 增量连接常返回空 snapshot，绝不能清空已有 REST 结果
        if (!entries.length) return;
        mergeRows(entries.filter(matchesFilters));
      },
      onLog: (entry) => {
        if (!matchesFilters(entry)) return;
        mergeRows([entry]);
      },
      onError: () => {
        streaming.value = false;
      },
    },
    { sinceId },
  );
}

function stopStream() {
  stopWatch?.();
  stopWatch = null;
  streaming.value = false;
}

async function reload() {
  loading.value = true;
  try {
    const data = await fetchHttpLogs({
      limit: 1500,
      method: method.value && method.value !== 'all' ? method.value : undefined,
      status: status.value && status.value !== 'all' ? status.value : undefined,
      q: keyword.value.trim() || undefined,
    });
    rows.value = data.entries || [];
    latestId = data.latestId || (rows.value.at(-1)?.id ?? 0);
    if (follow.value) startStream();
    else stopStream();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载接口日志失败');
  } finally {
    loading.value = false;
  }
}

function onRowClick(row: HttpLogEntry) {
  active.value = row;
  drawerOpen.value = true;
}

async function copyRid(row: HttpLogEntry | null) {
  if (!row?.requestId) return;
  try {
    await navigator.clipboard.writeText(row.requestId);
    ElMessage.success('已复制 requestId');
  } catch {
    ElMessage.error('复制失败');
  }
}

watch(follow, (on) => {
  if (on) {
    // 列表被清空过时，重新走完整拉取，避免只连空增量流
    if (!rows.value.length) void reload();
    else startStream();
  } else {
    stopStream();
  }
});

onMounted(() => {
  void reload();
});

onUnmounted(() => {
  stopStream();
});
</script>

<style scoped>
.http-logs {
  /* 强制深色 Element，避免浅色主题把输入框/表格打成白底 */
  --el-bg-color: var(--studio-panel);
  --el-bg-color-overlay: var(--studio-panel);
  --el-fill-color-blank: var(--studio-panel);
  --el-fill-color-light: var(--studio-panel-3);
  --el-text-color-primary: var(--studio-ink);
  --el-text-color-regular: var(--studio-text);
  --el-text-color-secondary: var(--studio-muted);
  --el-text-color-placeholder: var(--studio-faint);
  --el-border-color: var(--studio-line-strong);
  --el-border-color-hover: var(--studio-line-bright);
  --el-input-bg-color: var(--studio-panel);
  --el-input-text-color: var(--studio-ink);
  --el-input-border-color: var(--studio-line-strong);
  --el-color-primary: var(--studio-text);
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--studio-ink);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.f-method {
  width: 110px;
}
.f-status {
  width: 100px;
}
.f-q {
  width: min(280px, 42vw);
}

.filters :deep(.el-input__wrapper),
.filters :deep(.el-select__wrapper) {
  background: var(--studio-panel) !important;
  box-shadow: 0 0 0 1px var(--studio-line-strong) inset !important;
}
.filters :deep(.el-input__inner),
.filters :deep(.el-select__placeholder),
.filters :deep(.el-select__selected-item) {
  color: var(--studio-ink) !important;
}
.filters :deep(.el-select__caret) {
  color: var(--studio-muted);
}

.tool-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--studio-line-strong);
  border-radius: 10px;
  background: var(--studio-panel);
  color: var(--studio-muted);
  cursor: pointer;
}
.tool-btn:hover {
  background: var(--studio-panel-3);
  color: var(--studio-ink);
  border-color: var(--studio-line-bright);
}
.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: var(--studio-faint);
  font-size: 12px;
}

.follow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  user-select: none;
  color: var(--studio-muted);
}
.follow input {
  accent-color: var(--studio-muted);
}

.live.on {
  color: #86efac;
}

.table-wrap {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--studio-line-strong);
  border-radius: 16px;
  overflow: hidden;
  background: var(--studio-panel);
}

.http-table {
  --el-table-bg-color: var(--studio-panel);
  --el-table-tr-bg-color: var(--studio-panel);
  --el-table-header-bg-color: var(--studio-panel);
  --el-table-row-hover-bg-color: var(--studio-panel-3);
  --el-table-text-color: var(--studio-text);
  --el-table-header-text-color: var(--studio-muted);
  --el-table-border-color: var(--studio-line-strong);
  --el-table-current-row-bg-color: var(--studio-panel-3);
  --el-fill-color-lighter: var(--studio-panel-3);
  --el-fill-color-light: var(--studio-panel-3);
  --el-bg-color: var(--studio-panel);
  background: var(--studio-panel);
  cursor: pointer;
}
.http-table :deep(.el-table__inner-wrapper::before) {
  background-color: var(--studio-line-strong);
}
.http-table :deep(.el-table__empty-text) {
  color: var(--studio-faint);
}
.http-table :deep(th.el-table__cell) {
  background-color: var(--studio-panel) !important;
  border-bottom-color: var(--studio-line-strong) !important;
}
.http-table :deep(td.el-table__cell) {
  background-color: var(--studio-panel) !important;
  border-bottom-color: var(--studio-line-strong) !important;
}
/* 强制深色 hover / 当前行，避免浅色主题打成白底 */
.http-table :deep(.el-table__body tr:hover > td.el-table__cell),
.http-table :deep(.el-table__body tr.hover-row > td.el-table__cell),
.http-table :deep(.el-table__body tr.el-table__row:hover > td.el-table__cell) {
  background-color: var(--studio-panel-3) !important;
}
.http-table :deep(.el-table__body tr.current-row > td.el-table__cell) {
  background-color: var(--studio-panel-3) !important;
}

.mono {
  font-family: Consolas, 'Cascadia Mono', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
}
.muted {
  color: var(--studio-faint);
}
.path {
  color: var(--studio-text);
}

.method {
  display: inline-block;
  min-width: 52px;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  background: var(--studio-panel-3);
  color: var(--studio-muted);
}
.method.get {
  color: #86efac;
  background: rgba(134, 239, 172, 0.1);
}
.method.post {
  color: #93c5fd;
  background: rgba(147, 197, 253, 0.1);
}
.method.put,
.method.patch {
  color: #fcd34d;
  background: rgba(252, 211, 77, 0.1);
}
.method.run {
  color: #f9a8d4;
  background: rgba(249, 168, 212, 0.12);
}

.status {
  font-family: Consolas, ui-monospace, monospace;
  font-size: 12px;
  font-weight: 650;
}
.status.s2 {
  color: #86efac;
}
.status.s3 {
  color: #fcd34d;
}
.status.s4 {
  color: #fbbf24;
}
.status.s5 {
  color: #fca5a5;
}

.rid {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font-family: Consolas, ui-monospace, monospace;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.rid:hover {
  color: #fff;
  text-decoration: underline;
}

.drawer-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  color: var(--studio-text);
  background: var(--studio-panel);
  overflow: auto;
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.dh-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.dh-path {
  font-size: 14px;
  font-weight: 650;
  word-break: break-all;
  color: var(--studio-ink);
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1px solid var(--studio-line-strong);
  background: transparent;
  color: var(--studio-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.icon-btn:hover {
  background: var(--studio-panel-3);
  color: #fff;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--studio-panel-3);
  color: var(--studio-muted);
  font-size: 12px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.block-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--studio-faint);
}
.link-btn {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  cursor: pointer;
  font-size: 12px;
}
.link-btn:hover {
  color: #fff;
}

.code {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--studio-bg);
  border: 1px solid var(--studio-line-strong);
  color: var(--studio-text);
  font-family: Consolas, 'Cascadia Mono', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow: auto;
  tab-size: 2;
}
.code.err {
  color: #fca5a5;
}

.meta-block {
  font-size: 12px;
  color: var(--studio-faint);
  gap: 4px;
}
</style>

<style>
.http-log-drawer.el-drawer {
  background: var(--studio-panel) !important;
}
.http-log-drawer .el-drawer__body {
  padding: 0;
  height: 100%;
  background: var(--studio-panel);
}

/* Element Plus Select 弹层挂到 body，必须整层强制深色（含内层 dropdown） */
.http-logs-popper.el-popper,
.http-logs-popper.el-select__popper {
  --el-bg-color: var(--studio-panel);
  --el-bg-color-overlay: var(--studio-panel);
  --el-fill-color-blank: var(--studio-panel);
  --el-fill-color-light: var(--studio-panel-3);
  --el-text-color-primary: var(--studio-ink);
  --el-text-color-regular: var(--studio-text);
  --el-text-color-secondary: var(--studio-muted);
  --el-border-color: var(--studio-line-strong);
  --el-color-primary: var(--studio-ink);
  background: var(--studio-panel) !important;
  border: 1px solid var(--studio-line-strong) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45) !important;
  border-radius: 12px !important;
  overflow: hidden;
  padding: 4px !important;
}
.http-logs-popper .el-select-dropdown,
.http-logs-popper.el-popper .el-select-dropdown,
.http-logs-popper .el-scrollbar,
.http-logs-popper .el-select-dropdown__wrap,
.http-logs-popper .el-select-dropdown__list {
  background: var(--studio-panel) !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
}
.http-logs-popper .el-select-dropdown__item {
  color: var(--studio-text) !important;
  background: transparent !important;
  border-radius: 8px;
  margin: 1px 0;
  height: auto !important;
  min-height: 34px;
  padding: 8px 12px !important;
  font-weight: 550;
}
.http-logs-popper .el-select-dropdown__item.is-hovering,
.http-logs-popper .el-select-dropdown__item:hover {
  background: var(--studio-panel-3) !important;
  color: var(--studio-ink) !important;
}
.http-logs-popper .el-select-dropdown__item.is-selected {
  color: #fff !important;
  font-weight: 650;
  background: var(--studio-panel-3) !important;
}
.http-logs-popper .el-popper__arrow::before {
  background: var(--studio-panel) !important;
  border: 1px solid var(--studio-line-strong) !important;
}
</style>
