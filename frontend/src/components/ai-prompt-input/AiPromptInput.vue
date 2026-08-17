<script setup lang="ts">
import { EditorContent, useEditor } from '@tiptap/vue-3';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ElMessage } from 'element-plus';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { UiScroll } from '@/components/ui';
import UiIcon from '@/components/icons/UiIcon.vue';
import type { IconName } from '@/components/icons/types';
import { CHAT_SKILL_CATEGORIES } from '@/utils/skill-catalog';
import GenPrefsPanel from './GenPrefsPanel.vue';
import DurationSeg from './DurationSeg.vue';
import AppImage from '@/components/AppImage.vue';
import { MentionTag } from './extensions/mentionTag';
import { InputTag } from './extensions/inputTag';
import { SelectTag } from './extensions/selectTag';
import {
  PROMPT_IMAGE_ACCEPT,
  PROMPT_IMAGE_MAX_BYTES,
  PROMPT_IMAGE_MAX_COUNT,
  attachmentMentionLabel,
  revokeAttachmentPreview,
  type PromptImageAttachment,
} from './attachment';
import {
  createDefaultPrefs,
  DEFAULT_QUALITY_OPTIONS,
  VIDEO_DURATION_DEFAULT,
  VIDEO_QUALITY_OPTIONS,
  VIDEO_REF_MODE_OPTIONS,
  normalizeVideoDuration,
  type PromptGenPrefs,
  type PromptMediaKind,
  type PromptModeOption,
  type PromptPrefOption,
} from './prefs';
import {
  cloneJson,
  emptyDoc,
  hasInlineTags,
  isPromptDoc,
  resolveEditorDoc,
  serializeForGenerate,
  serializeToPlainText,
  type PromptGeneratePayload,
} from './serialize';
import type { AiPromptTemplate } from './types';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    /** TipTap 富文本文档；有值时优先用其还原 @ 标签等节点 */
    richDoc?: JSONContent | null;
    /** 配合 modelValue 里的 @图N 做无 richDoc 时的回退还原 */
    citedImageUrls?: string[];
    citedVideoUrls?: string[];
    attachments?: PromptImageAttachment[];
    prefs?: PromptGenPrefs;
    placeholder?: string;
    /** 多条文案轮播打字机；有值时覆盖静态 placeholder */
    placeholderHints?: string[];
    minHeight?: number;
    templates?: AiPromptTemplate[];
    /** 技能分类 Tab（Hub Skill 广场 filters）；不传则按模板自带 category 推断 */
    templateFilters?: { id: string; label: string }[];
    showTemplates?: boolean;
    autoApplyTemplate?: boolean;
    enableAttachments?: boolean;
    maxImages?: number;
    /** 参考区文案（如首尾帧） */
    attachLabels?: { empty?: string; add?: string; slotNames?: string[] };
    /** 是否显示「生成偏好」面板 */
    showPrefs?: boolean;
    prefsKinds?: PromptMediaKind[];
    models?: PromptPrefOption[];
    videoModels?: PromptPrefOption[];
    /** Agent 模式展示的对话模型列表 */
    chatModels?: PromptPrefOption[];
    /** 当前对话模型 id（Agent） */
    chatModel?: string;
    qualities?: PromptPrefOption[];
    showAspect?: boolean;
    showQuality?: boolean;
    modes?: PromptModeOption[];
    mode?: string;
    showMention?: boolean;
    /**
     * true：@ 只向外 emit，由宿主画自定义引用菜单（Agent 迷你首页）
     * false：使用内置附件 @ 浮层
     */
    mentionExternal?: boolean;
    /** 选用模板时只插入名称 tag，不把正文塞进输入框（生成页 Agent 技能） */
    templateAsTag?: boolean;
    /** 按 / 时额外 emit slash（即使未展示技能芯片） */
    emitSlash?: boolean;
    /** 仅编辑区，隐藏附件列与底栏（画布 MediaSheet 等外挂工具栏时用） */
    bare?: boolean;
    disabled?: boolean;
    loading?: boolean;
    /** 是否显示默认圆形发送按钮（可用 #actions 自定义） */
    showSend?: boolean;
    /** 弹层色调：home 对齐首页暗色毛玻璃，default 跟系统主题 token */
    tone?: 'default' | 'home';
  }>(),
  {
    modelValue: '',
    richDoc: null,
    citedImageUrls: () => [],
    citedVideoUrls: () => [],
    attachments: () => [],
    prefs: () => createDefaultPrefs(),
    placeholder: '输入想法、大纲要点或上传参考，支持 “/” 使用技能，@ 添加主体',
    placeholderHints: () => [],
    minHeight: 148,
    templates: () => [],
    templateFilters: () => [],
    showTemplates: true,
    autoApplyTemplate: true,
    enableAttachments: true,
    maxImages: PROMPT_IMAGE_MAX_COUNT,
    attachLabels: undefined,
    showPrefs: false,
    prefsKinds: () => ['image'] as PromptMediaKind[],
    models: () => [],
    videoModels: () => [],
    chatModels: () => [],
    chatModel: '',
    qualities: () => DEFAULT_QUALITY_OPTIONS,
    showAspect: true,
    showQuality: true,
    modes: () => [],
    mode: '',
    showMention: false,
    mentionExternal: false,
    templateAsTag: false,
    emitSlash: false,
    bare: false,
    disabled: false,
    loading: false,
    showSend: true,
    tone: 'default',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:richDoc': [value: JSONContent];
  'update:attachments': [value: PromptImageAttachment[]];
  'update:prefs': [value: PromptGenPrefs];
  'update:mode': [value: string];
  'generate-payload': [value: PromptGeneratePayload];
  submit: [value: string];
  mention: [];
  slash: [];
  'pick-template': [value: AiPromptTemplate];
}>();

function buildInitialDoc(): JSONContent {
  return resolveEditorDoc({
    richDoc: props.richDoc,
    prompt: props.modelValue,
    imageUrls: props.citedImageUrls,
    videoUrls: props.citedVideoUrls,
  });
}

const syncing = ref(false);
const skipExternal = ref(false);
const activeTplId = ref('');
const contentTick = ref(0);
const fileInput = ref<HTMLInputElement | null>(null);
const prefsOpen = ref(false);
const skillsOpen = ref(false);
const skillQuery = ref('');
const skillCategory = ref('all');
const modeOpen = ref(false);
const modelOpen = ref(false);
const refOpen = ref(false);
const durationOpen = ref(false);
const mentionOpen = ref(false);
const attachHover = ref(false);

const typedPlaceholder = ref('');
const typewriterOn = computed(() => (props.placeholderHints?.length || 0) > 0);
let twTimer: ReturnType<typeof setTimeout> | null = null;
let twIndex = 0;
let twChar = 0;
let twDeleting = false;

function clearTypewriter() {
  if (twTimer) {
    clearTimeout(twTimer);
    twTimer = null;
  }
}

function preferReduceMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function scheduleTypewriter(ms: number) {
  clearTypewriter();
  twTimer = setTimeout(tickTypewriter, ms);
}

function tickTypewriter() {
  const hints = props.placeholderHints || [];
  if (!hints.length) {
    typedPlaceholder.value = props.placeholder;
    return;
  }
  if (preferReduceMotion()) {
    typedPlaceholder.value = hints[twIndex % hints.length] || props.placeholder;
    return;
  }

  const full = hints[twIndex % hints.length] || '';
  if (!twDeleting) {
    twChar = Math.min(full.length, twChar + 1);
    typedPlaceholder.value = full.slice(0, twChar);
    if (twChar >= full.length) {
      if (hints.length <= 1) return;
      twDeleting = true;
      scheduleTypewriter(1800);
      return;
    }
    const last = full[twChar - 1];
    scheduleTypewriter(last === '，' || last === '…' || last === '、' ? 90 : 42);
    return;
  }

  twChar = Math.max(0, twChar - 1);
  typedPlaceholder.value = full.slice(0, twChar);
  if (twChar <= 0) {
    twDeleting = false;
    twIndex = (twIndex + 1) % hints.length;
    scheduleTypewriter(420);
    return;
  }
  scheduleTypewriter(22);
}

function restartTypewriter() {
  clearTypewriter();
  twIndex = 0;
  twChar = 0;
  twDeleting = false;
  const hints = props.placeholderHints || [];
  if (!hints.length) {
    typedPlaceholder.value = props.placeholder;
    return;
  }
  typedPlaceholder.value = '';
  scheduleTypewriter(280);
}

function bump() {
  contentTick.value += 1;
}

function currentDoc(): JSONContent {
  return (editor.value?.getJSON() as JSONContent) || emptyDoc();
}

function emitPlain() {
  bump();
  const doc = currentDoc();
  emit('update:richDoc', cloneJson(doc));
  const payload = serializeForGenerate(doc);
  if (payload.prompt !== (props.modelValue || '')) {
    skipExternal.value = true;
    emit('update:modelValue', payload.prompt);
  }
  emit('generate-payload', payload);
}

