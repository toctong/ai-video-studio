<template>
  <Teleport to="body">
    <div
      v-if="open && data"
      class="cas-root"
      :class="{ anchored: !!anchorStyle }"
      @mousedown.stop
    >
      <div
        ref="casElRef"
        class="cas"
        :class="{
          'cas-empty': !hasRunTranscript && !skillChip,
          'cas-skill': !hasRunTranscript && !!skillChip,
        }"
        role="dialog"
        :aria-label="headerTitle"
        :style="anchorStyle || undefined"
      >
        <header class="cas-head">
          <div v-if="skillChip" class="skill-chip" @click="openSkillsPanel">
            <UiIcon name="zap" :size="13" />
            <span class="chip-name">{{ skillChip.name }}</span>
            <button type="button" class="chip-x" title="清除技能" @click.stop="clearSkill">
              ×
            </button>
          </div>
          <button v-else type="button" class="add-skill" @click="openSkillsPanel">
            <UiIcon name="sparkles" :size="14" />
            添加技能
          </button>
          <span class="gap" />
          <button type="button" class="icon-btn" title="关闭" @click="emit('close')">×</button>
        </header>

        <!-- 仅有运行记录时展示对话区；未选技能的空态对齐图1（无「准备就绪」块） -->
        <div
          v-if="hasRunTranscript"
          class="cas-stream chat"
        >
          <UiScroll
            ref="streamScrollRef"
            class="stream-scroll"
            always
            height="100%"
          >
            <div class="stream-body chat-body">
              <div v-if="userMessage" class="user-bubble">{{ userMessage }}</div>

              <div v-if="steps.length" class="proc-card">
                <button type="button" class="proc-toggle" @click="emit('toggle-steps')">
                  <span class="proc-dot" :class="{ on: streaming }" />
                  <strong>{{ processTitle }}</strong>
                  <span class="proc-chev" :class="{ open: stepsOpen }">▾</span>
                </button>
                <ul v-if="stepsOpen" class="proc-steps">
                  <li
                    v-for="st in steps"
                    :key="st.id"
                    class="proc-step"
                    :class="st.status"
                  >
                    <span class="proc-ico" aria-hidden="true">
                      <template v-if="st.status === 'done'">✓</template>
                      <span v-else-if="st.status === 'active'" class="proc-spin" />
                      <template v-else>○</template>
                    </span>
                    <span class="proc-label">{{ st.label }}</span>
                  </li>
                </ul>
                <p v-if="streaming && activeStepLabel" class="proc-current">
                  {{ activeStepLabel }}
                </p>
              </div>

              <div v-if="displayStream" class="reply-block" :class="{ live: streaming }">
                <div class="stream-md" v-html="renderStream(displayStream)" />
                <span v-if="streaming" class="stream-caret" aria-hidden="true" />
              </div>
              <div
                v-else-if="streaming && !a2uiSurfaceIds.length"
                class="stream-wait"
              >
                <span class="wait-dots" aria-hidden="true"><i /><i /><i /></span>
                <span>正在输出</span>
              </div>

              <div
                v-for="sid in a2uiSurfaceIds"
                :key="sid"
                class="a2ui-bubble"
                :class="{ active: sid === a2uiActiveSurfaceId }"
              >
                <A2UISurface :surface-id="sid" />
              </div>
            </div>
          </UiScroll>
        </div>

        <div class="cas-composer" :class="{ empty: !hasRunTranscript }">
          <div class="cas-refs">
            <button
              type="button"
              class="ref-slot"
              title="添加文档/文本"
              @click="emit('pick-ref', 'grid')"
            >
              <UiIcon name="file-text" :size="18" />
            </button>
            <button
              type="button"
              class="ref-slot"
              title="添加图片"
              @click="emit('pick-ref', 'image')"
            >
              <UiIcon name="image" :size="18" />
            </button>
            <button
              type="button"
              class="ref-slot"
              title="添加视频"
              @click="emit('pick-ref', 'video')"
            >
              <UiIcon name="clapperboard" :size="18" />
            </button>

            <div
              v-for="(r, i) in refs"
              :key="r.id"
              class="ref-chip"
              :title="r.label || `参考${i + 1}`"
            >
              <img v-if="r.url && r.kind !== 'video'" :src="r.url" alt="" />
              <LazyVideoThumb
                v-else-if="r.url && r.kind === 'video'"
                :src="r.url"
                :poster-url="String((r as any).posterUrl || '')"
              />
              <span v-else class="ph">{{ i + 1 }}</span>
              <button type="button" class="x" title="移除" @click.stop="onRemoveRef(r.id)">
                ×
              </button>
            </div>
          </div>

          <div class="composer-wrap">
            <!-- 我的技能 -->
            <div v-if="skillsPanelOpen" class="float-panel skills-panel" @mousedown.stop>
              <div class="fp-head">
                <strong>我的技能</strong>
                <button type="button" class="fp-link" @click="emit('manage-skills')">管理</button>
              </div>
              <div v-if="skillsLoading" class="fp-empty">正在加载技能库…</div>
              <div v-else-if="!skillList.length" class="fp-empty">暂无技能，请先到技能广场选用</div>
              <UiScroll v-else class="fp-scroll" :max-height="220" always>
                <div class="fp-list">
                  <button
                    v-for="sk in skillList"
                    :key="sk.id"
                    type="button"
                    class="skill-row"
                    :class="{ on: skillId === sk.id }"
                    @click="pickSkill(sk)"
                  >
                    <span class="sk-ico" aria-hidden="true">⚡</span>
                    <span class="sk-meta">
                      <strong>{{ sk.name }}</strong>
                      <em>{{ sk.desc || `/${sk.slash || sk.id}` }}</em>
                    </span>
                    <span v-if="skillId === sk.id" class="sk-check">✓</span>
                  </button>
                </div>
              </UiScroll>
            </div>

            <!-- @ 引用：平铺可选素材，已选的不再出现 -->
            <div v-if="mentionPanelOpen" class="float-panel mention-panel" @mousedown.stop>
              <div class="men-search top">
                <input
                  v-model="mentionQuery"
                  type="search"
                  placeholder="输入关键词搜索"
                  @keydown.stop
                />
              </div>
              <div v-if="!filteredCiteItems.length" class="fp-empty">
                {{ mentionQuery.trim() ? '没有匹配的素材' : '暂无可引用内容' }}
              </div>
              <UiScroll v-else class="fp-scroll" :max-height="180" always>
                <div class="fp-list compact">
                  <button
                    v-for="it in filteredCiteItems"
                    :key="`${it.source}-${it.id}`"
                    type="button"
                    class="cite-row"
                    @click="pickCite(it)"
                  >
                    <span class="cite-thumb">
                      <img v-if="it.url && it.kind !== 'video'" :src="it.url" alt="" />
                      <LazyVideoThumb
                        v-else-if="it.url && it.kind === 'video'"
                        :src="it.url"
                        :poster-url="String((it as any).posterUrl || '')"
                      />
                      <span v-else class="cite-ph">{{ it.kind === 'text' ? '文' : '·' }}</span>
                    </span>
                    <span class="cite-meta">
                      <strong>{{ it.label }}</strong>
                      <em>{{ citeKindLabel(it.kind) }} · {{ it.source === 'project' ? '本项目' : '画布' }}</em>
                    </span>
                  </button>
                </div>
              </UiScroll>
            </div>

            <div class="cas-editor-shell">
              <AiPromptInput
                :key="promptEditorKey"
                ref="inputRef"
                class="cas-prompt"
                :model-value="prompt"
                :rich-doc="promptRichDoc"
                :cited-image-urls="citedImageUrls"
                :cited-video-urls="citedVideoUrls"
                mode="agent"
                :modes="[]"
                :templates="[]"
                :show-templates="false"
                :show-prefs="false"
                :show-mention="true"
                :mention-external="true"
                :emit-slash="true"
                :enable-attachments="false"
                :show-send="false"
                :loading="streaming || !!running"
                :disabled="streaming || !!running"
                :min-height="hasRunTranscript ? 56 : 88"
                :auto-apply-template="false"
                bare
                tone="home"
                :placeholder="agentPlaceholderHints[0]"
                :placeholder-hints="agentPlaceholderHints"
                @update:model-value="onPromptUpdate"
                @update:rich-doc="onRichDocUpdate"
                @generate-payload="onGeneratePayload"
                @submit="onSubmit"
                @mention="openMentionPanel"
                @slash="openSkillsPanel"
              />
            </div>
          </div>
        </div>

        <footer class="cas-bar">
          <span class="agent-badge" title="Agent 节点">
            <UiIcon name="sparkles" :size="13" />
            Agent模式
          </span>

          <div class="pill-wrap">
            <button
              type="button"
              class="pill"
              :class="{ on: intentOpen }"
              @click.stop="intentOpen = !intentOpen"
            >
              <UiIcon name="message" :size="13" />
              {{ intentLabel }}
              <span class="chev">▾</span>
            </button>
            <div v-if="intentOpen" class="mode-pop" @mousedown.stop>
              <button
                v-for="it in intents"
                :key="it.id"
                type="button"
                class="mode-row"
                :class="{ on: intent === it.id }"
                @click="pickIntent(it.id)"
              >
                <span>{{ it.label }}</span>
                <span v-if="intent === it.id" class="check">✓</span>
              </button>
            </div>
          </div>

          <span class="gap" />

          <button
            type="button"
            class="send"
            :class="{ stop: streaming || running }"
            :title="streaming || running ? '终止' : '发送'"
            @click="streaming || running ? emit('cancel') : emit('run')"
          >
            <UiIcon v-if="!(streaming || running)" name="arrow-up" :size="18" />
            <span v-else class="stop-sq" />
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { A2UISurface } from 'a2ui-vue';
import type { WorkflowFlowNodeData } from '@/components/studio/WorkflowFlowNode.vue';
import type { JSONContent } from '@tiptap/core';
import AiPromptInput from '@/components/ai-prompt-input/AiPromptInput.vue';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';
import { parsePromptDoc } from '@/components/ai-prompt-input/serialize';
import { listChatSkills, findChatSkill, setRuntimeSkillCatalog, type CatalogSkill } from '@/utils/skill-catalog';
import { fetchSkillPlaza, toCatalogSkill } from '@/api/skills';
import { fetchAgentsPlaza } from '@/api/plaza';
import { fetchMyPrompts } from '@/api/user-prompts';
import { renderMarkdown } from '@/utils/markdown';
import UiIcon from '@/components/icons/UiIcon.vue';
import { UiScroll } from '@/components/ui';
import {
  useAgentA2ui,
  type AgentA2uiActionPayload,
} from '@/composables/useAgentA2ui';

