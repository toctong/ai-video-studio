<template>
  <div class="gen-page">
    <aside class="gen-sidebar">
      <div class="sb-head">
        <h2>{{ isImageWorkbench ? 'AI 生图' : '历史记录' }}</h2>
        <button type="button" class="sb-new" title="新对话" @click="onNewSession">
          <UiIcon name="plus" :size="16" />
          <span>新对话</span>
        </button>
      </div>
      <div class="sb-list" v-loading="sessionsLoading">
        <UiScroll class="sb-scroll" always height="100%">
          <div class="sb-scroll-inner">
            <div
              v-for="s in sessions"
              :key="s.id"
              class="sb-item"
              :class="{ on: s.id === activeSessionId, pinned: s.pinned }"
              @click="selectSession(s.id)"
            >
              <div class="sb-thumb" :class="{ empty: !s.coverUrl }">
                <LazyCoverImage v-if="s.coverUrl" :src="s.coverUrl" alt="" />
                <span v-else class="sb-thumb-ico" aria-hidden="true">◇</span>
              </div>
              <div class="sb-item-main">
                <input
                  v-if="renamingId === s.id"
                  ref="renameInputRef"
                  v-model="renameDraft"
                  class="sb-rename"
                  @click.stop
                  @keydown.enter.prevent="commitRename(s)"
                  @keydown.esc.prevent="renamingId = null"
                  @blur="commitRename(s)"
                />
                <span v-else class="sb-title">{{ s.title || '新对话' }}</span>
              </div>
              <div class="sb-item-ops" @click.stop>
                <button type="button" class="ico" :title="s.pinned ? '取消置顶' : '置顶'" @click="togglePin(s)">
                  {{ s.pinned ? '★' : '☆' }}
                </button>
                <button type="button" class="ico" title="重命名" @click="startRename(s)">
                  <UiIcon name="pencil" :size="13" />
                </button>
                <button type="button" class="ico danger" title="删除" @click="confirmDelete(s)">
                  <UiIcon name="trash" :size="13" />
                </button>
              </div>
            </div>
            <p v-if="!sessionsLoading && !sessions.length" class="sb-empty">还没有对话，输入提示词开始生成</p>
          </div>
        </UiScroll>
      </div>
    </aside>

    <section class="gen-main">
      <div class="gen-feed">
        <UiScroll ref="feedScrollRef" class="feed-scroll" always height="100%">
          <div class="feed-inner">
            <div v-if="!activeSessionId || (!messages.length && !chatBusy)" class="gen-empty">
              <h1>{{ emptyTitle }}</h1>
              <p>{{ emptySub }}</p>
            </div>
            <template v-else>
              <div
                v-for="item in feedItems"
                :key="item.key"
                class="msg"
                :class="item.type === 'media' ? 'media-card-msg' : item.message.role"
              >
                <!-- 聊天：用户气泡 -->
                <div v-if="item.type === 'chat' && item.message.role === 'user'" class="bubble user-bubble">
                  <div v-if="quotesOf(item.message).length" class="msg-quotes">
                    <div
                      v-for="(q, qi) in quotesOf(item.message)"
                      :key="q.id || qi"
                      class="msg-quote-chip"
                      :class="q.kind"
                    >
                      <img v-if="q.kind === 'image' && q.url" :src="q.url" alt="" class="msg-quote-thumb" />
                      <LazyVideoThumb
                        v-else-if="q.kind === 'video' && q.url"
                        class="msg-quote-thumb"
                        :src="q.url"
                        :poster-url="String((q as any).posterUrl || '')"
                      />
                      <span class="msg-quote-label">{{ quoteChipLabel(q, qi) }}</span>
                    </div>
                  </div>
                  <p class="user-text">{{ item.message.content }}</p>
                </div>

                <!-- 聊天：助手回复 -->
                <div
                  v-else-if="item.type === 'chat' && item.message.role === 'assistant'"
                  class="bubble asst-bubble"
                >
                  <div v-if="modelLabelOf(item.message)" class="model-tag" :title="modelIdOf(item.message)">
                    <span class="model-tag-ico" aria-hidden="true">◈</span>
                    <span>{{ modelLabelOf(item.message) }}</span>
                  </div>
                  <GenerateThinkReply
                    :source="thinkingOf(item.message)"
                    :streaming="isThinkStreaming(item.message)"
                    :think-ms="Number(item.message.prefs?.thinkMs) || thinkMsOf(item.message.id)"
                  />
                  <GenerateMarkdown
                    v-if="item.message.content || item.message.status === 'error'"
                    class="asst-answer"
                    :tone="theme.isDark ? 'dark' : 'light'"
                    :source="
                      item.message.status === 'error' && !item.message.content
                        ? item.message.errorMessage || '对话失败'
                        : item.message.content
                    "
                  />
                </div>

                <!-- 图/视频：提示词头 + 结果网格（即梦式结果卡） -->
                <div v-else-if="item.type === 'media'" class="result-card">
                  <header class="result-head">
                    <div v-if="item.user && quotesOf(item.user).length" class="msg-quotes result-quotes">
                      <div
                        v-for="(q, qi) in quotesOf(item.user)"
                        :key="q.id || qi"
                        class="msg-quote-chip"
                        :class="q.kind"
                      >
                        <img v-if="q.kind === 'image' && q.url" :src="q.url" alt="" class="msg-quote-thumb" />
                        <LazyVideoThumb
                          v-else-if="q.kind === 'video' && q.url"
                          class="msg-quote-thumb"
                          :src="q.url"
                          :poster-url="String((q as any).posterUrl || '')"
                        />
                        <span class="msg-quote-label">{{ quoteChipLabel(q, qi) }}</span>
                      </div>
                    </div>
                    <div class="result-prompt-block">
                      <div class="result-prompt-row">
                        <div class="result-prompt-clip">
                          <p
                            class="result-prompt"
                            :class="{ expanded: isPromptExpanded(item.assistant.id) }"
                          >
                            {{ resultPromptOf(item) }}
                          </p>
                        </div>
                        <button
                          type="button"
                          class="result-prompt-copy"
                          title="复制提示词"
                          aria-label="复制提示词"
                          @click.stop="copyResultPrompt(resultPromptOf(item))"
                        >
                          <UiIcon name="copy" :size="14" />
                        </button>
                      </div>
                      <button
                        v-if="promptNeedsExpand(resultPromptOf(item))"
                        type="button"
                        class="result-prompt-toggle"
                        @click="togglePromptExpand(item.assistant.id)"
                      >
                        {{ isPromptExpanded(item.assistant.id) ? '收起' : '展开' }}
                      </button>
                    </div>
                    <div class="result-meta">
                      <span class="result-meta-text">
                        <span v-if="modelLabelOf(item.assistant)" :title="modelIdOf(item.assistant)">
                          {{ modelLabelOf(item.assistant) }}
                        </span>
                        <template v-if="metaAspectOf(item.assistant)">
                          <span class="result-meta-dot" aria-hidden="true">·</span>
                          <span>{{ metaAspectOf(item.assistant) }}</span>
                        </template>
                        <template v-if="metaCountOf(item.assistant) > 1">
                          <span class="result-meta-dot" aria-hidden="true">·</span>
                          <span>{{ metaCountOf(item.assistant) }} 张</span>
                        </template>
                        <span
                          class="result-meta-status"
                          :class="{
                            live:
                              item.assistant.status === 'pending' ||
                              item.assistant.status === 'streaming',
                            err: item.assistant.status === 'error',
                          }"
                        >
                          <template v-if="modelLabelOf(item.assistant) || metaAspectOf(item.assistant) || metaCountOf(item.assistant) > 1">
                            <span class="result-meta-dot" aria-hidden="true">·</span>
                          </template>
                          {{
                            item.assistant.status === 'error'
                              ? item.assistant.kind === 'video'
                                ? '视频生成失败'
                                : '图片生成失败'
                              : item.assistant.status === 'done'
                                ? item.assistant.kind === 'video'
                                  ? '视频生成完成'
                                  : '图片生成完成'
                                : item.assistant.kind === 'video'
                                  ? '视频生成中'
                                  : '图片生成中'
                          }}
                        </span>
                      </span>
                      <button
                        v-if="
                          item.assistant.status === 'pending' || item.assistant.status === 'streaming'
                        "
                        type="button"
                        class="result-stop"
                        title="停止生成"
                        aria-label="停止生成"
                        @click="stopMediaGen(item.assistant.id)"
                      >
                        <span class="result-stop-sq" aria-hidden="true" />
                        <span>停止</span>
                      </button>
                    </div>
                  </header>
                  <GenerateThinkReply
                    v-if="
                      thinkingOf(item.assistant) ||
                      understandingOf(item.assistant) ||
                      item.assistant.status === 'pending'
                    "
                    :source="thinkingOf(item.assistant) || understandingOf(item.assistant)"
                    :streaming="
                      (item.assistant.status === 'pending' || item.assistant.status === 'streaming') &&
                      !thinkingOf(item.assistant) &&
                      !understandingOf(item.assistant)
                    "
                    :think-ms="Number(item.assistant.prefs?.thinkMs) || thinkMsOf(item.assistant.id)"
                  />
                  <GenerateMediaSlot
                    :tone="theme.isDark ? 'dark' : 'light'"
                    :kind="item.assistant.kind === 'video' ? 'video' : 'image'"
                    :url="item.assistant.mediaUrl"
                    :urls="mediaUrlsOf(item.assistant)"
                    :expected-count="metaCountOf(item.assistant)"
                    :poster-url="String(item.assistant.prefs?.posterUrl || '')"
                    :aspect-ratio="item.assistant.aspectRatio"
                    :status="item.assistant.status"
                    :error-message="item.assistant.errorMessage"
                    :loading="item.assistant.status === 'pending'"
                    @quote="(url) => quoteMedia(item.assistant, url)"
                    @edit-from="(url) => onEditFrom(item.assistant, url)"
                    @reedit="onReedit(item.assistant)"
                    @regenerate="onRegenerate(item.assistant)"
                  />
                </div>
              </div>
            </template>
          </div>
        </UiScroll>
      </div>

      <div class="gen-composer">
        <div v-if="!isImageWorkbench" class="video-mode-tabs" role="tablist" aria-label="生视频方式">
          <button
            v-for="m in videoWorkbenchModes"
            :key="m.id"
            type="button"
            role="tab"
            class="video-mode-tab"
            :class="{ on: genPrefs.refMode === m.id }"
            :aria-selected="genPrefs.refMode === m.id"
            :title="m.desc"
            @click="setVideoRefMode(m.id)"
          >
            {{ m.label }}
            <img v-if="m.id === 'omni'" class="tab-badge" :src="seedanceBadge" alt="" />
          </button>
        </div>
        <div v-if="quotes.length" class="quote-bar">
          <div v-for="(q, qi) in quotes" :key="q.id" class="quote-chip" :class="q.kind">
            <img v-if="q.kind === 'image' && q.url" :src="q.url" alt="" class="quote-thumb" />
            <LazyVideoThumb
              v-else-if="q.kind === 'video' && q.url"
              class="quote-thumb"
              :src="q.url"
              :poster-url="String((q as any).posterUrl || '')"
            />
            <span class="quote-chip-text">{{ quoteChipLabel(q, qi) }}</span>
            <button type="button" class="quote-chip-x" title="移除引用" @click="removeQuote(q.id)">
              ×
            </button>
          </div>
        </div>
        <div v-if="showFramesHint" class="frames-hint">
          <span class="fh-pill">参考图 1</span>
          <span class="fh-arrow">画面起点</span>
          <span class="fh-dot">·</span>
          <span class="fh-pill">参考图 2</span>
          <span class="fh-arrow">画面收束</span>
          <em>左侧上传 1～2 张图</em>
        </div>
        <div class="home-prompt">
          <AiPromptInput
            ref="promptInputRef"
            v-model="prompt"
            v-model:attachments="attachments"
            v-model:prefs="genPrefs"
            :mode="createMode"
            :modes="composerModes"
            :models="imageModelOptions"
            :video-models="videoModelOptions"
            :chat-models="chatModelOptions"
            :chat-model="chatModelId"
            :placeholder="placeholder"
            :placeholder-hints="placeholderHints"
            :loading="false"
            :disabled="false"
            :min-height="148"
            :show-templates="false"
            :templates="agentSkillTemplates"
            :template-filters="agentSkillFilters"
            :auto-apply-template="false"
            template-as-tag
            :show-prefs="true"
            :prefs-kinds="isImageWorkbench ? ['image'] : ['video']"
            :show-mention="false"
            :show-send="false"
            :attach-labels="attachLabels"
            :max-images="attachMax"
            :enable-attachments="showAttachRail"
            tone="home"
            :show-ref-mode="false"
            class="home-ai-prompt"
            @update:mode="onModeUpdate"
            @pick-template="onPickSkillTemplate"
            @submit="onSubmit"
          >
            <template #toolbar>
              <button
                type="button"
                class="enhance-btn"
                :disabled="chatBusy || enhancing || !prompt.trim()"
                title="优化提示词"
                @click="onEnhancePrompt"
              >
                <UiIcon name="sparkles" :size="14" />
                <span>{{ enhancing ? '优化中…' : '优化提示词' }}</span>
              </button>
            </template>
            <template #actions>
              <button
                type="button"
                class="home-send"
                :class="{ stop: chatBusy }"
                :disabled="submitting || (!chatBusy && !canSend)"
                :title="chatBusy ? '停止' : sendTitle"
                :aria-label="chatBusy ? '停止' : sendTitle"
                @click="onSendClick"
              >
                <UiIcon v-if="!chatBusy" name="arrow-up" :size="18" />
                <span v-else class="home-send-stop" aria-hidden="true" />
              </button>
            </template>
          </AiPromptInput>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import AiPromptInput from '@/components/ai-prompt-input/AiPromptInput.vue';
