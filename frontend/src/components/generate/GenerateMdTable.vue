<template>
  <div
    class="md-table-wrap"
    :class="[
      tone === 'dark' ? 'md-table-wrap--dark' : 'md-table-wrap--light',
      colCount >= 5 ? 'is-wide' : 'is-compact',
    ]"
  >
    <div class="md-table-toolbar" role="toolbar" aria-label="表格操作">
      <button
        type="button"
        class="tb-btn"
        :class="{ on: copied }"
        :title="copied ? '已复制' : '复制表格'"
        :aria-label="copied ? '已复制' : '复制表格'"
        @click="onCopy"
      >
        <UiIcon :name="copied ? 'check' : 'copy'" :size="14" />
      </button>
      <button type="button" class="tb-btn" title="下载 CSV" aria-label="下载 CSV" @click="onDownload">
        <UiIcon name="download" :size="14" />
      </button>
    </div>

    <div class="md-table">
      <UiScroll class="md-table-scroll" always :max-height="scrollMaxH">
        <div class="md-table-inner" v-html="safeHtml" />
      </UiScroll>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import DOMPurify from 'dompurify';
import { ElMessage } from 'element-plus';
import UiIcon from '@/components/icons/UiIcon.vue';
import { UiScroll } from '@/components/ui';
import { downloadTextFile } from '@/utils/download';

const props = withDefaults(
  defineProps<{
    html: string;
    tone?: 'light' | 'dark';
  }>(),
  { tone: 'dark' },
);

const safeHtml = computed(() =>
  DOMPurify.sanitize(props.html, {
    ADD_ATTR: ['class', 'colspan', 'rowspan'],
  }),
);

/** 首行单元格数：少列用铺满布局，多列才固定前列 + 横滑 */
const colCount = computed(() => {
  const html = safeHtml.value;
  const row = html.match(/<tr[\s\S]*?<\/tr>/i)?.[0] || '';
  return (row.match(/<t[hd]\b/gi) || []).length;
});

const scrollMaxH = 'min(520px, 62vh)';

const copied = ref(false);
let copiedTimer: number | null = null;

function cellText(el: Element): string {
  return String(el.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function parseRows(): string[][] {
  const wrap = document.createElement('div');
  wrap.innerHTML = safeHtml.value;
  const table = wrap.querySelector('table');
  if (!table) return [];
  const rows: string[][] = [];
  table.querySelectorAll('tr').forEach((tr) => {
    const cells = [...tr.querySelectorAll('th,td')].map(cellText);
    if (cells.length) rows.push(cells);
  });
  return rows;
}

function toTsv(rows: string[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const needsQuote = /[\t\n"]/.test(c);
          const escaped = c.replace(/"/g, '""');
          return needsQuote ? `"${escaped}"` : escaped;
        })
        .join('\t'),
    )
    .join('\n');
}

function toCsv(rows: string[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const escaped = c.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(','),
    )
    .join('\n');
}

async function onCopy() {
  const rows = parseRows();
  if (!rows.length) {
    ElMessage.warning('表格为空');
    return;
  }
  try {
    await navigator.clipboard.writeText(toTsv(rows));
    copied.value = true;
    if (copiedTimer) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
      copiedTimer = null;
    }, 1200);
    ElMessage.success('已复制表格');
  } catch {
    ElMessage.error('复制失败');
  }
}