export type AgentRefChip = {
  id: string;
  url: string;
  label?: string;
  linked?: boolean;
  kind?: 'image' | 'video' | 'text' | 'audio';
};

export type AgentCiteItem = {
  id: string;
  label: string;
  url?: string;
  kind: 'image' | 'video' | 'text';
  source: 'canvas' | 'project';
};

export type AgentRunStep = {
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending';
};

const props = defineProps<{
  open: boolean;
  data: WorkflowFlowNodeData | null;
  running?: boolean;
  streaming?: boolean;
  liveText?: string;
  userMessage?: string;
  phase?: 'idle' | 'understanding' | 'generating' | 'done' | 'failed';
  steps?: AgentRunStep[];
  stepsOpen?: boolean;
  refs?: AgentRefChip[];
  canvasCites?: AgentCiteItem[];
  projectCites?: AgentCiteItem[];
  /** 贴在 Agent 节点右侧的屏幕坐标 */
  anchor?: { left: number; top: number } | null;
}>();

const emit = defineEmits<{
  close: [];
  run: [];
  cancel: [];
  restart: [];
  ask: [];
  'manage-skills': [];
  'cite-item': [item: AgentCiteItem];
  'toggle-steps': [];
  'refresh-refs': [];
  'pick-ref': [kind: 'image' | 'grid' | 'video'];
  'remove-ref': [id: string];
  'update-param': [key: string, value: string];
  'update-label': [value: string];
  'a2ui-action': [payload: AgentA2uiActionPayload];
  /** 弹层尺寸变化，供画布重新对齐锚点 */
  layout: [];
}>();

