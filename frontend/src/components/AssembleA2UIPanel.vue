<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { A2UISurface, useMessageProcessor, type A2uiMessage } from 'a2ui-vue';
import api from '@/api';
import LibraryPicker from '@/components/LibraryPicker.vue';
import IconBack from '@/components/IconBack.vue';
import { fetchSseJson } from '@/utils/fetch-sse';
import {
  ASSEMBLE_GROUP_META,
  ASSEMBLE_KIND_ORDER,
  buildCandidateCatalogs,
  catalogsFromGroups,
  composeAssembleIdea,
  deriveDescriptionFromPicks,
  deriveStyleBrief,
  deriveTitleFromPicks,
  localFallbackGroups,
  mergeAiExpandedIntoGroups,
  resolveAssembleOptions,
  type AssembleBlockKind,
  type AssembleOption,
} from '@/utils/assemble-blocks';
import { categoryOptionsFor, type AnyLibraryItem, type ScriptLibraryItem } from '@/libraries';
import { useLibrariesStore } from '@/stores/libraries';
import { createProjectFromAssembleDraft } from '@/composables/useAssembleCreate';
import { markOutlinePending } from '@/utils/outline-pending';
import { resetCardFresh } from '@/a2ui/card-motion';
import BookScalePicker from '@/components/BookScalePicker.vue';
import { UiScroll } from '@/components/ui';
import {
  DEFAULT_BOOK_SCALE,
  formatBookScaleIdeaBlock,
  formatBookScaleLabel,
  type BookScale,
} from '@/utils/book-scale';

const props = withDefaults(
  defineProps<{ initialMode?: 'choose' | 'quick' | 'assemble' }>(),
  { initialMode: 'choose' },
);

const emit = defineEmits<{
  created: [projectId: string];
  back: [];
  cancel: [];
}>();

const router = useRouter();
const libraries = useLibrariesStore();
const SCRIPT_LIBRARY = computed(() => libraries.scripts);
const SCRIPT_CATEGORIES = computed(() => libraries.scriptCategories);

type Lane = 'path' | 'quick' | 'assemble';
type ChatTurn = {
  id: string;
  role: 'agent' | 'user';
  text?: string;
  /** 欢迎气泡大标题 */
  greeting?: string;
  surfaceId?: string;
  /** 开写路径建议卡 */
  suggestCards?: boolean;
  /** 快速创建库工具条 */
  quickTools?: boolean;
};

const processor = useMessageProcessor();

const lane = ref<Lane>('path');
const assembleStep = ref(1);
const sessionId = ref('');
const statusMessage = ref('选择一种开写方式');
const progress = ref(0);
const busy = ref(false);
/** 灵感关联流式思考输出 */
const suggestDelta = ref('');
const suggestStreaming = ref(false);
/** 扩充 / 联想等「等结果」态：显示文案 loading，不被表面流式逻辑吞掉 */
const loadingHint = ref('');
const creating = ref(false);
const localMode = ref(false);
const turns = ref<ChatTurn[]>([]);
const chatEnd = ref<HTMLElement | null>(null);
const activeSurfaceId = ref('');
let turnSeq = 0;

const scriptPicker = ref(false);
const stylePicker = ref(false);
const pickedScript = ref('');
const pickedStyle = ref('');
const seedAssets = ref(true);
const pendingSkeleton = ref('');
const quickForm = reactive({ title: '', description: '', styleBrief: '' });
/** 成书篇幅：用户可选预估万字与卷数 */
const bookScale = ref<BookScale>({ ...DEFAULT_BOOK_SCALE });
/** 快速创建分步：1对话中 2可确认开写（AI 引导） */
const quickStep = ref(1);
/** 快速创建 AI 会话 */
const quickSessionId = ref('');
const quickReady = ref(false);
/** 积木拼装过程中用户补充的偏好备注（已改为不可对话，保留兼容） */
const assembleNotes = ref<string[]>([]);

let abort: AbortController | null = null;
let unsub: (() => void) | null = null;
let localScript: ScriptLibraryItem | null = null;
let localGroups: Partial<Record<AssembleBlockKind, AssembleOption[]>> = {};
let localCategory = '';
let localTitleVariants: string[] = [];
let localDescVariants: string[] = [];
/** 当前本地积木勾选（AI 扩充后重建表面时保留） */
let localPicksSnapshot: Record<string, string[]> = {};

const CATALOG_ID = 'https://a2ui.org/specification/v0_9/basic_catalog.json';

const chatInput = ref('');
const PATH_SUGGESTS = [
  {
    id: 'assemble',
    mark: '积',
    title: '积木式拼装',
    desc: '点选题材与灵感生成草案，上方卡片操作，不走对话',
    featured: true,
  },
  {
    id: 'quick',
    mark: '快',
    title: '快速创建',
    desc: 'AI 全程对话引导：聊出书名、简介与风格后开写',
    featured: false,
  },
] as const;

const composerPlaceholder = computed(() => {
  if (lane.value === 'path') return '发消息或描述你的小说想法…';
  if (lane.value === 'quick') {
    if (quickReady.value) return '继续改设定，或直接说「创建」…';
    return '跟 AI 聊聊你的故事想法…';
  }
  return '发消息…';
});

const showComposer = computed(() => lane.value !== 'assemble');

const showBookScale = computed(
  () =>
    (lane.value === 'quick' && quickReady.value) ||
    (lane.value === 'assemble' && assembleStep.value >= 3),
);

/** 右侧设定抽屉：当前设定 + 成书篇幅 */
const settingsDrawer = ref(false);
const showSettingsFab = computed(
  () => (lane.value === 'quick' && quickReady.value) || showBookScale.value,
);

watch(
  () => [lane.value, quickReady.value, assembleStep.value] as const,
  ([laneNow, ready, step]) => {
    if (laneNow === 'quick' && ready) settingsDrawer.value = true;
    else if (laneNow === 'assemble' && step >= 3) settingsDrawer.value = true;
    else if (laneNow === 'path') settingsDrawer.value = false;
  },
);

const quickProgressLabel = computed(() => {
  const d = quickForm;
  if (quickReady.value && d.title && d.description) return '可确认开写';
  if (d.title && d.description && d.styleBrief) return '设定较齐';
  if (d.title && d.description) return '书名+简介';
  if (d.title) return '已有书名';
  return '对话引导中';
});

const laneLabel = computed(() => {
  if (lane.value === 'quick') return '快速创建';
  if (lane.value === 'assemble') return '积木拼装';
  return '写作助手';
});

const canSend = computed(
  () => !!chatInput.value.trim() && !busy.value && !creating.value,
);

const composerRef = ref<HTMLTextAreaElement | null>(null);

