<template>
  <div
    ref="hostRef"
    class="json-editor-pane jse-theme-dark"
    :style="{ minHeight: `${minHeight}px` }"
  />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  createJSONEditor,
  Mode,
  type Content,
  type JsonEditor,
} from 'vanilla-jsoneditor';
import 'vanilla-jsoneditor/themes/jse-theme-dark.css';

const props = withDefaults(
  defineProps<{
    modelValue?: unknown;
    readOnly?: boolean;
    minHeight?: number;
    /** tree = 结构化编辑器；text = 纯文本 JSON */
    mode?: 'tree' | 'text' | 'table';
  }>(),
  {
    readOnly: true,
    minHeight: 220,
    mode: 'tree',
  },
);

const hostRef = ref<HTMLElement | null>(null);
let editor: JsonEditor | null = null;

function toContent(value: unknown): Content {
  if (value === undefined) return { json: null };
  if (value === null) return { json: null };
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return { json: '' };
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      trimmed === 'null' ||
      trimmed === 'true' ||
      trimmed === 'false' ||
      /^-?\d+(\.\d+)?$/.test(trimmed)
    ) {
      try {
        return { json: JSON.parse(trimmed) };
      } catch {
        return { text: value };
      }
    }
    // 非 JSON 字符串仍用 text，避免 tree 模式解析失败
    return { text: value };
  }
  try {
    // 确保可序列化
    JSON.stringify(value);
    return { json: value };
  } catch {
    return { text: String(value) };
  }
}

function resolveMode(content: Content): Mode {
  if (props.mode === 'text') return Mode.text;
  if (props.mode === 'table') return Mode.table;
  // 只有纯文本内容时退回 text，否则用树形编辑器
  if ('text' in content && !('json' in content)) return Mode.text;
  return Mode.tree;
}

async function mountEditor() {
  await nextTick();
  if (!hostRef.value) return;
  if (editor) {
    editor.destroy();
    editor = null;
  }
  const content = toContent(props.modelValue);
  editor = createJSONEditor({
    target: hostRef.value,
    props: {
      content,
      readOnly: props.readOnly,
      mode: resolveMode(content),
      mainMenuBar: true,
      navigationBar: true,
      statusBar: true,
      askToFormat: false,
      indentation: 2,
      tabSize: 2,
    },
  });
}

function syncContent() {
  if (!editor) {
    void mountEditor();
    return;
  }
  const content = toContent(props.modelValue);
  editor.updateProps({
    content,
    readOnly: props.readOnly,
    mode: resolveMode(content),
  });
}

onMounted(() => {
  void mountEditor();
});

watch(
  () => props.modelValue,
  () => syncContent(),
  { deep: true },
);

watch(
  () => [props.readOnly, props.mode] as const,
  () => {
    if (!editor) return;
    const content = toContent(props.modelValue);
    editor.updateProps({
      readOnly: props.readOnly,
      mode: resolveMode(content),
    });
  },
);

onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});
</script>

<style scoped>
.json-editor-pane {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
}

.json-editor-pane :deep(.jse-main) {
  border: none !important;
  min-height: inherit;
  background: var(--studio-panel) !important;
}

.json-editor-pane :deep(.jse-menu) {
  background: var(--studio-panel) !important;
  border-bottom: 1px solid var(--studio-line-strong) !important;
}

.json-editor-pane :deep(.jse-tree-mode),
.json-editor-pane :deep(.jse-text-mode),
.json-editor-pane :deep(.jse-table-mode),
.json-editor-pane :deep(.cm-editor),
.json-editor-pane :deep(.cm-scroller) {
  min-height: 180px;
  max-height: 420px;
}

.json-editor-pane :deep(.jse-contents) {
  background: var(--studio-panel) !important;
}
</style>
