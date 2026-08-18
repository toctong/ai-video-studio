<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { renderMarkdown, type MdTocItem } from '@/utils/markdown';
import { UiScroll } from '@/components/ui';

const props = withDefaults(
  defineProps<{
    content: string;
    title?: string;
    hideToc?: boolean;
    /** 对齐章节页：无卡片边框，左侧朴素目录 */
    workspace?: boolean;
  }>(),
  {
    title: '',
    hideToc: false,
    workspace: false,
  },
);

const activeId = ref('');
const readerScrollRef = ref<{ wrapEl: () => HTMLElement | undefined; setScrollTop: (n: number) => void } | null>(null);
/** 点击目录跳转时短暂锁定，避免 smooth scroll 过程中 spy 抢选中 */
let spyLockedUntil = 0;
let unlockTimer: ReturnType<typeof setTimeout> | null = null;

const rendered = computed(() => renderMarkdown(props.content || ''));
const html = computed(() => rendered.value.html);

/** 目录只保留主要小节，避免正文行误入导致挤爆侧栏 */
const toc = computed<MdTocItem[]>(() => {
  const all = rendered.value.toc;
  const major = all.filter((item) => {
    const t = item.text.trim();
    if (item.level <= 2) return true;
    if (/^[0-9]{1,2}\s*[)）、.．]/.test(t)) return true;
    if (/^[一二三四五六七八九十]+[、.．]/.test(t)) return true;
    if (/^第.+[章节卷部篇]/.test(t)) return true;
    return false;
  });
  const list = (major.length ? major : all).slice(0, 36);
  return list.map((item) => ({
    ...item,
    text: shortTocLabel(item.text),
  }));
});

function shortTocLabel(text: string) {
  let t = String(text || '').replace(/^#+\s*/, '').trim();
  t = t.split(/[：:]/)[0]?.trim() || t;
  // 「1) 书名 (备选)」→「1) 书名」
  t = t.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim() || t;
  if (t.length > 16) t = `${t.slice(0, 16)}…`;
  return t;
}

/** 标题相对滚动容器的真实偏移（offsetTop 在嵌套布局下会错） */
function headingScrollTop(root: HTMLElement, el: HTMLElement) {
  return el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
}

watch(
  () => props.content,
  async () => {
    await nextTick();
    activeId.value = toc.value[0]?.id || '';
    readerScrollRef.value?.setScrollTop(0);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (unlockTimer) clearTimeout(unlockTimer);
});

function scrollTo(id: string, ev?: Event) {
  activeId.value = id;
  spyLockedUntil = Date.now() + 600;
  if (unlockTimer) clearTimeout(unlockTimer);
  unlockTimer = setTimeout(() => {
    spyLockedUntil = 0;
    onReaderScroll();
  }, 650);

  const el = readerRoot()?.querySelector(`#${CSS.escape(id)}`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // 去掉点击残留 focus，避免灰底像「双选中」
  const target = ev?.currentTarget;
  if (target instanceof HTMLElement) target.blur();
}

function readerRoot() {
  return readerScrollRef.value?.wrapEl?.();
}

function onReaderScroll() {
  if (Date.now() < spyLockedUntil) return;
  const root = readerRoot();
  if (!root || !toc.value.length) return;
  const marker = root.scrollTop + 36;
  let current = toc.value[0]?.id || '';
  for (const item of toc.value) {
    const el = root.querySelector(`#${CSS.escape(item.id)}`) as HTMLElement | null;
    if (!el) continue;
    if (headingScrollTop(root, el) <= marker) current = item.id;
  }
  if (current) activeId.value = current;
}
</script>

<template>
  <div class="doc" :class="{ 'no-toc': hideToc, workspace }">
    <aside v-if="!hideToc" class="toc" :aria-label="title || '大纲目录'">
      <div class="toc-head">
        <strong class="toc-label">目录</strong>
        <p v-if="!workspace" class="toc-title" :title="title || '大纲目录'">
          {{ title || '大纲目录' }}
        </p>
      </div>

      <UiScroll class="toc-nav" always>
        <button
          v-for="item in toc"
          :key="item.id"
          type="button"
          class="toc-item"
          :class="[`lv-${item.level}`, { active: activeId === item.id }]"
          :title="item.text"
          @click="scrollTo(item.id, $event)"
        >
          <span class="toc-item-text">{{ item.text }}</span>
        </button>
        <p v-if="!toc.length" class="toc-empty">暂无可用目录</p>
      </UiScroll>
    </aside>

    <UiScroll ref="readerScrollRef" class="reader" always @scroll="onReaderScroll">
      <header v-if="workspace || (hideToc && title)" class="reader-title">
        {{ title || '项目大纲' }}
      </header>
      <div v-if="!content?.trim()" class="empty">生成结果将显示在这里</div>
      <article v-else class="article md-body" v-html="html" />
    </UiScroll>
  </div>
</template>

<style scoped>
.doc {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  width: 100%;
  height: min(72vh, 780px);
  min-height: 480px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
}

.doc.workspace {
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr);
  border-top: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
}

.doc.no-toc {
  display: block;
}

.toc {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--surface-2) 88%, var(--surface));
  border-right: 1px solid var(--line);
}