const {
  ingestA2ui,
  patchA2ui,
  clearSurfaces,
  activeSurfaceId: a2uiActiveSurfaceId,
  surfaceIds: a2uiSurfaceIds,
} = useAgentA2ui({
  onAction: async (payload) => {
    emit('a2ui-action', payload);
  },
});

const intentOpen = ref(false);
const skillsPanelOpen = ref(false);
const mentionPanelOpen = ref(false);
const mentionQuery = ref('');
const skillsLoading = ref(false);
const skillsTick = ref(0);
/** 本轮已选引用，避免重复出现在弹层 */
const pickedCiteIds = ref<Set<string>>(new Set());
const inputRef = ref<InstanceType<typeof AiPromptInput> | null>(null);
const streamScrollRef = ref<{ $el?: HTMLElement } | null>(null);
const casElRef = ref<HTMLElement | null>(null);
let sheetResizeObs: ResizeObserver | null = null;

const intents = [
  { id: 'run', label: '执行' },
  { id: 'ask', label: '询问' },
] as const;

type IntentId = (typeof intents)[number]['id'];

const refs = computed(() => props.refs || []);
const selectedCiteIdSet = computed(() => {
  const s = new Set<string>([...pickedCiteIds.value]);
  for (const r of refs.value) s.add(String(r.id));
  return s;
});
const prompt = computed(() => String(props.data?.params?.prompt || ''));
function paramStr(key: string) {
  return String(props.data?.params?.[key] ?? '');
}
function parseUrlList(raw: string): string[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}
const promptRichDoc = computed(() => parsePromptDoc(paramStr('promptDoc')));
const citedImageUrls = computed(() => parseUrlList(paramStr('citedImageUrls')));
const citedVideoUrls = computed(() => parseUrlList(paramStr('citedVideoUrls')));
const promptEditorKey = computed(
  () => `${props.data?.params?.skillId || 'agent'}-${props.open ? '1' : '0'}`,
);
const replyText = computed(() => String(props.data?.previewText || '').trim());
const userMessage = computed(() => String(props.userMessage || '').trim());
const steps = computed(() => props.steps || []);
const stepsOpen = computed(() => props.stepsOpen !== false);
const displayStream = computed(() =>
  String(props.liveText || (!props.streaming ? replyText.value : '') || '').trim(),
);
const hasRunTranscript = computed(
  () =>
    !!(
      userMessage.value ||
      steps.value.length ||
      displayStream.value ||
      a2uiSurfaceIds.value.length ||
      props.streaming ||
      props.phase === 'done' ||
      props.phase === 'failed'
    ),
);
const doneStepCount = computed(() => steps.value.filter((s) => s.status === 'done').length);
const processTitle = computed(() => {
  if (props.streaming || props.phase === 'understanding' || props.phase === 'generating') {
    return `处理中 (${Math.max(steps.value.length, doneStepCount.value)}步)`;
  }
  if (props.phase === 'failed') return '处理失败';
  if (props.phase === 'done' || displayStream.value) {
    return `已完成 (${doneStepCount.value}步)`;
  }
  return '处理过程';
});
const activeStepLabel = computed(() => {
  const active = steps.value.find((s) => s.status === 'active');
  return active?.label || '';
});

const anchorStyle = computed(() => {
  const a = props.anchor;
  if (!a || !Number.isFinite(a.left) || !Number.isFinite(a.top)) return null;
  return {
    position: 'fixed' as const,
    left: `${Math.round(a.left)}px`,
    top: `${Math.round(a.top)}px`,
    right: 'auto',
    bottom: 'auto',
    margin: '0',
    transform: 'none',
  };
});

const skillId = computed(() => String(props.data?.params?.skillId || '').trim());
const skillChip = computed(() => {
  if (!skillId.value) return null;
  return (
    findChatSkill(skillId.value) || {
      id: skillId.value,
      name: String(props.data?.label || skillId.value),
      slash: String(props.data?.params?.slash || ''),
      desc: '',
    }
  );
});

const headerTitle = computed(() => skillChip.value?.name || 'Agent');
const skillList = computed(() => {
  void skillsTick.value;
  return listChatSkills();
});
const agentPlaceholderHints = [
  '试试说“在画布上为我创建..” 随时为你开启下一轮对话',
  '输入创意想法，按 / 调用技能，@ 引用素材库',
];

const intent = computed<IntentId>(() =>
  String(props.data?.params?.agentIntent || '').trim() === 'ask' ? 'ask' : 'run',
);
const intentLabel = computed(() => (intent.value === 'ask' ? '询问' : '执行'));

const filteredCiteItems = computed(() => {
  const taken = selectedCiteIdSet.value;
  const seen = new Set<string>();
  const pool: AgentCiteItem[] = [];
  for (const it of [...(props.canvasCites || []), ...(props.projectCites || [])]) {
    const id = String(it.id || '');
    if (!id || taken.has(id) || seen.has(id)) continue;
    seen.add(id);
    pool.push(it);
  }
  const q = mentionQuery.value.trim().toLowerCase();
  if (!q) return pool;
  return pool.filter(
    (it) =>
      it.label.toLowerCase().includes(q) ||
      it.id.toLowerCase().includes(q) ||
      it.kind.includes(q) ||
      it.source.includes(q),
  );
});

function citeKindLabel(kind: string) {
  if (kind === 'video') return '视频';
  if (kind === 'text') return '文本';
  return '图片';
}

function renderStream(raw: string) {
  try {
    return renderMarkdown(raw).html;
  } catch {
    return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>');
  }
}

function onPromptUpdate(v: string) {
  emit('update-param', 'prompt', v);
}

function onRichDocUpdate(doc: JSONContent) {
  emit('update-param', 'promptDoc', JSON.stringify(doc));
}

function onGeneratePayload(p: { prompt: string; imageUrls: string[]; videoUrls: string[] }) {
  emit('update-param', 'prompt', p.prompt);
  emit('update-param', 'citedImageUrls', JSON.stringify(p.imageUrls || []));
  emit('update-param', 'citedVideoUrls', JSON.stringify(p.videoUrls || []));
}

