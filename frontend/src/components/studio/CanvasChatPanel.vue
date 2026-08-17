<template>
  <Teleport to="body">
    <aside v-if="open" class="ccp" role="dialog" aria-label="工作流对话">
      <header class="ccp-head">
        <div class="ccp-titles">
          <strong>工作流对话</strong>
          <span v-if="subtitle" class="ccp-sub">{{ subtitle }}</span>
          <span class="ccp-hint">可读写当前画布 · Skills · 动作落地</span>
        </div>
        <div class="ccp-ops">
          <button
            v-if="sending"
            type="button"
            class="ghost"
            title="停止"
            @click="store.stop()"
          >
            停止
          </button>
          <button type="button" class="icon" title="关闭" @click="emit('close')">×</button>
        </div>
      </header>

      <div ref="listRef" class="ccp-body">
        <div v-if="!messages.length" class="ccp-welcome">
          <p class="hi">Hi，我是你的画布助手</p>
          <p class="sub">
            对话绑定当前工作流：看得见节点与连线，能帮你改提示词、加节点、落到画布、运行生成。
          </p>
          <p class="tip-label">技能 Skills</p>
          <div class="skills">
            <button
              v-for="s in skillChips"
              :key="s.id"
              type="button"
              class="skill"
              @click="runSkill(s.id)"
            >
              {{ s.name }}
            </button>
          </div>
          <p class="tip-label">快捷</p>
          <div class="skills">
            <button type="button" class="skill soft" @click="draftHint('帮我看看当前画布缺什么')">
              诊断画布
            </button>
            <button type="button" class="skill soft" @click="draftHint('给选中节点优化提示词')">
              优化选中节点
            </button>
            <button type="button" class="skill soft" @click="draftHint('落到画布')">
              落到画布
            </button>
          </div>
        </div>

        <div
          v-for="m in displayMessages"
          :key="m.id"
          class="msg"
          :class="[m.role, { err: m.error }]"
        >
          <div class="bubble" v-html="renderMsg(m.display)" />
          <div v-if="m.actions?.length" class="act-row">
            <button
              v-for="(a, i) in m.actions"
              :key="`${m.id}-${a.name}-${i}`"
              type="button"
              class="act"
              :disabled="sending"
              @click="dispatchAction(a, m.raw)"
            >
              {{ a.label || a.name }}
            </button>
          </div>
        </div>
        <div v-if="sending && !streamingTail" class="msg assistant">
          <div class="bubble muted">思考中…</div>
        </div>
      </div>

      <footer class="ccp-foot">
        <div v-if="skillChips.length" class="ccp-skill-bar">
          <button
            v-for="s in skillChips.slice(0, 6)"
            :key="`bar-${s.id}`"
            type="button"
            class="skill-mini"
            :class="{ on: activeSkillId === s.id }"
            :title="s.desc"
            @click="runSkill(s.id)"
          >
            {{ s.name }}
          </button>
        </div>
        <AiPromptInput
          ref="inputRef"
          v-model="draft"
          v-model:attachments="attachments"
          mode="agent"
          :modes="[{ value: 'agent', label: 'Agent' }]"
          :templates="skillTemplates"
          :show-templates="skillTemplates.length > 0"
          :show-prefs="false"
          :show-mention="true"
          :enable-attachments="true"
          :show-send="true"
          :loading="sending"
          :disabled="sending"
          :min-height="72"
          :auto-apply-template="false"
          tone="home"
          placeholder="描述你想改的画布 / 提示词 / 节点… 可用 / 调技能"
          class="ccp-prompt"
          @submit="onSubmit"
          @pick-template="onTemplatePick"
        />
      </footer>
    </aside>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { JSONContent } from '@tiptap/core';
import {
  useStudioChatStore,
  type CanvasChatSnapshot,
} from '@/stores/studio-chat';
import {
  extractChatActions,
  matchUserIntent,
  stripActionFences,
  type ChatAction,
} from '@/utils/studio-chat-actions';
import { listChatSkills, type CatalogSkill } from '@/utils/skill-catalog';
import { renderMarkdown } from '@/utils/markdown';
import AiPromptInput from '@/components/ai-prompt-input/AiPromptInput.vue';
import type { AiPromptTemplate } from '@/components/ai-prompt-input/types';
import type { PromptImageAttachment } from '@/components/ai-prompt-input/attachment';