function applyDoc(doc: JSONContent) {
  if (!editor.value) return;
  syncing.value = true;
  editor.value.commands.setContent(cloneJson(doc), { emitUpdate: false });
  emitPlain();
  nextTick(() => {
    syncing.value = false;
    bump();
  });
}

/** 接受 TipTap doc，或段落数组 / 单段落（兼容旧 applyNodes 调用） */
function applyNodes(nodes: JSONContent | JSONContent[]) {
  if (Array.isArray(nodes)) {
    applyDoc({ type: 'doc', content: nodes });
    return;
  }
  if (nodes?.type === 'doc') {
    applyDoc(nodes);
    return;
  }
  applyDoc({ type: 'doc', content: [nodes] });
}

function applyTemplate(tpl: AiPromptTemplate) {
  activeTplId.value = tpl.id;
  skillsOpen.value = false;
  if (props.templateAsTag || isAgentMode.value) {
    applySkillTag(tpl.label);
    emit('pick-template', tpl);
    return;
  }
  applyDoc(tpl.content);
  emit('pick-template', tpl);
}

function setAttachments(next: PromptImageAttachment[]) {
  emit('update:attachments', next);
}

function openFilePicker() {
  if (!props.enableAttachments || props.disabled || props.loading) return;
  if (props.attachments.length >= props.maxImages) {
    ElMessage.warning(`最多可添加 ${props.maxImages} 张图片`);
    return;
  }
  fileInput.value?.click();
}

function revokeAll(list: PromptImageAttachment[]) {
  for (const item of list) {
    revokeAttachmentPreview(item.previewUrl);
  }
}

function removeAttachment(id: string) {
  const target = props.attachments.find((a) => a.id === id);
  if (target) revokeAttachmentPreview(target.previewUrl);
  setAttachments(props.attachments.filter((a) => a.id !== id));
}

function clearAttachments() {
  revokeAll(props.attachments);
  setAttachments([]);
}

function onFilesSelected(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;

  const room = props.maxImages - props.attachments.length;
  if (room <= 0) {
    ElMessage.warning(`最多可添加 ${props.maxImages} 张图片`);
    return;
  }

  const next = [...props.attachments];
  let skipped = 0;
  for (const file of files.slice(0, room)) {
    if (!file.type.startsWith('image/')) {
      skipped += 1;
      continue;
    }
    if (file.size > PROMPT_IMAGE_MAX_BYTES) {
      ElMessage.warning(`${file.name} 超过 10MB，已跳过`);
      continue;
    }
    next.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      mimeType: file.type || 'image/png',
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      file,
    });
  }
  if (files.length > room) {
    ElMessage.warning(`最多可添加 ${props.maxImages} 张图片，多余已忽略`);
  } else if (skipped) {
    ElMessage.warning('仅支持图片文件');
  }
  setAttachments(next);
}

function onSubmit() {
  if (props.loading || props.disabled) return;
  const payload = serializeForGenerate(currentDoc());
  if (!payload.prompt.trim() && !props.attachments.length) return;
  emit('generate-payload', payload);
  emit('submit', payload.prompt);
}

function onPrefsUpdate(v: PromptGenPrefs) {
  emit('update:prefs', v);
}

function focusEditor() {
  try {
    editor.value?.commands.focus();
  } catch {
    /* noop */
  }
}

function insertMention() {
  if (props.bare) {
    emit('mention');
    focusEditor();
    return;
  }
  mentionOpen.value = !mentionOpen.value;
  emit('mention');
}

/** 图片模式：插入画面文字占位，方便写「画面上的字」 */
function insertTextTool() {
  const ed = editor.value;
  if (!ed) return;
  try {
    ed.chain().focus().insertContent('「」').run();
    const { from } = ed.state.selection;
    ed.commands.setTextSelection(Math.max(1, from - 1));
  } catch {
    /* noop */
  }
}

function consumeTriggerAt() {
  const ed = editor.value;
  if (!ed) return;
  const { from } = ed.state.selection;
  if (from < 1) return;
  const textBefore = ed.state.doc.textBetween(Math.max(0, from - 1), from, '');
  if (textBefore === '@') {
    ed.commands.deleteRange({ from: from - 1, to: from });
  }
}

/** 去掉触发技能面板用的 `/`（及紧随其后的检索片段） */
function consumeTriggerSlash() {
  const ed = editor.value;
  if (!ed) return;
  try {
    ed.commands.focus();
  } catch {
    /* noop */
  }
  const { from } = ed.state.selection;
  if (from < 1) return;
  const lookBack = Math.min(from, 64);
  const textBefore = ed.state.doc.textBetween(from - lookBack, from, '\n', '\n');
  const lineBreak = textBefore.lastIndexOf('\n');
  const line = lineBreak >= 0 ? textBefore.slice(lineBreak + 1) : textBefore;
  const slashAt = line.lastIndexOf('/');
  if (slashAt < 0) return;
  const after = line.slice(slashAt + 1);
  // 仅消费「/」或「/查询词」（无空格）；正文里的路径等不动
  if (/\s/.test(after)) {
    if (textBefore.endsWith('/')) {
      ed.commands.deleteRange({ from: from - 1, to: from });
    }
    return;
  }
  const deleteLen = line.length - slashAt;
  ed.commands.deleteRange({ from: from - deleteLen, to: from });
  emitPlain();
}

/** 在光标处插入引用标签（如 @图1），并去掉触发用的 @ */
function insertCite(opts: {
  label: string;
  id?: string;
  expandText?: string;
  url?: string;
  mediaKind?: 'image' | 'video' | 'text';
}) {
  const ed = editor.value;
  if (!ed) return;
  const raw = String(opts.label || '').trim() || '参考';
  const tag = raw.startsWith('@') ? raw : `@${raw}`;
  try {
    ed.commands.focus();
    consumeTriggerAt();
    const kind = opts.mediaKind || (opts.expandText ? 'text' : opts.url ? 'image' : undefined);
    if (kind === 'text' || opts.expandText) {
      ed
        .chain()
        .focus()
        .insertMentionTag({
          label: tag,
          mentionId: opts.id || '',
          expandText: opts.expandText || '',
          mediaKind: 'text',
        })
        .insertContent(' ')
        .run();
    } else if (kind === 'image' || kind === 'video' || opts.url) {
      ed
        .chain()
        .focus()
        .insertMentionTag({
          label: tag,
          mentionId: opts.id || '',
          url: opts.url || '',
          mediaKind: kind === 'video' ? 'video' : 'image',
        })
        .insertContent(' ')
        .run();
    } else {
      ed
        .chain()
        .focus()
        .insertInputTag({ label: tag, text: tag })
        .insertContent(' ')
        .run();
    }
    emitPlain();
    focusEditor();
  } catch {
    /* noop */
  }
}

function pickAttachmentMention(img: PromptImageAttachment, index: number) {
  if (props.disabled || props.loading) return;
  insertCite({
    label: attachmentMentionLabel(img, index + 1),
    id: img.id,
    url: img.previewUrl,
    mediaKind: 'image',
  });
  mentionOpen.value = false;
}

function onEditorKeyDown(event: KeyboardEvent): boolean {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    onSubmit();
    return true;
  }
  /** atom tag：默认要先选中再删（两下）；光标紧贴标签后时一次退格直接删掉 */
  if (event.key === 'Backspace' && !event.altKey && !event.metaKey && !event.ctrlKey) {
    const ed = editor.value;
    if (ed && deleteAtomTagBeforeCursor(ed)) {
      event.preventDefault();
      return true;
    }
  }
  if (event.key === '/' && !props.disabled && !props.loading) {
    if (hasTemplates.value) skillsOpen.value = true;
    if (props.emitSlash || hasTemplates.value) emit('slash');
  }
  if (event.key === '@' && props.showMention && !props.disabled && !props.loading) {
    if (props.mentionExternal) {
      emit('mention');
      return false;
    }
    if (props.bare) {
      event.preventDefault();
      emit('mention');
      return true;
    }
    nextTick(() => {
      mentionOpen.value = true;
    });
    emit('mention');
  }
  return false;
}