async function ensureSkillsLoaded() {
  if (skillsLoading.value) return;
  skillsLoading.value = true;
  try {
    const [plaza, agents, mine] = await Promise.all([
      fetchSkillPlaza().catch(() => null),
      fetchAgentsPlaza().catch(() => null),
      fetchMyPrompts().catch(() => [] as Awaited<ReturnType<typeof fetchMyPrompts>>),
    ]);
    // fetchSkillPlaza 已写入 runtime；再合并 Agent 广场 + 我的提示词
    const extra: CatalogSkill[] = [];
    for (const a of agents?.items || []) {
      if (!a.id || !a.name) continue;
      extra.push({
        id: a.id,
        name: a.name,
        desc: a.desc || '',
        prompt: String(a.prompt || a.desc || ''),
        category: (a.category as CatalogSkill['category']) || 'story',
        official: a.visibility === 'official',
        author: a.author || '社区',
        likes: Number(a.likes) || 0,
        mode: 'agent',
        slash: a.slash || a.id,
        coverUrl: a.coverUrl,
      });
    }
    for (const p of mine || []) {
      if (!p.id || !p.name) continue;
      extra.push({
        id: p.id,
        name: p.name,
        desc: p.desc || '',
        prompt: p.prompt || '',
        category: 'story',
        official: false,
        author: '我',
        likes: 0,
        mode: p.mode === 'video' || p.mode === 'image' ? p.mode : 'agent',
        slash: p.id.slice(0, 16),
        coverUrl: p.coverUrl || undefined,
      });
    }
    if (extra.length || (plaza?.skills || []).length) {
      const plazaSkills = (plaza?.skills || []).map(toCatalogSkill);
      const byId = new Map<string, CatalogSkill>();
      for (const s of [...plazaSkills, ...extra]) {
        if (!byId.has(s.id)) byId.set(s.id, s);
      }
      setRuntimeSkillCatalog([...byId.values()]);
    }
    skillsTick.value += 1;
  } finally {
    skillsLoading.value = false;
  }
}

function openSkillsPanel() {
  mentionPanelOpen.value = false;
  skillsPanelOpen.value = true;
  void ensureSkillsLoaded();
  void nextTick(() => inputRef.value?.focus?.());
}

function openMentionPanel() {
  skillsPanelOpen.value = false;
  mentionPanelOpen.value = true;
  mentionQuery.value = '';
}

function pickSkill(sk: CatalogSkill) {
  emit('update-param', 'skillId', sk.id);
  emit('update-param', 'slash', sk.slash || sk.id);
  emit('update-param', 'agentTitle', '');
  if (sk.name) emit('update-label', sk.name);
  if (sk.prompt) emit('update-param', 'system', sk.prompt);
  // 技能静默注入：不把 starter/正文写入输入框；清掉触发用的 /
  inputRef.value?.consumeTriggerSlash?.();
  skillsPanelOpen.value = false;
  ElMessage.success(`已选用技能「${sk.name}」`);
  void nextTick(() => inputRef.value?.focus?.());
}

function clearSkill() {
  emit('update-param', 'skillId', '');
  emit('update-param', 'slash', '');
  emit('update-param', 'system', '');
  emit('update-param', 'agentTitle', '');
  // 去掉技能后节点标题还原为 Agent
  emit('update-label', 'Agent');
}

function pickCite(it: AgentCiteItem) {
  const id = String(it.id || '');
  if (id) {
    const next = new Set(pickedCiteIds.value);
    next.add(id);
    pickedCiteIds.value = next;
  }
  inputRef.value?.insertCite?.({
    label: it.label,
    id: it.id,
    url: it.url,
    mediaKind: it.kind,
  });
  emit('cite-item', it);
  mentionPanelOpen.value = false;
  mentionQuery.value = '';
}

function onRemoveRef(id: string) {
  const next = new Set(pickedCiteIds.value);
  next.delete(String(id));
  pickedCiteIds.value = next;
  emit('remove-ref', id);
}

/** 重新开始：清空弹层本地态（A2UI / 已选引用 / 浮层） */
function resetSession() {
  clearSurfaces();
  pickedCiteIds.value = new Set();
  skillsPanelOpen.value = false;
  mentionPanelOpen.value = false;
  mentionQuery.value = '';
  intentOpen.value = false;
}

function pickIntent(id: IntentId) {
  emit('update-param', 'agentIntent', id === 'ask' ? 'ask' : 'run');
  intentOpen.value = false;
  if (id === 'ask') emit('ask');
}

function onSubmit() {
  if (intent.value === 'ask') emit('ask');
  else emit('run');
}

function onDocDown(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (intentOpen.value && !t?.closest?.('.pill-wrap')) intentOpen.value = false;
  if (skillsPanelOpen.value && !t?.closest?.('.skills-panel') && !t?.closest?.('.add-skill') && !t?.closest?.('.skill-chip')) {
    skillsPanelOpen.value = false;
  }
  if (mentionPanelOpen.value && !t?.closest?.('.mention-panel')) {
    mentionPanelOpen.value = false;
  }
}

watch(
  () => props.open,
  (v) => {
    if (!v) {
      intentOpen.value = false;
      skillsPanelOpen.value = false;
      mentionPanelOpen.value = false;
      return;
    }
    void ensureSkillsLoaded();
    void nextTick(() => inputRef.value?.focus?.());
  },
);

function scrollStreamToEnd() {
  void nextTick(() => {
    const root = streamScrollRef.value?.$el as HTMLElement | undefined;
    const wrap =
      (root?.querySelector?.('.el-scrollbar__wrap') as HTMLElement | null) || null;
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  });
}

watch(
  () => displayStream.value,
  () => {
    scrollStreamToEnd();
  },
);

watch(
  () => a2uiSurfaceIds.value.length,
  () => {
    scrollStreamToEnd();
  },
);

defineExpose({
  insertCite: (opts: {
    label: string;
    id?: string;
    url?: string;
    mediaKind?: 'image' | 'video' | 'text';
  }) => {
    inputRef.value?.insertCite?.(opts);
  },
  focus: () => inputRef.value?.focus?.(),
  openSkillsPanel,
  openMentionPanel,
  ingestA2ui,
  patchA2ui,
  clearSurfaces,
  resetSession,
  getSheetRect: () => casElRef.value?.getBoundingClientRect() ?? null,
});