function onDownload() {
  const rows = parseRows();
  if (!rows.length) {
    ElMessage.warning('表格为空');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadTextFile(`\uFEFF${toCsv(rows)}`, `table-${stamp}.csv`, 'text/csv;charset=utf-8');
  ElMessage.success('已下载 CSV');
}

onUnmounted(() => {
  if (copiedTimer) window.clearTimeout(copiedTimer);
});
</script>

<style scoped>
.md-table-wrap {
  --t-fg: var(--studio-text-strong);
  --t-strong: var(--studio-ink);
  --t-muted: var(--studio-text-faint);
  --t-line: var(--studio-glass-2);
  --t-line-soft: var(--studio-glass);
  --t-bg: #101012;
  --t-row: transparent;
  --t-row-alt: rgba(255, 255, 255, 0.025);
  --t-row-hover: rgba(142, 200, 216, 0.06);
  --t-sticky: #161618;
  --t-sticky-alt: #18181b;
  --t-sticky-head: #1c1c20;
  --t-head-fg: var(--studio-text-strong);
  --t-accent: #8ec8d8;
  --t-shadow: rgba(0, 0, 0, 0.55);
  --t-label: var(--studio-text-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 1em 0 1.25em;
  min-width: 0;
  width: 100%;
}

.md-table-wrap--light {
  --t-fg: #374151;
  --t-strong: #111827;
  --t-muted: #6b7280;
  --t-line: rgba(15, 23, 42, 0.1);
  --t-line-soft: rgba(15, 23, 42, 0.06);
  --t-bg: #fcfcfd;
  --t-row: transparent;
  --t-row-alt: rgba(15, 23, 42, 0.025);
  --t-row-hover: rgba(37, 99, 235, 0.05);
  --t-sticky: #f4f5f7;
  --t-sticky-alt: #eef0f3;
  --t-sticky-head: #e8eaee;
  --t-head-fg: #4b5563;
  --t-accent: #3b82f6;
  --t-shadow: rgba(15, 23, 42, 0.12);
  --t-label: #6b7280;
}

.md-table-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 3px;
  align-self: flex-end;
  border-radius: 10px;
  border: 1px solid var(--t-line);
  background: linear-gradient(180deg, var(--studio-glass), rgba(255, 255, 255, 0.015));
}

.md-table-wrap--light .md-table-toolbar {
  background: linear-gradient(180deg, #fff, #f7f8fa);
}

.tb-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--t-muted);
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.tb-btn:hover {
  background: var(--studio-glass-2);
  color: var(--t-strong);
}

.tb-btn:active {
  transform: scale(0.96);
}

.tb-btn.on {
  color: var(--t-accent);
  background: color-mix(in srgb, var(--t-accent) 14%, transparent);
}

.md-table-wrap--light .tb-btn:hover {
  background: rgba(15, 23, 42, 0.06);
}

.md-table {
  position: relative;
  border: 1px solid var(--t-line);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 48px),
    var(--t-bg);
  overflow: hidden;
  min-width: 0;
  width: 100%;
  box-shadow:
    inset 0 1px 0 var(--studio-glass),
    0 10px 28px -18px var(--t-shadow);
}

.md-table::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--t-accent) 45%, transparent) 18%,
    color-mix(in srgb, var(--t-accent) 18%, transparent) 62%,
    transparent 100%
  );
  opacity: 0.85;
  pointer-events: none;
  z-index: 6;
}

.md-table-wrap--light .md-table {
  background: linear-gradient(180deg, #fff, var(--t-bg));
  box-shadow:
    inset 0 1px 0 var(--studio-text-strong),
    0 12px 28px -20px var(--t-shadow);
}

.md-table-scroll {
  height: auto !important;
  width: 100%;
}

.md-table-scroll :deep(.el-scrollbar) {
  height: auto;
}

.md-table-scroll :deep(.el-scrollbar__wrap) {
  max-height: min(520px, 62vh);
  overflow-x: auto !important;
}

/* —— 少列表（类别/内容）：铺满内容区 —— */
.is-compact .md-table-scroll :deep(.el-scrollbar__view) {
  display: block;
  width: 100%;
  min-width: 100%;
}

.is-compact .md-table-inner {
  width: 100%;
  min-width: 100%;
}

.is-compact .md-table-inner :deep(table) {
  width: 100%;
  min-width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--t-fg);
}

.is-compact .md-table-inner :deep(th),
.is-compact .md-table-inner :deep(td) {
  border-bottom: 1px solid var(--t-line-soft);
  border-right: 1px solid var(--t-line-soft);
  padding: 0.85em 1.05em;
  text-align: left;
  vertical-align: top;
  max-width: none;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--t-row);
  transition: background 0.14s ease;
}

.is-compact .md-table-inner :deep(th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--t-sticky-head) !important;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: var(--t-head-fg);
  white-space: nowrap;
  border-bottom: 1px solid var(--t-line);
}

/* 标签列：可读宽度，左对齐，不强制竖排 */
.is-compact .md-table-inner :deep(th:first-child),
.is-compact .md-table-inner :deep(td:first-child) {
  width: 7.5em;
  min-width: 7.5em;
  max-width: 9.5em;
  white-space: nowrap;
  font-weight: 600;
  color: var(--t-strong);
  background: var(--t-sticky);
  border-right: 1px solid var(--t-line);
}