/** 退格时一次删掉紧挨光标前的 skill/mention 标签（避免「先选中再删」） */
function deleteAtomTagBeforeCursor(ed: NonNullable<typeof editor.value>): boolean {
  const { state } = ed;
  const { selection } = state;
  const atomNames = new Set(['selectTag', 'mentionTag']);

  if (!selection.empty) {
    const node = (selection as { node?: { type: { name: string }; nodeSize: number } }).node;
    if (node && atomNames.has(node.type.name)) {
      return ed.commands.deleteSelection();
    }
    return false;
  }

  const $from = selection.$from;
  const nodeBefore = $from.nodeBefore;
  let deleteFrom = $from.pos - (nodeBefore?.nodeSize || 0);
  let deleteTo = $from.pos;

  // 标签后的空格 / 零宽占位：退格时连同标签一起去掉
  if (nodeBefore?.isText && /^[\u200B\s]+$/.test(nodeBefore.text || '')) {
    const afterSpace = $from.pos - nodeBefore.nodeSize;
    const $space = state.doc.resolve(afterSpace);
    const tag = $space.nodeBefore;
    if (tag && atomNames.has(tag.type.name)) {
      deleteFrom = afterSpace - tag.nodeSize;
      deleteTo = $from.pos;
      return ed.commands.deleteRange({ from: deleteFrom, to: deleteTo });
    }
    return false;
  }

  if (nodeBefore && atomNames.has(nodeBefore.type.name)) {
    return ed.commands.deleteRange({ from: deleteFrom, to: deleteTo });
  }
  return false;
}

const editor = useEditor({
  content: buildInitialDoc(),
  editable: !(props.disabled || props.loading),
  extensions: [
    StarterKit.configure({
      heading: false,
      bold: false,
      italic: false,
      strike: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      horizontalRule: false,
      dropcursor: false,
    }),
    Placeholder.configure({
      placeholder: ({ editor }) => {
        if (typewriterOn.value) return '';
        // 仅整篇为空时显示；多段里夹空行不再出提示
        if (!editor.isEmpty) return '';
        return props.placeholder;
      },
      showOnlyWhenEditable: true,
      showOnlyCurrent: false,
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
    }),
    MentionTag,
    InputTag,
    SelectTag,
  ],
  editorProps: {
    attributes: {
      class: 'tiptap-container',
      spellcheck: 'false',
    },
    handleKeyDown: (_view, event) => onEditorKeyDown(event),
  },
  onUpdate: () => {
    if (syncing.value || props.disabled) return;
    emitPlain();
  },
});

const hasTemplates = computed(() => props.showTemplates && props.templates.length > 0);
const hasModes = computed(() => props.modes.length > 0);

const skillCategoryTabs = computed(() => {
  const fromProps = (props.templateFilters || []).filter((f) => f?.id && f?.label);
  if (fromProps.length) {
    const hasAll = fromProps.some((f) => f.id === 'all');
    return hasAll ? fromProps : [{ id: 'all', label: '全部' }, ...fromProps];
  }
  const present = new Set(
    props.templates.map((t) => String(t.category || '').trim()).filter(Boolean),
  );
  const inferred = [...present].map((id) => ({
    id,
    label: CHAT_SKILL_CATEGORIES.find((c) => c.id === id)?.label || id,
  }));
  return [{ id: 'all', label: '全部' }, ...inferred];
});

const filteredSkillTemplates = computed(() => {
  const q = skillQuery.value.trim().toLowerCase();
  const cat = String(skillCategory.value || 'all');
  return props.templates.filter((tpl) => {
    if (cat !== 'all') {
      const c = String(tpl.category || '').trim();
      const tags = String((tpl as any).tags || '');
      if (c !== cat && !tags.split(',').includes(cat)) return false;
    }
    if (!q) return true;
    const hay = `${tpl.label || ''} ${tpl.description || ''} ${tpl.id || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

const skillGroups = computed(() => {
  const labelMap = new Map(skillCategoryTabs.value.map((t) => [t.id, t.label]));
  const map = new Map<string, AiPromptTemplate[]>();
  for (const tpl of filteredSkillTemplates.value) {
    const key = String(tpl.category || '').trim() || 'other';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tpl);
  }
  const order = skillCategoryTabs.value.map((c) => c.id).filter((id) => id !== 'all');
  const keys = [
    ...order.filter((id) => map.has(id)),
    ...[...map.keys()].filter((k) => !order.includes(k)),
  ];
  return keys.map((id) => ({
    id,
    label: id === 'other' ? '其他' : labelMap.get(id) || id,
    items: map.get(id) || [],
  }));
});

watch(skillsOpen, (open) => {
  if (!open) return;
  skillQuery.value = '';
  skillCategory.value = 'all';
});

const isVideoMode = computed(
  () =>
    props.mode === 'video' ||
    props.mode === 'agent' ||
    props.prefs.mediaKind === 'video',
);

const isAgentMode = computed(() => props.mode === 'agent');
const showMediaPrefs = computed(() => props.showPrefs && !isAgentMode.value);
const showAgentPrefs = computed(() => props.showPrefs && isAgentMode.value);
/** Agent 迷你首页可自建技能面板：仅在 showTemplates 时显示底栏芯片 */
const showSkillsChip = computed(() => props.showTemplates && (isAgentMode.value || hasTemplates.value));
const showMentionChip = computed(() => props.showMention && !props.mentionExternal);

function popperClass(kind: 'jimeng' | 'prefs' | 'skills') {
  const base =
    kind === 'jimeng'
      ? 'ai-prompt-jimeng-popper'
      : kind === 'prefs'
        ? 'ai-prompt-prefs-popper'
        : 'ai-prompt-skills-popper';
  return props.tone === 'home' ? `${base} ai-prompt-home-popper` : base;
}

const prefsPopperOptions = {
  modifiers: [
    {
      name: 'offset',
      options: { offset: [0, 10] },
    },
    {
      name: 'preventOverflow',
      options: { padding: 16, altAxis: true },
    },
    {
      name: 'flip',
      options: { fallbackPlacements: ['bottom-start', 'bottom-end', 'top'] },
    },
  ],
};
const agentPrefsLabel = computed(() => (props.prefs.auto ? '自动' : '自定义'));
const agentQualityOptions = computed(() => {
  if (props.prefs.mediaKind === 'image') {
    return props.qualities.length ? props.qualities : DEFAULT_QUALITY_OPTIONS;
  }
  return VIDEO_QUALITY_OPTIONS;
});

const activeModeLabel = computed(() => {
  const found = props.modes.find((m) => m.value === props.mode);
  if (found?.label) return found.label;
  if (props.mode === 'agent') return 'Agent';
  if (isVideoMode.value) return '视频';
  return '图片';
});

function modeIconFor(value: string): IconName {
  if (value === 'agent') return 'bot';
  if (value === 'video') return 'film';
  return 'image';
}

const modeIconName = computed(() => modeIconFor(props.mode));

function refModeIconFor(value: string): IconName {
  if (value === 'frames') return 'images';
  if (value === 'edit') return 'wand';
  return 'infinity';
}

const activeModelList = computed(() => {
  if (isAgentMode.value) return props.chatModels;
  if (isVideoMode.value) return props.videoModels;
  return props.models;
});

const activeModelMeta = computed(() => {
  const list = activeModelList.value;
  const id = isAgentMode.value ? props.chatModel : props.prefs.model;
  const found = list.find((m) => m.value === id);
  return found || list[0] || null;
});

const activeModelLabel = computed(() => activeModelMeta.value?.label || '选择模型');

/** Agent 也展示当前对话模型；图片/视频模式沿用原偏好芯片 */
const showModelChip = computed(() => {
  if (isAgentMode.value) return props.chatModels.length > 0 || !!props.chatModel;
  return showMediaPrefs.value;
});

const qualityOptions = computed(() => {
  if (isVideoMode.value) return VIDEO_QUALITY_OPTIONS;
  return props.qualities.length ? props.qualities : DEFAULT_QUALITY_OPTIONS;
});

const aspectChipLabel = computed(() => {
  if (props.prefs.auto || props.prefs.aspectRatio === 'auto') return '智能';
  return props.prefs.aspectRatio || '16:9';
});

const qualityChipLabel = computed(() => {
  const q = String(props.prefs.quality || '').toLowerCase();
  const found = qualityOptions.value.find((x) => x.value === q);
  if (found) return found.label;
  if (q === '1.5k') return '1.5K';
  if (q === '1k') return '1K';
  if (q === '2k') return '2K';
  if (q === '4k') return '4K';
  if (q === '480p') return '480P';
  if (q === '720p') return '720P';
  if (q === '1080p') return '1080P';
  return q.toUpperCase() || '2K';
});

const countChipLabel = computed(() => String(Math.max(1, Number(props.prefs.count) || 1)));

const refModeLabel = computed(() => {
  const found = VIDEO_REF_MODE_OPTIONS.find((x) => x.value === props.prefs.refMode);
  return found?.label || '全能参考';
});

const durationChipLabel = computed(
  () => `${normalizeVideoDuration(props.prefs.durationSec)}s`,
);

function pickModel(value: string) {
  if (!value) return;
  onPrefsUpdate({ ...props.prefs, model: value, auto: false });
  modelOpen.value = false;
}

function pickRefMode(value: string) {
  const opt = VIDEO_REF_MODE_OPTIONS.find((x) => x.value === value);
  if (opt?.disabled) return;
  const refMode = (['text', 'frames', 'omni'].includes(value) ? value : 'omni') as PromptGenPrefs['refMode'];
  onPrefsUpdate({ ...props.prefs, refMode, auto: false });
  refOpen.value = false;
}

function pickDuration(value: number | number[] | string) {
  const raw = Array.isArray(value) ? value[0] : value;
  onPrefsUpdate({
    ...props.prefs,
    durationSec: normalizeVideoDuration(raw, VIDEO_DURATION_DEFAULT),
    auto: false,
  });
}

function selectMode(value: string) {
  const opt = props.modes.find((m) => m.value === value);
  if (opt?.disabled) return;
  emit('update:mode', value);
  modeOpen.value = false;
}

const canSend = computed(() => {
  contentTick.value;
  if (props.disabled || props.loading) return false;
  if (props.attachments.length > 0) return true;
  const doc = currentDoc();
  if (hasInlineTags(doc)) return true;
  return !!serializeToPlainText(doc).trim();
});

const editorEmpty = computed(() => {
  contentTick.value;
  const doc = currentDoc();
  if (hasInlineTags(doc)) return false;
  return !serializeToPlainText(doc).trim();
});

const showTypewriter = computed(
  () => typewriterOn.value && editorEmpty.value && !props.disabled && !props.loading,
);

const attachmentPreviewUrls = computed(() =>
  props.attachments.map((a) => a.previewUrl).filter(Boolean),
);

/** 多图扇形叠放：收起时略微错位旋转，悬停时展开便于点选删除（绝对定位，不挤压输入区） */
function attachCardStyle(index: number, total: number) {
  const n = Math.max(1, total);
  const mid = (n - 1) / 2;
  const offset = index - mid;
  const expand = attachHover.value;
  const spread = expand ? 26 : n === 1 ? 0 : 11;
  const rotBase = expand ? 7.5 : n === 1 ? -2 : 5.5;
  const rot = offset * rotBase + (n === 1 ? -2 : index === n - 1 ? 0 : offset * 0.4);
  const x = offset * spread;
  const y = expand ? Math.abs(offset) * 3 : Math.abs(offset) * 1.5;
  return {
    transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`,
    zIndex: index + 1,
  };
}

const shellStyle = computed(() => ({ minHeight: `${props.minHeight}px` }));

const editorScrollMax = computed(() => (props.bare ? 140 : 220));

onMounted(() => {
  nextTick(() => {
    if (props.autoApplyTemplate && !props.modelValue?.trim() && props.templates.length > 0) {
      applyTemplate(props.templates[0]);
    } else {
      bump();
    }
  });
  restartTypewriter();
});

onUnmounted(() => {
  clearTypewriter();
});

watch(
  () => props.placeholderHints,
  () => restartTypewriter(),
  { deep: true },
);

watch(
  () => props.placeholder,
  () => {
    if (!typewriterOn.value) typedPlaceholder.value = props.placeholder;
  },
);

watch(
  () => [props.disabled, props.loading] as const,
  ([disabled, loading]) => {
    editor.value?.setEditable(!(disabled || loading));
  },
);

watch(
  () => props.richDoc,
  (doc) => {
    if (syncing.value || !editor.value || !isPromptDoc(doc)) return;
    const cur = JSON.stringify(currentDoc());
    const next = JSON.stringify(doc);
    if (cur === next) return;
    syncing.value = true;
    editor.value.commands.setContent(cloneJson(doc), { emitUpdate: false });
    nextTick(() => {
      syncing.value = false;
      bump();
    });
  },
);

watch(
  () => props.modelValue,
  (v) => {
    if (skipExternal.value) {
      skipExternal.value = false;
      return;
    }
    if (syncing.value || !editor.value) return;
    // 已有富文本/内联标签时，不要用纯文本把 @ 标签冲掉
    if (isPromptDoc(props.richDoc) || hasInlineTags(currentDoc())) return;
    const nextDoc = resolveEditorDoc({
      prompt: v || '',
      imageUrls: props.citedImageUrls,
      videoUrls: props.citedVideoUrls,
    });
    const currentGen = serializeForGenerate(currentDoc()).prompt;
    const next = v || '';
    if (next === currentGen && !hasInlineTags(nextDoc)) return;
    if (next === serializeToPlainText(currentDoc()) && !hasInlineTags(nextDoc)) return;
    syncing.value = true;
    editor.value.commands.setContent(nextDoc, { emitUpdate: false });
    nextTick(() => {
      syncing.value = false;
      bump();
    });
  },
);

function applySkillTag(name: string) {
  const ed = editor.value;
  if (!ed) return;
  const label = String(name || '').trim();
  syncing.value = true;
  if (!label) {
    ed.commands.setContent(
      { type: 'doc', content: [{ type: 'paragraph' }] },
      { emitUpdate: true },
    );
  } else {
    // 零宽占位：让光标落在文本节点上（高度正常），避免贴着 chip 被行盒撑高
    ed.commands.setContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'selectTag',
                attrs: {
                  value: label,
                  options: [{ label, value: label }],
                },
              },
              { type: 'text', text: '\u200B' },
            ],
          },
        ],
      },
      { emitUpdate: true },
    );
  }
  nextTick(() => {
    syncing.value = false;
    bump();
    ed.commands.focus('end');
  });
}