const props = defineProps<{
  open: boolean;
  productionId?: string;
  workflowId?: string;
  workflowName?: string;
  projectId?: string;
  /** 当前画布快照，注入模型上下文 */
  canvasSnapshot?: CanvasChatSnapshot | null;
  seedDraft?: string;
}>();

const emit = defineEmits<{
  close: [];
  'consumed-seed': [];
  action: [action: ChatAction, sourceText?: string];
}>();

const store = useStudioChatStore();
const draft = ref('');
const attachments = ref<PromptImageAttachment[]>([]);
const listRef = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof AiPromptInput> | null>(null);
/** 已自动执行过的助手消息，避免重复落地 */
const autoDone = ref(new Set<string>());

const messages = computed(() => store.active?.messages || []);
const sending = computed(() => store.sending || messages.value.some((m) => m.streaming));
const activeSkillId = computed(() => store.active?.skillId || '');
const streamingTail = computed(() => {
  const last = messages.value[messages.value.length - 1];
  return !!(last?.role === 'assistant' && last.streaming && last.content);
});

const subtitle = computed(() => {
  const n = String(props.workflowName || '').trim();
  if (n && n !== '未命名工作流' && n !== '未命名项目') return n;
  return '';
});

const skillChips = computed(() => {
  const prefer = [
    'plot-architect',
    'character-bible',
    'image-prompt-pro',
    'shot-table',
    'hook-rewriter',
    'style-lock',
  ];
  const all = listChatSkills();
  const picked: CatalogSkill[] = [];
  for (const id of prefer) {
    const hit = all.find((s) => s.id === id);
    if (hit) picked.push(hit);
  }
  for (const s of all) {
    if (picked.length >= 8) break;
    if (!picked.some((x) => x.id === s.id)) picked.push(s);
  }
  return picked;
});

const skillTemplates = computed<AiPromptTemplate[]>(() =>
  skillChips.value.map((s) => skillToTemplate(s)),
);

const displayMessages = computed(() =>
  messages.value.map((m) => {
    const raw = String(m.content || '');
    const actions =
      m.role === 'assistant' && !m.streaming && !m.error ? extractChatActions(raw) : [];
    return {
      id: m.id,
      role: m.role,
      error: m.error,
      streaming: m.streaming,
      raw,
      display: m.role === 'assistant' ? stripActionFences(raw) || raw : raw,
      actions,
    };
  }),
);

function skillToTemplate(s: CatalogSkill): AiPromptTemplate {
  const text = String(s.starter || s.prompt || s.name).trim() || s.name;
  const content: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
  return {
    id: s.id,
    label: s.slash ? `/${s.slash} ${s.name}` : s.name,
    description: s.desc,
    content,
  };
}

function bindCurrentWorkflow() {
  store.hydrate();
  store.ensureWorkflowSession({
    workflowId: String(props.workflowId || ''),
    productionId: String(props.productionId || ''),
    title: String(props.workflowName || '').trim() || undefined,
  });
}

function currentCanvas(): CanvasChatSnapshot | null {
  return props.canvasSnapshot || {
    workflowId: String(props.workflowId || ''),
    workflowName: String(props.workflowName || ''),
  };
}

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    bindCurrentWorkflow();
    const seed = String(props.seedDraft || '').trim();
    if (seed) {
      draft.value = seed;
      emit('consumed-seed');
    }
    void nextTick(() => {
      inputRef.value?.focus?.();
      void scrollBottom();
    });
  },
);

watch(
  () => [props.workflowId, props.productionId] as const,
  () => {
    if (!props.open) return;
    autoDone.value = new Set();
    bindCurrentWorkflow();
    void scrollBottom();
  },
);

watch(
  () => messages.value.map((m) => `${m.id}:${m.content.length}:${m.streaming}`).join('|'),
  () => {
    void scrollBottom();
    void maybeAutoDispatch();
  },
);

async function scrollBottom() {
  await nextTick();
  const el = listRef.value;
  if (el) el.scrollTop = el.scrollHeight;
}

