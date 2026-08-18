<template>
  <div class="txt-pane" :class="{ readonly }">
    <div class="txt-bar">
      <span class="txt-badge">TXT</span>
      <span class="txt-name" :title="title">{{ title || '未命名章节.txt' }}</span>
      <span class="txt-meta">{{ wordCount }} 字</span>
      <button
        type="button"
        class="mode-btn copy-btn"
        title="复制本章正文"
        aria-label="复制本章正文"
        :disabled="!wordCount"
        @click="copyBody"
      >
        <el-icon :size="13"><DocumentCopy /></el-icon>
        复制
      </button>
      <div class="txt-modes">
        <button
          type="button"
          class="mode-btn"
          :class="{ on: mode === 'edit' }"
          :disabled="readonly"
          @click="mode = 'edit'"
        >
          编辑
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ on: mode === 'read' }"
          @click="mode = 'read'"
        >
          阅读
        </button>
      </div>
      <button
        v-if="withPlan"
        type="button"
        class="mode-btn plan-btn"
        @click="emit('plan')"
      >
        <el-icon :size="12"><Notebook /></el-icon>
        本章规划
      </button>
    </div>

    <UiScroll v-show="mode === 'edit'" ref="editScrollRef" class="txt-editor-scroll" always>
    <textarea
      ref="taRef"
      class="txt-editor"
      :value="modelValue"
      :readonly="readonly"
      :placeholder="placeholder"
      spellcheck="false"
      @input="onInput"
    />
    </UiScroll>

    <UiScroll v-show="mode === 'read'" ref="readerScrollRef" class="txt-reader-scroll" always>
    <div class="txt-reader">
      <article v-if="paragraphs.length" class="txt-article">
        <p v-for="(p, i) in paragraphs" :key="i">{{ p }}</p>
      </article>
      <div v-else class="txt-empty">暂无正文</div>
    </div>
    </UiScroll>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { DocumentCopy, Notebook } from '@element-plus/icons-vue';
import { copyText } from '@/utils/clipboard';
import { UiScroll } from '@/components/ui';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    title?: string;
    readonly?: boolean;
    placeholder?: string;
    withPlan?: boolean;
  }>(),
  {
    modelValue: '',
    title: '',
    readonly: false,
    placeholder: '在此撰写小说正文…',
    withPlan: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [string];
  plan: [];
}>();

const mode = ref<'edit' | 'read'>('read');
const taRef = ref<HTMLTextAreaElement | null>(null);
const editScrollRef = ref<{ wrapEl: () => HTMLElement | undefined; setScrollTop: (n: number) => void } | null>(null);
const readerScrollRef = ref<{ wrapEl: () => HTMLElement | undefined; setScrollTop: (n: number) => void } | null>(null);
const copying = ref(false);

const wordCount = computed(() => String(props.modelValue || '').length);

const paragraphs = computed(() => {
  const raw = String(props.modelValue || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [] as string[];
  return raw
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n/g, '').trim())
    .filter(Boolean);
});

watch(
  () => props.readonly,
  (v) => {
    // 流式生成时切编辑（全宽跟写），结束后回到阅读
    mode.value = v ? 'edit' : 'read';
  },
  { immediate: true },
);

watch(mode, async () => {
  await nextTick();
  syncEditorHeight();
});

function syncEditorHeight() {
  const ta = taRef.value;
  if (!ta) return;
  ta.style.height = '0px';
  const minH = ta.parentElement?.clientHeight ?? 0;
  ta.style.height = `${Math.max(ta.scrollHeight, minH)}px`;
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value);
  syncEditorHeight();
}

watch(
  () => props.modelValue,
  async () => {
    await nextTick();
    syncEditorHeight();
  },
);

async function copyBody() {
  const text = String(props.modelValue || '');
  if (!text.trim() || copying.value) return;
  copying.value = true;
  try {
    const ok = await copyText(text);
    if (ok) ElMessage.success('已复制本章正文');
    else ElMessage.error('复制失败，请手动选择文本复制');
  } finally {
    copying.value = false;
  }
}

async function scrollToEnd() {
  await nextTick();
  syncEditorHeight();
  await nextTick();
  if (mode.value === 'edit') {
    const wrap = editScrollRef.value?.wrapEl?.();
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
    else editScrollRef.value?.setScrollTop(1e9);
  } else {
    const wrap = readerScrollRef.value?.wrapEl?.();
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
    else readerScrollRef.value?.setScrollTop(1e9);
  }
}

defineExpose({ scrollToEnd, focus: () => taRef.value?.focus() });
</script>

<style scoped>
.txt-pane {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 0;
  border-radius: 12px;
  overflow: hidden;
  background: transparent;
  color: var(--ink);
}

.txt-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 2px 8px;
  background: transparent;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent);
  flex-shrink: 0;
  font-size: 12px;
}

.txt-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 4px;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 85%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
  flex-shrink: 0;
}

.txt-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--muted);
}

.txt-meta {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.txt-modes {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  flex-shrink: 0;
}

.mode-btn {
  border: none;
  outline: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
  box-shadow: none;
  -webkit-appearance: none;
  appearance: none;
}

.mode-btn.on {
  background: var(--surface);
  color: var(--ink);
  box-shadow: none;
}

.mode-btn:hover:not(:disabled):not(.on) {
  color: var(--ink);
}

.mode-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.plan-btn {
  flex-shrink: 0;
  margin-left: 2px;
  background: var(--studio-panel-3);
  color: var(--studio-ink);
  border: 1px solid var(--studio-line-strong);
  border-radius: 8px;
}

.plan-btn:hover {
  color: #fff;
  background: var(--studio-panel-3);
  filter: none;
}

.plan-btn :deep(.el-icon) {
  font-size: 12px;
}

.copy-btn {
  flex-shrink: 0;
  color: var(--muted);
}
.copy-btn:hover:not(:disabled) {
  color: var(--accent-2, var(--accent));
}

.txt-editor-scroll,
.txt-reader-scroll {
  flex: 1;
  min-height: 0;
}

.txt-editor {
  flex: 1;
  min-height: 100%;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 28px 28px 40px;
  background: transparent;
  color: var(--ink);
  font-family: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif;
  font-size: 18px;
  line-height: 2.15;
  letter-spacing: 0.02em;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
}

.txt-editor::placeholder {
  color: var(--muted);
  font-family: inherit;
}

.txt-editor:read-only {
  cursor: default;
}

.txt-reader {
  min-height: 0;
}

.txt-article {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 28px 28px 52px;
  box-sizing: border-box;
  font-family: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif;
  font-size: 18px;
  line-height: 2.2;
  letter-spacing: 0.03em;
  color: var(--ink);
}

.txt-article p {
  margin: 0 0 1.2em;
  text-indent: 2em;
  text-align: justify;
}

.txt-empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 14px;
}

.txt-editor::-webkit-scrollbar,
.txt-reader::-webkit-scrollbar {
  width: 8px;
}
.txt-editor::-webkit-scrollbar-thumb,
.txt-reader::-webkit-scrollbar-thumb {
  background: var(--scroll-thumb);
  border-radius: 4px;
}
</style>