watch(
  () => [props.open, casElRef.value] as const,
  ([open, el]) => {
    sheetResizeObs?.disconnect();
    sheetResizeObs = null;
    if (!open || !el || typeof ResizeObserver === 'undefined') return;
    sheetResizeObs = new ResizeObserver(() => emit('layout'));
    sheetResizeObs.observe(el);
    void nextTick(() => emit('layout'));
  },
  { flush: 'post' },
);

onMounted(() => window.addEventListener('mousedown', onDocDown, true));
onUnmounted(() => {
  window.removeEventListener('mousedown', onDocDown, true);
  sheetResizeObs?.disconnect();
  sheetResizeObs = null;
});
</script>

<style scoped>
.cas-root {
  position: fixed;
  inset: 0;
  z-index: 62;
  pointer-events: none;
  box-sizing: border-box;
}
.cas-root.anchored {
  /* 坐标由 .cas 的 fixed left/top 接管 */
  display: block;
  padding: 0;
}
.cas-root:not(.anchored) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 72px 28px 48px;
}
.cas {
  pointer-events: auto;
  width: min(380px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 64px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  /* 不能 hidden：技能/@ 浮层向上展开会被裁掉；滚动裁切交给 .cas-stream */
  overflow: visible;
  /* Teleport 到 body 后可能丢画布暗色 token，这里写死暗色 */
  --surface: var(--studio-panel);
  --surface-2: var(--studio-panel-3);
  --ink: var(--studio-text);
  --muted: var(--studio-text-faint);
  --line: var(--studio-glass-3);
  --line-strong: var(--studio-line-bright);
  --accent: #c4b5fd;
  --accent-soft: rgba(139, 92, 246, 0.2);
  --accent-ring: rgba(167, 139, 250, 0.25);
  background: color-mix(in srgb, var(--studio-panel) 98%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.55);
  color: var(--studio-text);
  backdrop-filter: blur(18px);
  box-sizing: border-box;
}
.cas.cas-empty,
.cas.cas-skill {
  gap: 10px;
  padding: 12px 14px 14px;
  max-height: none;
}
.cas-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  flex-shrink: 0;
}
.gap {
  flex: 1;
}
.add-skill {
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-glass-2);
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.add-skill:hover {
  background: var(--studio-glass-3);
}
.skill-chip {
  height: 32px;
  padding: 0 8px 0 10px;
  border-radius: 999px;
  background: var(--studio-glass-3);
  color: var(--studio-text);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 58%;
  cursor: pointer;
}
.skill-chip :deep(.ui-icon) {
  color: #fbbf24;
  flex-shrink: 0;
}
.chip-name {
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chip-x {
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-soft);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.chip-x:hover {
  background: var(--studio-glass-3);
  color: #fff;
}
.icon-btn {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text-faint);
  font-size: 18px;
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--studio-glass-2);
  color: #fff;
}

.cas-stream {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 0;
  border-radius: 0;
  background: transparent;
  border: 0;
  overflow: hidden;
}
.cas-stream.idle {
  min-height: 0;
  flex: 0 1 auto;
  max-height: 140px;
}
.cas-stream.chat {
  min-height: min(320px, 42vh);
}
.stream-scroll {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  height: 100% !important;
}
.cas-stream :deep(.el-scrollbar) {
  height: 100%;
}
.cas-stream :deep(.el-scrollbar__wrap) {
  max-height: 100% !important;
  overflow-x: hidden !important;
}
.cas-stream :deep(.el-scrollbar__view) {
  min-height: 100%;
  box-sizing: border-box;
}
.stream-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 0;
  font-size: 12px;
  color: var(--studio-text-soft);
}
.idle-head {
  padding-bottom: 0;
}
.stream-head strong {
  color: var(--studio-text);
  font-weight: 650;
}
.stream-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
}
.stream-dot.on {
  background: #a78bfa;
  box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.2);
  animation: pulse 1.1s ease infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