import {
  aiModelsToPrefOptions,
  createDefaultPrefs,
  HOME_CREATE_MODES,
  prefsToImageSize,
  type PromptGenPrefs,
  type PromptModeOption,
} from '@/components/ai-prompt-input/prefs';
import type { AiPromptTemplate } from '@/components/ai-prompt-input/types';
import {
  remoteImageAttachment,
  type PromptImageAttachment,
} from '@/components/ai-prompt-input/attachment';
import GenerateMarkdown from '@/components/generate/GenerateMarkdown.vue';
import GenerateMediaSlot from '@/components/generate/GenerateMediaSlot.vue';
import GenerateThinkReply from '@/components/generate/GenerateThinkReply.vue';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';
import LazyCoverImage from '@/components/LazyCoverImage.vue';
import {
  createQuoteId,
  GENERATE_QUOTE_MAX,
  mediaUrlsFromQuotes,
  quoteLabel,
  quotesFromPrefs,
  serializeQuotes,
  type GenerateQuote,
} from '@/components/generate/generate-quotes';
import UiIcon from '@/components/icons/UiIcon.vue';
import { UiScroll } from '@/components/ui';
import { useAiSettings } from '@/composables/useAiSettings';
import { useThemeStore } from '@/stores/theme';
import { copyText } from '@/utils/clipboard';
import { skillPromptText, type CatalogSkill } from '@/utils/skill-catalog';
import { namiAsset } from '@/constants/oss-public';
import { useRoute, useRouter } from 'vue-router';
import {
  cancelGenerateMessage,
  createGenerateSession,
  deleteGenerateSession,
  enhanceGeneratePrompt,
  generateChatStream,
  generateImage,
  generateVideo,
  listGenerateMessages,
  listGenerateSessions,
  updateGenerateSession,
  uploadGenerateRef,
  type GenerateMessage,
  type GenerateSession,
} from '@/api/generate';
import { notifyJobsChanged } from '@/api/jobs';

type GenMediaMode = 'image' | 'video';

const homeModes: PromptModeOption[] = HOME_CREATE_MODES;
const composerModes = computed<PromptModeOption[]>(() =>
  isImageWorkbench.value ? [{ label: '图片', value: 'image', icon: '🖼' }] : [],
);

const seedanceBadge = namiAsset('entry/seedanceBadge.png');

const videoWorkbenchModes = [
  { id: 'omni' as const, label: '全能参考', desc: '多参考图直出视频' },
  { id: 'frames' as const, label: '图生视频', desc: '参考图生成视频' },
  { id: 'text' as const, label: '文生视频', desc: '纯文本描述生成' },
];

const isImageWorkbench = computed(() => createMode.value === 'image');

const SESSION_STORAGE_KEY = 'lumina.generate.activeSession';
const MODE_STORAGE_KEY = 'lumina.generate.createMode';

const route = useRoute();
const router = useRouter();
const theme = useThemeStore();
const { modelsOf, defaultOf, ensureAiSettings } = useAiSettings();

const sessions = ref<GenerateSession[]>([]);
const sessionsLoading = ref(false);
const activeSessionId = ref('');
const messages = ref<GenerateMessage[]>([]);
const prompt = ref('');
const attachments = ref<PromptImageAttachment[]>([]);
/** 本页默认视频工作台；图/视频直接生成 */
const createMode = ref('video');
const genMode = ref<GenMediaMode>('video');
const genPrefs = ref<PromptGenPrefs>(
  createDefaultPrefs({
    auto: true,
    mediaKind: 'video',
    aspectRatio: '16:9',
    model: '',
    quality: '480p',
    count: 1,
    durationSec: 10,
    refMode: 'omni',
  }),
);
/** 按会话：仅当前会话在 Agent 流式时锁发送（可切到其它会话继续聊） */
const chatBusyBySession = ref<Record<string, true>>({});
const chatBusy = computed(() => !!chatBusyBySession.value[activeSessionId.value || '']);
/** 提交瞬间（上传参考等）：防连点，不把发送变成停止 */
const submitting = ref(false);
const enhancing = ref(false);
const renamingId = ref<string | null>(null);
const renameDraft = ref('');
const feedScrollRef = ref<{ $el?: HTMLElement } | null>(null);
const promptInputRef = ref<InstanceType<typeof AiPromptInput> | null>(null);
const quotes = ref<GenerateQuote[]>([]);
/** Agent 模式选用的 Skill（输入框只显示名称 tag） */
const activeSkill = ref<CatalogSkill | null>(null);
/** Hub Agent Skill 广场（不是提示词广场） */
const agentSkills = ref<CatalogSkill[]>([]);
const agentSkillFilters = ref<{ id: string; label: string }[]>([]);
/** sessionId → 当前可停止的 Agent SSE */
const streamAbortBySession = new Map<string, AbortController>();
/** 所有进行中的 Agent SSE（含已解锁底栏、仍在等图/视频的请求） */
const chatAborts = new Set<AbortController>();
/** 图/视频本地乐观 id → 用户已点停止（入队返回前） */
const cancelledOptimisticIds = new Set<string>();
/** 图/视频生成各自独立（入队前的本地 abort；入队后走 cancel API） */
const mediaAborts = new Map<string, AbortController>();
/** 本地思考计时（服务端未存时也能展示耗时） */
const thinkClock = ref<Record<string, { startedAt: number; ms?: number }>>({});
let pendingPollTimer: ReturnType<typeof setInterval> | null = null;