defineExpose({
  applyTemplate,
  applyNodes,
  applySkillTag,
  insertCite,
  consumeTriggerSlash,
  clearAttachments,
  getPlainText: () => serializeToPlainText(currentDoc()),
  getGeneratePayload: () => serializeForGenerate(currentDoc()),
  getAttachments: () => props.attachments,
  getPrefs: () => props.prefs,
  submit: onSubmit,
  focus: focusEditor,
});

</script>

<template>
  <div
    class="ai-prompt"
    :class="{ disabled, loading, ready: canSend, bare }"
    :style="shellStyle"
  >
    <div class="ai-prompt-body">
      <div v-if="enableAttachments && !bare" class="attach-rail">
        <button
          v-if="!attachments.length"
          type="button"
          class="attach-empty"
          title="上传参考内容"
          :disabled="disabled || loading"
          @click="openFilePicker"
        >
          <span class="attach-plus" aria-hidden="true">+</span>
          <em>{{ attachLabels?.empty || '参考内容' }}</em>
        </button>

        <div
          v-else
          class="attach-stack"
          :class="{ hover: attachHover, multi: attachments.length > 1 }"
          @mouseenter="attachHover = true"
          @mouseleave="attachHover = false"
        >
          <div
            v-for="(img, i) in attachments"
            :key="img.id"
            class="attach-card"
            :style="attachCardStyle(i, attachments.length)"
          >
            <AppImage
              :src="img.previewUrl"
              :alt="img.name"
              :preview-list="attachmentPreviewUrls"
            />
            <span v-if="attachLabels?.slotNames?.[i]" class="attach-slot-tag">{{
              attachLabels.slotNames[i]
            }}</span>
            <button
              type="button"
              class="attach-remove"
              title="移除"
              :disabled="disabled || loading"
              @click.stop="removeAttachment(img.id)"
            >
              <UiIcon name="x" :size="12" />
            </button>
          </div>

          <button
            v-if="attachments.length < maxImages"
            type="button"
            class="attach-fab"
            :title="attachLabels?.add || '继续添加参考'"
            :disabled="disabled || loading"
            @click="openFilePicker"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>

      <div class="ai-prompt-main">
        <div class="ai-prompt-editor">
          <div
            v-if="showTypewriter"
            class="ai-prompt-placeholder typewriter"
            aria-hidden="true"
          >
            <span>{{ typedPlaceholder }}</span>
            <span class="tw-caret" />
          </div>
          <UiScroll class="editor-scroll" always :max-height="editorScrollMax">
            <EditorContent :editor="editor" />
          </UiScroll>
        </div>

        <div v-if="!bare" class="ai-prompt-bar">
          <div class="bar-tools">
            <el-popover
              v-if="hasModes"
              v-model:visible="modeOpen"
              placement="bottom-start"
              :width="168"
              trigger="click"
              :popper-class="popperClass('jimeng')"
            >
              <template #reference>
                <button
                  type="button"
                  class="chip chip-mode"
                  :class="{ video: isVideoMode && mode !== 'agent', agent: mode === 'agent', on: modeOpen }"
                  :disabled="disabled || loading"
                >
                  <UiIcon :name="modeIconName" :size="15" class="chip-ico accent" />
                  <span>{{ activeModeLabel }}</span>
                  <UiIcon name="chevron-down" :size="12" class="chip-caret" />
                </button>
              </template>
              <div class="jimeng-pop">
                <div class="jimeng-pop-title">创作类型</div>
                <button
                  v-for="m in modes"
                  :key="m.value"
                  type="button"
                  class="jimeng-row"
                  :class="{ on: mode === m.value, disabled: m.disabled }"
                  :disabled="!!m.disabled || disabled || loading"
                  @click="selectMode(m.value)"
                >
                  <span class="jimeng-ico">
                    <UiIcon :name="modeIconFor(m.value)" :size="16" />
                  </span>
                  <span class="jimeng-label">{{ m.label }}</span>
                  <UiIcon v-if="mode === m.value" name="check" :size="14" class="jimeng-check-ico" />
                </button>
              </div>
            </el-popover>

            <button
              v-if="isAgentMode && showModelChip"
              type="button"
              class="chip chip-model readonly"
              title="对话模型（在设置中更换）"
            >
              <UiIcon name="cpu" :size="14" class="chip-ico" />
              <span class="chip-ellipsis">{{ activeModelLabel }}</span>
            </button>

            <el-popover
              v-else-if="showModelChip"
              v-model:visible="modelOpen"
              placement="bottom-start"
              :width="320"
              trigger="click"
              :popper-class="popperClass('jimeng')"
            >
              <template #reference>
                <button
                  type="button"
                  class="chip chip-model"
                  :class="{ on: modelOpen }"
                  :disabled="disabled || loading || !activeModelList.length"
                  title="选择模型"
                >
                  <UiIcon name="cpu" :size="14" class="chip-ico" />
                  <span class="chip-ellipsis">{{ activeModelLabel }}</span>
                  <UiIcon name="sparkles" :size="12" class="chip-spark" />
                </button>
              </template>
              <div class="jimeng-pop model-pop">
                <div class="jimeng-pop-title">
                  选择模型{{ activeModelMeta ? `：${activeModelMeta.label}` : '' }}
                  <em v-if="activeModelMeta?.vendor"> by {{ activeModelMeta.vendor }}</em>
                </div>
                <UiScroll v-if="activeModelList.length" class="model-scroll" :max-height="280" always>
                  <button
                    v-for="m in activeModelList"
                    :key="m.value"
                    type="button"
                    class="jimeng-model"
                    :class="{ on: prefs.model === m.value }"
                    :disabled="!!m.disabled || disabled || loading"
                    @click="pickModel(m.value)"
                  >
                    <span class="model-mark" aria-hidden="true">
                      <UiIcon name="layers" :size="14" />
                    </span>
                    <span class="model-body">
                      <span class="model-name">
                        {{ m.label }}
                        <i v-if="m.badge" class="model-badge">{{ m.badge }}</i>
                      </span>
                      <span v-if="m.description" class="model-desc">{{ m.description }}</span>
                    </span>
                    <UiIcon v-if="prefs.model === m.value" name="check" :size="14" class="jimeng-check-ico" />
                  </button>
                </UiScroll>
                <div v-else class="jimeng-empty">暂无可用模型，请先在设置中配置 AI 提供商</div>
              </div>
            </el-popover>

            <el-popover
              v-if="showMediaPrefs && isVideoMode"
              v-model:visible="refOpen"
              placement="bottom-start"
              :width="220"
              trigger="click"
              :popper-class="popperClass('jimeng')"
            >
              <template #reference>
                <button
                  type="button"
                  class="chip chip-ref"
                  :class="{ on: refOpen }"
                  :disabled="disabled || loading"
                >
                  <UiIcon name="infinity" :size="14" class="chip-ico" />
                  <span class="chip-ellipsis">{{ refModeLabel }}</span>
                  <UiIcon name="chevron-down" :size="12" class="chip-caret" />
                </button>
              </template>
              <div class="jimeng-pop">
                <button
                  v-for="m in VIDEO_REF_MODE_OPTIONS"
                  :key="m.value"
                  type="button"
                  class="jimeng-row"
                  :class="{ on: prefs.refMode === m.value, disabled: m.disabled }"
                  :disabled="!!m.disabled || disabled || loading"
                  @click="pickRefMode(m.value)"
                >
                  <span class="jimeng-ico">
                    <UiIcon :name="refModeIconFor(m.value)" :size="16" />
                  </span>
                  <span class="jimeng-label">
                    {{ m.label }}
                    <i v-if="m.badge" class="model-badge">{{ m.badge }}</i>
                  </span>
                  <UiIcon
                    v-if="prefs.refMode === m.value && !m.disabled"
                    name="check"
                    :size="14"
                    class="jimeng-check-ico"
                  />
                </button>
              </div>
            </el-popover>


            <el-popover
              v-if="showAgentPrefs"
              v-model:visible="prefsOpen"
              placement="bottom-start"
              :width="420"
              trigger="click"
              :popper-class="popperClass('prefs')"
            >
              <template #reference>
                <button
                  type="button"
                  class="chip chip-auto"
                  :class="{ on: prefsOpen || !prefs.auto }"
                  :disabled="disabled || loading"
                >
                  <UiIcon name="settings" :size="14" class="chip-ico" />
                  <span class="chip-ellipsis">{{ agentPrefsLabel }}</span>
                </button>
              </template>
              <div class="agent-auto-pop">
                <GenPrefsPanel
                  class="agent-prefs-panel"
                  :model-value="prefs"
                  :kinds="prefsKinds"
                  :models="models"
                  :video-models="videoModels"
                  :qualities="agentQualityOptions"
                  :show-aspect="showAspect"
                  :show-quality="showQuality"
                  :show-kinds="true"
                  :show-model="true"
                  :tone="tone"
                  @update:model-value="onPrefsUpdate"
                />
                <template v-if="prefs.mediaKind === 'video'">
                  <DurationSeg
                    class="agent-duration"
                    :model-value="prefs.durationSec"
                    :disabled="disabled || loading"
                    @update:model-value="pickDuration"
                  />
                </template>
              </div>
            </el-popover>

            <el-popover
              v-if="showMediaPrefs"
              v-model:visible="prefsOpen"
              placement="bottom"
              :width="380"
              :offset="10"
              trigger="click"
              :show-arrow="true"
              :popper-options="prefsPopperOptions"
              :popper-class="popperClass('prefs')"
            >
              <template #reference>
                <button
                  type="button"
                  class="chip chip-combo"
                  :class="{ on: prefsOpen || !prefs.auto }"
                  :disabled="disabled || loading"
                >
                  <span class="combo-seg">
                    <UiIcon
                      :name="prefs.auto || prefs.aspectRatio === 'auto' ? 'sparkles' : 'ratio'"
                      :size="13"
                      class="chip-ico"
                    />
                    {{ aspectChipLabel }}
                  </span>
                  <span class="combo-divider" aria-hidden="true" />
                  <span class="combo-seg">
                    {{ qualityChipLabel }}
                    <UiIcon name="gem" :size="11" class="chip-spark" />
                  </span>
                  <span class="combo-divider" aria-hidden="true" />
                  <span class="combo-seg">
                    <UiIcon name="images" :size="12" class="chip-ico" />
                    {{ countChipLabel }}
                  </span>
                </button>
              </template>
              <GenPrefsPanel
                :model-value="prefs"
                :kinds="prefsKinds"
                :models="models"
                :video-models="videoModels"
                :qualities="qualityOptions"
                :show-aspect="showAspect"
                :show-quality="showQuality"
                :show-kinds="false"
                :show-model="false"
                :show-count="true"
                :tone="tone"
                @update:model-value="onPrefsUpdate"
              />
            </el-popover>

            <el-popover
              v-if="showMediaPrefs && isVideoMode"
              v-model:visible="durationOpen"
              placement="bottom"
              :width="300"
              trigger="click"
              :popper-class="popperClass('jimeng')"
            >
              <template #reference>
                <button
                  type="button"
                  class="chip chip-duration"
                  :class="{ on: durationOpen }"
                  :disabled="disabled || loading"
                >
                  <UiIcon name="clock" :size="14" class="chip-ico" />
                  <span>{{ durationChipLabel }}</span>
                </button>
              </template>
              <div class="jimeng-pop duration-pop">
                <DurationSeg
                  :model-value="prefs.durationSec"
                  :disabled="disabled || loading"
                  @update:model-value="pickDuration"
                />
              </div>
            </el-popover>

            <el-popover
              v-if="showSkillsChip"
              v-model:visible="skillsOpen"
              placement="bottom-start"
              :width="340"
              trigger="click"
              :popper-class="popperClass('skills')"
            >
              <template #reference>
                <button
                  type="button"
                  class="chip"
                  :class="{ on: skillsOpen || !!activeTplId }"
                  :disabled="disabled || loading"
                >
                  <UiIcon name="wand" :size="14" class="chip-ico" />
                  <span>{{ isAgentMode ? '使用 Skill' : '使用技能' }}</span>
                </button>
              </template>
              <div class="skills-panel">
                <div class="skills-title">{{ isAgentMode ? '使用 Skill' : '技能模板' }}</div>
                <div v-if="!templates.length" class="skills-empty">
                  <div class="skills-empty-art" aria-hidden="true">⚒</div>
                  <p>{{ isAgentMode ? '暂无可用 Skill' : '暂无技能模板' }}</p>
                  <span>{{
                    isAgentMode
                      ? '请先在设置中同步 Hub，技能广场同步后会出现在这里'
                      : '可稍后再试'
                  }}</span>
                </div>
                <template v-else>
                  <div class="skills-search">
                    <input
                      v-model="skillQuery"
                      type="search"
                      class="skills-search-input"
                      placeholder="搜索 Skill 名称或描述"
                      :disabled="disabled || loading"
                    />
                  </div>
                  <div v-if="skillCategoryTabs.length > 1" class="skills-cats">
                    <button
                      v-for="tab in skillCategoryTabs"
                      :key="tab.id"
                      type="button"
                      class="skills-cat"
                      :class="{ on: skillCategory === tab.id }"
                      :disabled="disabled || loading"
                      @click="skillCategory = tab.id"
                    >
                      {{ tab.label }}
                    </button>
                  </div>
                  <UiScroll class="skills-scroll" :max-height="300" always>
                    <div v-if="!filteredSkillTemplates.length" class="skills-empty compact">
                      <p>没有匹配的 Skill</p>
                      <span>换个关键词或分类试试</span>
                    </div>
                    <template v-else-if="skillCategory === 'all' && skillGroups.length > 1">
                      <div v-for="group in skillGroups" :key="group.id" class="skills-group">
                        <div class="skills-group-title">{{ group.label }}</div>
                        <button
                          v-for="tpl in group.items"
                          :key="tpl.id"
                          type="button"
                          class="skill-row"
                          :class="{ on: activeTplId === tpl.id }"
                          @click="applyTemplate(tpl)"
                        >
                          <div class="skill-name">{{ tpl.label }}</div>
                          <div v-if="tpl.description" class="skill-desc">{{ tpl.description }}</div>
                        </button>
                      </div>
                    </template>
                    <template v-else>
                      <button
                        v-for="tpl in filteredSkillTemplates"
                        :key="tpl.id"
                        type="button"
                        class="skill-row"
                        :class="{ on: activeTplId === tpl.id }"
                        @click="applyTemplate(tpl)"
                      >
                        <div class="skill-name">{{ tpl.label }}</div>
                        <div v-if="tpl.description" class="skill-desc">{{ tpl.description }}</div>
                      </button>
                    </template>
                  </UiScroll>
                </template>
              </div>
            </el-popover>

            <button
              v-if="showMediaPrefs && !isVideoMode"
              type="button"
              class="chip chip-icon chip-text-tool"
              title="画面文字"
              :disabled="disabled || loading"
              @click="insertTextTool"
            >
              <UiIcon name="type" :size="15" />
            </button>

            <el-popover
              v-if="showMentionChip"
              v-model:visible="mentionOpen"
              placement="bottom"
              :width="260"
              trigger="click"
              :popper-class="popperClass('jimeng')"
            >
              <template #reference>
                <button
                  type="button"
                  class="chip chip-icon"
                  :class="{ on: mentionOpen }"
                  title="@ 引用参考"
                  :disabled="disabled || loading"
                >
                  <UiIcon name="at-sign" :size="15" />
                </button>
              </template>
              <div class="jimeng-pop mention-pop">
                <div class="jimeng-pop-title">可能@的内容</div>
                <UiScroll v-if="attachments.length" class="mention-scroll" :max-height="260" always>
                  <button
                    v-for="(img, i) in attachments"
                    :key="img.id"
                    type="button"
                    class="jimeng-row mention-attach"
                    :disabled="disabled || loading"
                    @click="pickAttachmentMention(img, i)"
                  >
                    <span class="mention-thumb" aria-hidden="true">
                      <AppImage :src="img.previewUrl" :alt="img.name" />
                    </span>
                    <span class="jimeng-label">
                      <strong class="mention-name">{{ img.name || `参考图 ${i + 1}` }}</strong>
                      <em>参考图 {{ i + 1 }}</em>
                    </span>
                  </button>
                </UiScroll>
                <div v-else class="mention-empty">
                  <div class="mention-art" aria-hidden="true">⧉</div>
                  <p>还没有参考图</p>
                  <span>先上传参考内容，再在这里 @ 引用</span>
                  <button
                    type="button"
                    class="mention-create"
                    :disabled="disabled || loading || !enableAttachments"
                    @click="
                      mentionOpen = false;
                      openFilePicker();
                    "
                  >
                    + 上传参考图
                  </button>
                </div>
              </div>
            </el-popover>

            <slot name="toolbar" />
          </div>

          <div class="bar-send">
            <slot name="actions" />
            <button
              v-if="showSend"
              type="button"
              class="send-btn"
              :class="{ ready: canSend }"
              :disabled="!canSend"
              :title="loading ? '生成中…' : '生成'"
              @click="onSubmit"
            >
              <UiIcon name="arrow-up" :size="16" :class="{ spin: loading }" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      class="file-input"
      :accept="PROMPT_IMAGE_ACCEPT"
      multiple
      @change="onFilesSelected"
    />
  </div>