.stream-body {
  min-height: 0;
  padding: 2px 10px 16px 2px;
}
.chat-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.user-bubble {
  align-self: flex-end;
  max-width: 92%;
  padding: 8px 11px;
  border-radius: 12px 12px 4px 12px;
  background: var(--studio-glass-3);
  color: var(--studio-text);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.proc-card {
  border-radius: 0;
  background: transparent;
  border: 0;
  overflow: visible;
}
.proc-toggle {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--studio-text);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px 6px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.proc-toggle strong {
  font-weight: 650;
}
.proc-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--studio-line-bright);
  flex-shrink: 0;
}
.proc-dot.on {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
  animation: pulse 1.1s ease infinite;
}
.proc-chev {
  margin-left: auto;
  opacity: 0.5;
  transition: transform 0.15s ease;
}
.proc-chev.open {
  transform: rotate(180deg);
}
.proc-steps {
  list-style: none;
  margin: 0;
  padding: 0 0 4px;
  display: flex;
  flex-direction: column;
  gap: 0;
  border-left: 1px solid var(--studio-glass-2);
  margin-left: 5px;
  padding-left: 10px;
}
.proc-step {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 0;
  border-radius: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--studio-text-faint);
  background: transparent;
  border: 0;
}
.proc-step.done {
  color: var(--studio-text-strong);
}
.proc-step.active {
  color: rgba(253, 230, 138, 0.95);
  background: transparent;
  border-left: 0;
}
.proc-step.pending {
  opacity: 0.4;
}
.proc-ico {
  width: 14px;
  height: 14px;
  margin-top: 1px;
  flex-shrink: 0;
  text-align: center;
  font-size: 11px;
  line-height: 14px;
  display: inline-grid;
  place-items: center;
}
.proc-spin {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid rgba(245, 158, 11, 0.28);
  border-top-color: #fbbf24;
  animation: proc-spin 0.7s linear infinite;
}
@keyframes proc-spin {
  to {
    transform: rotate(360deg);
  }
}
.proc-label {
  min-width: 0;
  word-break: break-word;
}
.proc-step.active .proc-label {
  animation: proc-label-pulse 1.4s ease-in-out infinite;
}
@keyframes proc-label-pulse {
  0%,
  100% {
    opacity: 0.78;
  }
  50% {
    opacity: 1;
  }
}
.proc-current {
  margin: 0;
  padding: 2px 2px 4px 16px;
  font-size: 11px;
  color: var(--studio-line-bright);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reply-block {
  position: relative;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--studio-glass);
  border: 1px solid var(--studio-glass-2);
}
.reply-block.live {
  border-color: rgba(167, 139, 250, 0.22);
}
.reply-block.live .stream-caret {
  display: inline-block;
}
.stream-caret {
  display: none;
  width: 2px;
  height: 0.95em;
  margin-left: 2px;
  vertical-align: -0.1em;
  background: rgba(196, 181, 253, 0.9);
  animation: stream-caret 0.9s steps(1) infinite;
}
@keyframes stream-caret {
  50% {
    opacity: 0;
  }
}
.a2ui-bubble {
  padding: 2px 0 4px;
  border-radius: 0;
  background: transparent;
  border: 0;
  color: var(--studio-ink);
  /* 覆盖全局 accent，避免 A2UI 按钮落到淡紫底 */
  --accent: var(--studio-text);
  --accent-ink: var(--studio-inset);
  --accent-soft: var(--studio-glass-2);
}
.a2ui-bubble.active {
  border-color: transparent;
}
.a2ui-bubble :deep(.a2ui-surface),
.a2ui-bubble :deep([data-a2ui-surface]) {
  font-size: 13px;
  line-height: 1.45;
}
/* Agent 内 A2UI 选项：压成紧凑行，去掉厚重卡片感 */
.a2ui-bubble :deep(.choice-picker) {
  gap: 8px;
}
.a2ui-bubble :deep(.choice-label) {
  font-size: 12px;
  color: var(--studio-text-faint);
}
.a2ui-bubble :deep(.choice-grid) {
  grid-template-columns: 1fr;
  gap: 6px;
  max-height: none;
  overflow: visible;
  padding: 0;
}
.a2ui-bubble :deep(.choice-card) {
  min-height: 0;
  padding: 9px 10px;
  border-radius: 10px;
  background: var(--studio-glass);
  border: 1px solid var(--studio-glass-2);
  box-shadow: none;
  transform: none;
}
.a2ui-bubble :deep(.choice-card:hover:not(:disabled):not(.skeleton)) {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--studio-line-strong);
  box-shadow: none;
  transform: none;
}
.a2ui-bubble :deep(.choice-card.selected),
.a2ui-bubble :deep(.choice-card.tone-local.selected),
.a2ui-bubble :deep(.choice-card.tone-ai.selected) {
  background: rgba(139, 92, 246, 0.12);
  border-color: rgba(167, 139, 250, 0.35);
  box-shadow: none;
}
.a2ui-bubble :deep(.choice-card.tone-local),
.a2ui-bubble :deep(.choice-card.tone-ai) {
  background: var(--studio-glass);
  border-color: var(--studio-glass-2);
}
.a2ui-bubble :deep(.choice-mark) {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  font-size: 12px;
  color: rgba(196, 181, 253, 0.95);
  background: rgba(139, 92, 246, 0.16);
}
.a2ui-bubble :deep(.choice-card.tone-local .choice-mark),
.a2ui-bubble :deep(.choice-card.tone-ai .choice-mark) {
  color: rgba(196, 181, 253, 0.95);
  background: rgba(139, 92, 246, 0.16);
}
.a2ui-bubble :deep(.choice-copy) {
  padding-right: 0;
  gap: 2px;
}
.a2ui-bubble :deep(.choice-copy strong) {
  font-size: 13px;
  font-weight: 650;
  color: var(--studio-text);
}
.a2ui-bubble :deep(.choice-copy em) {
  font-size: 11px;
  line-height: 1.35;
  color: var(--studio-text-faint);
  font-style: normal;
}
.a2ui-bubble :deep(.choice-badge) {
  top: 8px;
  right: 8px;
  padding: 2px 6px;
  font-size: 9px;
  background: var(--studio-glass-2);
  color: var(--studio-text-soft);
}
.a2ui-bubble :deep(.choice-card.tone-local .choice-badge),
.a2ui-bubble :deep(.choice-card.tone-ai .choice-badge) {
  background: var(--studio-glass-2);
  color: var(--studio-text-soft);
}
.a2ui-bubble :deep(.choice-chips) {
  max-height: none;
  overflow: visible;
  gap: 6px;
}
.a2ui-bubble :deep(.chip) {
  min-height: 32px;
  height: auto;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--studio-glass-2);
  border: 1px solid var(--studio-glass-2);
  color: var(--studio-text-strong);
  white-space: normal;
}
.a2ui-bubble :deep(.chip:hover) {
  background: var(--studio-glass-3);
  border-color: var(--studio-line-strong);
  transform: none;
}
.a2ui-bubble :deep(.chip.selected) {
  background: rgba(139, 92, 246, 0.16);
  border-color: rgba(167, 139, 250, 0.4);
  color: #e9e0ff;
}
.a2ui-bubble :deep(button),
.a2ui-bubble :deep([role='button']) {
  min-height: 30px;
}
/* 表单动作按钮：更小、浅底深字（排除选项 chips/cards） */
.a2ui-bubble :deep(.a2ui-surface button:not(.chip):not(.choice-card):not([role='option'])),
.a2ui-bubble :deep([data-a2ui-surface] button:not(.chip):not(.choice-card):not([role='option'])),
.a2ui-bubble :deep(button:not(.chip):not(.choice-card):not([role='option']):not(.ref-slot):not(.chip-x):not(.icon-btn):not(.add-skill):not(.proc-toggle):not(.fp-link):not(.cite-row):not(.skill-row):not(.mode-opt):not(.intent-btn):not(.send):not(.model-trigger):not(.vid-mode):not(.expand):not(.demo-link)) {
  box-sizing: border-box !important;
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  padding: 0 12px !important;
  border-radius: 8px !important;
  border: 1px solid transparent !important;
  background: var(--studio-text) !important;
  background-color: var(--studio-text) !important;
  color: var(--studio-inset) !important;
  font: inherit !important;
  font-size: 12.5px !important;
  font-weight: 650 !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
  box-shadow: none !important;
  line-height: 1 !important;
  white-space: nowrap;
}
.a2ui-bubble :deep(.a2ui-surface button:not(.chip):not(.choice-card):not([role='option']):hover:not(:disabled)),
.a2ui-bubble :deep([data-a2ui-surface] button:not(.chip):not(.choice-card):not([role='option']):hover:not(:disabled)) {
  background: var(--studio-ink) !important;
  background-color: var(--studio-ink) !important;
  color: #000 !important;
  transform: none !important;
  box-shadow: none !important;
}
.a2ui-bubble :deep(.a2ui-surface button[class*='primary']:not(.chip):not(.choice-card)),
.a2ui-bubble :deep(.a2ui-surface .a2ui-button-primary),
.a2ui-bubble :deep([data-a2ui-surface] button[class*='primary']:not(.chip):not(.choice-card)),
.a2ui-bubble :deep([data-a2ui-surface] .a2ui-button-primary) {
  background: var(--studio-text) !important;
  background-color: var(--studio-text) !important;
  color: var(--studio-inset) !important;
  border-color: transparent !important;
}
.a2ui-bubble :deep(.a2ui-surface button[class*='primary']:not(.chip):not(.choice-card):hover:not(:disabled)),
.a2ui-bubble :deep([data-a2ui-surface] button[class*='primary']:not(.chip):not(.choice-card):hover:not(:disabled)) {
  background: var(--studio-ink) !important;
  color: #000 !important;
}
/* 第二个及之后的动作按钮：暗色描边次要样式 */
.a2ui-bubble :deep([class*='Row'] > button:not(.chip):not(.choice-card):nth-child(n + 2)),
.a2ui-bubble :deep([class*='Row'] > *:nth-child(n + 2) button) {
  background: var(--studio-glass-2) !important;
  background-color: var(--studio-glass-2) !important;
  color: var(--studio-ink) !important;
  border: 1px solid var(--studio-line-strong) !important;
}
.a2ui-bubble :deep([class*='Row'] > button:not(.chip):not(.choice-card):nth-child(n + 2):hover:not(:disabled)),
.a2ui-bubble :deep([class*='Row'] > *:nth-child(n + 2) button:hover:not(:disabled)) {
  background: var(--studio-line-strong) !important;
  color: #fff !important;
}
/* 动作行：等宽排布 */
.a2ui-bubble :deep(.a2ui-surface [class*='Row']),
.a2ui-bubble :deep([data-a2ui-surface] [class*='Row']),
.a2ui-bubble :deep([class*='Row']) {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  margin-top: 10px !important;
  width: 100% !important;
}
.a2ui-bubble :deep(.a2ui-surface [class*='Row'] > button:not(.chip):not(.choice-card)),
.a2ui-bubble :deep([data-a2ui-surface] [class*='Row'] > button:not(.chip):not(.choice-card)),
.a2ui-bubble :deep([class*='Row'] > button:not(.chip):not(.choice-card)) {
  flex: 1 1 calc(50% - 4px) !important;
  min-width: 0 !important;
  justify-content: center !important;
}
.a2ui-bubble :deep(input),
.a2ui-bubble :deep(textarea),
.a2ui-bubble :deep([contenteditable='true']),
.a2ui-bubble :deep(.p-inputtext),
.a2ui-bubble :deep(.p-inputtextarea),
.a2ui-bubble :deep([class*='TextField'] input),
.a2ui-bubble :deep([class*='TextField'] textarea) {
  box-sizing: border-box !important;
  width: 100% !important;
  min-height: 40px !important;
  height: auto !important;
  max-height: 120px !important;
  margin-top: 6px !important;
  padding: 10px 12px !important;
  border-radius: 10px !important;
  border: 1px solid var(--studio-line-strong) !important;
  background: rgba(0, 0, 0, 0.35) !important;
  color: var(--studio-text) !important;
  font-family: inherit !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  line-height: 1.45 !important;
  letter-spacing: 0 !important;
  box-shadow: none !important;
  outline: none !important;
  resize: vertical;
}
.a2ui-bubble :deep(input:focus),
.a2ui-bubble :deep(textarea:focus),
.a2ui-bubble :deep(.p-inputtext:focus),
.a2ui-bubble :deep(.p-inputtextarea:focus) {
  border-color: rgba(167, 139, 250, 0.45) !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15) !important;
}
.a2ui-bubble :deep(input::placeholder),
.a2ui-bubble :deep(textarea::placeholder),
.a2ui-bubble :deep(.p-inputtext::placeholder),
.a2ui-bubble :deep(.p-inputtextarea::placeholder) {
  color: var(--studio-line-bright) !important;
  font-family: inherit !important;
  font-size: 13px !important;
  opacity: 1 !important;
}
.a2ui-bubble :deep(label),
.a2ui-bubble :deep(.p-float-label),
.a2ui-bubble :deep([class*='Field'] label),
.a2ui-bubble :deep([class*='textfield'] label) {
  display: block;
  margin: 0 0 2px;
  color: var(--studio-text-soft) !important;
  font-size: 12px !important;
  font-weight: 650 !important;
  font-family: inherit !important;
}
.a2ui-bubble :deep([class*='Column']),
.a2ui-bubble :deep([class*='column']) {
  gap: 12px !important;
}
.stream-md {
  font-size: 13px;
  line-height: 1.55;
  color: var(--studio-text-strong);
  word-break: break-word;
}
.stream-md :deep(p) {
  margin: 0 0 0.5em;
}
.stream-md :deep(p:last-child) {
  margin-bottom: 0;
}
.stream-wait,
.stream-idle {
  margin: 4px 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--studio-text-faint);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.wait-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 14px;
}
.wait-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(196, 181, 253, 0.85);
  animation: wait-blink 1.15s infinite ease-in-out;
}
.wait-dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.wait-dots i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes wait-blink {
  0%,
  80%,
  100% {
    opacity: 0.28;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .proc-spin,
  .proc-step.active .proc-label,
  .stream-caret,
  .wait-dots i,
  .proc-dot.on {
    animation: none;
  }
}
.stream-idle kbd {
  display: inline-block;
  padding: 0 5px;
  border-radius: 4px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-glass-2);
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: rgba(221, 214, 254, 0.95);
}