.doc.workspace .toc {
  background: transparent;
  border-right: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
}

.toc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  min-height: 48px;
}

.doc.workspace .toc-head {
  justify-content: space-between;
  padding: 12px 12px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.toc-label {
  display: none;
  font-size: 13px;
  font-weight: 750;
  letter-spacing: 0.02em;
  color: var(--muted);
}
.doc.workspace .toc-label {
  display: block;
}

.toc-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-family: var(--font);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-nav {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 8px 6px 8px 8px;
}
.toc-nav :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc.workspace .toc-nav {
  padding: 8px 8px 20px 10px;
  gap: 0;
}

.toc-item {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  user-select: none;
  text-align: left;
  font: inherit;
  appearance: none;
  -webkit-appearance: none;
}
.doc.workspace .toc-item {
  padding: 11px 4px;
  border-radius: 0;
}
.toc-item:focus {
  outline: none;
}
.toc-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: -2px;
}

.toc-item:hover:not(.active) {
  background: var(--hover-bg);
}
.doc.workspace .toc-item:hover:not(.active) {
  background: transparent;
}

.toc-item.active {
  background: var(--accent-soft);
}
.doc.workspace .toc-item.active {
  background: transparent;
}

.toc-item-text {
  display: block;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--muted);
  letter-spacing: 0;
  word-break: keep-all;
}
.doc.workspace .toc-item-text {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--ink);
}
.doc.workspace .toc-item:hover .toc-item-text {
  color: var(--accent);
}
.doc.workspace .toc-item.active .toc-item-text {
  color: var(--accent);
  font-weight: 500;
}

.toc-item.active .toc-item-text {
  color: var(--accent);
  font-weight: 700;
}

.toc-item.lv-2 .toc-item-text {
  padding-left: 8px;
  font-size: 12.5px;
  font-weight: 550;
}
.doc.workspace .toc-item.lv-2 .toc-item-text {
  padding-left: 10px;
  font-size: 13.5px;
  font-weight: 500;
}

.toc-item.lv-3 .toc-item-text {
  padding-left: 16px;
  font-size: 12px;
  font-weight: 550;
}
.doc.workspace .toc-item.lv-3 .toc-item-text {
  padding-left: 18px;
  font-size: 13px;
  font-weight: 500;
}

.toc-empty {
  margin: 0;
  padding: 14px 10px;
  color: var(--muted);
  font-size: 12px;
  font-family: var(--font);
}

.reader {
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--surface);
}

.doc.workspace .reader {
  background: transparent;
  padding: 0 12px 10px 28px;
}

.reader-title {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0;
  padding: 14px 28px;
  font-size: 14px;
  font-weight: 750;
  color: var(--ink);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}

.doc.workspace .reader-title {
  position: static;
  padding: 4px 2px 14px;
  margin-bottom: 4px;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1.3;
  background: transparent;
  backdrop-filter: none;
  border-bottom: 0;
}

.empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 14px;
}

.article {
  max-width: 720px;
  margin: 0 auto;
  padding: 28px 32px 56px;
  font-family: var(--font);
  color: var(--ink);
}

.doc.workspace .article {
  max-width: none;
  margin: 0;
  padding: 0 2px 40px;
}

.article :deep(h2),
.article :deep(h3),
.article :deep(h4) {
  color: var(--ink);
  line-height: 1.4;
  scroll-margin-top: 12px;
  font-family: var(--font);
}

.article :deep(h2) {
  margin: 28px 0 14px;
  font-size: 22px;
  font-weight: 750;
}
.article :deep(h2:first-child) {
  margin-top: 0;
}

.article :deep(h3) {
  margin: 22px 0 10px;
  font-size: 16px;
  font-weight: 700;
}

.article :deep(h4) {
  margin: 16px 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.article :deep(p) {
  margin: 0 0 12px;
  font-size: 14.5px;
  line-height: 1.85;
  color: var(--text);
}

.article :deep(br) {
  line-height: 1.85;
}

.article :deep(ul),
.article :deep(ol) {
  margin: 0 0 14px;
  padding-left: 1.35em;
}

.article :deep(li) {
  margin: 0 0 6px;
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--text);
}

.article :deep(blockquote) {
  margin: 0 0 14px;
  padding: 10px 14px;
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent-soft) 55%, transparent);
  border-radius: 0 8px 8px 0;
}

.article :deep(blockquote p) {
  margin: 0;
}

.article :deep(hr) {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 20px 0;
}

.article :deep(strong) {
  color: var(--ink);
  font-weight: 700;
}

.article :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
  background: var(--surface-2);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}

@media (max-width: 960px) {
  .doc,
  .doc.workspace {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 520px;
  }
  .doc.workspace {
    height: auto;
    border-top: 0;
  }
  .toc {
    max-height: 200px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .doc.workspace .toc {
    max-height: 220px;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
  }
  .doc.workspace .reader {
    padding: 12px 4px 10px;
  }
  .reader {
    min-height: 360px;
  }
  .article {
    padding: 20px 18px 36px;
  }
  .doc.workspace .article {
    padding: 0 0 36px;
  }
}
</style>
