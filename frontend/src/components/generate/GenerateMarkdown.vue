<template>
  <div class="gen-md" :class="tone === 'dark' ? 'gen-md--dark' : 'gen-md--light'">
    <template v-for="(seg, i) in segments" :key="i">
      <div v-if="seg.kind === 'html'" class="gen-md-chunk" v-html="seg.html" />
      <GenerateMdTable
        v-else-if="seg.kind === 'table'"
        :html="seg.html"
        :tone="tone"
      />
      <div v-else class="gen-md-codeblock">
        <button
          type="button"
          class="gen-md-copy"
          :title="copiedId === i ? '已复制' : '复制'"
          :aria-label="copiedId === i ? '已复制' : '复制'"
          @click="copySeg(i, seg.text)"
        >
          <UiIcon :name="copiedId === i ? 'check' : 'copy'" :size="14" />
        </button>
        <UiScroll class="gen-md-code-scroll" always>
          <pre
            class="gen-md-pre"
            :data-lang="seg.lang || undefined"
          ><code class="hljs" v-html="seg.html" /></pre>
        </UiScroll>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import GenerateMdTable from '@/components/generate/GenerateMdTable.vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import { UiScroll } from '@/components/ui';

const props = withDefaults(
  defineProps<{ source: string; tone?: 'light' | 'dark' }>(),
  { tone: 'dark' },
);

type CodeSeg = { kind: 'code'; lang: string; html: string; text: string };
type HtmlSeg = { kind: 'html'; html: string };
type TableSeg = { kind: 'table'; html: string };
type Seg = CodeSeg | HtmlSeg | TableSeg;

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightInner(str: string, lang: string): string {
  const language = String(lang || '').trim();
  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(str, { language, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(str).value;
  } catch {
    return escapeAttr(str);
  }
}

/** 渲染时收集代码块，正文用占位 pre（以 &lt;pre 开头，避免 markdown-it 再包一层） */
function createRenderer() {
  const codes: Omit<CodeSeg, 'kind'>[] = [];
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: true,
    highlight(str, lang) {
      const language = String(lang || '').trim();
      const i = codes.length;
      codes.push({
        lang: language,
        html: highlightInner(str, language),
        text: str,
      });
      return `<pre class="gen-md-ph" data-gen-code="${i}"></pre>`;
    },
  });

  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const aIndex = token.attrIndex('target');
    if (aIndex < 0) token.attrPush(['target', '_blank']);
    else token.attrs![aIndex][1] = '_blank';
    const rIndex = token.attrIndex('rel');
    if (rIndex < 0) token.attrPush(['rel', 'noopener noreferrer']);
    else token.attrs![rIndex][1] = 'noopener noreferrer';
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return { md, codes };
}

function splitTablesFromHtml(html: string): Array<HtmlSeg | TableSeg> {
  const out: Array<HtmlSeg | TableSeg> = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index > last) {
      out.push({ kind: 'html', html: html.slice(last, m.index) });
    }
    out.push({ kind: 'table', html: m[0] });
    last = m.index + m[0].length;
  }
  if (last < html.length) out.push({ kind: 'html', html: html.slice(last) });
  return out;
}

function splitSegments(sanitized: string, codes: Omit<CodeSeg, 'kind'>[]): Seg[] {
  const segs: Seg[] = [];
  const re = /<pre[^>]*\bdata-gen-code="(\d+)"[^>]*>\s*<\/pre>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sanitized))) {
    if (m.index > last) {
      segs.push(...splitTablesFromHtml(sanitized.slice(last, m.index)));
    }
    const idx = Number(m[1]);
    const c = codes[idx];
    if (c) {
      segs.push({
        kind: 'code',
        lang: c.lang,
        text: c.text,
        html: DOMPurify.sanitize(c.html, { ADD_TAGS: ['span'], ADD_ATTR: ['class'] }),
      });
    }
    last = m.index + m[0].length;
  }
  if (last < sanitized.length) {
    segs.push(...splitTablesFromHtml(sanitized.slice(last)));
  }
  return segs.filter((s) => (s.kind === 'html' ? Boolean(s.html.trim()) : true));
}

const segments = computed(() => {
  const raw = String(props.source || '');
  if (!raw.trim()) return [] as Seg[];
  const { md, codes } = createRenderer();
  const rendered = md.render(raw);
  const sanitized = DOMPurify.sanitize(rendered, {
    ADD_ATTR: ['data-gen-code', 'data-lang', 'target', 'rel', 'class'],
  });
  return splitSegments(sanitized, codes);
});

const copiedId = ref<number | null>(null);
let copiedTimer: number | null = null;

async function copySeg(i: number, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedId.value = i;
    if (copiedTimer) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copiedId.value = null;
      copiedTimer = null;
    }, 1200);
  } catch {
    /* ignore */
  }
}
</script>

<style scoped>
/* —— AIGC 视频工厂 对话散文：对齐壳层深色，避免「文档白线」感 —— */
.gen-md {
  --md-fg: var(--studio-text-strong);
  --md-fg-strong: var(--studio-ink);
  --md-muted: var(--studio-text-faint);
  --md-line: var(--studio-glass-3);
  --md-soft: var(--studio-glass);
  --md-code-bg: #161618;
  --md-accent: #8ec8d8;
  font-family: var(--font);
  font-size: 14.5px;
  line-height: 1.75;
  letter-spacing: 0.01em;
  color: var(--md-fg);
  word-break: break-word;
}