</template>

<style lang="scss" scoped>
.ai-prompt {
  --prompt-radius: var(--radius-lg, 14px);
  --prompt-tag-bg: var(--accent-soft);
  --prompt-tag-fg: var(--accent);
  --prompt-send: var(--ink);
  --prompt-send-disabled: var(--line-strong);
  --prompt-border: var(--line);
  --prompt-chip-bg: var(--surface-2);

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--surface);
  border-radius: var(--prompt-radius);
  border: 1px solid var(--prompt-border);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.18s var(--ease), box-shadow 0.18s var(--ease);

  &:focus-within {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
    box-shadow: var(--shadow-sm), 0 0 0 3px var(--accent-ring);
  }

  &.bare {
    border: 0;
    box-shadow: none;
    background: transparent;
    border-radius: 0;

    &:focus-within {
      border-color: transparent;
      box-shadow: none;
    }

    .ai-prompt-body {
      padding: 0;
      gap: 0;
    }

    .ai-prompt-editor {
      padding: 0;
    }

    :deep(.tiptap-container) {
      min-height: 64px;
      padding: 0;
    }
  }

  &.disabled {
    pointer-events: none;
    opacity: 0.7;
  }
}

[data-theme='dark'] .ai-prompt {
  --prompt-tag-bg: var(--accent-soft);
  --prompt-tag-fg: var(--accent);
  --prompt-send: var(--accent);
  --prompt-send-disabled: var(--line-strong);
  --prompt-border: var(--line);
  --prompt-chip-bg: var(--surface-2);
}