function resizeComposer() {
  const el = composerRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(Math.max(el.scrollHeight, 28), 160)}px`;
}

watch(chatInput, () => nextTick(resizeComposer));

function pickPath(id: 'quick' | 'assemble') {
  if (lane.value !== 'path' || busy.value || creating.value) return;
  if (id === 'quick') {
    pushUser('选择了「快速创建」');
    void enterQuick(true);
    return;
  }
  pushUser('选择了「积木式拼装」');
  void enterAssemble(true);
}

function submitComposer() {
  const text = chatInput.value.trim();
  if (!text || busy.value || creating.value) return;
  chatInput.value = '';
  if (lane.value === 'path') {
    void enterQuick(true, text);
    return;
  }
  if (lane.value === 'quick') {
    void sendQuickChat(text);
    return;
  }
}

async function sendQuickChat(text: string) {
  pushUser(text);
  if (/^(创建|开写|确认创建|就这样|可以创建)/.test(text.trim()) && isQuickDraftReady()) {
    await createQuickFromModel({ ...quickForm });
    return;
  }
  busy.value = true;
  loadingHint.value = 'AI 正在想…';
  statusMessage.value = '快速创建 · 对话中';
  try {
    const { data } = await api.post(
      '/ai/create/chat',
      {
        sessionId: quickSessionId.value || undefined,
        message: text,
      },
      { timeout: 30000 },
    );
    if (data?.sessionId) quickSessionId.value = String(data.sessionId);
    const draft = data?.draft || {};
    if (typeof draft.title === 'string' && draft.title.trim()) {
      quickForm.title = draft.title.trim();
    }
    if (typeof draft.description === 'string' && draft.description.trim()) {
      quickForm.description = draft.description.trim();
    }
    if (typeof draft.styleBrief === 'string' && draft.styleBrief.trim()) {
      quickForm.styleBrief = draft.styleBrief.trim();
    }
    quickReady.value = !!data?.ready || isQuickDraftReady();
    quickStep.value = quickReady.value ? 2 : 1;
    progress.value = quickReady.value ? 88 : Math.min(70, 25 + (quickForm.title ? 20 : 0) + (quickForm.description ? 20 : 0));
    statusMessage.value = quickReady.value ? '快速创建 · 可确认开写' : '快速创建 · 对话中';
    pushAgentText(String(data?.reply || '继续聊聊你的故事吧。'));
    if (quickReady.value) showQuickConfirmStep(true);
  } catch (e: any) {
    // 本地兜底：把用户话填进草稿，仍保持对话感
    if (!quickForm.title && text.length <= 24) quickForm.title = text.slice(0, 24);
    else if (!quickForm.description) quickForm.description = text.slice(0, 280);
    else if (!quickForm.styleBrief) quickForm.styleBrief = text.slice(0, 120);
    quickReady.value = isQuickDraftReady();
    quickStep.value = quickReady.value ? 2 : 1;
    pushAgentText(
      e?.response?.data?.message ||
        e?.message ||
        (quickReady.value
          ? `先记下了。书名「${quickForm.title}」，可以点下方创建，或继续改。`
          : '我先记着。再说说书名、冲突或金手指？'),
    );
    if (quickReady.value) showQuickConfirmStep(true);
  } finally {
    loadingHint.value = '';
    busy.value = false;
  }
}

function isQuickDraftReady() {
  return quickForm.title.trim().length >= 2 && quickForm.description.trim().length >= 12;
}

const waitingReply = computed(() => {
  // 扩充 / 重联想：始终显示底部 loading 气泡（带文案）
  if (loadingHint.value) return true;
  if (suggestStreaming.value && activeSurfaceId.value) return false;
  // 已提示「开始创建」后不再叠加载点，否则看起来像卡死
  const last = turns.value[turns.value.length - 1];
  if (last?.role === 'agent' && /开始创建项目/.test(String(last.text || ''))) {
    return false;
  }
  if (creating.value) return true;
  if (!busy.value) return false;
  return !last || last.role === 'user';
});

const surfaceWorking = computed(
  () =>
    !!loadingHint.value ||
    (suggestStreaming.value && !!activeSurfaceId.value && busy.value),
);

watch(loadingHint, (v) => {
  if (v) scrollChat();
});

function scrollChat() {
  nextTick(() => {
    chatEnd.value?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
}

function resetChat() {
  turns.value = [];
  turnSeq = 0;
  activeSurfaceId.value = '';
  processor.clearSurfaces();
}

function pushUser(summary: string) {
  turns.value.push({
    id: `u-${++turnSeq}`,
    role: 'user',
    text: summary,
  });
  scrollChat();
}

function pushAgentText(text: string, extras?: Partial<ChatTurn>) {
  turns.value.push({
    id: `a-${++turnSeq}`,
    role: 'agent',
    text,
    ...extras,
  });
  scrollChat();
}

function remapSurfaceMessages(
  messages: Record<string, unknown>[],
  surfaceId: string,
): A2uiMessage[] {
  return messages
    .filter((m) => !m.deleteSurface)
    .map((raw) => {
      const m = JSON.parse(JSON.stringify(raw)) as Record<string, any>;
      for (const key of ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface']) {
        if (m[key]?.surfaceId) m[key].surfaceId = surfaceId;
      }
      return m as A2uiMessage;
    });
}

function ingestA2ui(messages: Record<string, unknown>[], agentText?: string) {
  const surfaceId = `turn-${++turnSeq}`;
  const remapped = remapSurfaceMessages(messages, surfaceId);
  if (!remapped.length) return;
  // 确保有 createSurface
  const hasCreate = remapped.some((m) => 'createSurface' in m);
  const batch = hasCreate
    ? remapped
    : [
        {
          version: 'v0.9',
          createSurface: { surfaceId, catalogId: CATALOG_ID, sendDataModel: true },
        } as A2uiMessage,
        ...remapped,
      ];
  processor.processMessages(batch);
  activeSurfaceId.value = surfaceId;
  turns.value.push({
    id: `a-${surfaceId}`,
    role: 'agent',
    text: agentText,
    surfaceId,
    quickTools: false,
  });
  scrollChat();
}

/** 同一气泡内增量更新（积木卡片逐组出现） */
function patchA2ui(messages: Record<string, unknown>[]) {
  const surfaceId = activeSurfaceId.value;
  if (!surfaceId) {
    ingestA2ui(messages);
    return;
  }
  const remapped = remapSurfaceMessages(messages, surfaceId).filter(
    (m) => !('createSurface' in m) && !('deleteSurface' in m),
  );
  if (!remapped.length) return;
  processor.processMessages(remapped);
  scrollChat();
}

function pushLocalSurface(
  components: Record<string, unknown>[],
  data: Record<string, unknown>,
  agentText?: string,
) {
  ingestA2ui(
    [
      {
        version: 'v0.9',
        createSurface: { surfaceId: 'local', catalogId: CATALOG_ID, sendDataModel: true },
      },
      {
        version: 'v0.9',
        updateDataModel: { surfaceId: 'local', path: '/', value: data },
      },
      {
        version: 'v0.9',
        updateComponents: { surfaceId: 'local', components },
      },
    ],
    agentText,
  );
}

function patchLocalSurface(
  components: Record<string, unknown>[],
  data: Record<string, unknown>,
) {
  if (!activeSurfaceId.value) {
    pushLocalSurface(components, data);
    return;
  }
  patchA2ui([
    {
      version: 'v0.9',
      updateDataModel: { surfaceId: 'local', path: '/', value: data },
    },
    {
      version: 'v0.9',
      updateComponents: { surfaceId: 'local', components },
    },
  ]);
}

function scriptsForCategory(category: string) {
  return SCRIPT_LIBRARY.value.filter((s) => s.category === category)
    .slice(0, 40)
    .map((s) => ({
      id: s.id,
      label: s.label,
      category: s.category,
      tags: s.tags,
      blurb: s.blurb,
      idea: s.idea,
    }));
}

function buildCatalogsOnly(script: ScriptLibraryItem) {
  return buildCandidateCatalogs(script);
}

function findScript(id: string): ScriptLibraryItem | undefined {
  return SCRIPT_LIBRARY.value.find((s) => s.id === id);
}

function enterPath() {
  lane.value = 'path';
  assembleStep.value = 1;
  quickStep.value = 1;
  quickSessionId.value = '';
  quickReady.value = false;
  busy.value = false;
  suggestStreaming.value = false;
  loadingHint.value = '';
  localMode.value = false;
  sessionId.value = '';
  progress.value = 0;
  statusMessage.value = '在对话里选一条开写路径';
  abort?.abort();
  resetChat();
  quickForm.title = '';
  quickForm.description = '';
  quickForm.styleBrief = '';
  bookScale.value = { ...DEFAULT_BOOK_SCALE };
  pickedScript.value = '';
  pickedStyle.value = '';
  pendingSkeleton.value = '';
  assembleNotes.value = [];
  pushAgentText('我可以陪你聊天开书，或用积木拼出百万字向大纲（积木模式点选操作、不走对话）。', {
    greeting: '你好，我是写作助手',
    suggestCards: true,
  });
}

function enterQuick(skipUser = false, seedMessage?: string) {
  lane.value = 'quick';
  quickStep.value = 1;
  quickSessionId.value = '';
  quickReady.value = false;
  statusMessage.value = '快速创建 · 对话中';
  progress.value = 18;
  if (!skipUser) pushUser('选择了「快速创建」');
  if (!seedMessage) {
    pushAgentText(
      [
        '好，我们用对话开书——我会每轮直接给你可改的草案，不用一问一答抠细节。',
        '',
        '随便丢一句就行：题材、男主、金手指，或「修仙散修轻松文」这种关键词。',
        '我马上回你：书名候选 + 完整简介 + 风格建议。',
      ].join('\n'),
    );
    return;
  }
  void sendQuickChat(seedMessage);
}

function showQuickTitleStep() {
  quickStep.value = 1;
  statusMessage.value = '快速创建 · 书名';
  progress.value = 20;
  pushLocalSurface(
    [
      { id: 'root', component: 'Column', children: ['field_title', 'actions'] },
      {
        id: 'field_title',
        component: 'TextField',
        label: '书名',
        value: { path: '/title' },
        variant: 'shortText',
        checks: [
          {
            condition: {
              call: 'required',
              args: { value: { path: '/title' } },
              returnType: 'boolean',
            },
            message: '请填写书名',
          },
        ],
      },
      { id: 'actions', component: 'Row', children: ['btn_next'] },
      {
        id: 'btn_next',
        component: 'Button',
        variant: 'primary',
        child: 'btn_next_label',
        checks: [
          {
            condition: {
              call: 'required',
              args: { value: { path: '/title' } },
              returnType: 'boolean',
            },
            message: '请填写书名',
          },
        ],
        action: {
          event: {
            name: 'quick_next_title',
            context: { title: { path: '/title' } },
          },
        },
      },
      { id: 'btn_next_label', component: 'Text', text: '下一步' },
    ],
    { title: quickForm.title },
    '先取个书名吧？',
  );
}

function showQuickDescStep() {
  quickStep.value = 2;
  statusMessage.value = '快速创建 · 简介';
  progress.value = 45;
  pushLocalSurface(
    [
      { id: 'root', component: 'Column', children: ['field_desc', 'libs', 'actions'] },
      {
        id: 'field_desc',
        component: 'TextField',
        label: '简介 / 灵感',
        value: { path: '/description' },
        variant: 'longText',
      },
      { id: 'libs', component: 'Row', children: ['btn_script'] },
      {
        id: 'btn_script',
        component: 'Button',
        child: 'btn_script_label',
        action: { event: { name: 'open_script_lib', context: {} } },
      },
      { id: 'btn_script_label', component: 'Text', text: '从灵感库选用' },
      { id: 'actions', component: 'Row', children: ['btn_skip', 'btn_next'] },
      {
        id: 'btn_skip',
        component: 'Button',
        child: 'btn_skip_label',
        action: { event: { name: 'quick_skip_desc', context: {} } },
      },
      { id: 'btn_skip_label', component: 'Text', text: '暂时跳过' },
      {
        id: 'btn_next',
        component: 'Button',
        variant: 'primary',
        child: 'btn_next_label',
        action: {
          event: {
            name: 'quick_next_desc',
            context: { description: { path: '/description' } },
          },
        },
      },
      { id: 'btn_next_label', component: 'Text', text: '下一步' },
    ],
    { title: quickForm.title, description: quickForm.description },
    `「${quickForm.title || '这部小说'}」的简介或灵感，可以手写，也可以从灵感库选。`,
  );
}

function showQuickStyleStep() {
  quickStep.value = 3;
  statusMessage.value = '快速创建 · 风格';
  progress.value = 70;
  pushLocalSurface(
    [
      { id: 'root', component: 'Column', children: ['field_style', 'libs', 'actions'] },
      {
        id: 'field_style',
        component: 'TextField',
        label: '画面风格',
        value: { path: '/styleBrief' },
        variant: 'longText',
      },
      { id: 'libs', component: 'Row', children: ['btn_style'] },
      {
        id: 'btn_style',
        component: 'Button',
        child: 'btn_style_label',
        action: { event: { name: 'open_style_lib', context: {} } },
      },
      { id: 'btn_style_label', component: 'Text', text: '从风格库选用' },
      { id: 'actions', component: 'Row', children: ['btn_skip', 'btn_next'] },
      {
        id: 'btn_skip',
        component: 'Button',
        child: 'btn_skip_label',
        action: { event: { name: 'quick_skip_style', context: {} } },
      },
      { id: 'btn_skip_label', component: 'Text', text: '暂时跳过' },
      {
        id: 'btn_next',
        component: 'Button',
        variant: 'primary',
        child: 'btn_next_label',
        action: {
          event: {
            name: 'quick_next_style',
            context: { styleBrief: { path: '/styleBrief' } },
          },
        },
      },
      { id: 'btn_next_label', component: 'Text', text: '下一步' },
    ],
    {
      title: quickForm.title,
      description: quickForm.description,
      styleBrief: quickForm.styleBrief,
    },
    '画面风格想怎么定？也可以先跳过，之后再补。',
  );
}

function showQuickConfirmStep(fromAi = false) {
  quickStep.value = 2;
  quickReady.value = true;
  statusMessage.value = '快速创建 · 可确认开写';
  progress.value = 90;
  settingsDrawer.value = true;
  if (!fromAi) {
    pushAgentText('信息差不多了，右侧可确认设定并开写；不满意继续聊就行。');
  }
}

function confirmQuickCreate() {
  if (creating.value || busy.value) return;
  void createQuickFromModel();
}

async function enterAssemble(skipUser = false) {
  lane.value = 'assemble';
  assembleStep.value = 1;
  localMode.value = false;
  sessionId.value = '';
  progress.value = 5;
  statusMessage.value = '助手正在提问…';
  assembleNotes.value = [];
  if (!skipUser) pushUser('选择了「积木式拼装」');
  try {
    await libraries.ensureAll();
    await runA2ui({
      action: 'start',
      categories: SCRIPT_CATEGORIES.value,
      categoryOptions: categoryOptionsFor(SCRIPT_CATEGORIES.value),
    });
    assembleStep.value = 1;
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    ElMessage.warning(e?.message || '后端暂不可用，已切换本地回退');
    enterLocalCategory();
  }
}

function mergeAssembleNotes(idea: string) {
  const notes = assembleNotes.value.map((s) => s.trim()).filter(Boolean);
  if (!notes.length) return idea;
  return `${idea.trim()}\n\n【作者补充偏好】\n${notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
}

function agentTextForStage(stage?: string) {
  switch (stage) {
    case 'category':
      return '先选个题材方向？下面每张卡片有简介，点一下就行。';
    case 'script':
      return '这一题材下，哪条灵感更对你胃口？';
    case 'suggest':
      return '正在生成拼装草案，稍等会出齐各组积木。';
    case 'draft':
      return '草案生成中：各组积木会一张张出来，不用干等。';
    case 'expand':
      return '关联已出齐，正在按组并入 AI 扩充（暖色卡）。';
    case 'blocks':
      return '草案已就绪：青绿=本地，暖色=AI。默认已预选，只改不满意的即可。';
    case 'fallback':
      return 'AI 暂时不可用，已用本地相近标签生成草案；可稍后点「AI 再扩充」。';
    case 'confirm':
    case 'create':
      return '书名和简介可用 AI 联想点选，确认后开项目；大纲在概览后台生成。';
    default:
      return '';
  }
}