.gen-md--light {
  --md-fg: #1f2937;
  --md-fg-strong: #111827;
  --md-muted: #6b7280;
  --md-line: rgba(0, 0, 0, 0.08);
  --md-soft: rgba(0, 0, 0, 0.04);
  --md-code-bg: #f4f4f5;
  --md-accent: #2563eb;
}

.gen-md-chunk :deep(> :first-child) {
  margin-top: 0 !important;
}

.gen-md-chunk:first-child :deep(> :first-child) {
  margin-top: 0 !important;
}

.gen-md-chunk:last-child :deep(> :last-child),
.gen-md > .gen-md-codeblock:last-child {
  margin-bottom: 0 !important;
}

.gen-md :deep(p) {
  margin: 0 0 0.85em;
}

.gen-md :deep(h1),
.gen-md :deep(h2),
.gen-md :deep(h3),
.gen-md :deep(h4) {
  margin: 1.35em 0 0.55em;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: var(--md-fg-strong);
  border: none;
}

.gen-md :deep(h1) {
  font-size: 1.28em;
}
.gen-md :deep(h2) {
  font-size: 1.12em;
  padding-bottom: 0.35em;
  border-bottom: 1px solid var(--md-line);
}
.gen-md :deep(h3) {
  font-size: 1.02em;
  color: var(--studio-text-strong);
}
.gen-md--light :deep(h3) {
  color: #374151;
}

.gen-md :deep(h1:first-child),
.gen-md :deep(h2:first-child),
.gen-md :deep(h3:first-child) {
  margin-top: 0.15em;
}

.gen-md :deep(hr) {
  border: none;
  height: 1px;
  margin: 1.4em 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--md-line) 12%,
    var(--md-line) 88%,
    transparent 100%
  );
  opacity: 0.9;
}

.gen-md :deep(ul),
.gen-md :deep(ol) {
  margin: 0.35em 0 0.95em;
  padding-left: 1.35em;
}

.gen-md :deep(li) {
  margin: 0.28em 0;
  padding-left: 0.15em;
}

.gen-md :deep(li::marker) {
  color: var(--md-muted);
}

.gen-md :deep(strong) {
  color: var(--md-fg-strong);
  font-weight: 650;
}

.gen-md :deep(em) {
  color: var(--studio-text-strong);
  font-style: italic;
}
.gen-md--light :deep(em) {
  color: #4b5563;
}

.gen-md :deep(a) {
  color: var(--md-accent);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--md-accent) 35%, transparent);
  transition: border-color 0.15s ease, color 0.15s ease;
}

.gen-md :deep(a:hover) {
  border-bottom-color: var(--md-accent);
}

.gen-md :deep(blockquote) {
  margin: 0.9em 0;
  padding: 0.55em 0 0.55em 0.95em;
  border-left: 2px solid rgba(142, 200, 216, 0.35);
  color: var(--md-muted);
  background: transparent;
}

.gen-md :deep(blockquote p) {
  margin: 0.2em 0;
}

.gen-md-codeblock {
  position: relative;
  margin: 0.85em 0 1.1em;
  border-radius: 12px;
  background: var(--md-code-bg);
  border: 1px solid var(--md-line);
  overflow: hidden;
}

.gen-md-code-scroll {
  height: auto !important;
  width: 100%;
  max-height: min(420px, 55vh);
}

.gen-md-code-scroll :deep(.el-scrollbar) {
  height: auto;
}

.gen-md-code-scroll :deep(.el-scrollbar__wrap) {
  max-height: min(420px, 55vh);
  overflow-x: auto !important;
}

.gen-md-code-scroll :deep(.el-scrollbar__view) {
  display: block;
  min-width: 100%;
}

.gen-md-pre {
  margin: 0;
  padding: 2.4em 1em 1em;
  overflow: visible;
  background: transparent;
  border: none;
  border-radius: 0;
  white-space: pre;
  word-break: normal;
  tab-size: 2;
}

.gen-md-pre code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  background: transparent !important;
  padding: 0;
  color: var(--studio-text-strong);
  white-space: pre;
  display: block;
  width: max-content;
  min-width: 100%;
  box-sizing: border-box;
}

.gen-md--light .gen-md-pre code {
  color: #1f2937;
}

/* 克制的语法高亮，避免 github-dark 全局污染 */
.gen-md :deep(.hljs-keyword),
.gen-md :deep(.hljs-selector-tag),
.gen-md :deep(.hljs-built_in) {
  color: #c4b5fd;
}
.gen-md :deep(.hljs-string),
.gen-md :deep(.hljs-attr) {
  color: #86efac;
}
.gen-md :deep(.hljs-number),
.gen-md :deep(.hljs-literal) {
  color: #fcd34d;
}
.gen-md :deep(.hljs-comment),
.gen-md :deep(.hljs-quote) {
  color: var(--studio-line-bright);
  font-style: italic;
}
.gen-md :deep(.hljs-title),
.gen-md :deep(.hljs-section) {
  color: #93c5fd;
}

.gen-md-copy {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 6;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--md-line);
  background: color-mix(in srgb, var(--md-code-bg) 88%, #000);
  backdrop-filter: blur(6px);
  border-radius: 8px;
  color: var(--md-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.gen-md-copy:hover {
  background: var(--studio-glass-3);
  color: var(--md-fg-strong);
}

.gen-md--light .gen-md-copy {
  background: color-mix(in srgb, var(--md-code-bg) 90%, #fff);
}

.gen-md :deep(code:not(.hljs)) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  padding: 0.12em 0.4em;
  border-radius: 5px;
  background: var(--md-soft);
  border: 1px solid var(--md-line);
  color: var(--md-fg-strong);
}
</style>