.file-input {
  display: none;
}

.ai-prompt-body {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 14px 14px 12px;
  min-height: inherit;
}

.attach-rail {
  --attach-w: 52px;
  --attach-h: 68px;
  position: relative;
  z-index: 5;
  flex: 0 0 auto;
  width: var(--attach-w);
  height: var(--attach-h);
  margin-top: 2px;
  /* 占位固定；悬停展开绝对溢出，不挤压输入区 */
  overflow: visible;
}

.attach-empty {
  width: var(--attach-w);
  height: var(--attach-h);
  border: 1px solid var(--prompt-border);
  border-radius: 10px;
  background: var(--prompt-chip-bg);
  color: var(--muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  padding: 0;
  transform: rotate(3deg);
  transition: color 0.15s var(--ease), background 0.15s var(--ease), border-color 0.15s var(--ease),
    transform 0.15s var(--ease);
}

.attach-empty:hover:not(:disabled) {
  color: var(--ink);
  background: color-mix(in srgb, var(--prompt-chip-bg) 80%, #fff 8%);
  border-color: color-mix(in srgb, var(--prompt-border) 70%, #fff 20%);
  transform: rotate(0deg);
}

.attach-empty:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.attach-plus {
  font-size: 18px;
  font-weight: 300;
  line-height: 1;
}

.attach-empty em {
  font-style: normal;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: -0.02em;
  white-space: nowrap;
  line-height: 1;
  opacity: 0.9;
}

.attach-stack {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--attach-w);
  height: var(--attach-h);
  z-index: 6;
  pointer-events: auto;
}

.attach-stack.hover {
  z-index: 30;
}

.attach-card {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--attach-w);
  height: var(--attach-h);
  margin-left: calc(var(--attach-w) / -2);
  margin-top: calc(var(--attach-h) / -2);
  border-radius: 10px;
  overflow: visible;
  border: 2px solid #fff;
  background: var(--prompt-chip-bg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: transform 0.22s var(--ease), box-shadow 0.22s var(--ease);
  transform-origin: center center;
  pointer-events: auto;
}

.attach-slot-tag {
  position: absolute;
  left: 4px;
  bottom: 4px;
  z-index: 3;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 10px;
  line-height: 14px;
  pointer-events: none;
}

[data-theme='dark'] .attach-card {
  border-color: rgba(255, 255, 255, 0.88);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}

.attach-card :deep(.el-image),
.attach-card :deep(.el-image__wrapper),
.attach-card :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  display: block;
  overflow: hidden;
}

.attach-remove {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(15, 15, 15, 0.88);
  color: #fff;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s var(--ease);
  z-index: 2;
}

/* 最前一张常显删除；悬停展开后其它张也可删 */
.attach-card:last-child .attach-remove,
.attach-stack.hover .attach-remove,
.attach-card:hover .attach-remove {
  opacity: 1;
  pointer-events: auto;
}

.attach-fab {
  position: absolute;
  right: -4px;
  bottom: -2px;
  z-index: 20;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: #fff;
  color: #525252;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  transition: transform 0.15s var(--ease), background 0.15s var(--ease);
}

.attach-fab:hover:not(:disabled) {
  background: #f5f5f5;
  transform: scale(1.06);
}

.attach-fab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ai-prompt-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ai-prompt-editor {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 2px 4px 6px 0;
}

.editor-scroll {
  width: 100%;
  height: auto;
  max-height: inherit;
}

:deep(.tiptap-container) {
  position: relative;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  outline: 0;
  overflow: visible;
  resize: none;
  min-height: 72px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--ink);
}