function summarizeUserAction(
  name: string,
  context: Record<string, unknown>,
  dataModel: Record<string, unknown>,
) {
  const scalar = (v: unknown) =>
    Array.isArray(v) ? String(v[0] || '') : v == null ? '' : String(v);
  if (name === 'select_category') {
    const c = scalar(context.category ?? dataModel.category);
    return c ? `题材选「${c}」` : '已选题材';
  }
  if (name === 'select_script') {
    const id = scalar(context.scriptId ?? dataModel.scriptId);
    const script = findScript(id);
    return script ? `灵感选「${script.label}」` : '已选灵感';
  }
  if (name === 'confirm_picks') return '积木草案确认好了';
  if (name === 'expand_blocks') return '请求 AI 再扩充积木';
  if (name === 'refresh_draft') return '请求重出拼装草案';
  if (name === 'suggest_meta') return '请求 AI 重联想书名简介';
  if (name === 'create_project') return '确认创建项目';
  if (name === 'back_category') return '返回重选题材';
  if (name === 'back_script') return '返回重选灵感';
  if (name === 'back_blocks') return '返回改积木';
  return '';
}

async function runA2ui(body: Record<string, unknown>) {
  abort?.abort();
  abort = new AbortController();
  busy.value = true;
  let draft: any = null;
  let pendingStage = '';
  /** 收到 done 后立刻开建，避免 SSE 流不结束导致永远卡在加载 */
  let createPromise: Promise<void> | null = null;
  const action = String(body.action || '');
  try {
    if (action === 'select_script') {
      resetCardFresh();
      suggestDelta.value = '';
      suggestStreaming.value = true;
      loadingHint.value = '';
    } else if (action === 'expand_blocks' || action === 'refresh_draft') {
      // 扩写 / 重出草案：A2UI 骨架卡承担 loading
      suggestStreaming.value = true;
      loadingHint.value = '';
      statusMessage.value =
        action === 'refresh_draft' ? '正在重新生成拼装草案…' : 'AI 正在扩写设定 / 人物 / 桥段…';
      progress.value = Math.max(progress.value, action === 'refresh_draft' ? 50 : 80);
    } else if (action === 'suggest_meta' || action === 'confirm_picks') {
      suggestStreaming.value = true;
      loadingHint.value =
        action === 'confirm_picks'
          ? 'AI 正在联想书名与简介…'
          : 'AI 正在重联想书名与简介…';
      statusMessage.value = loadingHint.value;
      progress.value = Math.max(progress.value, action === 'confirm_picks' ? 88 : 90);
    }
    try {
      await fetchSseJson('/ai/assemble/a2ui', {
        body,
        signal: abort.signal,
        onEvent: async (ev) => {
          if (!ev || typeof ev !== 'object') return;
          if (ev.type === 'session' && ev.sessionId) {
            sessionId.value = String(ev.sessionId);
          } else if (ev.type === 'delta') {
            // 原始 JSON 不展示；卡片由后续 a2ui patch 推进
            return;
          } else if (ev.type === 'status') {
            if (ev.message) statusMessage.value = String(ev.message);
            if (typeof ev.progress === 'number') {
              progress.value = Math.max(progress.value, Math.min(100, ev.progress));
            }
            if (ev.stage) pendingStage = String(ev.stage);
            if (ev.stage === 'category') assembleStep.value = 1;
            if (ev.stage === 'script') assembleStep.value = 2;
            if (
              ev.stage === 'blocks' ||
              ev.stage === 'suggest' ||
              ev.stage === 'fallback' ||
              ev.stage === 'expand' ||
              ev.stage === 'draft'
            ) {
              assembleStep.value = 3;
            }
            if (ev.stage === 'confirm' || ev.stage === 'create') assembleStep.value = 4;
            if (
              ev.stage === 'suggest' ||
              ev.stage === 'fallback' ||
              ev.stage === 'expand' ||
              ev.stage === 'draft'
            ) {
              suggestStreaming.value = true;
            }
            if (ev.stage === 'expand') {
              loadingHint.value = '';
              statusMessage.value = String(ev.message || 'AI 正在扩写设定 / 人物 / 桥段…');
            }
            if (ev.stage === 'draft') {
              loadingHint.value = '';
              statusMessage.value = String(ev.message || '正在生成拼装草案…');
            }
            if (ev.stage === 'confirm' && /联想/.test(String(ev.message || ''))) {
              loadingHint.value = String(ev.message);
              suggestStreaming.value = true;
            }
            if (ev.stage === 'blocks') {
              suggestStreaming.value = false;
              loadingHint.value = '';
            }
            if (ev.stage === 'confirm' && !/联想/.test(String(ev.message || ''))) {
              suggestStreaming.value = false;
              loadingHint.value = '';
            }
          } else if (ev.type === 'a2ui' && Array.isArray(ev.messages)) {
            if (ev.patch && activeSurfaceId.value) {
              patchA2ui(ev.messages);
            } else {
              ingestA2ui(
                ev.messages,
                agentTextForStage(pendingStage) || statusMessage.value,
              );
            }
            if (pendingStage === 'expand') {
              loadingHint.value = '';
              suggestStreaming.value = true;
            }
            if (pendingStage === 'blocks' || pendingStage === 'confirm') {
              suggestStreaming.value = false;
              loadingHint.value = '';
            }
          } else if (ev.type === 'done' && ev.draft) {
            suggestStreaming.value = false;
            suggestDelta.value = '';
            loadingHint.value = '';
            draft = ev.draft;
            pushAgentText('好，开始创建项目并生成大纲…');
            if (!createPromise) {
              createPromise = createFromDraft(draft);
            }
            // 掐断 SSE，防止 Connection keep-alive 一直挂起
            queueMicrotask(() => abort?.abort());
          } else if (ev.type === 'error') {
            suggestStreaming.value = false;
            suggestDelta.value = '';
            loadingHint.value = '';
            throw new Error(String(ev.message || '积木问答失败'));
          }
        },
      });
    } catch (e: any) {
      // done 后主动 abort 属预期
      if (e?.name !== 'AbortError' && !/abort|cancel/i.test(String(e?.message || ''))) {
        throw e;
      }
    }
    if (draft && !createPromise) {
      createPromise = createFromDraft(draft);
    }
    if (createPromise) await createPromise;
  } finally {
    suggestStreaming.value = false;
    loadingHint.value = '';
    busy.value = false;
    abort = null;
  }
}

function enterLocalCategory() {
  localMode.value = true;
  lane.value = 'assemble';
  assembleStep.value = 1;
  sessionId.value = 'local-fallback';
  statusMessage.value = '本地回退模板（不依赖 AI）';
  progress.value = 20;
  const options = categoryOptionsFor(SCRIPT_CATEGORIES.value);
  pushLocalSurface(
    [
      { id: 'root', component: 'Column', children: ['picker', 'actions'] },
      {
        id: 'picker',
        component: 'ChoicePicker',
        variant: 'mutuallyExclusive',
        displayStyle: 'cards',
        filterable: true,
        options,
        value: { path: '/category' },
      },
      {
        id: 'actions',
        component: 'Button',
        variant: 'primary',
        child: 'btn_label',
        action: {
          event: {
            name: 'select_category',
            context: { category: { path: '/category' } },
          },
        },
      },
      { id: 'btn_label', component: 'Text', text: '就选这个题材' },
    ],
    { category: [] },
    '后端暂时连不上，我们先用本地模板继续。选一个题材？',
  );
}

function enterLocalScript(category: string) {
  localCategory = category;
  assembleStep.value = 2;
  const items = SCRIPT_LIBRARY.value.filter((s) => s.category === category).slice(0, 40);
  const options = items.map((s) => ({
    label: s.label,
    value: s.id,
    description: s.blurb,
    mark: s.label.slice(0, 1),
  }));
  statusMessage.value = `本地 · 题材「${category}」`;
  progress.value = 40;
  pushLocalSurface(
    [
      { id: 'root', component: 'Column', children: ['picker', 'actions'] },
      {
        id: 'picker',
        component: 'ChoicePicker',
        variant: 'mutuallyExclusive',
        displayStyle: 'cards',
        filterable: true,
        options: options.length ? options : [{ label: '（无）', value: '', description: '换个题材试试' }],
        value: { path: '/scriptId' },
      },
      { id: 'actions', component: 'Row', children: ['btn_back', 'btn_next'] },
      {
        id: 'btn_back',
        component: 'Button',
        child: 'btn_back_label',
        action: { event: { name: 'back_category', context: {} } },
      },
      { id: 'btn_back_label', component: 'Text', text: '换个题材' },
      {
        id: 'btn_next',
        component: 'Button',
        variant: 'primary',
        child: 'btn_next_label',
        action: {
          event: {
            name: 'select_script',
            context: { scriptId: { path: '/scriptId' } },
          },
        },
      },
      { id: 'btn_next_label', component: 'Text', text: '用这条灵感' },
    ],
    { category, scriptId: [] },
    items.length
      ? `「${category}」里有 ${items.length} 条灵感，选一条当主线？`
      : '这个分类暂时没有灵感，换个题材试试。',
  );
}

function readLocalPicksFromModel(dataModel?: Record<string, unknown>): Record<string, string[]> {
  const picks = (dataModel?.picks || localPicksSnapshot || {}) as Record<string, string[]>;
  const normalized: Record<string, string[]> = {};
  for (const kind of ASSEMBLE_KIND_ORDER) {
    const v = picks[kind];
    normalized[kind] = Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  }
  return normalized;
}

function buildLocalBlocksComponents(opts?: { expanding?: boolean; drafting?: boolean }) {
  const expanding = !!opts?.expanding;
  const drafting = !!opts?.drafting;
  if (!localScript) {
    return { components: [] as Record<string, unknown>[], defaultPicks: {} as Record<string, string[]> };
  }
  const readyCount = ASSEMBLE_KIND_ORDER.filter((k) => (localGroups[k] || []).length > 0).length;
  const childIds: string[] = ['source'];
  const components: Record<string, unknown>[] = [
    { id: 'root', component: 'Column', children: childIds },
    {
      id: 'source',
      component: 'Text',
      text: drafting
        ? `草案生成中（已出 ${readyCount}/${ASSEMBLE_KIND_ORDER.length} 组）…`
        : expanding
          ? 'AI 正在扩写设定 / 人物 / 桥段…（暖色闪烁骨架卡为新增位）'
          : '拼装草案 · 青绿=本地 · 暖色=AI · 默认已预选，改不满意的即可',
      variant: 'caption',
    },
  ];
  const defaultPicks: Record<string, string[]> = { ...localPicksSnapshot };
  for (const kind of ASSEMBLE_KIND_ORDER) {
    const meta = ASSEMBLE_GROUP_META[kind];
    const optsList = localGroups[kind] || [];
    const validIds = new Set(optsList.map((o) => o.id));
    let picks = (defaultPicks[kind] || []).filter((id) => validIds.has(id));
    if (!picks.length) {
      const n = Math.min(Math.max(meta.min, meta.min ? 1 : 0), meta.max, optsList.length);
      picks = optsList.slice(0, n).map((o) => o.id);
    }
    defaultPicks[kind] = picks;
    const headId = `h_${kind}`;
    const pickId = `p_${kind}`;
    childIds.push(headId, pickId);
    const options = optsList.map((o) => {
      const isAi = o.reason === 'AI 扩充' || String(o.id).startsWith('ai-');
      return {
        label: o.label,
        value: o.id,
        description: o.blurb,
        mark: String(o.label || '').slice(0, 1) || '·',
        badge: isAi ? 'AI' : '本地',
        tone: isAi ? 'ai' : 'local',
      };
    });
    if (!optsList.length) {
      options.push(
        {
          label: '生成中',
          value: `_loading_${kind}_a`,
          description: '正在匹配相关积木…',
          mark: '·',
          badge: '本地',
          tone: 'local',
        },
        {
          label: '生成中',
          value: `_loading_${kind}_b`,
          description: '稍候就会出现',
          mark: '·',
          badge: '本地',
          tone: 'local',
        },
      );
    } else if (expanding) {
      options.push(
        {
          label: '扩写中',
          value: `_loading_${kind}_x`,
          description: 'AI 正在发明新积木…',
          mark: '·',
          badge: 'AI',
          tone: 'ai',
        },
        {
          label: '扩写中',
          value: `_loading_${kind}_y`,
          description: '设定 / 人物 / 桥段…',
          mark: '·',
          badge: 'AI',
          tone: 'ai',
        },
      );
    }
    components.push({
      id: headId,
      component: 'Text',
      text: !optsList.length
        ? `${meta.title} · 匹配中…`
        : expanding
          ? `${meta.title} · AI 扩写中…`
          : `${meta.title} · ${meta.hint}`,
      variant: 'h4',
    });
    components.push({
      id: pickId,
      component: 'ChoicePicker',
      variant: meta.max === 1 ? 'mutuallyExclusive' : 'multipleSelection',
      displayStyle: 'cards',
      options,
      value: { path: `/picks/${kind}` },
    });
  }
  if (!expanding && !drafting) {
    childIds.push('actions');
    components.push({
      id: 'actions',
      component: 'Row',
      children: ['btn_refresh', 'btn_expand', 'btn_next'],
    });
    components.push({
      id: 'btn_refresh',
      component: 'Button',
      child: 'btn_refresh_label',
      action: {
        event: { name: 'refresh_draft', context: { picks: { path: '/picks' } } },
      },
    });
    components.push({ id: 'btn_refresh_label', component: 'Text', text: '重出草案' });
    components.push({
      id: 'btn_expand',
      component: 'Button',
      child: 'btn_expand_label',
      action: {
        event: { name: 'expand_blocks', context: { picks: { path: '/picks' } } },
      },
    });
    components.push({ id: 'btn_expand_label', component: 'Text', text: 'AI 再扩充' });
    components.push({
      id: 'btn_next',
      component: 'Button',
      variant: 'primary',
      child: 'btn_next_label',
      action: {
        event: { name: 'confirm_picks', context: { picks: { path: '/picks' } } },
      },
    });
    components.push({ id: 'btn_next_label', component: 'Text', text: '草案 OK，下一步' });
  }
  (components[0] as { children: string[] }).children = childIds;
  localPicksSnapshot = defaultPicks;
  return { components, defaultPicks };
}