function thinkMsOf(id: string) {
  return Number(thinkClock.value[id]?.ms) || 0;
}

function understandingOf(m: GenerateMessage) {
  return String(m.prefs?.understanding || '').trim();
}

function thinkingOf(m: GenerateMessage) {
  return String(m.prefs?.thinking || '').trim();
}

/** 思考流：尚无正文时保持展开；开始输出正文后收起 */
function isThinkStreaming(m: GenerateMessage) {
  if (m.status !== 'streaming' && m.status !== 'pending') return false;
  return !String(m.content || '').trim();
}

function mediaUrlsOf(m: GenerateMessage): string[] {
  const fromPrefs = Array.isArray(m.prefs?.mediaUrls)
    ? (m.prefs!.mediaUrls as unknown[]).map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  if (fromPrefs.length) return fromPrefs;
  const one = String(m.mediaUrl || '').trim();
  return one ? [one] : [];
}

function metaCountOf(m: GenerateMessage) {
  const fromPrefs = Number(m.prefs?.count);
  if (Number.isFinite(fromPrefs) && fromPrefs >= 1) return Math.min(4, Math.floor(fromPrefs));
  const urls = mediaUrlsOf(m).length;
  return urls > 1 ? urls : 1;
}

function metaAspectOf(m: GenerateMessage) {
  const raw = String(m.prefs?.aspectRatio || m.aspectRatio || '').trim();
  if (!raw || raw === 'auto') return '';
  return raw;
}

function resultPromptOf(item: { user?: GenerateMessage; assistant: GenerateMessage }) {
  return String(item.user?.content || item.assistant.content || '生成请求').trim() || '生成请求';
}

/** 约 4 行可展示量；超长才显示展开 */
function promptNeedsExpand(text: string) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.length > 140) return true;
  return t.split(/\n/).length > 4;
}

const expandedPromptIds = ref<Record<string, boolean>>({});

function isPromptExpanded(id: string) {
  return !!expandedPromptIds.value[id];
}

function togglePromptExpand(id: string) {
  expandedPromptIds.value = {
    ...expandedPromptIds.value,
    [id]: !expandedPromptIds.value[id],
  };
}

async function copyResultPrompt(text: string) {
  const t = String(text || '').trim();
  if (!t) return;
  const ok = await copyText(t);
  if (ok) ElMessage.success('已复制提示词');
  else ElMessage.error('复制失败');
}

type FeedChatItem = {
  type: 'chat';
  key: string;
  message: GenerateMessage;
};

type FeedMediaItem = {
  type: 'media';
  key: string;
  user?: GenerateMessage;
  assistant: GenerateMessage;
};

type FeedItem = FeedChatItem | FeedMediaItem;

const feedItems = computed<FeedItem[]>(() => {
  const list = messages.value;
  const out: FeedItem[] = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i]!;
    if (m.role === 'user') {
      const next = list[i + 1];
      if (
        next &&
        next.role === 'assistant' &&
        (next.kind === 'image' || next.kind === 'video')
      ) {
        out.push({
          type: 'media',
          key: `media-${next.id}`,
          user: m,
          assistant: next,
        });
        i += 1;
        continue;
      }
      out.push({ type: 'chat', key: `chat-${m.id}`, message: m });
      continue;
    }
    if (m.kind === 'image' || m.kind === 'video') {
      out.push({ type: 'media', key: `media-${m.id}`, assistant: m });
      continue;
    }
    out.push({ type: 'chat', key: `chat-${m.id}`, message: m });
  }
  return out;
});

const showFramesHint = computed(() => {
  return !isImageWorkbench.value && genPrefs.value.refMode === 'frames';
});

const showAttachRail = computed(() => {
  if (isImageWorkbench.value) return true;
  return genPrefs.value.refMode !== 'text';
});

const attachMax = computed(() => (showFramesHint.value ? 2 : 6));

const attachLabels = computed(() => {
  if (isImageWorkbench.value) return undefined;
  if (genPrefs.value.refMode === 'frames') {
    return { empty: '参考图', add: '添加参考', slotNames: ['参考图 1', '参考图 2'] };
  }
  if (genPrefs.value.refMode === 'omni') {
    return { empty: '全能参考', add: '添加参考', slotNames: ['参考 1', '参考 2', '参考 3'] };
  }
  return { empty: '可选参考', add: '添加参考' };
});

const emptyTitle = computed(() =>
  isImageWorkbench.value ? '描述你想生成的画面' : '描述你想做成的画面',
);

const emptySub = computed(() => {
  if (isImageWorkbench.value) return '文生图 / 参考生图，结果会出现在对话里';
  if (genPrefs.value.refMode === 'frames') return '上传参考图后生成视频，适合对画面精度要求高的场景';
  if (genPrefs.value.refMode === 'text') return '用文字描述镜头、运动与氛围，直接生成视频';
  return '全能参考生视频，支持多张参考图，真人出镜更稳';
});

function setVideoRefMode(id: 'omni' | 'frames' | 'text') {
  genPrefs.value = { ...genPrefs.value, refMode: id, auto: false, mediaKind: 'video' };
  if (id === 'text') attachments.value = [];
}

function quoteMedia(m: GenerateMessage, preferUrl?: string) {
  const url = String(preferUrl || m.mediaUrl || '').trim();
  if (!url || m.status !== 'done') return;
  if (m.kind === 'image') {
    addReferenceImage(url, '参考图.png');
    return;
  }
  if (m.kind !== 'video') return;
  addMediaQuote({
    kind: 'video',
    url,
    sourceMessageId: m.id,
    label: '视频',
  });
}

function addReferenceImage(url: string, name = '参考图.png', _opts?: { silent?: boolean }) {
  const remote = String(url || '').trim();
  if (!remote) return false;
  if (
    attachments.value.some(
      (a) => String(a.remoteUrl || a.previewUrl || '').trim() === remote,
    )
  ) {
    return false;
  }
  const max = attachMax.value;
  if (attachments.value.length >= max) {
    ElMessage.warning(`最多可添加 ${max} 张参考图`);
    return false;
  }
  const item = remoteImageAttachment(remote, { name });
  if (!item) return false;
  attachments.value = [...attachments.value, item];
  void nextTick(() => promptInputRef.value?.focus?.());
  return true;
}

function onEditFrom(m: GenerateMessage, preferUrl?: string) {
  const url = String(preferUrl || m.mediaUrl || '').trim();
  if (!url || m.status !== 'done' || m.kind !== 'image') return;
  createMode.value = 'image';
  genMode.value = 'image';
  syncPrefsForMedia('image');
  addReferenceImage(url, '参考图.png');
  if (!String(prompt.value || '').trim()) {
    prompt.value = '保持主体与画风，改成：';
  }
  void nextTick(() => promptInputRef.value?.focus?.());
}

async function onEnhancePrompt() {
  const text = String(prompt.value || '').trim();
  if (!text || enhancing.value || chatBusy.value) return;
  enhancing.value = true;
  try {
    const kind =
      createMode.value === 'video'
        ? 'video'
        : createMode.value === 'image'
          ? 'image'
          : genPrefs.value.mediaKind === 'video'
            ? 'video'
            : 'image';
    const next = await enhanceGeneratePrompt(text, kind);
    if (!next) throw new Error('未返回优化结果');
    prompt.value = next;
    ElMessage.success('提示词已优化');
  } catch (e: any) {
    ElMessage.error(String(e?.message || '优化失败'));
  } finally {
    enhancing.value = false;
  }
}

function setChatBusy(sessionId: string, on: boolean) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  const next = { ...chatBusyBySession.value };
  if (on) next[sid] = true;
  else delete next[sid];
  chatBusyBySession.value = next;
}

function persistActiveSession(id: string) {
  const sid = String(id || '').trim();
  if (!sid) return;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, sid);
  } catch {
    /* ignore */
  }
  if (String(route.query.session || '') === sid) return;
  void router.replace({
    query: {
      ...route.query,
      session: sid,
    },
  });
}

function persistCreateMode(mode: string) {
  const m = String(mode || '').trim();
  if (!m) return;
  try {
    localStorage.setItem(MODE_STORAGE_KEY, m);
  } catch {
    /* ignore */
  }
}