.ai-prompt-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 2px;
}

.bar-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}

.bar-send {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  margin-left: auto;
}

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--prompt-border);
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s var(--ease), color 0.15s var(--ease), border-color 0.15s var(--ease);
}

.chip:hover:not(:disabled) {
  background: var(--prompt-chip-bg);
  border-color: color-mix(in srgb, var(--prompt-border) 60%, var(--ink) 20%);
}

.chip.on {
  color: var(--prompt-tag-fg);
  background: var(--prompt-tag-bg);
  border-color: color-mix(in srgb, var(--prompt-tag-fg) 35%, transparent);
}

.chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chip-model.readonly {
  cursor: default;
  opacity: 1;
  pointer-events: none;
}

.chip-icon {
  width: 32px;
  padding: 0;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.chip-mode {
  color: #3b82f6;
  border-color: color-mix(in srgb, #3b82f6 35%, var(--prompt-border));
  background: color-mix(in srgb, #3b82f6 8%, transparent);
}

.chip-mode.video {
  color: #14b8a6;
  border-color: color-mix(in srgb, #14b8a6 35%, var(--prompt-border));
  background: color-mix(in srgb, #14b8a6 8%, transparent);
}

.chip-mode.agent {
  color: #8b5cf6;
  border-color: color-mix(in srgb, #8b5cf6 35%, var(--prompt-border));
  background: color-mix(in srgb, #8b5cf6 8%, transparent);
}

.chip-mode .chip-ico.accent {
  color: inherit;
}

.chip-ellipsis {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-caret {
  opacity: 0.55;
  flex-shrink: 0;
}

.chip-ico {
  flex-shrink: 0;
  opacity: 0.92;
}

.chip-spark {
  color: #60a5fa;
  flex-shrink: 0;
}

.chip-model .chip-ellipsis {
  max-width: none;
  overflow: visible;
  text-overflow: clip;
}

.jimeng-check-ico {
  margin-left: auto;
  color: #86efac;
  flex-shrink: 0;
}

.jimeng-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--studio-glass-2);
  color: var(--studio-text-strong);
  flex-shrink: 0;
}

.model-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(96, 165, 250, 0.12);
  color: #93c5fd;
  flex-shrink: 0;
}

.chip-combo {
  padding: 0 4px 0 8px;
  gap: 0;
}

.combo-seg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 100%;
}

.combo-divider {
  width: 1px;
  height: 14px;
  background: var(--prompt-border);
  flex-shrink: 0;
}

.chip-text-tool {
  color: var(--studio-text-strong);
}

.chip-duration {
  gap: 4px;
}

.send-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-sm);
  display: grid;
  place-items: center;
  background: var(--prompt-send-disabled);
  color: var(--accent-ink);
  cursor: not-allowed;
  transition: background 0.15s var(--ease), transform 0.15s var(--ease);
}

.send-btn.ready {
  background: var(--prompt-send);
  cursor: pointer;
}

.send-btn.ready:hover {
  transform: scale(1.05);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.skills-panel {
  padding: 4px;
}

.skills-scroll {
  width: 100%;
}

.skills-title {
  font-size: 13px;
  font-weight: 700;
  padding: 6px 8px 8px;
  color: var(--ink);
}

.skills-search {
  padding: 0 6px 8px;
}

.skills-search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.14));
  background: var(--surface, rgba(255, 255, 255, 0.06));
  color: var(--ink);
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.skills-search-input::placeholder {
  color: var(--muted);
}

.skills-search-input:focus {
  border-color: color-mix(in srgb, var(--accent, #7dd3e8) 55%, var(--line));
}

.skills-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 6px 10px;
}

.skills-cat {
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.14));
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}

.skills-cat:hover:not(:disabled) {
  color: var(--ink);
  border-color: color-mix(in srgb, var(--accent, #7dd3e8) 40%, var(--line));
}

.skills-cat.on {
  color: var(--ink);
  background: color-mix(in srgb, var(--accent, #7dd3e8) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent, #7dd3e8) 45%, transparent);
}

.skills-group + .skills-group {
  margin-top: 6px;
}

.skills-group-title {
  padding: 6px 10px 4px;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--muted);
}

.skill-row {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 10px 10px;
  cursor: pointer;
  font-family: inherit;
}

.skill-row:hover,
.skill-row.on {
  background: var(--prompt-tag-bg, var(--accent-soft));
}

.skill-name {
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
}

.skill-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

.skills-empty.compact {
  padding: 18px 12px;
}

.jimeng-pop {
  padding: 0;
}

.jimeng-pop-title {
  padding: 2px 6px 6px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.3;

  em {
    font-style: normal;
    opacity: 0.75;
  }
}

.jimeng-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: var(--ink);
  border-radius: 8px;
  padding: 6px 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.jimeng-row:hover:not(:disabled),
.jimeng-row.on {
  background: var(--surface-2);
}

.jimeng-row.disabled,
.jimeng-row:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.jimeng-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--ink) 6%, transparent);
  color: var(--ink);
  opacity: 1;
  flex: 0 0 auto;
}