function renderMsg(raw: string) {
  try {
    return renderMarkdown(String(raw || '')).html;
  } catch {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\n/g, '<br/>');
  }
}

function draftHint(text: string) {
  draft.value = text;
  void nextTick(() => inputRef.value?.focus?.());
}

function onTemplatePick(tpl: AiPromptTemplate) {
  const skill = skillChips.value.find((s) => s.id === tpl.id);
  if (skill) store.setSkill(skill.id);
}

async function onSubmit(text: string) {
  const t = String(text || draft.value || '').trim();
  if (!t || sending.value) return;
  bindCurrentWorkflow();

  const intent = matchUserIntent(t);
  if (intent && intent.name !== 'run_skill' && intent.name !== 'to_canvas') {
    // 打开类意图：先交给宿主，再可选继续聊
    emit('action', intent, t);
  }

  const attNote =
    attachments.value.length > 0
      ? `\n\n（用户附带 ${attachments.value.length} 张参考图，请结合理解需求）`
      : '';
  draft.value = '';
  attachments.value = [];
  await store.send(`${t}${attNote}`, {
    canvas: currentCanvas(),
    skillId: intent?.name === 'run_skill' ? String(intent.args?.skillId || '') : undefined,
  });
  void scrollBottom();
  await maybeAutoDispatch();
}

async function runSkill(skillId: string) {
  bindCurrentWorkflow();
  await store.runSkill(skillId, '', { canvas: currentCanvas() });
  void scrollBottom();
  await maybeAutoDispatch();
}

function dispatchAction(action: ChatAction, sourceText?: string) {
  emit('action', action, sourceText);
}

/** 助手结束后自动执行安全动作（落画布 / 跑节点等） */
async function maybeAutoDispatch() {
  if (sending.value) return;
  const last = [...messages.value].reverse().find((m) => m.role === 'assistant' && !m.error);
  if (!last || last.streaming) return;
  if (autoDone.value.has(last.id)) return;
  const actions = extractChatActions(last.content);
  if (!actions.length) return;
  autoDone.value.add(last.id);
  // 自动执行落地类；打开类仍留给按钮
  const autoNames = new Set(['to_canvas', 'run_node', 'add_node', 'set_param', 'select_node', 'run_skill']);
  for (const a of actions) {
    if (!autoNames.has(a.name)) continue;
    if (a.name === 'run_skill') {
      // 模型声明的技能：若与刚跑过的重复则跳过；否则再跑一次会啰嗦，只交给按钮
      continue;
    }
    emit('action', a, last.content);
  }
}

async function sendNow(text: string) {
  const t = String(text || '').trim();
  if (!t) return;
  bindCurrentWorkflow();
  await store.send(t, { canvas: currentCanvas() });
  void scrollBottom();
  await maybeAutoDispatch();
}

defineExpose({ sendNow, bindCurrentWorkflow });
</script>