function readStoredSessionId() {
  try {
    return String(localStorage.getItem(SESSION_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function readStoredCreateMode() {
  try {
    return String(localStorage.getItem(MODE_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function isLocalOptimisticId(id: string) {
  return /^(u|a)-\d+-/.test(String(id || ''));
}

function stopChatStream() {
  const sid = activeSessionId.value;
  const ac = sid ? streamAbortBySession.get(sid) : null;
  ac?.abort();
}

function markMessageCancelled(messageId: string) {
  const id = String(messageId || '').trim();
  if (!id) return;
  let hit = false;
  messages.value = messages.value.map((m) => {
    if (m.id !== id) return m;
    if (m.status !== 'pending' && m.status !== 'streaming') return m;
    hit = true;
    return {
      ...m,
      status: 'error',
      errorMessage: '已取消',
    };
  });
  if (hit) {
    const clock = { ...thinkClock.value };
    delete clock[id];
    thinkClock.value = clock;
  }
}

/** 停止某一条图/视频生成（结果卡「停止」→ 取消队列任务） */
function stopMediaGen(messageId: string) {
  const id = String(messageId || '').trim();
  if (!id) return;
  markMessageCancelled(id);
  if (isLocalOptimisticId(id)) {
    cancelledOptimisticIds.add(id);
    mediaAborts.get(id)?.abort();
    return;
  }
  void cancelGenerateMessage(id)
    .then((m) => {
      if (activeSessionId.value === m.sessionId) upsertMessages(m);
      void refreshSessions();
    })
    .catch(() => {
      /* 已乐观取消 */
    });
}

function quotesOf(m: GenerateMessage) {
  return quotesFromPrefs(m.prefs).filter((q) => q.kind === 'image' || q.kind === 'video');
}

function quoteChipLabel(q: GenerateQuote, index = 0) {
  return quoteLabel(q, index);
}

function addMediaQuote(q: {
  kind: 'image' | 'video';
  url: string;
  sourceMessageId?: string;
  label?: string;
}) {
  if (quotes.value.length >= GENERATE_QUOTE_MAX) {
    ElMessage.warning(`最多引用 ${GENERATE_QUOTE_MAX} 项`);
    return;
  }
  const url = String(q.url || '').trim();
  if (!url) return;
  if (quotes.value.some((x) => x.kind === q.kind && String(x.url || '').trim() === url)) {
    ElMessage.info('已在引用列表中');
    return;
  }
  quotes.value = [
    ...quotes.value,
    {
      id: createQuoteId(),
      kind: q.kind,
      url,
      sourceMessageId: q.sourceMessageId,
      label: q.label || (q.kind === 'video' ? '视频' : '图片'),
    },
  ];
  ElMessage.success('已加入引用');
}

function removeQuote(id: string) {
  quotes.value = quotes.value.filter((q) => q.id !== id);
}

function beginThink(id: string) {
  thinkClock.value = {
    ...thinkClock.value,
    [id]: { startedAt: Date.now() },
  };
}

function endThink(id: string) {
  const cur = thinkClock.value[id];
  if (!cur?.startedAt) return Number(cur?.ms) || 0;
  if (cur.ms != null) return cur.ms;
  const ms = Math.max(200, Date.now() - cur.startedAt);
  thinkClock.value = {
    ...thinkClock.value,
    [id]: { ...cur, ms },
  };
  return ms;
}

const imageModelOptions = computed(() => aiModelsToPrefOptions(modelsOf('image')));
const videoModelOptions = computed(() => aiModelsToPrefOptions(modelsOf('video')));
const chatModelOptions = computed(() => aiModelsToPrefOptions(modelsOf('chat')));
const chatModelId = computed(() => defaultOf('chat') || '');

function modelIdOf(m: GenerateMessage) {
  const fromPrefs = String(m.prefs?.model || '').trim();
  if (fromPrefs) return fromPrefs;
  if (m.kind === 'chat') return chatModelId.value;
  if (m.kind === 'video') return defaultOf('video') || '';
  if (m.kind === 'image') return defaultOf('image') || '';
  return '';
}

function modelLabelOf(m: GenerateMessage) {
  const id = modelIdOf(m);
  if (!id) return '';
  const list =
    m.kind === 'video'
      ? videoModelOptions.value
      : m.kind === 'image'
        ? imageModelOptions.value
        : chatModelOptions.value;
  const hit = list.find((x) => x.value === id);
  return hit?.label || id;
}

const placeholder = computed(() => {
  if (isImageWorkbench.value) return '描述你想生成的画面风格、主体与构图…';
  if (genPrefs.value.refMode === 'frames') return '描述参考图要演成的镜头运动与节奏…';
  if (genPrefs.value.refMode === 'text') return '描述画面、镜头运动、节奏与氛围…';
  return '描述你想生成的视频画面，可配合多张参考图…';
});

const placeholderHints = computed(() => {
  if (isImageWorkbench.value) {
    return [
      '描述你想生成的画面风格、主体与构图…',
      '半身定妆立绘，干净背景，精细衣纹与五官…',
      '赛博朋克夜市，潮湿地面反光，远处全息招牌…',
      '古风庭院雪景，朱红廊柱，一盏纸灯摇曳…',
    ];
  }
  if (genPrefs.value.refMode === 'frames') {
    return [
      '根据参考图生成视频，镜头缓缓推进…',
      '角色回头一笑，浅景深，暖色逆光扫过发丝…',
      '从近景切到全景，脚步溅起水花…',
    ];
  }
  if (genPrefs.value.refMode === 'text') {
    return [
      '雨夜霓虹街道，镜头缓缓推进，脚步溅起水花…',
      '航拍掠过云海，云层翻涌，阳光从缝隙洒下…',
      '古装对峙，衣袂翻飞，尘土扬起…',
    ];
  }
  return [
    '多参考图直出视频，镜头连贯、人物更稳…',
    '雨夜霓虹街道，镜头缓缓推进，脚步溅起水花…',
    '角色回头一笑，浅景深，暖色逆光扫过发丝…',
  ];
});

const canSend = computed(
  () =>
    !!prompt.value.trim() ||
    !!activeSkill.value ||
    attachments.value.length > 0 ||
    quotes.value.length > 0,
);

const agentSkillTemplates = computed<AiPromptTemplate[]>(() =>
  agentSkills.value.map((s) => ({
    id: s.id,
    label: s.name,
    description: s.desc,
    category: s.category,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  })),
);

const sendTitle = computed(() => {
  if (createMode.value === 'agent') return 'Agent 对话';
  return genMode.value === 'video' ? '生成视频' : '生成图片';
});

function clearActiveSkill(clearTag = false) {
  activeSkill.value = null;
  if (clearTag) promptInputRef.value?.applySkillTag?.('');
}

function onPickSkillTemplate(tpl: AiPromptTemplate) {
  const hit = agentSkills.value.find((s) => s.id === tpl.id || s.name === tpl.label) || null;
  activeSkill.value = hit;
}

/** 去掉输入里的技能名 tag，拼成给 Agent 的完整指令 */
function composeAgentMessage(userRaw: string, skill: CatalogSkill | null) {
  let user = String(userRaw || '').trim();
  const skillName = String(skill?.name || '').trim();
  if (skillName) {
    if (user === skillName) user = '';
    else if (user.startsWith(skillName)) {
      user = user
        .slice(skillName.length)
        .replace(/^[\s,，、:：\-—]+/, '')
        .trim();
    }
  }
  const body = skill ? skillPromptText(skill) : '';
  if (skill && body) {
    if (!user) {
      return `请按技能「${skill.name}」执行以下指引：\n${body}`;
    }
    return `请按技能「${skill.name}」执行。\n【技能指引】\n${body}\n\n【用户补充】\n${user}`;
  }
  return user;
}

function agentDisplayText(userRaw: string, skill: CatalogSkill | null) {
  let user = String(userRaw || '').trim();
  const skillName = String(skill?.name || '').trim();
  if (skillName) {
    if (user === skillName) user = '';
    else if (user.startsWith(skillName)) {
      user = user
        .slice(skillName.length)
        .replace(/^[\s,，、:：\-—]+/, '')
        .trim();
    }
  }
  if (skill && !user) return `使用技能：${skill.name}`;
  if (skill && user) return `使用技能：${skill.name}\n${user}`;
  return user;
}

function syncPrefsForMedia(mode: GenMediaMode) {
  const model = mode === 'video' ? defaultOf('video') : defaultOf('image');
  genPrefs.value = {
    ...genPrefs.value,
    mediaKind: mode,
    model,
    quality: mode === 'video' ? '480p' : '1.5k',
    aspectRatio: genPrefs.value.aspectRatio === 'auto' ? '16:9' : genPrefs.value.aspectRatio,
  };
}

function onModeUpdate(v: string) {
  const opt = homeModes.find((m) => m.value === v);
  if (opt?.disabled) {
    ElMessage.info('该创作类型即将开放');
    return;
  }
  createMode.value = v;
  persistCreateMode(v);
  if (v !== 'agent') clearActiveSkill(true);
  if (v === 'agent') {
    genMode.value = 'video';
    syncPrefsForMedia('video');
    return;
  }
  const mode: GenMediaMode = v === 'image' ? 'image' : 'video';
  genMode.value = mode;
  syncPrefsForMedia(mode);
}

/** 重新编辑：回填提示词与偏好，但保持当前创作类型（避免误切到图片模式后每句都出图） */
function onReedit(m: GenerateMessage) {
  const prefs = m.prefs || {};
  prompt.value = m.content || '';
  if (m.kind === 'image' || m.kind === 'video') {
    if (createMode.value === 'image' || createMode.value === 'video') {
      createMode.value = m.kind;
      genMode.value = m.kind;
      syncPrefsForMedia(m.kind);
    }
    genPrefs.value = {
      ...genPrefs.value,
      ...createDefaultPrefs({
        mediaKind: m.kind,
        aspectRatio: String(prefs.aspectRatio || m.aspectRatio || '16:9'),
        model: String(prefs.model || ''),
        quality: String(prefs.quality || (m.kind === 'video' ? '480p' : '1.5k')),
        count: Number(prefs.count) || 1,
        durationSec: Number(prefs.durationSec) || 10,
        refMode: (prefs.refMode as PromptGenPrefs['refMode']) || 'omni',
        auto: false,
      }),
    };
  }
  ElMessage.info('已回填到底栏，可修改后发送');
}

watch(
  () => genPrefs.value.mediaKind,
  (kind) => {
    const mode: GenMediaMode = kind === 'image' ? 'image' : 'video';
    if (genMode.value !== mode) {
      genMode.value = mode;
      if (createMode.value === 'image' || createMode.value === 'video') {
        createMode.value = mode;
      }
      syncPrefsForMedia(mode);
    }
  },
);

function onSendClick() {
  if (chatBusy.value) {
    stopChatStream();
    return;
  }
  if (submitting.value || !canSend.value) return;
  void onSubmit(prompt.value);
}

async function scrollFeedBottom() {
  await nextTick();
  const root = feedScrollRef.value?.$el as HTMLElement | undefined;
  const wrap = root?.querySelector?.('.el-scrollbar__wrap') as HTMLElement | null;
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

async function refreshSessions() {
  sessionsLoading.value = true;
  try {
    sessions.value = await listGenerateSessions();
  } finally {
    sessionsLoading.value = false;
  }
}

/** 避免异步 load 覆盖正在发送中的乐观消息 */
let messagesLoadSeq = 0;

function stopPendingPoll() {
  if (pendingPollTimer) {
    clearInterval(pendingPollTimer);
    pendingPollTimer = null;
  }
}

function mergeServerMessages(sessionId: string, rows: GenerateMessage[]) {
  const localKeep = messages.value.filter(
    (m) =>
      m.sessionId === sessionId &&
      isLocalOptimisticId(m.id) &&
      (m.status === 'pending' || m.status === 'streaming'),
  );
  const byId = new Map<string, GenerateMessage>();
  for (const r of rows) byId.set(r.id, r);
  for (const loc of localKeep) {
    if (!byId.has(loc.id)) byId.set(loc.id, loc);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function startPendingPoll(sessionId: string) {
  stopPendingPoll();
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  const needsPoll = messages.value.some(
    (m) =>
      m.sessionId === sid &&
      (m.status === 'pending' || m.status === 'streaming') &&
      !isLocalOptimisticId(m.id),
  );
  if (!needsPoll) return;

  pendingPollTimer = setInterval(async () => {
    if (activeSessionId.value !== sid) return;
    try {
      const rows = await listGenerateMessages(sid);
      if (activeSessionId.value !== sid) return;
      messages.value = mergeServerMessages(sid, rows);
      const still = rows.some((m) => m.status === 'pending' || m.status === 'streaming');
      if (!still) {
        stopPendingPoll();
        void refreshSessions();
      }
    } catch {
      /* ignore poll errors */
    }
  }, 2800);
}

/** 客户端 HTTP 超时：不弹 toast，改拉消息继续等结果 */
function isClientTimeoutError(e: unknown) {
  const err = e as { code?: string; message?: string; name?: string } | null;
  const msg = String(err?.message || '');
  return (
    err?.code === 'ECONNABORTED' ||
    /timeout/i.test(msg) ||
    /超时/.test(msg)
  );
}

async function recoverGenerateAfterTimeout(sessionId: string) {
  try {
    const rows = await listGenerateMessages(sessionId);
    if (activeSessionId.value === sessionId) {
      messages.value = mergeServerMessages(sessionId, rows);
      startPendingPoll(sessionId);
    }
    notifyJobsChanged();
    await refreshSessions();
  } catch {
    /* ignore */
  }
}

async function loadMessages(sessionId: string) {
  const seq = ++messagesLoadSeq;
  const rows = await listGenerateMessages(sessionId);
  if (seq !== messagesLoadSeq) return;
  if (activeSessionId.value !== sessionId) return;
  messages.value = mergeServerMessages(sessionId, rows);
  startPendingPoll(sessionId);
  await scrollFeedBottom();
}

async function ensureSession(): Promise<string> {
  if (activeSessionId.value) return activeSessionId.value;
  const s = await createGenerateSession();
  sessions.value = [s, ...sessions.value];
  messagesLoadSeq += 1;
  activeSessionId.value = s.id;
  messages.value = [];
  persistActiveSession(s.id);
  return s.id;
}

async function selectSession(id: string) {
  if (activeSessionId.value === id) return;
  activeSessionId.value = id;
  persistActiveSession(id);
  quotes.value = [];
  clearActiveSkill(true);
  await loadMessages(id);
}

async function onNewSession() {
  const s = await createGenerateSession();
  sessions.value = [s, ...sessions.value.filter((x) => x.id !== s.id)];
  messagesLoadSeq += 1;
  activeSessionId.value = s.id;
  messages.value = [];
  prompt.value = '';
  quotes.value = [];
  clearActiveSkill(true);
  persistActiveSession(s.id);
  stopPendingPoll();
}

async function togglePin(s: GenerateSession) {
  const updated = await updateGenerateSession(s.id, { pinned: !s.pinned });
  sessions.value = sessions.value.map((x) => (x.id === s.id ? updated : x));
  sessions.value.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function startRename(s: GenerateSession) {
  renamingId.value = s.id;
  renameDraft.value = s.title || '';
}

async function commitRename(s: GenerateSession) {
  if (renamingId.value !== s.id) return;
  const title = renameDraft.value.trim();
  renamingId.value = null;
  if (!title || title === s.title) return;
  const updated = await updateGenerateSession(s.id, { title });
  sessions.value = sessions.value.map((x) => (x.id === s.id ? updated : x));
}

async function confirmDelete(s: GenerateSession) {
  try {
    await ElMessageBox.confirm(
      `删除会话「${s.title || '新对话'}」将清除对话记录，并删除该会话在对象存储中的全部生成文件。此操作不可恢复。`,
      '删除会话',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    );
  } catch {
    return;
  }
  await deleteGenerateSession(s.id);
  sessions.value = sessions.value.filter((x) => x.id !== s.id);
  if (activeSessionId.value === s.id) {
    activeSessionId.value = sessions.value[0]?.id || '';
    if (activeSessionId.value) await loadMessages(activeSessionId.value);
    else messages.value = [];
  }
  ElMessage.success('已删除会话及云端资源');
}

function upsertMessages(...rows: GenerateMessage[]) {
  const map = new Map(messages.value.map((m) => [m.id, m]));
  for (const r of rows) map.set(r.id, r);
  messages.value = [...map.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

async function uploadRefs(sessionId: string): Promise<string[]> {
  const urls: string[] = [];
  for (const img of attachments.value) {
    const remote = String(img.remoteUrl || '').trim();
    if (remote) {
      urls.push(remote);
      continue;
    }
    if (!img.file) continue;
    const put = await uploadGenerateRef(sessionId, img.file);
    if (put?.url) urls.push(put.url);
  }
  return urls;
}

function localId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function runChat(
  text: string,
  refs: string[] = [],
  quoteList: GenerateQuote[] = [],
  opts?: { displayText?: string; skill?: CatalogSkill | null },
) {
  const sessionId = await ensureSession();
  const quotePayload = serializeQuotes(quoteList);
  const quoteMediaUrls = mediaUrlsFromQuotes(quoteList);
  const allImageRefs = [...refs, ...quoteMediaUrls.images].filter(Boolean);
  const displayText = String(opts?.displayText || text || '').trim() || text;
  const skill = opts?.skill || null;
  const localUser: GenerateMessage = {
    id: localId('u'),
    sessionId,
    role: 'user',
    kind: 'chat',
    content: displayText,
    mediaUrl: '',
    mediaOssKey: '',
    aspectRatio: '16:9',
    prefs: {
      referenceImages: allImageRefs,
      referenceVideoUrls: quoteMediaUrls.videos,
      quotes: quotePayload,
      skillId: skill?.id || '',
      skillName: skill?.name || '',
    },
    status: 'done',
    errorMessage: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const localAsst: GenerateMessage = {
    ...localUser,
    id: localId('a'),
    role: 'assistant',
    content: '',
    prefs: {},
    status: 'streaming',
  };
  beginThink(localAsst.id);
  messages.value = [...messages.value, localUser, localAsst];
  await scrollFeedBottom();

  const imagePrefs = createDefaultPrefs({
    mediaKind: 'image',
    aspectRatio: '1:1',
    model: defaultOf('image') || '',
    quality: '1.5k',
    count: Number(genPrefs.value.count) || 1,
    auto: false,
  });
  const chatModel = defaultOf('chat') || '';
  localAsst.prefs = { ...localAsst.prefs, model: chatModel };
  const agentPrefs = {
    ...genPrefs.value,
    imageModel: defaultOf('image') || '',
    videoModel: defaultOf('video') || '',
    imageSize: prefsToImageSize(imagePrefs),
    imageAspectRatio: '1:1',
    videoAspectRatio:
      genPrefs.value.aspectRatio === 'auto' ? '16:9' : genPrefs.value.aspectRatio || '16:9',
    referenceImages: allImageRefs,
    quotes: quotePayload,
  };

  const chatAc = new AbortController();
  streamAbortBySession.set(sessionId, chatAc);
  chatAborts.add(chatAc);
  // 整段 Agent 请求可停；路由到出图后结果卡「停止」用同一 controller
  mediaAborts.set(localAsst.id, chatAc);
  let routedMedia = false;
  let thinkEnded = false;
  try {
    await generateChatStream(
      {
        sessionId,
        message: text,
        model: chatModel || undefined,
        prefs: agentPrefs,
        referenceImages: allImageRefs,
        referenceVideoUrls: quoteMediaUrls.videos,
        quotes: quotePayload,
      },
      {
        signal: chatAc.signal,
        onEvent: (ev) => {
          if (ev.type === 'think' && ev.text) {
            const prev = String(localAsst.prefs?.thinking || '');
            localAsst.prefs = { ...localAsst.prefs, thinking: prev + ev.text };
            upsertMessages({ ...localAsst });
            void scrollFeedBottom();
            return;
          }
          if (ev.type === 'route') {
            const understanding = String(ev.understanding || '').trim();
            if (understanding) {
              localAsst.prefs = {
                ...localAsst.prefs,
                understanding,
              };
              upsertMessages({ ...localAsst });
            }
            if (ev.intent === 'image' || ev.intent === 'video') {
              routedMedia = true;
              // 已转入图/视频生成：解锁当前会话底栏，可继续发下一条
              setChatBusy(sessionId, false);
              if (streamAbortBySession.get(sessionId) === chatAc) {
                streamAbortBySession.delete(sessionId);
              }
              mediaAborts.set(localAsst.id, chatAc);
              const ms = endThink(localAsst.id);
              thinkEnded = true;
              localAsst.kind = ev.intent;
              localAsst.status = 'pending';
              localAsst.content = ev.prompt || text;
              localAsst.aspectRatio = ev.intent === 'video' ? '16:9' : '1:1';
              localAsst.prefs = {
                ...localAsst.prefs,
                understanding,
                agentRouted: true,
                thinkMs: ms,
                model:
                  ev.intent === 'video'
                    ? defaultOf('video') || ''
                    : defaultOf('image') || '',
              };
              upsertMessages({ ...localAsst });
              void scrollFeedBottom();
            }
            return;
          }
          if (ev.type === 'delta' && ev.text && !routedMedia) {
            if (!thinkEnded) {
              endThink(localAsst.id);
              thinkEnded = true;
            }
            localAsst.content += ev.text;
            upsertMessages({ ...localAsst });
            void scrollFeedBottom();
          }
          if (ev.type === 'done') {
            const ms = endThink(localAsst.id) || thinkMsOf(localAsst.id);
            if (ev.userMessage && ev.assistantMessage) {
              if (activeSessionId.value !== sessionId) return;
              messages.value = messages.value.filter(
                (m) => m.id !== localUser.id && m.id !== localAsst.id,
              );
              const serverThinking = String(ev.assistantMessage.prefs?.thinking || '').trim();
              const localThinking = String(localAsst.prefs?.thinking || '').trim();
              if (ev.assistantMessage.kind === 'chat') {
                const asst = {
                  ...ev.assistantMessage,
                  prefs: {
                    ...ev.assistantMessage.prefs,
                    thinking: serverThinking || localThinking,
                    thinkMs: ms,
                  },
                };
                thinkClock.value = {
                  ...thinkClock.value,
                  [asst.id]: { startedAt: Date.now() - ms, ms },
                };
                upsertMessages(ev.userMessage, asst);
              } else {
                upsertMessages(ev.userMessage, {
                  ...ev.assistantMessage,
                  prefs: {
                    ...ev.assistantMessage.prefs,
                    thinking: serverThinking || localThinking,
                    thinkMs: ms,
                  },
                });
              }
            } else {
              localAsst.content = ev.text || localAsst.content;
              localAsst.status = 'done';
              if (!routedMedia) localAsst.prefs = { ...localAsst.prefs, thinkMs: ms };
              if (activeSessionId.value === sessionId) upsertMessages({ ...localAsst });
            }
          }
        },
      },
    );
    await refreshSessions();
    // Agent 对话出图/出视频不刷顶栏任务队列；仅图片/视频模式直出会 notify
    if (routedMedia) {
      startPendingPoll(sessionId);
    }
  } catch (e: any) {
    const aborted =
      e?.name === 'AbortError' ||
      e?.name === 'CanceledError' ||
      e?.code === 'ERR_CANCELED';
    const current = messages.value.find((m) => m.id === localAsst.id);
    // 若已由 stopMediaGen 乐观标成已取消，勿再改成 done
    if (aborted && current?.status === 'error' && current.errorMessage === '已取消') {
      return;
    }
    if (isClientTimeoutError(e)) {
      if (routedMedia) await recoverGenerateAfterTimeout(sessionId);
      return;
    }
    const ms = routedMedia ? 0 : endThink(localAsst.id);
    if (aborted) {
      localAsst.status = 'error';
      localAsst.errorMessage = '已取消';
    } else {
      localAsst.status = 'error';
      localAsst.errorMessage = String(e?.message || '对话失败');
      if (!routedMedia) {
        localAsst.content = localAsst.content || localAsst.errorMessage;
      }
      ElMessage.error(localAsst.errorMessage);
    }
    if (!routedMedia) localAsst.prefs = { ...localAsst.prefs, thinkMs: ms };
    if (activeSessionId.value === sessionId) upsertMessages({ ...localAsst });
  } finally {
    chatAborts.delete(chatAc);
    if (mediaAborts.get(localAsst.id) === chatAc) mediaAborts.delete(localAsst.id);
    if (streamAbortBySession.get(sessionId) === chatAc) {
      streamAbortBySession.delete(sessionId);
    }
    setChatBusy(sessionId, false);
  }
}

async function runImage(
  text: string,
  prefs: PromptGenPrefs,
  refs: string[],
  quoteList: GenerateQuote[] = [],
) {
  const sessionId = await ensureSession();
  const aspect = prefs.auto || prefs.aspectRatio === 'auto' ? '1:1' : prefs.aspectRatio || '16:9';
  const quotePayload = serializeQuotes(quoteList);
  const localUser: GenerateMessage = {
    id: localId('u'),
    sessionId,
    role: 'user',
    kind: 'image',
    content: text,
    mediaUrl: '',
    mediaOssKey: '',
    aspectRatio: aspect,
    prefs: { ...prefs, referenceImages: refs, quotes: quotePayload },
    status: 'done',
    errorMessage: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const localAsst: GenerateMessage = {
    ...localUser,
    id: localId('a'),
    role: 'assistant',
    status: 'pending',
  };
  messages.value = [...messages.value, localUser, localAsst];
  await scrollFeedBottom();

  try {
    const result = await generateImage({
      sessionId,
      prompt: text,
      model: prefs.model || defaultOf('image') || undefined,
      size: prefsToImageSize(prefs),
      aspectRatio: aspect,
      count: prefs.count,
      referenceImages: refs,
      prefs: { ...prefs, referenceImages: refs, quotes: quotePayload },
    });
    if (cancelledOptimisticIds.has(localAsst.id)) {
      cancelledOptimisticIds.delete(localAsst.id);
      if (result.assistantMessage?.id) {
        await cancelGenerateMessage(result.assistantMessage.id).catch(() => null);
      }
    }
    if (activeSessionId.value === sessionId) {
      messages.value = messages.value.filter(
        (m) => m.id !== localUser.id && m.id !== localAsst.id,
      );
      if (result.userMessage) upsertMessages(result.userMessage, result.assistantMessage);
      else upsertMessages(result.assistantMessage);
      startPendingPoll(sessionId);
    }
    notifyJobsChanged();
    await refreshSessions();
  } catch (e: any) {
    if (isClientTimeoutError(e)) {
      await recoverGenerateAfterTimeout(sessionId);
      return;
    }
    localAsst.status = 'error';
    localAsst.errorMessage = String(e?.message || '生图失败');
    ElMessage.error(localAsst.errorMessage);
    if (activeSessionId.value === sessionId) {
      upsertMessages({ ...localAsst });
    }
  }
}

async function runVideo(
  text: string,
  prefs: PromptGenPrefs,
  refs: string[],
  quoteList: GenerateQuote[] = [],
) {
  const sessionId = await ensureSession();
  const aspect = prefs.auto || prefs.aspectRatio === 'auto' ? '16:9' : prefs.aspectRatio || '16:9';
  const quotePayload = serializeQuotes(quoteList);
  const quoteMedia = mediaUrlsFromQuotes(quoteList);
  const omni = prefs.refMode === 'omni' && refs.length > 0;
  const frames = prefs.refMode === 'frames';
  const localUser: GenerateMessage = {
    id: localId('u'),
    sessionId,
    role: 'user',
    kind: 'video',
    content: text,
    mediaUrl: '',
    mediaOssKey: '',
    aspectRatio: aspect,
    prefs: {
      ...prefs,
      referenceImageUrls: refs,
      referenceVideoUrls: quoteMedia.videos,
      quotes: quotePayload,
    },
    status: 'done',
    errorMessage: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const localAsst: GenerateMessage = {
    ...localUser,
    id: localId('a'),
    role: 'assistant',
    status: 'pending',
  };
  messages.value = [...messages.value, localUser, localAsst];
  await scrollFeedBottom();

  try {
    const result = await generateVideo({
      sessionId,
      prompt: text,
      model: prefs.model || defaultOf('video') || undefined,
      aspectRatio: aspect,
      durationSec: prefs.durationSec,
      resolution: prefs.quality,
      omniRef: omni,
      imageUrl: !omni && frames ? refs[0] : undefined,
      endImageUrl: !omni && frames ? refs[1] : undefined,
      referenceImageUrls: omni ? refs : !frames ? refs : undefined,
      referenceVideoUrls: quoteMedia.videos.length ? quoteMedia.videos : undefined,
      prefs: {
        ...prefs,
        referenceImageUrls: refs,
        referenceVideoUrls: quoteMedia.videos,
        quotes: quotePayload,
      },
    });
    if (cancelledOptimisticIds.has(localAsst.id)) {
      cancelledOptimisticIds.delete(localAsst.id);
      if (result.assistantMessage?.id) {
        await cancelGenerateMessage(result.assistantMessage.id).catch(() => null);
      }
    }
    if (activeSessionId.value === sessionId) {
      messages.value = messages.value.filter(
        (m) => m.id !== localUser.id && m.id !== localAsst.id,
      );
      if (result.userMessage) upsertMessages(result.userMessage, result.assistantMessage);
      else upsertMessages(result.assistantMessage);
      startPendingPoll(sessionId);
    }
    notifyJobsChanged();
    await refreshSessions();
  } catch (e: any) {
    if (isClientTimeoutError(e)) {
      await recoverGenerateAfterTimeout(sessionId);
      return;
    }
    localAsst.status = 'error';
    localAsst.errorMessage = String(e?.message || '生视频失败');
    ElMessage.error(localAsst.errorMessage);
    if (activeSessionId.value === sessionId) {
      upsertMessages({ ...localAsst });
    }
  } finally {
    mediaAborts.delete(localAsst.id);
    cancelledOptimisticIds.delete(localAsst.id);
  }
}

async function onSubmit(textRaw?: string) {
  const text = String(textRaw ?? prompt.value ?? '').trim();
  const skillSnapshot = createMode.value === 'agent' ? activeSkill.value : null;
  if (
    chatBusy.value ||
    submitting.value ||
    (!text && !skillSnapshot && !attachments.value.length && !quotes.value.length)
  ) {
    return;
  }
  const mode = createMode.value;
  if (mode !== 'agent' && mode !== 'image' && mode !== 'video') {
    ElMessage.info('该创作类型即将开放');
    return;
  }
  submitting.value = true;
  const prefsSnapshot = { ...genPrefs.value };
  const quoteSnapshot = [...quotes.value];
  try {
    const sessionId = await ensureSession();
    let refs: string[] = [];
    if (attachments.value.length) {
      refs = await uploadRefs(sessionId);
    }
    const quoteMedia = mediaUrlsFromQuotes(quoteSnapshot);
    let promptText =
      text ||
      (quoteSnapshot.length
        ? mode === 'agent'
          ? '请基于引用内容继续'
          : mode === 'video'
            ? '根据引用内容生成视频'
            : '根据引用内容生成图片'
        : mode === 'video'
          ? '根据参考内容生成视频'
          : mode === 'image'
            ? '根据参考内容生成图片'
            : '');
    if (mode === 'agent') {
      const apiMessage = composeAgentMessage(text, skillSnapshot);
      const display = agentDisplayText(text, skillSnapshot);
      if (!apiMessage && !refs.length && !quoteSnapshot.length) {
        ElMessage.warning('请先输入内容、选择技能或添加参考');
        return;
      }
      prompt.value = '';
      attachments.value = [];
      quotes.value = [];
      clearActiveSkill(true);
      submitting.value = false;
      setChatBusy(sessionId, true);
      try {
        await runChat(apiMessage || promptText || '请继续', refs, quoteSnapshot, {
          displayText: display || apiMessage,
          skill: skillSnapshot,
        });
      } finally {
        setChatBusy(sessionId, false);
      }
      return;
    }
    if (!promptText) {
      ElMessage.warning('请先输入内容或添加引用');
      return;
    }
    prompt.value = '';
    attachments.value = [];
    quotes.value = [];
    // 图/视频后台跑：解锁底栏，可继续发下一条
    submitting.value = false;
    const mediaRefs = [...refs, ...quoteMedia.images];
    if (mode === 'image') {
      void runImage(promptText, prefsSnapshot, mediaRefs, quoteSnapshot);
    } else {
      void runVideo(promptText, prefsSnapshot, mediaRefs, quoteSnapshot);
    }
  } catch (e: any) {
    if (isClientTimeoutError(e)) return;
    ElMessage.error(String(e?.message || '发送失败'));
  } finally {
    submitting.value = false;
    await scrollFeedBottom();
  }
}

async function onRegenerate(m: GenerateMessage) {
  if (chatBusy.value || submitting.value) return;
  const text = String(m.content || '').trim();
  if (!text) return;
  const prefs = createDefaultPrefs({
    mediaKind: m.kind === 'video' ? 'video' : 'image',
    aspectRatio: String(m.prefs?.aspectRatio || m.aspectRatio || '16:9'),
    model: String(m.prefs?.model || ''),
    quality: String(m.prefs?.quality || (m.kind === 'video' ? '480p' : '1.5k')),
    count: Number(m.prefs?.count) || 1,
    durationSec: Number(m.prefs?.durationSec) || 10,
    refMode: (m.prefs?.refMode as PromptGenPrefs['refMode']) || 'omni',
    auto: false,
  });
  const refs = (
    (m.prefs?.referenceImages as string[]) ||
    (m.prefs?.referenceImageUrls as string[]) ||
    []
  ).filter(Boolean);
  if (m.kind === 'video') void runVideo(text, prefs, refs);
  else void runImage(text, prefs, refs);
}

onMounted(async () => {
  await ensureAiSettings();
  const modeFromQuery = String(route.query.mode || '').trim();
  const preferredMode = modeFromQuery === 'image' ? 'image' : 'video';
  createMode.value = preferredMode;
  persistCreateMode(preferredMode);
  genMode.value = preferredMode;
  syncPrefsForMedia(preferredMode);
  try {
    agentSkills.value = [];
    agentSkillFilters.value = [];
  } catch {
    agentSkills.value = [];
    agentSkillFilters.value = [];
  }
  await refreshSessions();
  const fromQuery = String(route.query.session || '').trim();
  const fromStore = readStoredSessionId();
  const initial =
    (fromQuery && sessions.value.find((s) => s.id === fromQuery)?.id) ||
    (fromStore && sessions.value.find((s) => s.id === fromStore)?.id) ||
    sessions.value[0]?.id ||
    '';
  if (initial) {
    activeSessionId.value = initial;
    persistActiveSession(initial);
    await loadMessages(initial);
  }
});

watch(prompt, (v) => {
  const skill = activeSkill.value;
  if (!skill) return;
  const name = String(skill.name || '').trim();
  if (!name) return;
  if (!String(v || '').includes(name)) {
    activeSkill.value = null;
  }
});

watch(
  () => String(route.query.mode || '').trim(),
  (mode) => {
    if (mode === 'image' || mode === 'video') {
      if (createMode.value !== mode) onModeUpdate(mode);
    }
  },
);

onBeforeUnmount(() => {
  stopPendingPoll();
  for (const ac of streamAbortBySession.values()) ac.abort();
  streamAbortBySession.clear();
  for (const ac of chatAborts) ac.abort();
  chatAborts.clear();
  for (const ac of mediaAborts.values()) ac.abort();
  mediaAborts.clear();
});
</script>

<style scoped>
.gen-page {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: #111;
  color: #f5f5f5;
  font-family: var(--font);
}

.gen-sidebar {
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: #0c0c0c;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.sb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 14px 10px;
}

.sb-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: #f5f5f5;
}

.sb-new {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: #2563eb;
  color: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.sb-new:hover {
  background: #3b82f6;
  border-color: transparent;
}

.sb-list {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.sb-scroll {
  height: 100% !important;
}

.sb-list :deep(.el-scrollbar) {
  height: 100%;
}

.sb-list :deep(.el-scrollbar__wrap) {
  max-height: 100% !important;
  overflow-x: hidden !important;
}

.sb-scroll-inner {
  padding: 4px 8px 16px;
}

.sb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 2px;
  color: var(--studio-text-strong);
}

.sb-item:hover {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}

.sb-item.on {
  background: rgba(37, 99, 235, 0.16);
  color: #fff;
}

.sb-thumb {
  flex: none;
  width: 56px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: grid;
  place-items: center;
}

.sb-thumb :deep(.lazy-cover),
.sb-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sb-thumb.empty {
  color: var(--studio-line-bright);
}

.sb-thumb-ico {
  font-size: 12px;
  line-height: 1;
}

.sb-item-main {
  flex: 1;
  min-width: 0;
}

.sb-title {
  display: block;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-item.pinned .sb-title {
  font-weight: 600;
}

.sb-rename {
  width: 100%;
  border: 1px solid var(--studio-line-strong);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 13px;
  background: var(--studio-panel);
  color: var(--studio-ink);
  outline: none;
}

.sb-rename:focus {
  border-color: var(--studio-text-faint);
}

.sb-item-ops {
  display: none;
  gap: 2px;
}

.sb-item:hover .sb-item-ops,
.sb-item.on .sb-item-ops {
  display: inline-flex;
}

.ico {
  border: none;
  background: transparent;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--studio-text-soft);
  display: grid;
  place-items: center;
  font-size: 13px;
}

.ico:hover {
  background: var(--studio-glass-3);
  color: var(--studio-ink);
}

.ico.danger:hover {
  color: #fda29b;
  background: rgba(180, 35, 24, 0.25);
}

.sb-empty {
  margin: 24px 8px;
  font-size: 13px;
  color: var(--studio-line-bright);
  text-align: center;
}

.gen-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #111;
}

.gen-feed {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.feed-scroll {
  height: 100% !important;
}

.gen-feed :deep(.el-scrollbar) {
  height: 100%;
}

.gen-feed :deep(.el-scrollbar__wrap) {
  max-height: 100% !important;
  overflow-x: hidden !important;
}

.gen-feed :deep(.el-scrollbar__view) {
  min-height: 100%;
  box-sizing: border-box;
}

.feed-inner {
  width: 100%;
  margin: 0;
  padding: 28px clamp(20px, 3.5vw, 48px) 20px;
  box-sizing: border-box;
  min-height: 100%;
}

.gen-empty {
  max-width: 560px;
  margin: 16vh auto 0;
  text-align: center;
}

.gen-empty h1 {
  margin: 0 0 10px;
  font-size: 28px;
  font-weight: 650;
  letter-spacing: -0.03em;
  color: #f5f5f5;
}

.gen-empty p {
  margin: 0;
  color: #a3a3a3;
  font-size: 14px;
  line-height: 1.6;
}

.msg {
  display: flex;
  width: 100%;
  margin-bottom: 20px;
}

.msg.user {
  justify-content: flex-end;
}

.msg.assistant {
  justify-content: flex-start;
}

.user-bubble {
  max-width: min(56%, 640px);
  background: var(--studio-panel-2);
  color: var(--studio-ink);
  border: 1px solid var(--studio-glass-2);
  border-radius: 16px 16px 4px 16px;
  padding: 10px 14px;
}

.msg-quotes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.msg-quote-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  padding: 3px 8px 3px 3px;
  border-radius: 10px;
  background: var(--studio-glass-2);
  border: 1px solid var(--studio-glass-3);
  font-size: 12px;
  color: var(--studio-text-strong);
}

.msg-quote-thumb {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  object-fit: cover;
  background: var(--studio-inset);
  flex-shrink: 0;
}

.msg-quote-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.user-text {
  margin: 0;
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.55;
}

.quote-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: min(920px, 100%);
  margin: 0 auto 10px;
}

.quote-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 4px 6px 4px 4px;
  border-radius: 12px;
  background: var(--studio-glass);
  border: 1px solid var(--studio-glass-3);
  color: var(--studio-text-strong);
  font-size: 12.5px;
}

.quote-thumb {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--studio-inset);
  flex-shrink: 0;
}

.quote-chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.quote-chip-x {
  border: none;
  background: transparent;
  color: var(--studio-text-faint);
  width: 22px;
  height: 22px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1;
  font-size: 15px;
  display: grid;
  place-items: center;
}

.quote-chip-x:hover {
  background: var(--studio-glass-3);
  color: var(--studio-ink);
}

.asst-bubble {
  width: 92%;
  max-width: 92%;
  min-width: 0;
  padding: 2px 0;
  color: var(--studio-text-strong);
}

.asst-bubble > * {
  width: 100%;
  max-width: none;
}

.model-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
  padding: 2px 8px 2px 6px;
  width: fit-content;
  max-width: 100%;
  border-radius: 999px;
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-glass);
  color: var(--studio-text-faint);
  font-size: 11.5px;
  line-height: 1.4;
  letter-spacing: 0.01em;
}

.model-tag-ico {
  flex: none;
  font-size: 10px;
  color: rgba(142, 200, 216, 0.75);
}

.model-tag span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asst-answer {
  margin-top: 10px;
}

.msg.media-card-msg {
  justify-content: flex-start;
  margin-bottom: 28px;
}

.result-card {
  width: min(640px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.result-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--studio-glass);
  border: 1px solid var(--studio-glass-2);
}

.result-quotes {
  margin-bottom: 0;
}

.result-prompt-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  width: 100%;
}

.result-prompt-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.result-prompt-clip {
  flex: 1;
  min-width: 0;
  max-width: 100%;
}

.result-prompt {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--studio-ink);
  word-break: break-word;
  white-space: pre-wrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
}

.result-prompt.expanded {
  display: block;
  -webkit-line-clamp: unset;
  line-clamp: unset;
  overflow: visible;
  text-overflow: unset;
}

.result-prompt-toggle {
  align-self: flex-start;
  margin: 0;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: rgba(159, 224, 239, 0.9);
  font-size: 12.5px;
  line-height: 1.4;
  cursor: pointer;
}

.result-prompt-toggle:hover {
  color: #dff7fc;
  text-decoration: underline;
}

.result-prompt-copy {
  flex: none;
  width: 28px;
  height: 28px;
  margin-top: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.result-prompt-copy:hover {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}

.result-meta-text {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 2px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--studio-text-faint);
}

.result-meta-dot {
  margin: 0 4px;
  color: var(--studio-line-bright);
}

.result-meta-status {
  color: var(--studio-text-faint);
}

.result-meta-status.live {
  color: rgba(142, 200, 216, 0.85);
}

.result-meta-status.err {
  color: #f5a8a8;
}

.result-stop {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-glass-2);
  color: var(--studio-text-strong);
  font-size: 12px;
  cursor: pointer;
}

.result-stop:hover {
  background: rgba(255, 80, 80, 0.16);
  border-color: rgba(255, 120, 120, 0.35);
  color: #ffd0d0;
}

.result-stop-sq {
  width: 8px;
  height: 8px;
  border-radius: 1.5px;
  background: currentColor;
}

.result-card :deep(.media-card) {
  width: 100%;
  max-width: none;
}

.result-card :deep(.media-frame) {
  width: min(360px, 100%);
}

.result-card :deep(.media-card--video .media-frame) {
  width: min(420px, 100%);
}

.intent-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 52rem;
}

.intent-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--studio-text-faint);
}

.intent-bulb {
  color: rgba(251, 191, 36, 0.8);
  font-size: 12px;
  line-height: 1;
}

.intent-text {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.7;
  color: var(--studio-text-strong);
  letter-spacing: 0.01em;
}

.gen-composer {
  padding: 8px 24px 28px;
  background: linear-gradient(180deg, transparent, #111 36%);
}

.video-mode-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 920px;
  width: 100%;
  margin: 0 auto 12px;
  padding: 4px;
  border-radius: 999px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-sizing: border-box;
}

.video-mode-tab {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #a3a3a3;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.video-mode-tab:hover {
  color: #e5e5e5;
}

.video-mode-tab.on {
  background: #2563eb;
  color: #fff;
}

.tab-badge {
  height: 16px;
  width: auto;
  object-fit: contain;
  display: block;
}

.frames-hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 920px;
  margin: 0 auto 8px;
  padding: 0 4px;
  color: var(--studio-text-soft);
  font-size: 12px;
}

.frames-hint .fh-pill {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(142, 200, 216, 0.16);
  color: rgba(190, 230, 240, 0.95);
  font-weight: 600;
}

.frames-hint .fh-arrow,
.frames-hint .fh-dot {
  opacity: 0.7;
}

.frames-hint em {
  margin-left: 4px;
  font-style: normal;
  opacity: 0.55;
}

.enhance-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(251, 191, 36, 0.28);
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.12),
    rgba(96, 165, 250, 0.08)
  );
  color: rgba(253, 230, 138, 0.95);
  font-size: 12px;
  cursor: pointer;
}

.enhance-btn:hover:not(:disabled) {
  border-color: rgba(251, 191, 36, 0.45);
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.18),
    rgba(96, 165, 250, 0.12)
  );
  color: #fde68a;
}