.cas-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  background: var(--studio-glass);
  border: 1px solid var(--studio-glass-3);
  flex-shrink: 0;
  overflow: visible;
  position: relative;
  z-index: 6;
}
.cas-composer.empty {
  background: transparent;
  border: 0;
  padding: 4px 2px 0;
  gap: 12px;
}
.composer-wrap {
  position: relative;
  overflow: visible;
  z-index: 7;
}
.cas-refs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ref-slot {
  width: 44px;
  height: 44px;
  border: 1px dashed var(--studio-line-strong);
  border-radius: 12px;
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.ref-slot:hover {
  border-color: var(--studio-line-bright);
  color: #fff;
  background: var(--studio-glass);
}
.ref-chip {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--studio-glass-3);
}
.ref-chip img,
.ref-chip video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ref-chip .ph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--studio-text-faint);
}
.ref-chip .x {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.cas-prompt {
  width: 100%;
  color: var(--studio-text);
  --surface: var(--studio-panel);
  --surface-2: var(--studio-panel-3);
  --ink: var(--studio-text);
  --muted: var(--studio-text-faint);
  --line: var(--studio-glass-3);
  --el-text-color-placeholder: var(--studio-line-bright);
}
.cas-editor-shell {
  width: 100%;
  min-height: 64px;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-3);
  box-sizing: border-box;
}
.cas-composer:not(.empty) .cas-editor-shell {
  min-height: 56px;
}
.cas-prompt :deep(.ai-prompt) {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
  color: var(--studio-text) !important;
  --surface: transparent;
  --surface-2: var(--studio-panel-3);
  --ink: var(--studio-text);
}
.cas-prompt :deep(.ai-prompt-body),
.cas-prompt :deep(.ai-prompt-main),
.cas-prompt :deep(.ai-prompt-editor),
.cas-prompt :deep(.editor-scroll),
.cas-prompt :deep(.tiptap-container),
.cas-prompt :deep(.ProseMirror),
.cas-prompt :deep(.el-scrollbar),
.cas-prompt :deep(.el-scrollbar__wrap),
.cas-prompt :deep(.el-scrollbar__view) {
  background: transparent !important;
  color: var(--studio-text) !important;
  box-shadow: none !important;
}
.cas-prompt :deep(.ProseMirror) {
  min-height: 72px;
  caret-color: #e9d5ff;
}
.cas-prompt :deep(.ProseMirror p.is-editor-empty:first-child::before),
.cas-prompt :deep(.tiptap-container .is-empty::before),
.cas-prompt :deep(.ProseMirror p.is-empty:first-child::before) {
  color: var(--studio-line-bright) !important;
}
.cas-prompt :deep(.ai-prompt-bar) {
  background: transparent !important;
  border-color: var(--studio-glass-2) !important;
}