<style scoped>
.ccp {
  position: fixed;
  top: 56px;
  right: 14px;
  bottom: 72px;
  z-index: 70;
  width: min(400px, calc(100vw - 28px));
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--studio-panel) 97%, transparent);
  border: 1px solid var(--studio-glass-3);
  border-radius: 18px;
  box-shadow: 0 20px 56px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(20px) saturate(1.2);
  color: var(--studio-text);
  overflow: hidden;
  animation: ccp-in 0.18s ease-out;
}
.ccp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 14px 12px 16px;
  border-bottom: 1px solid var(--studio-glass-2);
}
.ccp-titles {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ccp-head strong {
  font-size: 14px;
  font-weight: 650;
}
.ccp-sub {
  font-size: 12px;
  color: var(--studio-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ccp-hint {
  font-size: 11px;
  color: var(--studio-line-bright);
}
.ccp-ops {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.ccp-ops .ghost,
.ccp-ops .icon {
  border: 0;
  background: transparent;
  color: var(--studio-text-soft);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  border-radius: 8px;
  padding: 4px 8px;
}
.ccp-ops .icon {
  width: 28px;
  height: 28px;
  font-size: 18px;
  line-height: 1;
  padding: 0;
}
.ccp-ops .ghost:hover,
.ccp-ops .icon:hover {
  background: var(--studio-glass-2);
  color: #fff;
}
.ccp-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ccp-welcome {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 2px 10px;
}
.ccp-welcome .hi {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.ccp-welcome .sub,
.ccp-welcome .tip-label {
  margin: 0;
  font-size: 12px;
  color: var(--studio-text-faint);
  line-height: 1.55;
}
.ccp-welcome .tip-label {
  margin-top: 6px;
  color: var(--studio-text-soft);
  font-weight: 600;
}
.skills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.skill {
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-glass);
  color: #f0f0f0;
  border-radius: 999px;
  padding: 6px 11px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.skill:hover {
  border-color: var(--studio-line-bright);
  background: var(--studio-glass-2);
}
.skill.soft {
  color: var(--studio-text-strong);
}
.msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
.msg.user {
  align-items: flex-end;
}
.msg .bubble {
  max-width: 94%;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.55;
  background: rgba(255, 255, 255, 0.07);
  word-break: break-word;
}
.msg.user .bubble {
  background: var(--studio-ink);
  color: var(--studio-inset);
  border-bottom-right-radius: 6px;
}
.msg.assistant .bubble {
  border-bottom-left-radius: 6px;
}
.msg.err .bubble {
  border: 1px solid rgba(248, 113, 113, 0.45);
}
.msg .bubble.muted {
  color: var(--studio-text-faint);
}
.msg .bubble :deep(p) {
  margin: 0 0 0.5em;
}
.msg .bubble :deep(p:last-child) {
  margin-bottom: 0;
}
.msg .bubble :deep(pre) {
  margin: 0.5em 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  overflow: auto;
  font-size: 12px;
}
.act-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 2px;
}
.act {
  height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(167, 139, 250, 0.35);
  border-radius: 999px;
  background: rgba(139, 92, 246, 0.14);
  color: #e9d5ff;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.act:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.24);
}
.act:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ccp-foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 14px;
  border-top: 1px solid var(--studio-glass-2);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.28));
  flex-shrink: 0;
}
.ccp-skill-bar {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow-x: auto;
  padding: 0 2px;
  scrollbar-width: none;
}
.ccp-skill-bar::-webkit-scrollbar {
  display: none;
}
.skill-mini {
  flex-shrink: 0;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--studio-glass-3);
  border-radius: 999px;
  background: var(--studio-glass);
  color: var(--studio-text-soft);
  font: inherit;
  font-size: 11px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}
.skill-mini:hover,
.skill-mini.on {
  background: var(--studio-glass-3);
  border-color: var(--studio-line-strong);
  color: #fff;
}