function renderLocalBlocksSurface(
  agentText?: string,
  opts?: { expanding?: boolean; drafting?: boolean; patch?: boolean },
) {
  if (!localScript) return;
  assembleStep.value = 3;
  const { components, defaultPicks } = buildLocalBlocksComponents({
    expanding: opts?.expanding,
    drafting: opts?.drafting,
  });
  const data = {
    category: localCategory,
    scriptId: localScript.id,
    picks: defaultPicks,
    title: localScript.label,
    description: localScript.idea,
  };
  const text =
    agentText ||
    (opts?.expanding
      ? 'AI 正在再充实草案…'
      : `灵感「${localScript.label}」——草案已预选，青绿本地 / 暖色 AI；不够再点「AI 再扩充」。`);
  if (opts?.patch && activeSurfaceId.value) {
    patchLocalSurface(components, data);
  } else {
    pushLocalSurface(components, data, text);
  }
}

async function composeLocalDraft(opts?: { silent?: boolean }) {
  if (!localScript) return;
  loadingHint.value = '';
  statusMessage.value = '草案生成中：各组会陆续出现…';
  suggestStreaming.value = true;
  progress.value = Math.max(progress.value, 40);
  // 先出骨架，再按组填充
  localGroups = {};
  for (const kind of ASSEMBLE_KIND_ORDER) localGroups[kind] = [];
  renderLocalBlocksSurface(undefined, { drafting: true, patch: !!activeSurfaceId.value });

  const catalogs = buildCandidateCatalogs(localScript);
  const mapped: Partial<Record<AssembleBlockKind, AssembleOption[]>> = {};
  const revealed = new Set<AssembleBlockKind>();

  const paintRevealed = () => {
    localGroups = {};
    for (const kind of ASSEMBLE_KIND_ORDER) {
      localGroups[kind] = mapped[kind] || [];
    }
    const stillMatching = revealed.size < ASSEMBLE_KIND_ORDER.length;
    renderLocalBlocksSurface(undefined, {
      drafting: stillMatching,
      expanding: !stillMatching,
      patch: true,
    });
  };

  try {
    // 与关联并行启动扩充（长超时），避免等关联结束才开始导致「全程只有本地卡」
    const expandPromise = api.post(
      '/ai/assemble/expand',
      {
        scriptLabel: localScript.label,
        scriptIdea: localScript.idea,
        scriptCategory: localScript.category,
        tags: localScript.tags || [],
        catalogs,
      },
      { timeout: 45000 },
    );

    await fetchSseJson('/ai/assemble/suggest-stream', {
      body: {
        scriptLabel: localScript.label,
        scriptIdea: localScript.idea,
        scriptCategory: localScript.category,
        tags: localScript.tags || [],
        catalogs,
      },
      onEvent: async (ev) => {
        if (!ev || typeof ev !== 'object') return;
        if (ev.type === 'status') {
          if (ev.message) statusMessage.value = String(ev.message);
          if (typeof ev.progress === 'number') {
            progress.value = Math.max(progress.value, Math.min(78, Number(ev.progress)));
          }
        } else if (ev.type === 'group' && ev.kind) {
          const kind = ev.kind as AssembleBlockKind;
          if (!ASSEMBLE_KIND_ORDER.includes(kind)) return;
          const picks = Array.isArray(ev.picks) ? ev.picks : [];
          mapped[kind] = resolveAssembleOptions(
            kind,
            picks.map((p: any) => ({ id: String(p.id), reason: p.reason || '草案推荐' })),
          );
          if (!mapped[kind]?.length) {
            mapped[kind] = localFallbackGroups(localScript!)[kind] || [];
          }
          revealed.add(kind);
          statusMessage.value = `已出「${ASSEMBLE_GROUP_META[kind].title}」${mapped[kind]!.length} 条`;
          paintRevealed();
        } else if (ev.type === 'done') {
          const groups = (ev.groups || {}) as Record<string, Array<{ id: string; reason?: string }>>;
          for (const kind of ASSEMBLE_KIND_ORDER) {
            const picks = Array.isArray(groups[kind]) ? groups[kind] : [];
            if (!mapped[kind]?.length && picks.length) {
              mapped[kind] = resolveAssembleOptions(
                kind,
                picks.map((p) => ({ id: p.id, reason: p.reason || '草案推荐' })),
              );
            }
            if (!mapped[kind]?.length) {
              mapped[kind] = localFallbackGroups(localScript!)[kind] || [];
            }
            if (!revealed.has(kind) && mapped[kind]?.length) {
              revealed.add(kind);
              statusMessage.value = `已出「${ASSEMBLE_GROUP_META[kind].title}」${mapped[kind]!.length} 条`;
              paintRevealed();
              await new Promise((r) => setTimeout(r, 70));
            }
          }
        }
      },
    });

    localGroups = { ...mapped };
    for (const kind of ASSEMBLE_KIND_ORDER) {
      if (!localGroups[kind]?.length) {
        localGroups[kind] = localFallbackGroups(localScript)[kind] || [];
      }
    }
    // 先解锁草案
    statusMessage.value = '草案已就绪，正在并入 AI 暖色卡…';
    progress.value = 82;
    renderLocalBlocksSurface(
      opts?.silent
        ? undefined
        : '草案已就绪，可先微调；暖色 AI 卡正在并入。',
      { patch: true },
    );

    try {
      const { data: exp } = await expandPromise;
      const items = (exp?.items || {}) as Record<string, any[]>;
      if (exp?.source === 'ai' && Object.keys(items).length) {
        for (const kind of ASSEMBLE_KIND_ORDER) {
          const rows = items[kind] || [];
          if (!rows.length) continue;
          localGroups = mergeAiExpandedIntoGroups(localGroups, { [kind]: rows });
          statusMessage.value = `已追加 AI「${ASSEMBLE_GROUP_META[kind].title}」${rows.length} 条`;
          renderLocalBlocksSurface(undefined, { patch: true });
          await new Promise((r) => setTimeout(r, 70));
        }
      } else {
        statusMessage.value = '暖色卡未生成，可点「AI 再扩充」';
      }
    } catch {
      statusMessage.value = '扩充超时已跳过，可点「AI 再扩充」';
    }

    progress.value = 95;
    renderLocalBlocksSurface(
      opts?.silent
        ? undefined
        : '草案已就绪：默认预选，改不满意的即可；不够再点「AI 再扩充」。',
      { patch: true },
    );
  } catch (e: any) {
    localGroups = localFallbackGroups(localScript);
    if (!opts?.silent) {
      ElMessage.warning(e?.response?.data?.message || e?.message || '草案生成失败，已用本地相近');
    }
    statusMessage.value = '本地草案已就绪';
    renderLocalBlocksSurface(undefined, { patch: true });
  } finally {
    loadingHint.value = '';
    suggestStreaming.value = false;
  }
}

async function expandLocalBlocksAi(opts?: { silent?: boolean }) {
  if (!localScript) return;
  // 首次进积木：走完整草案；按钮再扩充仍走 expand
  if (opts?.silent) {
    await composeLocalDraft(opts);
    return;
  }
  loadingHint.value = '';
  statusMessage.value = 'AI 再扩充中（约十余秒）…';
  suggestStreaming.value = true;
  progress.value = Math.max(progress.value, 78);
  renderLocalBlocksSurface(undefined, { patch: true });
  try {
    const catalogs = {
      ...buildCandidateCatalogs(localScript),
      ...catalogsFromGroups(localGroups),
    };
    const { data } = await api.post(
      '/ai/assemble/expand',
      {
        scriptLabel: localScript.label,
        scriptIdea: localScript.idea,
        scriptCategory: localScript.category,
        tags: localScript.tags || [],
        catalogs,
      },
      { timeout: 20000 },
    );
    const items = (data?.items || {}) as Record<string, any[]>;
    if (data?.source === 'ai' && Object.keys(items).length) {
      for (const kind of ASSEMBLE_KIND_ORDER) {
        const rows = items[kind] || [];
        if (!rows.length) continue;
        localGroups = mergeAiExpandedIntoGroups(localGroups, { [kind]: rows });
        statusMessage.value = `已追加 AI「${ASSEMBLE_GROUP_META[kind].title}」${rows.length} 条`;
        renderLocalBlocksSurface(undefined, { patch: true });
        await new Promise((r) => setTimeout(r, 80));
      }
      statusMessage.value = '已追加 AI 扩充积木';
      progress.value = 84;
      renderLocalBlocksSurface('已追加 AI 扩充。青绿为本地，暖色为 AI。', { patch: true });
    } else {
      ElMessage.warning('AI 扩充暂不可用，可继续用当前草案');
      renderLocalBlocksSurface(undefined, { patch: true });
    }
  } catch (e: any) {
    ElMessage.warning(e?.response?.data?.message || e?.message || 'AI 扩充超时或失败');
    renderLocalBlocksSurface(undefined, { patch: true });
  } finally {
    loadingHint.value = '';
    suggestStreaming.value = false;
  }
}

function enterLocalBlocks(script: ScriptLibraryItem) {
  localScript = script;
  localGroups = localFallbackGroups(script);
  localPicksSnapshot = {};
  localTitleVariants = [];
  localDescVariants = [];
  statusMessage.value = '正在生成拼装草案…';
  progress.value = 45;
  renderLocalBlocksSurface(`灵感「${script.label}」——正在一次生成拼装草案…`);
  void (async () => {
    busy.value = true;
    try {
      await composeLocalDraft({ silent: true });
      pushAgentText(agentTextForStage('blocks'));
    } finally {
      busy.value = false;
    }
  })();
}