.float-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 40;
  max-height: min(280px, 42vh);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: color-mix(in srgb, var(--studio-panel) 98%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.fp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 6px;
}
.fp-head strong {
  font-size: 13px;
  font-weight: 700;
}
.fp-link {
  border: 0;
  background: transparent;
  color: rgba(196, 181, 253, 0.95);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.fp-empty {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--studio-text-faint);
  text-align: center;
}
.fp-scroll {
  min-height: 0;
}
.fp-list {
  padding: 4px 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fp-list.compact {
  padding-top: 2px;
}
.skill-row {
  border: 0;
  background: transparent;
  color: var(--studio-text);
  text-align: left;
  padding: 10px 8px;
  border-radius: 10px;
  font: inherit;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.skill-row:hover,
.skill-row.on {
  background: var(--studio-glass-2);
}
.sk-ico {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(139, 92, 246, 0.2);
  flex-shrink: 0;
}
.sk-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sk-meta strong {
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sk-meta em {
  font-style: normal;
  font-size: 11px;
  color: var(--studio-text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sk-check {
  color: #c4b5fd;
  font-size: 14px;
  flex-shrink: 0;
}
.men-row,
.men-back {
  border: 0;
  background: transparent;
  color: var(--studio-text);
  text-align: left;
  padding: 11px 14px;
  font: inherit;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.men-row:hover:not(:disabled),
.men-back:hover {
  background: var(--studio-glass-2);
}
.men-row:disabled,
.men-row.muted {
  opacity: 0.4;
  cursor: not-allowed;
}
.men-row .chev {
  opacity: 0.45;
}
.men-search {
  border-top: 1px solid var(--studio-glass-2);
  padding: 8px 10px;
}
.men-search.top {
  border-top: 0;
  border-bottom: 1px solid var(--studio-glass-2);
  flex-shrink: 0;
}
.men-search input {
  width: 100%;
  height: 32px;
  border: 1px solid var(--studio-glass-3);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  padding: 0 10px;
  font: inherit;
  font-size: 12px;
  box-sizing: border-box;
}
.cite-row {
  border: 0;
  background: transparent;
  color: var(--studio-text);
  text-align: left;
  padding: 8px;
  border-radius: 10px;
  font: inherit;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.cite-row:hover {
  background: var(--studio-glass-2);
}
.cite-thumb {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
  flex-shrink: 0;
}
.cite-thumb img,
.cite-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cite-ph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: var(--studio-text-faint);
}
.cite-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cite-meta strong {
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cite-meta em {
  font-style: normal;
  font-size: 11px;
  color: var(--studio-text-faint);
}

.cas-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.agent-badge {
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(139, 92, 246, 0.16);
  color: #e9d5ff;
  font-size: 12px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  user-select: none;
}
.pill-wrap {
  position: relative;
}
.pill {
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-glass-2);
  color: var(--studio-text);
  font: inherit;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}
.pill.on,
.pill:hover {
  background: var(--studio-line-strong);
}
.chev {
  opacity: 0.55;
  font-size: 10px;
}
.mode-pop {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 5;
  min-width: 120px;
  padding: 6px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--studio-panel) 98%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mode-row {
  border: 0;
  background: transparent;
  color: var(--studio-text);
  text-align: left;
  padding: 9px 10px;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.mode-row:hover,
.mode-row.on {
  background: var(--studio-glass-2);
}
.check {
  color: #c4b5fd;
}
.send {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-text);
  color: var(--studio-inset);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.send.stop {
  background: #ef4444;
  color: #fff;
}
.stop-sq {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: currentColor;
}
</style>