/* 输入区：对齐画布暗色，避免 Teleport 后吃到浅色 --surface */
.ccp-prompt {
  width: 100%;
  --prompt-radius: 14px;
  --prompt-border: var(--studio-glass-3);
  --prompt-chip-bg: rgba(255, 255, 255, 0.07);
  --prompt-send: var(--studio-text);
  --prompt-send-disabled: var(--studio-line-bright);
  --prompt-tag-bg: rgba(167, 139, 250, 0.18);
  --prompt-tag-fg: #c4b5fd;
  --surface: var(--studio-panel);
  --surface-2: var(--studio-glass-2);
  --ink: var(--studio-text);
  --muted: var(--studio-text-faint);
  --line: var(--studio-glass-3);
  --line-strong: var(--studio-line-strong);
  --el-text-color-placeholder: var(--studio-text-faint);
  background: var(--studio-panel) !important;
  border: 1px solid var(--studio-glass-3) !important;
  box-shadow: none !important;
  color: var(--studio-text) !important;
  border-radius: 14px !important;
}
.ccp-prompt:focus-within {
  border-color: rgba(167, 139, 250, 0.42) !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.14) !important;
}
.ccp-prompt :deep(.ai-prompt-body) {
  gap: 10px;
  padding: 10px 10px 8px;
  background: transparent !important;
}
.ccp-prompt :deep(.attach-rail) {
  --attach-w: 44px;
  --attach-h: 56px;
}
.ccp-prompt :deep(.attach-empty) {
  background: var(--studio-glass-2) !important;
  border: 1px solid var(--studio-glass-3) !important;
  color: var(--studio-text-faint) !important;
  border-radius: 10px;
  font-size: 10px;
}
.ccp-prompt :deep(.attach-empty:hover:not(:disabled)) {
  background: var(--studio-glass-3) !important;
  border-color: var(--studio-line-strong) !important;
  color: var(--studio-text-strong) !important;
}
.ccp-prompt :deep(.attach-card) {
  border-color: var(--studio-line-strong) !important;
  background: rgba(0, 0, 0, 0.35) !important;
  box-shadow: none !important;
}
.ccp-prompt :deep(.attach-fab) {
  background: #ececec !important;
  color: var(--studio-inset) !important;
}
.ccp-prompt :deep(.ai-prompt-main),
.ccp-prompt :deep(.ai-prompt-editor),
.ccp-prompt :deep(.editor-scroll),
.ccp-prompt :deep(.tiptap-container),
.ccp-prompt :deep(.ProseMirror),
.ccp-prompt :deep(.el-scrollbar),
.ccp-prompt :deep(.el-scrollbar__wrap),
.ccp-prompt :deep(.el-scrollbar__view) {
  background: transparent !important;
  color: var(--studio-text) !important;
  box-shadow: none !important;
}
.ccp-prompt :deep(.tiptap-container),
.ccp-prompt :deep(.tiptap-container p),
.ccp-prompt :deep(.ai-prompt-p),
.ccp-prompt :deep(.ProseMirror) {
  color: var(--studio-text) !important;
  font-size: 13.5px !important;
  line-height: 1.55 !important;
  caret-color: #c4b5fd;
}
.ccp-prompt :deep(.ai-prompt-placeholder) {
  color: var(--studio-text-faint) !important;
  font-size: 13.5px !important;
}
.ccp-prompt :deep(.mention-tag) {
  background: rgba(167, 139, 250, 0.16) !important;
  color: #d8b4fe !important;
}
.ccp-prompt :deep(.mention-tag.media) {
  background: var(--studio-glass-3) !important;
  color: #f0f0f0 !important;
}
.ccp-prompt :deep(.ai-prompt-bar) {
  padding: 2px 2px 2px;
  background: transparent !important;
  border-color: transparent !important;
  gap: 6px;
}
.ccp-prompt :deep(.bar-tools) {
  gap: 6px;
}
.ccp-prompt :deep(.chip) {
  background: var(--studio-glass-2) !important;
  color: var(--studio-text-strong) !important;
  border: 1px solid var(--studio-glass-3) !important;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
  box-shadow: none !important;
}
.ccp-prompt :deep(.chip:hover:not(:disabled)) {
  background: var(--studio-glass-3) !important;
  border-color: var(--studio-line-strong) !important;
  color: #fff !important;
}
.ccp-prompt :deep(.chip.on),
.ccp-prompt :deep(.chip-mode.agent) {
  background: rgba(167, 139, 250, 0.16) !important;
  border-color: rgba(167, 139, 250, 0.35) !important;
  color: #e9d5ff !important;
}
.ccp-prompt :deep(.chip-mode.agent) {
  color: #e9d5ff !important;
}
.ccp-prompt :deep(.send-btn),
.ccp-prompt :deep(.ai-prompt-send),
.ccp-prompt :deep(button.send) {
  background: var(--studio-glass-2) !important;
  color: var(--studio-text-faint) !important;
  border: 1px solid var(--studio-glass-3) !important;
  box-shadow: none !important;
  transform: none !important;
}
.ccp-prompt :deep(.send-btn.ready),
.ccp-prompt :deep(.ai-prompt-send.ready),
.ccp-prompt :deep(button.send.ready) {
  background: #ececec !important;
  color: var(--studio-inset) !important;
  border-color: transparent !important;
  cursor: pointer;
}
.ccp-prompt :deep(.send-btn.ready:hover),
.ccp-prompt :deep(.ai-prompt-send.ready:hover),
.ccp-prompt :deep(button.send.ready:hover) {
  background: var(--studio-ink) !important;
  color: #000 !important;
  transform: none !important;
}
@keyframes ccp-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