function picksSummaryForLocal(picksRaw: Record<string, string[]>) {
  const lines: string[] = [];
  for (const kind of ASSEMBLE_KIND_ORDER) {
    const ids = picksRaw[kind] || [];
    if (!ids.length) continue;
    const labels = (localGroups[kind] || [])
      .filter((o) => ids.includes(o.id))
      .map((o) => o.label);
    if (labels.length) lines.push(`${ASSEMBLE_GROUP_META[kind].title}：${labels.join('、')}`);
  }
  return lines.join('\n');
}

function renderLocalConfirmSurface(
  picksRaw: Record<string, string[]>,
  title: string,
  description: string,
  agentText?: string,
) {
  if (!localScript) return;
  assembleStep.value = 4;
  statusMessage.value = '确认书名与简介';
  progress.value = 92;

  const titleOptions = localTitleVariants.filter(Boolean).slice(0, 8).map((t) => ({
    label: t,
    value: t,
    description: '点选填入书名',
  }));
  const descOptions = localDescVariants.filter(Boolean).slice(0, 4).map((d, i) => ({
    label: `简介方案 ${i + 1}`,
    value: d,
    description: d.slice(0, 120) + (d.length > 120 ? '…' : ''),
  }));

  const children = ['summary'] as string[];
  if (titleOptions.length) children.push('title_pick_h', 'title_pick');
  children.push('field_title');
  if (descOptions.length) children.push('desc_pick_h', 'desc_pick');
  children.push('field_desc', 'actions');

  const components: Record<string, unknown>[] = [
    { id: 'root', component: 'Column', children },
    {
      id: 'summary',
      component: 'Text',
      text: picksSummaryForLocal(picksRaw) || '已选积木组合',
      variant: 'body',
    },
  ];
  if (titleOptions.length) {
    components.push({
      id: 'title_pick_h',
      component: 'Text',
      text: 'AI 书名联想（点选填入）',
      variant: 'h4',
    });
    components.push({
      id: 'title_pick',
      component: 'ChoicePicker',
      variant: 'mutuallyExclusive',
      displayStyle: 'chips',
      options: titleOptions,
      value: { path: '/title' },
    });
  }
  components.push({
    id: 'field_title',
    component: 'TextField',
    label: '书名',
    value: { path: '/title' },
    variant: 'shortText',
  });
  if (descOptions.length) {
    components.push({
      id: 'desc_pick_h',
      component: 'Text',
      text: 'AI 简介联想（点选填入）',
      variant: 'h4',
    });
    components.push({
      id: 'desc_pick',
      component: 'ChoicePicker',
      variant: 'mutuallyExclusive',
      displayStyle: 'cards',
      options: descOptions,
      value: { path: '/description' },
    });
  }
  components.push({
    id: 'field_desc',
    component: 'TextField',
    label: '简介',
    value: { path: '/description' },
    variant: 'longText',
  });
  components.push({
    id: 'actions',
    component: 'Row',
    children: ['btn_back', 'btn_ai_meta', 'btn_create'],
  });
  components.push({
    id: 'btn_back',
    component: 'Button',
    child: 'btn_back_label',
    action: { event: { name: 'back_blocks', context: {} } },
  });
  components.push({ id: 'btn_back_label', component: 'Text', text: '再改改积木' });
  components.push({
    id: 'btn_ai_meta',
    component: 'Button',
    child: 'btn_ai_meta_label',
    action: {
      event: {
        name: 'suggest_meta',
        context: {
          picks: { path: '/picks' },
          title: { path: '/title' },
          description: { path: '/description' },
        },
      },
    },
  });
  components.push({ id: 'btn_ai_meta_label', component: 'Text', text: 'AI 重联想书名简介' });
  components.push({
    id: 'btn_create',
    component: 'Button',
    variant: 'primary',
    child: 'btn_create_label',
    action: {
      event: {
        name: 'create_project',
        context: {
          title: { path: '/title' },
          description: { path: '/description' },
          picks: { path: '/picks' },
        },
      },
    },
  });
  components.push({ id: 'btn_create_label', component: 'Text', text: '创建项目并生成大纲' });

  pushLocalSurface(
    components,
    {
      picks: picksRaw,
      title,
      description,
      scriptId: localScript.id,
    },
    agentText || '点选 AI 联想的书名/简介，或自己改；确认后创建项目。',
  );
}

async function fetchLocalSuggestMeta(picksRaw: Record<string, string[]>) {
  if (!localScript) return;
  loadingHint.value = 'AI 正在联想书名与简介…';
  statusMessage.value = loadingHint.value;
  suggestStreaming.value = true;
  progress.value = 88;
  try {
    const { data } = await api.post('/ai/assemble/suggest-meta', {
      scriptLabel: localScript.label,
      scriptIdea: localScript.idea,
      scriptCategory: localScript.category,
      picksSummary: picksSummaryForLocal(picksRaw),
    });
    localTitleVariants = Array.isArray(data?.titles) ? data.titles.map(String).filter(Boolean) : [];
    localDescVariants = Array.isArray(data?.descriptions)
      ? data.descriptions.map(String).filter(Boolean)
      : [];
  } catch {
    localTitleVariants = [];
    localDescVariants = [];
  } finally {
    loadingHint.value = '';
    suggestStreaming.value = false;
  }
}

async function enterLocalConfirm(picksRaw: Record<string, string[]>) {
  if (!localScript) return;
  localPicksSnapshot = picksRaw;
  const picks: Partial<Record<AssembleBlockKind, AssembleOption[]>> = {};
  for (const kind of ASSEMBLE_KIND_ORDER) {
    const ids = picksRaw[kind] || [];
    picks[kind] = (localGroups[kind] || []).filter((o) => ids.includes(o.id));
  }
  busy.value = true;
  try {
    await fetchLocalSuggestMeta(picksRaw);
    const title =
      localTitleVariants[0] || deriveTitleFromPicks(localScript, picks) || localScript.label;
    const description =
      localDescVariants[0] ||
      deriveDescriptionFromPicks(localScript, picks) ||
      localScript.idea;
    renderLocalConfirmSurface(
      picksRaw,
      title,
      description,
      localTitleVariants.length
        ? 'AI 已联想多套书名与简介，点选填入，或点「AI 重联想」换一批。'
        : 'AI 联想暂不可用，已用本地推导的书名简介，可手动改。',
    );
  } finally {
    busy.value = false;
  }
}

async function handleLocalAction(
  name: string,
  context: Record<string, unknown>,
  dataModel: Record<string, unknown>,
) {
  const scalar = (v: unknown) =>
    Array.isArray(v) ? String(v[0] || '') : v == null ? '' : String(v);

  if (name === 'select_category' || name === 'back_category') {
    if (name === 'back_category') {
      enterLocalCategory();
      return;
    }
    const category = scalar(context.category ?? dataModel.category);
    if (!category) throw new Error('请选择题材');
    enterLocalScript(category);
    return;
  }
  if (name === 'select_script') {
    const scriptId = scalar(context.scriptId ?? dataModel.scriptId);
    const script = findScript(scriptId);
    if (!script) throw new Error('请选择灵感');
    enterLocalBlocks(script);
    return;
  }
  if (name === 'expand_blocks') {
    localPicksSnapshot = readLocalPicksFromModel(dataModel);
    busy.value = true;
    try {
      await expandLocalBlocksAi();
    } finally {
      busy.value = false;
    }
    return;
  }
  if (name === 'refresh_draft') {
    localPicksSnapshot = {};
    busy.value = true;
    try {
      await composeLocalDraft();
    } finally {
      busy.value = false;
    }
    return;
  }
  if (name === 'confirm_picks' || name === 'back_blocks') {
    if (name === 'back_blocks' && localScript) {
      renderLocalBlocksSurface('继续勾选积木，或再点「AI 再扩充」。');
      return;
    }
    const normalized = readLocalPicksFromModel({
      picks: (dataModel.picks || context.picks || {}) as Record<string, string[]>,
    });
    await enterLocalConfirm(normalized);
    return;
  }
  if (name === 'suggest_meta') {
    const picksRaw = readLocalPicksFromModel(dataModel);
    busy.value = true;
    try {
      await fetchLocalSuggestMeta(picksRaw);
      const title = localTitleVariants[0] || String(dataModel.title || localScript?.label || '');
      const description =
        localDescVariants[0] || String(dataModel.description || localScript?.idea || '');
      renderLocalConfirmSurface(
        picksRaw,
        title,
        description,
        '已换一批 AI 书名与简介联想，点选填入即可。',
      );
    } finally {
      busy.value = false;
    }
    return;
  }
  if (name === 'create_project') {
    if (!localScript) throw new Error('缺少灵感');
    const picksRaw = readLocalPicksFromModel(dataModel);
    const picks: Partial<Record<AssembleBlockKind, AssembleOption[]>> = {};
    for (const kind of ASSEMBLE_KIND_ORDER) {
      const ids = picksRaw[kind] || [];
      picks[kind] = (localGroups[kind] || []).filter((o) => ids.includes(o.id));
    }
    const title = String(dataModel.title || context.title || localScript.label).trim();
    const description = String(
      dataModel.description || context.description || localScript.idea,
    ).trim();
    const draftPicks: Record<
      string,
      Array<{ id: string; label: string; blurb: string; preview: string }>
    > = {};
    for (const kind of ASSEMBLE_KIND_ORDER) {
      draftPicks[kind] = (picks[kind] || []).map((o) => ({
        id: o.id,
        label: o.label,
        blurb: o.blurb,
        preview: o.preview,
      }));
    }
    await createFromDraft({
      title: title || localScript.label,
      description: description || localScript.idea,
      styleBrief: deriveStyleBrief(picks),
      idea: composeAssembleIdea({ script: localScript, picks, scale: bookScale.value }),
      script: localScript,
      picks: draftPicks,
    });
    return;
  }
  throw new Error(`未知动作：${name}`);
}

async function onAction(name: string, context: Record<string, unknown>, dataModel: Record<string, unknown>) {
  if (name === 'choose_path') {
    const path = String(
      (Array.isArray(context.path) ? context.path[0] : context.path) ||
        dataModel.path ||
        '',
    );
    if (path === 'quick') {
      pushUser('选择了「快速创建」');
      await enterQuick(true);
      return;
    }
    if (path === 'assemble') {
      pushUser('选择了「积木式拼装」');
      await enterAssemble(true);
      return;
    }
    ElMessage.warning('请选择开写方式');
    return;
  }

  if (name === 'open_script_lib') {
    scriptPicker.value = true;
    return;
  }
  if (name === 'open_style_lib') {
    stylePicker.value = true;
    return;
  }

  const pickOne = (v: unknown) =>
    Array.isArray(v) ? String(v[0] || '') : v == null ? '' : String(v);

  if (name === 'select_category' || name === 'select_script') {
    if (name === 'select_category') {
      const category = pickOne(context.category ?? dataModel.category);
      if (!category) {
        ElMessage.warning('请先点选一个题材');
        return;
      }
    }
    if (name === 'select_script') {
      const scriptId = pickOne(context.scriptId ?? dataModel.scriptId);
      if (!scriptId) {
        ElMessage.warning('请先点选一条灵感');
        return;
      }
    }
  }

  if (name === 'quick_next_title' || name === 'quick_next_desc' || name === 'quick_skip_desc' || name === 'quick_next_style' || name === 'quick_skip_style' || name === 'quick_back_style') {
    // 旧分步表单已改为 AI 对话；忽略遗留动作
    return;
  }

  if (name === 'quick_create') {
    await createQuickFromModel();
    return;
  }

  const userLine = summarizeUserAction(name, context, dataModel);
  if (userLine) pushUser(userLine);

  if (localMode.value) {
    await handleLocalAction(name, context, dataModel);
    return;
  }

  const payload: Record<string, unknown> = {
    sessionId: sessionId.value || context.sessionId,
    action: name,
    context,
    dataModel,
  };

  if (name === 'select_category') {
    const category = pickOne(context.category ?? dataModel.category);
    if (category) payload.scripts = scriptsForCategory(category);
  }

  if (name === 'select_script') {
    const scriptId = pickOne(context.scriptId ?? dataModel.scriptId);
    const script = findScript(scriptId);
    if (script) {
      payload.scripts = [
        {
          id: script.id,
          label: script.label,
          category: script.category,
          tags: script.tags,
          blurb: script.blurb,
          idea: script.idea,
        },
      ];
      payload.catalogs = buildCatalogsOnly(script);
    }
  }

  try {
    await runA2ui(payload);
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    ElMessage.warning(e?.message || '后端失败，切换本地回退');
    localMode.value = true;
    await handleLocalAction(name, context, dataModel);
  }
}