.jimeng-label {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.jimeng-check {
  margin-left: auto;
  color: var(--ink);
  font-weight: 700;
}

.model-scroll {
  width: 100%;
}

.jimeng-model {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 0;
  background: transparent;
  color: var(--ink);
  border-radius: 12px;
  padding: 10px 12px;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.jimeng-model:hover:not(:disabled),
.jimeng-model.on {
  background: var(--surface-2);
}

.model-mark {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  font-size: 12px;
  margin-top: 1px;
}

.jimeng-model.on .model-mark {
  background: color-mix(in srgb, #3b82f6 16%, transparent);
  color: #3b82f6;
}

.model-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-name {
  font-size: 13px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.model-badge {
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, #3b82f6 14%, transparent);
  color: #3b82f6;
  line-height: 1.4;
}

.model-desc {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

.jimeng-empty {
  padding: 16px 12px;
  font-size: 13px;
  color: var(--muted);
  text-align: center;
}

.duration-pop {
  padding: 8px 12px 12px;
}

.duration-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.duration-slider {
  flex: 1 1 auto;
  min-width: 0;
}

.duration-box {
  flex: 0 0 auto;
  min-width: 52px;
  height: 32px;
  border-radius: 8px;
  background: var(--surface-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 13px;
  color: var(--muted);

  strong {
    color: var(--ink);
    font-size: 14px;
  }
}

.duration-ticks {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  padding-right: 64px;
  font-size: 11px;
  color: var(--muted);
}

.mention-pop {
  padding: 4px 4px 8px;
}

.mention-scroll {
  width: 100%;
}

.mention-attach {
  .jimeng-label {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
  }
  strong.mention-name {
    display: block;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 650;
  }
  em {
    font-style: normal;
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
  }
}

.mention-thumb {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  flex: 0 0 auto;
  background: var(--surface-2);
  border: 1px solid var(--line);

  :deep(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.mention-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px 4px;
  color: var(--muted);
  text-align: center;

  p {
    margin: 0;
    font-size: 13px;
    color: var(--ink);
    font-weight: 600;
  }

  span {
    font-size: 12px;
    line-height: 1.4;
  }
}

.mention-art {
  width: 56px;
  height: 48px;
  border-radius: 10px;
  border: 1px dashed var(--line);
  display: grid;
  place-items: center;
  font-size: 22px;
  opacity: 0.7;
}

.mention-create {
  margin-top: 4px;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  opacity: 0.95;
}

.mention-create:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>

<style lang="scss">
.ai-prompt {
  --prompt-tag-bg: var(--accent-soft);
  --prompt-tag-fg: var(--accent);
}

[data-theme='dark'] .ai-prompt {
  --prompt-tag-bg: var(--accent-soft);
  --prompt-tag-fg: var(--accent);
}

.ai-prompt-placeholder {
  position: absolute;
  color: var(--el-text-color-placeholder);
  font-size: 15px;
  font-weight: 400;
  line-height: 1.7;
  top: 0 !important;
  left: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  pointer-events: none;
  user-select: none;
  width: auto;
  max-width: calc(100% - 8px);
  white-space: pre-wrap;
  overflow-wrap: break-word;
  z-index: 1;
}
.ai-prompt-placeholder.is-hidden {
  display: none !important;
}
.ai-prompt-placeholder.typewriter {
  display: flex;
  align-items: baseline;
  gap: 1px;
  top: 2px !important;
  left: 4px !important;
}
.ai-prompt-placeholder .tw-caret {
  display: inline-block;
  width: 1.5px;
  height: 1.05em;
  margin-left: 1px;
  background: currentColor;
  opacity: 0.7;
  vertical-align: -0.12em;
  animation: tw-blink 1s steps(1) infinite;
}
@keyframes tw-blink {
  50% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ai-prompt-placeholder .tw-caret {
    animation: none;
    opacity: 0.45;
  }
}

.ai-prompt-p,
.tiptap-container p {
  color: inherit;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.7;
  margin: 0;
}
.tiptap-container {
  position: relative;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  outline: none;
  overflow: visible;
  resize: none;
  min-height: 72px;
  font-size: 15px;
  line-height: 1.7;
  color: var(--ink);
}
/* 仅整篇编辑器为空时显示占位，避免多段中的空行也冒出提示 */
.tiptap-container.is-editor-empty p.is-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--el-text-color-placeholder);
  pointer-events: none;
  height: 0;
  font-weight: 400;
}

/* TipTap NodeView 可能带 inline white-space，省略号要钉在 label 上 */
.ai-prompt .mention-tag {
  max-width: min(220px, 100%);
  min-width: 0;
  overflow: hidden;
  vertical-align: baseline;
}
.ai-prompt .mention-tag .mention-label {
  display: block;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.ai-prompt-jimeng-popper {
  .jimeng-pop-title {
    padding: 2px 6px 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .jimeng-row,
  .jimeng-model {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    background: transparent;
    color: var(--ink);
    border-radius: 8px;
    padding: 6px 8px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }
  .jimeng-model {
    align-items: flex-start;
  }
  .jimeng-row:hover:not(:disabled),
  .jimeng-row.on,
  .jimeng-model:hover:not(:disabled),
  .jimeng-model.on {
    background: var(--surface-2);
  }
  .jimeng-row.disabled,
  .jimeng-row:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .jimeng-ico {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  .jimeng-label {
    flex: 1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .jimeng-check {
    margin-left: auto;
    font-weight: 700;
  }
  .model-mark {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--surface-2);
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }
  .model-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .model-name {
    font-weight: 650;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .model-badge {
    font-style: normal;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 999px;
    background: color-mix(in srgb, #3b82f6 14%, transparent);
    color: #3b82f6;
  }
  .model-desc {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.4;
  }
  .duration-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 4px;
  }
  .duration-slider {
    flex: 1;
  }
  .duration-box {
    min-width: 52px;
    height: 32px;
    border-radius: 8px;
    background: var(--surface-2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--muted);
    strong {
      color: var(--ink);
    }
  }
  .duration-ticks {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    padding: 0 64px 0 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .mention-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 8px 4px;
    color: var(--muted);
    text-align: center;
    p {
      margin: 0;
      font-size: 13px;
      color: var(--ink);
      font-weight: 600;
    }
    span {
      font-size: 12px;
      line-height: 1.4;
    }
  }
  .mention-art {
    width: 56px;
    height: 48px;
    border-radius: 10px;
    border: 1px dashed var(--line);
    display: grid;
    place-items: center;
    font-size: 22px;
  }
  .mention-create {
    height: 32px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    opacity: 0.95;
  }
  .mention-create:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .mention-attach .mention-name {
    color: var(--muted);
  }
  .mention-thumb {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    overflow: hidden;
    flex: 0 0 auto;
    background: var(--surface-2);
    border: 1px solid var(--line);
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }
  .jimeng-empty {
    padding: 16px 12px;
    font-size: 13px;
    color: var(--muted);
    text-align: center;
  }
}

.ai-prompt .preview-pill {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--prompt-chip-bg, var(--surface-2));
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.ai-prompt .preview-pill:hover:not(:disabled) {
  color: var(--ink);
}
.ai-prompt .preview-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ai-prompt-prefs-popper.el-popover,
.ai-prompt-skills-popper.el-popover {
  --ai-pop-bg: var(--bg-elevated, var(--surface));
  --ai-pop-border: var(--line);
  --ai-pop-shadow: var(--shadow);
  border-radius: 14px !important;
  padding: 10px !important;
  box-shadow: var(--ai-pop-shadow) !important;
  border: 1px solid var(--ai-pop-border) !important;
  background: var(--ai-pop-bg) !important;
  color: var(--ink) !important;
  box-sizing: border-box !important;
  overflow: visible !important;
}

.ai-prompt-jimeng-popper.el-popover {
  --ai-pop-bg: var(--bg-elevated, var(--surface));
  --ai-pop-border: var(--line);
  --ai-pop-shadow: var(--shadow);
  border-radius: 12px !important;
  padding: 6px !important;
  min-width: 0 !important;
  box-shadow: var(--ai-pop-shadow) !important;
  border: 1px solid var(--ai-pop-border) !important;
  background: var(--ai-pop-bg) !important;
  color: var(--ink) !important;
  box-sizing: border-box !important;
  overflow: visible !important;
}

.ai-prompt-prefs-popper.el-popover {
  min-width: 360px !important;
  max-width: min(440px, calc(100vw - 24px)) !important;
}

.ai-prompt-prefs-popper .el-popper__arrow {
  display: block;
}

/* 首页暗色毛玻璃：Teleport 后覆盖浅色主题变量 */
.ai-prompt-home-popper.el-popover {
  --ai-pop-bg: color-mix(in srgb, var(--studio-panel) 94%, transparent);
  --ai-pop-border: var(--studio-line-strong);
  --ai-pop-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  --bg-elevated: color-mix(in srgb, var(--studio-panel) 94%, transparent);
  --surface: var(--studio-panel);
  --surface-2: var(--studio-glass-2);
  --ink: var(--studio-ink);
  --text: var(--studio-text-strong);
  --muted: var(--studio-text-soft);
  --line: var(--studio-line-strong);
  --line-strong: var(--studio-line-strong);
  --accent: #7dd3e8;
  --accent-soft: rgba(77, 175, 201, 0.16);
  --shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  background: var(--ai-pop-bg) !important;
  border-color: var(--ai-pop-border) !important;
  box-shadow: var(--ai-pop-shadow) !important;
  color: var(--ink) !important;

  .el-popper__arrow::before {
    background: var(--ai-pop-bg) !important;
    border: 1px solid var(--ai-pop-border) !important;
  }
}

.ai-prompt-jimeng-popper,
.ai-prompt-prefs-popper,
.ai-prompt-skills-popper {
  .jimeng-pop-title,
  .agent-kind-label,
  .skills-title,
  .skills-group-title {
    color: var(--muted);
  }
  .jimeng-row,
  .jimeng-model,
  .skill-row {
    color: var(--ink);
  }
  .jimeng-row:hover:not(:disabled),
  .jimeng-row.on,
  .jimeng-model:hover:not(:disabled),
  .jimeng-model.on,
  .skill-row:hover,
  .skill-row.on,
  .duration-box {
    background: var(--surface-2);
  }
  .model-badge {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
  }
  .model-desc,
  .skill-desc,
  .jimeng-empty,
  .skills-empty,
  .duration-ticks {
    color: var(--muted);
  }
  .skills-search-input {
    background: var(--studio-glass-2);
    border-color: var(--studio-line-strong);
    color: var(--studio-ink);
  }
  .skills-cat {
    border-color: var(--studio-line-strong);
    color: var(--studio-text-soft);
  }
  .skills-cat.on {
    color: #e8f7fb;
    background: rgba(125, 211, 232, 0.16);
    border-color: rgba(159, 224, 239, 0.45);
  }
}

.chip-auto .auto-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  opacity: 0.9;
  line-height: 0;

  svg {
    display: block;
  }
}

.agent-auto-pop {
  padding: 2px 4px 8px;
  color: var(--ink);
}

.agent-kind-label {
  font-size: 12px;
  color: var(--muted);
  margin: 12px 0 8px;
}

.agent-prefs-panel {
  width: 100% !important;
  padding: 0 !important;
}

.agent-duration {
  margin-top: 10px;
  padding-top: 4px;
}

.skills-empty {
  padding: 18px 12px 14px;
  font-size: 13px;
  color: var(--muted);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  p { margin: 0; color: var(--ink); font-weight: 600; }
  span { font-size: 12px; }
}

.skills-empty-art {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px dashed var(--line);
  display: grid;
  place-items: center;
  font-size: 20px;
  margin-bottom: 4px;
  opacity: 0.75;
}

</style>