.enhance-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.home-send.stop {
  background: #e5e5e5 !important;
  color: #111 !important;
}

.home-send-stop {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: #111;
}

.gen-composer .home-prompt {
  max-width: 920px;
  margin: 0 auto;
}

.gen-page :deep(.home-ai-prompt) {
  background: #1a1a1a !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 20px !important;
}

.gen-page :deep(.home-ai-prompt:focus-within) {
  border-color: rgba(59, 130, 246, 0.55) !important;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16) !important;
}

.gen-page :deep(.chip.on),
.gen-page :deep(.chip-mode),
.gen-page :deep(.chip-mode.video) {
  color: #93c5fd;
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(37, 99, 235, 0.14);
}

.gen-page :deep(.spark) {
  color: #60a5fa;
}

.gen-page :deep(.attach-rail) {
  --attach-w: 64px;
  --attach-h: 80px;
}

.gen-page :deep(.attach-empty) {
  transform: none;
  border-style: dashed;
  border-color: rgba(59, 130, 246, 0.35);
  background: rgba(37, 99, 235, 0.08);
  color: #93c5fd;
}

.gen-page :deep(.attach-empty:hover:not(:disabled)) {
  transform: none;
  border-color: #3b82f6;
  color: #dbeafe;
}

.gen-page .home-send {
  width: 36px;
  height: 36px;
  background: #2563eb;
  color: #fff;
}

.gen-page .home-send:hover:not(:disabled) {
  background: #3b82f6;
  filter: none;
}

.gen-page .home-send:disabled {
  background: #262626;
  color: #737373;
  opacity: 1;
}

@media (max-width: 860px) {
  .gen-page {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 100%;
  }

  .gen-sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    max-height: 220px;
  }

  .gen-main {
    min-height: 60vh;
  }

  .video-mode-tabs {
    border-radius: 14px;
  }
}
</style>

<style>
/* postcss 可能丢掉 -webkit-box-orient，放非 scoped 保证 4 行省略生效 */
.gen-page .result-prompt:not(.expanded) {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gen-page .result-prompt.expanded {
  display: block;
  -webkit-line-clamp: unset;
  line-clamp: unset;
  overflow: visible;
}
</style>