/** 项目已落库：交给父级关弹窗并跳转，避免双重 router.push */
function goToCreatedProject(projectId: string) {
  const id = String(projectId || '').trim();
  if (!id) return;
  emit('created', id);
}

async function createQuickFromModel(
  dataModel: Record<string, unknown> = {},
  context: Record<string, unknown> = {},
) {
  if (creating.value) return;
  // 以当前对话草稿为准，避免 A2UI 旧表面里的过期字段覆盖
  const title = String(quickForm.title || dataModel.title || context.title || '').trim();
  const description = String(
    quickForm.description || dataModel.description || context.description || '',
  ).trim();
  const styleBrief = String(
    quickForm.styleBrief || dataModel.styleBrief || context.styleBrief || '',
  ).trim();
  const scale = bookScale.value;
  if (!title) {
    ElMessage.warning('请填写书名');
    return;
  }
  creating.value = true;
  statusMessage.value = '正在创建项目…';
  try {
    const { data } = await api.post('/projects', {
      title,
      description,
      styleBrief,
      targetWordsWan: scale.wordsWan,
      volumeCount: scale.volumes,
    });
    const projectId = String(data?.id || '');
    if (!projectId) throw new Error('创建成功但未返回项目 ID');

    const idea = [
      '请根据以下「快速创建」对话结果，整合成一部通顺完整、可长线连载的小说大纲。',
      `篇幅按用户指定的「${formatBookScaleLabel(scale)}」设计：先分卷、再给首卷细章；禁止写成短剧分集，也禁止把大纲文档字数写成「全文约几千字」。`,
      '',
      '【书名】',
      title,
      '',
      '【简介 / 灵感】',
      description || '（用户未写详细简介，请按书名合理扩展）',
      '',
      '【画面风格】',
      styleBrief || '（未指定，请自拟贴合题材的视觉风格）',
      pendingSkeleton.value.trim()
        ? `\n【示例骨架参考】\n${pendingSkeleton.value.trim()}`
        : '',
      '',
      formatBookScaleIdeaBlock(scale),
    ]
      .filter(Boolean)
      .join('\n');

    // 先标记 pending 再跳转；jobId 稍后写入，概览会等 jobId / 按「小说大纲」轮询
    markOutlinePending(projectId);
    goToCreatedProject(projectId);
    ElMessage.success('项目已创建，大纲正在后台生成');
    creating.value = false;

    const jobs: Promise<unknown>[] = [
      api.post(`/projects/${projectId}/assets/text`, {
        type: 'script',
        name: pickedScript.value ? `灵感·${pickedScript.value}` : '快速创建·灵感',
        content: idea,
        prompt: idea,
      }),
    ];
    if (seedAssets.value && styleBrief) {
      jobs.push(
        api.post(`/projects/${projectId}/assets/text`, {
          type: 'style',
          name: pickedStyle.value ? `风格·${pickedStyle.value}` : '画面风格',
          content: styleBrief,
          prompt: styleBrief,
        }),
      );
    }
    if (pendingSkeleton.value.trim()) {
      jobs.push(
        api.post(`/projects/${projectId}/assets/text`, {
          type: 'script',
          name: pickedScript.value ? `示例骨架·${pickedScript.value}` : '示例剧情骨架',
          content: pendingSkeleton.value,
          prompt: description || idea,
        }),
      );
    }
    await Promise.allSettled(jobs);

    try {
      const { data: job } = await api.post(`/projects/${projectId}/script/generate-skeleton`, {
        idea,
        targetWordsWan: scale.wordsWan,
        volumeCount: scale.volumes,
      });
      markOutlinePending(projectId, String(job?.id || ''));
    } catch (e: any) {
      markOutlinePending(projectId);
      ElMessage.warning(e?.response?.data?.message || e?.message || '大纲任务提交失败，可在概览重试');
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
    creating.value = false;
  }
}

async function createFromDraft(draft: {
  title: string;
  description: string;
  styleBrief: string;
  idea: string;
  script: ScriptLibraryItem;
  picks: Record<string, Array<{ id: string; label: string; blurb: string; preview: string }>>;
}) {
  if (creating.value) return;
  creating.value = true;
  statusMessage.value = '正在创建项目…';
  progress.value = 98;
  let projectId = '';
  let navigated = false;
  try {
    const { projectId: id } = await createProjectFromAssembleDraft(
      {
        ...draft,
        notes: [...assembleNotes.value],
        scale: bookScale.value,
      },
      {
        findScript,
        onNavigable: (pid) => {
          projectId = pid;
          goToCreatedProject(pid);
          navigated = true;
          creating.value = false;
          busy.value = false;
          ElMessage.success('项目已创建，大纲正在后台生成');
        },
      },
    );
    projectId = id;
  } catch (e: any) {
    if (projectId && !navigated) {
      ElMessage.warning(
        e?.response?.data?.message || e?.message || '后续步骤失败，已为你打开刚创建的项目',
      );
      goToCreatedProject(projectId);
    } else if (!projectId) {
      ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
    } else {
      ElMessage.warning(e?.response?.data?.message || e?.message || '部分步骤失败，可在项目内继续');
    }
  } finally {
    creating.value = false;
  }
}

function onApplyScript(item: AnyLibraryItem) {
  if (!('idea' in item)) return;
  quickForm.description = item.idea;
  pickedScript.value = item.label;
  pendingSkeleton.value = item.sampleSkeleton || '';
  if (!quickForm.title.trim()) quickForm.title = item.label;
  ElMessage.success(`已应用灵感：${item.label}`);
  if (lane.value === 'quick') {
    void sendQuickChat(
      `我想用灵感库里的「${item.label}」：${String(item.idea || '').slice(0, 200)}`,
    );
  }
}

function onApplyStyle(item: AnyLibraryItem) {
  if (!('styleBrief' in item)) return;
  quickForm.styleBrief = item.styleBrief;
  pickedStyle.value = item.label;
  ElMessage.success(`已应用风格：${item.label}`);
  if (lane.value === 'quick') {
    void sendQuickChat(`画面风格参考「${item.label}」：${String(item.styleBrief || '').slice(0, 160)}`);
  }
}

function onBack() {
  if (lane.value === 'path') {
    emit('cancel');
    return;
  }
  if (lane.value === 'quick' || lane.value === 'assemble') {
    enterPath();
    return;
  }
  emit('back');
}

function boot() {
  const mode = props.initialMode || 'choose';
  if (mode === 'quick') enterQuick();
  else if (mode === 'assemble') enterAssemble();
  else enterPath();
}

watch(
  () => props.initialMode,
  () => boot(),
);

onMounted(() => {
  void libraries.ensureAll();
  unsub = processor.onEvent(({ message, resolve, reject }) => {
    const name = message?.action?.name;
    const context = (message?.action?.context || {}) as Record<string, unknown>;
    const surfaceId = String(message?.action?.surfaceId || activeSurfaceId.value);
    const surface = processor.getSurface(surfaceId);
    const rootModel =
      (surface?.dataModel?.get?.('/') as Record<string, unknown> | undefined) || {};

    const isPathRef = (v: unknown) =>
      !!v && typeof v === 'object' && !Array.isArray(v) && 'path' in (v as object);

    const readPath = (path: string) => {
      if (surface?.dataModel?.get) {
        try {
          return surface.dataModel.get(path);
        } catch {
          /* ignore */
        }
      }
      const bare = path.replace(/^\//, '');
      return bare ? rootModel[bare] : undefined;
    };

    const resolvedContext: Record<string, unknown> = {};
    const dataModel: Record<string, unknown> = { ...rootModel };
    for (const [k, v] of Object.entries(context)) {
      if (isPathRef(v)) {
        const resolved = readPath(String((v as { path: string }).path || ''));
        if (resolved !== undefined) {
          resolvedContext[k] = resolved;
          dataModel[k] = resolved;
        } else {
          resolvedContext[k] = rootModel[k];
        }
      } else {
        resolvedContext[k] = v;
        dataModel[k] = v;
      }
    }
    if (!dataModel.picks && rootModel.picks) dataModel.picks = rootModel.picks;

    onAction(String(name || ''), resolvedContext, dataModel)
      .then(() => resolve([]))
      .catch((err) => {
        ElMessage.error(err?.message || '操作失败');
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
  boot();
});

onUnmounted(() => {
  unsub?.();
  abort?.abort();
  processor.clearSurfaces();
});
</script>

<template>
  <div class="create-a2ui" :class="[`lane-${lane}`]">
    <header class="talk-bar">
      <div class="bar-left">
        <button
          v-if="lane !== 'path'"
          type="button"
          class="icon-btn"
          title="返回"
          @click="onBack"
        >
          <IconBack :size="18" />
        </button>
        <button type="button" class="icon-btn" title="重新开始" @click="enterPath">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M12 5v6l4 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8" />
          </svg>
        </button>
      </div>
      <div class="bar-center">
        <strong>{{ laneLabel }}</strong>
        <span>AI 生成内容仅供参考，请注意核实</span>
      </div>
      <div class="bar-right">
        <button type="button" class="icon-btn" aria-label="关闭" @click="emit('cancel')">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </header>

    <div v-if="lane === 'assemble'" class="step-dots" aria-label="拼装进度">
      <span
        v-for="n in 4"
        :key="n"
        class="dot"
        :class="{ active: assembleStep === n, done: assembleStep > n }"
      />
    </div>
    <div v-else-if="lane === 'quick'" class="quick-progress" aria-label="快速创建进度">
      <span class="quick-progress-pill">{{ quickProgressLabel }}</span>
      <span v-if="quickForm.title" class="quick-progress-chip">书名</span>
      <span v-if="quickForm.description" class="quick-progress-chip">简介</span>
      <span v-if="quickForm.styleBrief" class="quick-progress-chip">风格</span>
      <span
        v-if="quickReady"
        class="quick-progress-chip linkish"
        title="打开设定"
        @click="settingsDrawer = true"
      >{{ formatBookScaleLabel(bookScale) }}</span>
    </div>

    <UiScroll class="chat-scroll" always>
      <div class="chat-scroll-inner">
      <div
        v-for="turn in turns"
        :key="turn.id"
        class="turn"
        :class="[
          turn.role,
          {
            frozen: turn.surfaceId && turn.surfaceId !== activeSurfaceId,
            welcome: !!turn.greeting,
          },
        ]"
      >
        <div class="bubble" :class="{ welcome: !!turn.greeting }">
          <h3 v-if="turn.greeting" class="greet">{{ turn.greeting }}</h3>
          <p v-if="turn.text" class="bubble-text">{{ turn.text }}</p>

          <div v-if="turn.suggestCards && lane === 'path'" class="suggest-block">
            <div class="suggest-head">
              <span>试试这样开始</span>
            </div>
            <div class="suggest-grid">
              <button
                v-for="card in PATH_SUGGESTS"
                :key="card.id"
                type="button"
                class="suggest-card"
                :class="{ featured: card.featured }"
                @click="pickPath(card.id)"
              >
                <span class="suggest-mark">{{ card.mark }}</span>
                <span class="suggest-copy">
                  <strong>{{ card.title }}</strong>
                  <em>{{ card.desc }}</em>
                </span>
              </button>
            </div>
          </div>

          <div v-if="turn.quickTools" class="quick-libs">
            <span v-if="pickedScript" class="picked">灵感 · {{ pickedScript }}</span>
            <span v-if="pickedStyle" class="picked">风格 · {{ pickedStyle }}</span>
          </div>

          <div
            v-if="turn.surfaceId"
            class="surface-wrap"
            :class="{ generating: surfaceWorking && turn.surfaceId === activeSurfaceId }"
          >
            <A2UISurface :surface-id="turn.surfaceId" />
          </div>
        </div>
      </div>

      <div v-if="waitingReply" class="turn agent typing">
        <div class="bubble typing-bubble">
          <span class="dots" aria-label="正在回复">
            <i /><i /><i />
          </span>
          <span v-if="loadingHint" class="typing-hint">{{ loadingHint }}</span>
        </div>
      </div>

      <div ref="chatEnd" class="chat-end" />
      </div>
    </UiScroll>

    <button
      v-if="showSettingsFab && !settingsDrawer"
      type="button"
      class="settings-fab"
      title="开写设定"
      @click="settingsDrawer = true"
    >
      <span class="settings-fab-mark">设</span>
      <span class="settings-fab-copy">
        <strong>{{ lane === 'quick' && quickReady ? '当前设定' : '成书篇幅' }}</strong>
        <em>{{ formatBookScaleLabel(bookScale) }}</em>
      </span>
    </button>

    <el-drawer
      v-model="settingsDrawer"
      title="开写设定"
      direction="rtl"
      size="420px"
      append-to-body
      :z-index="3500"
      class="create-settings-drawer"
      :destroy-on-close="false"
    >
      <div class="settings-drawer-body">
        <UiScroll class="settings-scroll" always>
          <section v-if="lane === 'quick' && quickReady" class="settings-section">
            <header class="settings-section-head">
              <strong>当前设定</strong>
              <span>随对话实时更新</span>
            </header>
            <dl class="qc-summary">
              <div class="qc-row">
                <dt>书名</dt>
                <dd>{{ quickForm.title || '（未填）' }}</dd>
              </div>
              <div class="qc-row">
                <dt>简介</dt>
                <dd>{{ quickForm.description || '（暂无）' }}</dd>
              </div>
              <div class="qc-row">
                <dt>风格</dt>
                <dd>{{ quickForm.styleBrief || '（暂无）' }}</dd>
              </div>
            </dl>
          </section>

          <section v-if="showBookScale" class="settings-section">
            <header class="settings-section-head">
              <strong>成书篇幅</strong>
              <span>接近目标字数时会自动收束</span>
            </header>
            <BookScalePicker v-model="bookScale" embedded />
          </section>
        </UiScroll>

        <footer v-if="lane === 'quick' && quickReady" class="settings-footer">
          <p class="qc-hint">
            {{
              seedAssets
                ? '创建后会把简介/风格写入项目素材；也可继续对话修改。'
                : '创建后不自动写入素材；也可继续对话修改。'
            }}
          </p>
          <button
            type="button"
            class="qc-create"
            :disabled="creating || busy || !quickForm.title"
            @click="confirmQuickCreate"
          >
            {{ creating ? '正在创建…' : '创建项目并开写' }}
          </button>
        </footer>
      </div>
    </el-drawer>

    <footer v-if="showComposer" class="composer">
      <div class="prompt-shell" :class="{ ready: canSend, disabled: busy || creating }">
        <textarea
          ref="composerRef"
          v-model="chatInput"
          rows="1"
          class="prompt-input"
          :placeholder="composerPlaceholder"
          :disabled="busy || creating"
          @keydown.enter.exact.prevent="submitComposer"
          @input="resizeComposer"
        />
        <div class="prompt-bar">
          <UiScroll class="bar-tools" horizontal always>
            <button
              v-if="lane === 'path'"
              type="button"
              class="tool"
              @click="pickPath('assemble')"
            >
              <span class="tool-ico">积</span>
              <span>积木拼装</span>
            </button>
            <button
              v-if="lane === 'path'"
              type="button"
              class="tool"
              @click="pickPath('quick')"
            >
              <span class="tool-ico">快</span>
              <span>快速创建</span>
            </button>
            <template v-if="lane === 'quick'">
              <button type="button" class="tool" @click="scriptPicker = true">
                <span class="tool-ico">灵</span>
                <span>灵感库</span>
              </button>
              <button type="button" class="tool" @click="stylePicker = true">
                <span class="tool-ico">风</span>
                <span>风格库</span>
              </button>
              <label v-if="quickReady" class="tool seed-tool">
                <input v-model="seedAssets" type="checkbox" />
                <span>写入素材</span>
              </label>
              <span class="bar-hint">AI 引导对话开书</span>
            </template>
          </UiScroll>
          <button
            type="button"
            class="send-btn"
            :class="{ ready: canSend }"
            :disabled="!canSend"
            aria-label="发送"
            @click="submitComposer"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path
                d="M12 19V5M12 5l-5.5 5.5M12 5l5.5 5.5"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </footer>
    <div v-else class="assemble-no-chat" aria-live="polite">
      积木拼装请点选上方卡片操作，本模式不支持对话输入
    </div>

    <LibraryPicker v-model="scriptPicker" kind="script" @apply="onApplyScript" />
    <LibraryPicker v-model="stylePicker" kind="style" @apply="onApplyStyle" />
  </div>
</template>

<style scoped>
.create-a2ui {
  /* 跟随全局主题（原为强制深色语义，避免 Teleport 吃到浅色变量） */
  --shell-bg: var(--studio-bg);
  --bg-0: var(--studio-bg);
  --bg: var(--studio-bg);
  --surface: var(--studio-panel);
  --surface-2: var(--studio-panel-3);
  --surface-muted: var(--studio-panel-3);
  --ink: var(--studio-ink);
  --text: var(--studio-ink);
  --muted: var(--studio-muted);
  --line: var(--studio-line-strong);
  --line-strong: var(--studio-line-bright);
  --accent: var(--studio-text);
  --accent-2: var(--studio-ink);
  --accent-ink: var(--studio-bg);
  --accent-soft: var(--studio-glass-2);
  --hover-bg: var(--studio-glass-2);
  --shadow-sm: none;
  --shadow: none;
  --shadow-hover: none;
  --ease: ease;
  --p-30: var(--accent);
  --p-40: var(--accent);
  --p-60: var(--accent-2);
  --p-100: var(--surface);
  --n-0: var(--ink);
  --n-10: var(--ink);
  --n-30: var(--ink);
  --n-90: var(--surface-2);
  --n-100: var(--surface);
  --chat-bg: var(--studio-bg);
  --user-bubble: var(--studio-panel);
  --dock-border: var(--studio-line-strong);
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  color: var(--studio-ink);
  background: var(--studio-bg);
  overflow: hidden;
}

.talk-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  flex-shrink: 0;
  background: var(--chat-bg);
}

.bar-left,
.bar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.bar-right {
  justify-content: flex-end;
}

.bar-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
  min-width: 0;
}
.bar-center strong {
  font-size: 15px;
  font-weight: 650;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.bar-center span {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.3;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: grid;
  place-items: center;
}
.icon-btn:hover {
  background: var(--user-bubble);
  color: var(--ink);
}

.step-dots {
  display: flex;
  gap: 6px;
  justify-content: center;
  padding: 0 16px 4px;
  flex-shrink: 0;
}
.step-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--line-strong);
}
.step-dots .dot.active {
  background: var(--accent);
}
.step-dots .dot.done {
  background: color-mix(in srgb, var(--accent) 50%, var(--line));
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.chat-scroll-inner {
  padding: 12px clamp(36px, 8vw, 96px) 28px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.chat-end {
  height: 8px;
  flex-shrink: 0;
}

.turn {
  display: flex;
  width: 100%;
  margin: 0;
  animation: turn-in 0.24s var(--ease);
}
@keyframes turn-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.turn.user {
  justify-content: flex-end;
}
.turn.agent {
  justify-content: flex-start;
}

.bubble {
  min-width: 0;
  max-width: 100%;
}

.turn.user .bubble {
  max-width: min(480px, 100%);
  margin-left: auto;
  padding: 12px 16px;
  border-radius: 18px 18px 6px 18px;
  background: var(--user-bubble);
  color: var(--ink);
}

.turn.agent .bubble {
  max-width: 100%;
  width: 100%;
  padding: 2px 0;
}

.turn.agent .bubble.welcome {
  padding: 8px 0 0;
}

.greet {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.03em;
  color: var(--studio-ink);
  line-height: 1.25;
}

.bubble-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--ink);
  white-space: pre-wrap;
}
.turn.user .bubble-text {
  font-size: 15px;
  line-height: 1.55;
}

.suggest-block {
  margin-top: 20px;
}
.suggest-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--muted);
}

