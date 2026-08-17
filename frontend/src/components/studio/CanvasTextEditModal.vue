<template>
  <Teleport to="body">
    <div v-if="open" class="tem-mask" @click.self="emit('close')">
      <div class="tem" role="dialog" aria-label="编辑文本" @mousedown.stop @click.stop>
        <header class="tem-head">
          <strong>编辑文本</strong>
          <button type="button" class="x" title="关闭" @click="emit('close')">×</button>
        </header>

        <div class="tem-editor">
          <Toolbar
            v-if="editorRef"
            class="tem-toolbar"
            :editor="editorRef"
            :default-config="toolbarConfig"
            mode="default"
          />
          <Editor
            v-model="html"
            class="tem-body"
            :default-config="editorConfig"
            mode="default"
            @on-created="onCreated"
            @on-destroyed="onDestroyed"
          />
        </div>

        <footer class="tem-foot">
          <button type="button" class="ghost" @click="emit('close')">取消</button>
          <button type="button" class="primary" @click="save">保存</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import '@wangeditor/editor/dist/css/style.css';
import { onBeforeUnmount, shallowRef, watch } from 'vue';
import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor';
import { htmlToPlainText } from '@/utils/html-to-plain';

const props = defineProps<{
  open: boolean;
  value: string;
}>();

const emit = defineEmits<{
  close: [];
  save: [value: string];
}>();

const editorRef = shallowRef<IDomEditor | null>(null);
const html = shallowRef('');
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

const toolbarConfig: Partial<IToolbarConfig> = {
  excludeKeys: ['group-video', 'insertVideo', 'uploadVideo', 'editVideoSize', 'fullScreen'],
};

const editorConfig: Partial<IEditorConfig> = {
  placeholder: '输入文字内容…',
  autoFocus: true,
};

function toEditorHtml(raw: string) {
  const text = String(raw || '');
  if (!text.trim()) return '<p><br></p>';
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('');
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bindHotkeys(editor: IDomEditor) {
  unbindHotkeys();
  const root = editor.getEditableContainer?.() as HTMLElement | null;
  if (!root) return;
  keyHandler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  };
  root.addEventListener('keydown', keyHandler);
}

function unbindHotkeys() {
  const ed = editorRef.value;
  const root = ed?.getEditableContainer?.() as HTMLElement | null;
  if (root && keyHandler) root.removeEventListener('keydown', keyHandler);
  keyHandler = null;
}

function onCreated(editor: IDomEditor) {
  editorRef.value = editor;
  bindHotkeys(editor);
}

function onDestroyed() {
  unbindHotkeys();
  editorRef.value = null;
}

function save() {
  const ed = editorRef.value;
  // 存纯文本给下游 AI；编辑态仍用 HTML（toEditorHtml）
  const plain = ed ? ed.getText() : htmlToPlainText(html.value);
  const cleaned = htmlToPlainText(plain).trim();
  emit('save', cleaned);
  emit('close');
}

watch(
  () => props.open,
  (v) => {
    if (!v) {
      html.value = '';
      return;
    }
    html.value = toEditorHtml(props.value || '');
  },
);

onBeforeUnmount(() => {
  unbindHotkeys();
  const ed = editorRef.value;
  if (ed) {
    ed.destroy();
    editorRef.value = null;
  }
});
</script>

<style scoped>
.tem-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 24px;
}
.tem {
  width: min(1080px, calc(100vw - 48px));
  height: min(86vh, 900px);
  max-height: min(86vh, 900px);
  display: flex;
  flex-direction: column;
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-3);
  border-radius: 18px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  color: var(--studio-text);
  overflow: hidden;
}
.tem-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--studio-glass-2);
  flex-shrink: 0;
}
.tem-head strong {
  font-size: 15px;
  font-weight: 650;
}
.x {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text-soft);
  font-size: 18px;
  cursor: pointer;
}
.x:hover {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}
.tem-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--studio-panel);
}
.tem-toolbar {
  border-bottom: 1px solid var(--studio-glass-2) !important;
  background: var(--studio-panel) !important;
}
.tem-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--studio-panel) !important;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.tem-body::-webkit-scrollbar,
.tem-body :deep(.w-e-scroll)::-webkit-scrollbar,
.tem-body :deep(*)::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}
.tem-body :deep(.w-e-scroll) {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
.tem-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--studio-glass-2);
  flex-shrink: 0;
}
.ghost,
.primary {
  height: 36px;
  padding: 0 18px;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.ghost {
  border: 1px solid var(--studio-line-strong);
  background: transparent;
  color: var(--studio-ink);
}
.ghost:hover {
  background: var(--studio-glass-2);
}
.primary {
  border: 0;
  background: var(--studio-ink);
  color: var(--studio-inset);
}
.primary:hover {
  background: var(--studio-panel-2);
}

.tem-editor :deep(.w-e-toolbar) {
  background: var(--studio-panel) !important;
  border: 0 !important;
  color: var(--studio-text-strong);
}
.tem-editor :deep(.w-e-bar-item button) {
  color: var(--studio-text-soft) !important;
}
.tem-editor :deep(.w-e-bar-item button:hover) {
  background: var(--studio-glass-2) !important;
  color: var(--studio-ink) !important;
}
.tem-editor :deep(.w-e-bar-divider) {
  background-color: var(--studio-glass-3) !important;
}
.tem-editor :deep(.w-e-text-container) {
  background: var(--studio-panel) !important;
  color: var(--studio-text) !important;
}
.tem-editor :deep(.w-e-text-placeholder) {
  color: var(--studio-line-bright) !important;
}
.tem-editor :deep(.w-e-scroll) {
  min-height: 480px;
}
.tem-editor :deep(.w-e-text-container [data-slate-editor]) {
  padding: 18px 22px !important;
  min-height: 460px;
  color: var(--studio-text);
  caret-color: var(--studio-ink);
}
.tem-editor :deep(.w-e-bar-item-group .w-e-bar-item-menus-container),
.tem-editor :deep(.w-e-drop-panel),
.tem-editor :deep(.w-e-select-list),
.tem-editor :deep(.w-e-modal) {
  background: var(--studio-panel-3) !important;
  border-color: var(--studio-glass-3) !important;
  color: var(--studio-text) !important;
}
</style>