.is-compact .md-table-inner :deep(th:first-child) {
  background: var(--t-sticky-head) !important;
  color: var(--t-head-fg);
}

.is-compact .md-table-inner :deep(td:last-child),
.is-compact .md-table-inner :deep(th:last-child) {
  width: auto;
  border-right: none;
}

.is-compact .md-table-inner :deep(tbody tr:nth-child(even) td) {
  background: var(--t-row-alt);
}

.is-compact .md-table-inner :deep(tbody tr:nth-child(even) td:first-child) {
  background: var(--t-sticky-alt);
}

.is-compact .md-table-inner :deep(tbody tr:hover td) {
  background: var(--t-row-hover);
}

.is-compact .md-table-inner :deep(tbody tr:hover td:first-child) {
  background: color-mix(in srgb, var(--t-row-hover) 65%, var(--t-sticky));
}

.is-compact .md-table-inner :deep(tr:last-child td) {
  border-bottom: none;
}

/* —— 多列表（分镜等）：横滑 + 固定前两列 —— */
.is-wide .md-table-scroll :deep(.el-scrollbar__view) {
  display: block;
  min-width: 100%;
  width: max-content;
}

.is-wide .md-table-inner {
  min-width: 100%;
  width: max-content;
}

.is-wide .md-table-inner :deep(table) {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--t-fg);
  font-variant-numeric: tabular-nums;
}

.is-wide .md-table-inner :deep(th),
.is-wide .md-table-inner :deep(td) {
  border-bottom: 1px solid var(--t-line-soft);
  border-right: 1px solid var(--t-line-soft);
  padding: 0.72em 0.9em;
  text-align: left;
  vertical-align: top;
  max-width: 280px;
  min-width: 88px;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--t-row);
  transition: background 0.14s ease;
}

.is-wide .md-table-inner :deep(tbody tr:nth-child(even) td) {
  background: var(--t-row-alt);
}

.is-wide .md-table-inner :deep(tbody tr:hover td) {
  background: var(--t-row-hover);
}

.is-wide .md-table-inner :deep(th) {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--t-sticky-head) !important;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: var(--t-head-fg);
  white-space: nowrap;
  max-width: none;
  border-bottom: 1px solid var(--t-line);
  box-shadow: 0 1px 0 var(--t-line);
}

.is-wide .md-table-inner :deep(th:nth-child(1)),
.is-wide .md-table-inner :deep(td:nth-child(1)) {
  position: sticky;
  left: 0;
  z-index: 2;
  min-width: 58px;
  max-width: 72px;
  width: 58px;
  text-align: center;
  font-weight: 600;
  color: var(--t-strong);
  background: var(--t-sticky);
  box-shadow: 1px 0 0 var(--t-line);
}

.is-wide .md-table-inner :deep(tbody tr:nth-child(even) td:nth-child(1)) {
  background: var(--t-sticky-alt);
}

.is-wide .md-table-inner :deep(th:nth-child(1)) {
  z-index: 5;
  background: var(--t-sticky-head) !important;
  color: var(--t-head-fg);
}

.is-wide .md-table-inner :deep(th:nth-child(2)),
.is-wide .md-table-inner :deep(td:nth-child(2)) {
  position: sticky;
  left: 58px;
  z-index: 2;
  min-width: 72px;
  max-width: 120px;
  background: var(--t-sticky);
  box-shadow: 6px 0 14px -10px var(--t-shadow);
}

.is-wide .md-table-inner :deep(tbody tr:nth-child(even) td:nth-child(2)) {
  background: var(--t-sticky-alt);
}

.is-wide .md-table-inner :deep(tbody tr:hover td:nth-child(1)),
.is-wide .md-table-inner :deep(tbody tr:hover td:nth-child(2)) {
  background: color-mix(in srgb, var(--t-row-hover) 70%, var(--t-sticky));
}

.is-wide .md-table-inner :deep(th:nth-child(2)) {
  z-index: 5;
  background: var(--t-sticky-head) !important;
}

.is-wide .md-table-inner :deep(tr:last-child td) {
  border-bottom: none;
}

.is-wide .md-table-inner :deep(th:last-child),
.is-wide .md-table-inner :deep(td:last-child) {
  border-right: none;
}
</style>