.suggest-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 720px) {
  .suggest-grid {
    grid-template-columns: 1fr;
  }
}

.suggest-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  text-align: left;
  min-height: 96px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: var(--studio-panel);
  cursor: pointer;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
  color: var(--studio-ink);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.suggest-card:hover {
  border-color: rgba(255, 255, 255, 0.28);
  background: var(--studio-panel-2);
}
.suggest-card.featured {
  border-color: var(--studio-line-strong);
  background: var(--studio-panel);
  box-shadow: none;
}
.suggest-card.featured:hover {
  border-color: rgba(255, 255, 255, 0.28);
  background: var(--studio-panel-2);
}
.suggest-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--studio-ink);
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-line-strong);
}
.suggest-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.suggest-copy strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--studio-ink);
}
.suggest-copy em {
  font-style: normal;
  font-size: 12px;
  line-height: 1.45;
  color: var(--studio-faint);
}

.turn.frozen .surface-wrap {
  opacity: 0.55;
  pointer-events: none;
}

.surface-wrap {
  position: relative;
  margin-top: 14px;
  max-width: none;
  width: 100%;
  padding: 18px 18px 16px;
  border-radius: 16px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
  box-shadow: none;
  overflow: hidden;
  transition: border-color 0.2s ease, background 0.2s ease;
}
.surface-wrap.generating {
  border-color: var(--studio-line-bright);
  box-shadow: none;
  pointer-events: none;
}
.surface-wrap.generating::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--studio-text), transparent);
  background-size: 40% 100%;
  background-repeat: no-repeat;
  animation: gen-scan 1.6s ease-in-out infinite;
  pointer-events: none;
  z-index: 2;
}
.surface-wrap.generating::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 60% at 50% -10%, var(--studio-glass-2), transparent 55%);
  opacity: 0.55;
  animation: gen-breathe 2.4s ease-in-out infinite;
  z-index: 0;
}
.surface-wrap.generating :deep(*) {
  position: relative;
  z-index: 1;
}
.typing-bubble {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px !important;
  border-radius: 16px;
  background: var(--user-bubble);
}
.typing-hint {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.35;
}
@keyframes gen-scan {
  0% {
    background-position: -30% 0;
  }
  100% {
    background-position: 130% 0;
  }
}
@keyframes gen-breathe {
  0%,
  100% {
    opacity: 0.28;
  }
  50% {
    opacity: 0.55;
  }
}
@media (prefers-reduced-motion: reduce) {
  .surface-wrap.generating::before,
  .surface-wrap.generating::after {
    animation: none;
  }
}
.create-a2ui.lane-assemble .surface-wrap {
  max-width: none;
  width: 100%;
}
.create-a2ui.lane-quick .turn.agent .bubble,
.create-a2ui.lane-path .turn.agent .bubble {
  max-width: 100%;
  width: 100%;
}

.quick-libs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.picked {
  font-size: 12px;
  font-weight: 650;
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
}

.typing .bubble {
  padding: 8px 4px;
}
.dots {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
}
.dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
  animation: blink 1.2s infinite ease-in-out;
}
.dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.dots i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

/* 右侧设定 FAB + 抽屉 */
.settings-fab {
  position: absolute;
  right: 0;
  top: 42%;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(220px, 42vw);
  padding: 10px 12px 10px 10px;
  border: 1px solid var(--dock-border);
  border-radius: 16px 0 0 16px;
  background: var(--surface);
  box-shadow: var(--shadow);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    border-color 0.15s var(--ease),
    box-shadow 0.15s var(--ease),
    transform 0.15s var(--ease);
}
.settings-fab:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--dock-border));
  box-shadow: var(--shadow-hover);
  transform: translateY(-50%) translateX(-2px);
}
.settings-fab-mark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
  color: var(--accent);
  background: var(--accent-soft);
}
.settings-fab-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-fab-copy strong {
  font-size: 13px;
  font-weight: 720;
  color: var(--ink);
}
.settings-fab-copy em {
  font-style: normal;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.qc-summary {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.qc-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}
.qc-row:first-child {
  padding-top: 2px;
}
.qc-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.qc-summary dt {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.qc-summary dd {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--ink);
  word-break: break-word;
}
.qc-row:nth-child(2) dd {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.qc-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}
.qc-create {
  width: 100%;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: var(--accent-ink);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s var(--ease), opacity 0.15s var(--ease);
}
.qc-create:hover:not(:disabled) {
  background: var(--accent-2);
}
.qc-create:disabled {
  opacity: 0.55;
  cursor: default;
}

.composer {
  flex-shrink: 0;
  padding: 8px clamp(36px, 8vw, 96px) 20px;
  background: linear-gradient(180deg, transparent 0%, var(--chat-bg) 36%);
}
.assemble-no-chat {
  flex-shrink: 0;
  padding: 10px 20px 16px;
  text-align: center;
  font-size: 12.5px;
  color: var(--muted);
  border-top: none;
  background: transparent;
}
.quick-progress {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 4px clamp(36px, 8vw, 96px) 0;
}
.quick-progress-pill {
  font-size: 12px;
  font-weight: 650;
  color: var(--accent-2, var(--accent));
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
}
.quick-progress-chip {
  font-size: 11px;
  color: var(--muted);
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--dock-border);
}
.quick-progress-chip.linkish {
  cursor: pointer;
  color: var(--accent-2, var(--accent));
  border-color: color-mix(in srgb, var(--accent) 35%, var(--dock-border));
  background: var(--accent-soft);
}
.quick-progress-chip.linkish:hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--dock-border));
}

.settings-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  min-height: 0;
}
.settings-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.settings-scroll :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 8px;
}
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
}
.settings-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.settings-section-head strong {
  font-size: 14px;
  font-weight: 740;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.settings-section-head span {
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
}
.settings-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--dock-border);
  background: var(--surface);
}
.prompt-shell {
  width: min(720px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 12px;
  border-radius: 18px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
  box-shadow: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.prompt-shell:focus-within {
  border-color: var(--studio-line-bright);
  background: var(--studio-panel-2);
  box-shadow: none;
}
.prompt-shell.disabled {
  opacity: 0.7;
}
.prompt-input {
  width: 100%;
  min-height: 28px;
  max-height: 140px;
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 16px;
  line-height: 1.55;
  color: var(--ink);
  padding: 0 4px;
}
.prompt-input::placeholder {
  color: var(--muted);
}
.prompt-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.bar-tools {
  min-width: 0;
  flex: 1;
  height: 40px;
  overflow: hidden;
}
.bar-tools :deep(.el-scrollbar__view) {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  width: max-content;
  padding-bottom: 2px;
}
.tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}
.tool:hover {
  background: var(--user-bubble);
  color: var(--ink);
}
.tool-ico {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 750;
  color: var(--accent);
  background: var(--accent-soft);
}
.seed-tool {
  cursor: pointer;
}
.seed-tool input {
  margin: 0;
}
.bar-hint {
  font-size: 12.5px;
  color: var(--muted);
  padding: 0 6px;
}
.send-btn {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  cursor: pointer;
  color: var(--muted);
  background: var(--user-bubble);
  transition: background 0.15s var(--ease), color 0.15s var(--ease);
}
.send-btn.ready {
  color: var(--studio-bg);
  background: var(--studio-text);
}
.send-btn.ready:hover:not(:disabled) {
  background: var(--studio-ink);
}
.send-btn:disabled {
  cursor: default;
}

.create-a2ui :deep(.a2ui-surface),
.create-a2ui :deep([data-a2ui-surface]) {
  max-width: none;
  margin: 0;
}
.create-a2ui :deep(button),
.create-a2ui :deep([role='button']) {
  min-height: 38px;
}

/* A2UI 主按钮：未禁用时保持强调色，避免看起来像灰掉 */
.create-a2ui .surface-wrap :deep(button[class*='primary']),
.create-a2ui .surface-wrap :deep(.a2ui-button-primary),
.create-a2ui .surface-wrap :deep(button) {
  border-radius: 12px !important;
  font-weight: 650 !important;
  letter-spacing: 0.01em;
  transition:
    transform 0.15s var(--ease),
    box-shadow 0.15s var(--ease),
    background 0.15s var(--ease),
    opacity 0.15s var(--ease) !important;
}
.create-a2ui .surface-wrap :deep(button:hover:not(:disabled)) {
  transform: translateY(-1px);
}
.create-a2ui.lane-assemble .surface-wrap :deep(button[class*='primary']:not(:disabled)),
.create-a2ui.lane-assemble .surface-wrap :deep(.a2ui-button-primary:not(:disabled)) {
  background: var(--studio-text) !important;
  color: var(--studio-bg) !important;
  opacity: 1 !important;
  box-shadow: none !important;
  cursor: pointer !important;
}
.create-a2ui.lane-assemble .surface-wrap :deep(button:disabled),
.create-a2ui.lane-assemble .surface-wrap :deep(button[disabled]) {
  opacity: 0.45 !important;
  cursor: not-allowed !important;
  filter: grayscale(0.15);
}

/* 快速创建：次要按钮（灵感库/风格库） */
.create-a2ui.lane-quick .surface-wrap :deep(button:not([class*='primary'])) {
  background: var(--studio-panel) !important;
  color: var(--studio-text) !important;
  border: 1px solid var(--studio-line-strong) !important;
  box-shadow: none !important;
  padding: 9px 14px !important;
  font-size: 13px !important;
  min-height: 36px !important;
}
.create-a2ui.lane-quick .surface-wrap :deep(button:not([class*='primary']):hover) {
  border-color: rgba(255, 255, 255, 0.28) !important;
  color: #fff !important;
  background: var(--studio-panel-3) !important;
}
.create-a2ui.lane-quick .surface-wrap :deep(button[class*='primary']),
.create-a2ui.lane-quick .surface-wrap :deep(.a2ui-button-primary) {
  width: 100%;
  justify-content: center;
  margin-top: 4px;
  padding: 12px 18px !important;
  font-size: 14px !important;
  background: var(--studio-text) !important;
  color: var(--studio-bg) !important;
  box-shadow: none !important;
}

/* 快速创建输入框 */
.create-a2ui.lane-quick .surface-wrap :deep(input),
.create-a2ui.lane-quick .surface-wrap :deep(textarea),
.create-a2ui.lane-quick .surface-wrap :deep([contenteditable='true']) {
  border-radius: 12px !important;
  border: 1px solid var(--studio-line-strong) !important;
  background: var(--studio-panel) !important;
  color: var(--studio-ink) !important;
  padding: 11px 13px !important;
  font-size: 14.5px !important;
  line-height: 1.5 !important;
  transition: border-color 0.15s ease, background 0.15s ease !important;
}
.create-a2ui.lane-quick .surface-wrap :deep(input:focus),
.create-a2ui.lane-quick .surface-wrap :deep(textarea:focus),
.create-a2ui.lane-quick .surface-wrap :deep([contenteditable='true']:focus) {
  outline: none !important;
  border-color: var(--studio-line-bright) !important;
  background: var(--studio-panel) !important;
  box-shadow: none !important;
}
.create-a2ui.lane-quick .surface-wrap :deep(textarea) {
  min-height: 88px !important;
  resize: vertical;
}
.create-a2ui.lane-quick .surface-wrap :deep(label),
.create-a2ui.lane-quick .surface-wrap :deep(.a2ui-textfield-label) {
  font-size: 12.5px !important;
  font-weight: 650 !important;
  color: var(--muted) !important;
  margin-bottom: 6px !important;
}

.create-a2ui :deep(.a2ui-choice-picker-chips) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px 0 4px;
}
.create-a2ui :deep(.a2ui-choice-picker-chip) {
  min-height: 34px;
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
  color: var(--studio-text);
  font-size: 13px;
  line-height: 1.2;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.create-a2ui :deep(.a2ui-choice-picker-chip.selected) {
  border-color: transparent;
  background: var(--studio-text);
  color: var(--studio-bg);
  font-weight: 650;
}
.create-a2ui :deep(.a2ui-choice-picker-filter),
.create-a2ui :deep(.chips-filter) {
  width: 100%;
  margin-bottom: 4px;
  padding: 11px 14px 11px 36px;
  border-radius: 14px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
  color: var(--studio-ink);
  font: inherit;
  font-size: 14px;
}
.create-a2ui :deep(.a2ui-choice-picker-filter::placeholder),
.create-a2ui :deep(.chips-filter::placeholder) {
  color: var(--studio-faint);
}
.create-a2ui :deep(h1),
.create-a2ui :deep(.a2ui-text-h1) {
  font-size: 1rem !important;
  margin: 0 0 4px !important;
  font-weight: 700 !important;
}
.create-a2ui :deep(h4),
.create-a2ui :deep(.a2ui-text-h4) {
  font-size: 13px !important;
  font-weight: 650 !important;
  color: var(--muted) !important;
  margin: 10px 0 4px !important;
}
</style>

<style>
/* append-to-body：需非 scoped */
.create-settings-drawer.el-drawer {
  background: var(--studio-panel) !important;
  color: var(--studio-ink);
  box-shadow: none;
  border-left: 1px solid var(--studio-line-strong);
}
.create-settings-drawer .el-drawer__header {
  margin-bottom: 0 !important;
  padding: 16px 20px 14px !important;
  border-bottom: 1px solid var(--studio-line-strong);
  color: var(--studio-ink) !important;
}
.create-settings-drawer .el-drawer__title {
  font-size: 16px !important;
  font-weight: 600 !important;
  color: var(--studio-ink) !important;
  letter-spacing: -0.01em;
}
.create-settings-drawer .el-drawer__close-btn {
  color: var(--studio-muted) !important;
}
.create-settings-drawer .el-drawer__close-btn:hover {
  color: #fff !important;
}
.create-settings-drawer .el-drawer__body {
  display: flex;
  flex-direction: column;
  padding: 16px 16px 18px !important;
  overflow: hidden;
  height: 100%;
  box-sizing: border-box;
  background: var(--studio-panel);
}
</style>
