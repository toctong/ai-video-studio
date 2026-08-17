<template>
  <div class="home-bench">
    <HomeHalftoneField :height="720" :fg-rgb="theme.isDark ? '197, 229, 255' : '79, 70, 229'" />
    <div class="glow glow-1" aria-hidden="true" />
    <div class="glow glow-2" aria-hidden="true" />

    <div class="home-center">
      <h1 class="hero-title">灵感从这里开始！</h1>

      <div class="home-prompt">
        <AiPromptInput
          ref="promptInputRef"
          v-model="prompt"
          v-model:attachments="attachments"
          v-model:prefs="genPrefs"
          :mode="createMode"
          :modes="homeModes"
          :models="imageModelOptions"
          :video-models="videoModelOptions"
          :chat-models="chatModelOptions"
          :chat-model="chatModelId"
          :placeholder="placeholder"
          :placeholder-hints="placeholderHints"
          :loading="creating"
          :disabled="creating"
          :min-height="148"
          :show-templates="false"
          :templates="[]"
          :auto-apply-template="false"
          :show-prefs="true"
          :prefs-kinds="['image', 'video']"
          :show-mention="true"
          :show-send="false"
          enable-attachments
          tone="home"
          class="home-ai-prompt"
          @update:mode="onModeUpdate"
          @submit="onPromptSubmit"
        >
          <template #actions>
            <button
              type="button"
              class="home-send"
              :disabled="creating || !canStart"
              :title="creating ? '创建中…' : sendTitle"
              :aria-label="creating ? '创建中…' : sendTitle"
              @click="onHomeSend"
            >
              <UiIcon v-if="!creating" name="arrow-up" :size="18" />
              <span v-else class="home-send-spin" aria-hidden="true" />
            </button>
          </template>
        </AiPromptInput>
      </div>

      <div class="quick-skills">
        <button
          v-for="s in quickSkills"
          :key="s.id"
          type="button"
          class="quick-pill"
          @click="onStarter(s)"
        >
          <UiIcon name="zap" :size="14" />
          <span>{{ s.label }}</span>
        </button>
      </div>
    </div>

    <section class="recent-sec">
      <header class="sec-head">
        <h2>最近项目</h2>
        <button type="button" class="view-all" @click="$router.push('/productions')">查看全部 ›</button>
      </header>
      <div class="project-grid" v-loading="loading">
        <button type="button" class="project-card create" :disabled="creating" @click="createBlank">
          <UiIcon name="plus" :size="32" />
          <span>新建项目</span>
        </button>
        <button
          v-for="p in recent"
          :key="p.id"
          type="button"
          class="project-card"
          @click="openProduction(p)"
        >
          <div class="thumb" :class="{ empty: !p.thumbUrl }">
            <MediaThumb v-if="p.thumbUrl" :url="p.thumbUrl" />
          </div>
          <div class="meta">
            <strong>{{ p.name || '未命名项目' }}</strong>
            <em>编辑于 {{ relativeTime(p) }}</em>
          </div>
        </button>
      </div>
    </section>

    <section class="featured-sec">
      <header class="sec-head">
        <h2>官方精选提示词</h2>
        <button type="button" class="view-all" @click="$router.push('/skills')">查看全部 ›</button>
      </header>
      <div class="featured-grid">
        <article
          v-for="(s, i) in featuredSkills"
          :key="s.id"
          class="featured-card"
          :style="featuredTone(i)"
          @click="applyCatalogSkill(s)"
        >
          <div class="featured-body">
            <span class="featured-ico" aria-hidden="true">
              <UiIcon name="zap" :size="14" />
            </span>
            <strong>{{ s.name }}</strong>
            <span class="featured-author">
              <UiIcon name="user" :size="12" />
              {{ s.author }}
            </span>
            <p>{{ s.desc }}</p>
            <span class="featured-uses">
              使用次数
              <UiIcon name="zap" :size="12" />
              {{ formatUses(s.likes) }}
            </span>
          </div>
          <div class="featured-cover">
            <LazyCoverImage :src="skillCover(s)" :alt="s.name" />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { fetchProductions, type ProductionRow } from '@/api/productions';
import { fetchSkillPlaza, toCatalogSkill } from '@/api/skills';
import { fetchAgentsPlaza } from '@/api/plaza';
import { updateWorkflow } from '@/api/workflows';
import {
  createBlankProduction,
  ensureCompiledProduction,
} from '@/utils/compile-production';
import { homePromptWorkflowGraph, homeAgentSkillGraph } from '@/utils/workflow-defaults';
import {
  buildHomeAgentWorkflowGraph,
  planHomeAgentWorkflow,
} from '@/utils/home-agent-plan';
import {
  resolvePlazaGenMode,
  takeHomePlazaDraft,
  type HomeGenMode,
} from '@/utils/home-plaza-draft';
import {
  findSkill,
  setRuntimeSkillCatalog,
  skillPromptText,
  type CatalogSkill,
  type SkillCategory,
} from '@/utils/skill-catalog';
import { libraryCoverByCategory } from '@/libraries/cover-images';
import UiIcon from '@/components/icons/UiIcon.vue';
import LazyCoverImage from '@/components/LazyCoverImage.vue';
import MediaThumb from '@/components/MediaThumb.vue';
import HomeHalftoneField from '@/components/studio/HomeHalftoneField.vue';
import AiPromptInput from '@/components/ai-prompt-input/AiPromptInput.vue';
import type { PromptImageAttachment } from '@/components/ai-prompt-input/attachment';
import {
  aiModelsToPrefOptions,
  createDefaultPrefs,
  HOME_CREATE_MODES,
  type PromptGenPrefs,
  type PromptModeOption,
} from '@/components/ai-prompt-input/prefs';
import { useAiSettings } from '@/composables/useAiSettings';
import { useThemeStore } from '@/stores/theme';
import { uploadProjectAsset } from '@/utils/upload-asset';
import { resolveAssetProjectId } from '@/constants/studio';

type ActiveMeta = {
  id: string;
  name: string;
  desc?: string;
  /** 提示词正文：仅点击生成时与用户输入拼接，不回填进输入框 */
  prompt?: string;
  /** agent=Skill → 画布 ai.chat；prompt=提示词 → 图/视频管线 */
  kind?: 'prompt' | 'agent';
  slash?: string;
};

const FEATURED_TONES = [
  'linear-gradient(135deg, #c084fc 0%, #f472b6 55%, #fb7185 100%)',
  'linear-gradient(135deg, #38bdf8 0%, #60a5fa 50%, #93c5fd 100%)',
  'linear-gradient(135deg, #fbbf24 0%, #f59e0b 45%, #ea580c 100%)',
  'linear-gradient(135deg, #6366f1 0%, #4f46e5 55%, #3730a3 100%)',
  'linear-gradient(135deg, #f472b6 0%, #ec4899 50%, #e11d48 100%)',
  'linear-gradient(135deg, #22d3ee 0%, #14b8a6 55%, #0d9488 100%)',
];

const router = useRouter();
const route = useRoute();
const theme = useThemeStore();

const prompt = ref('');
/** UI 创作类型；默认 Agent：先理解再生成规范工作流 */
const createMode = ref('agent');
/** image/video 偏好与开单映射（Agent 管线默认按视频偏好展示） */
const genMode = ref<HomeGenMode>('video');
const { modelsOf, defaultOf, ensureAiSettings } = useAiSettings();
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
const creating = ref(false);
/** 创建阶段文案：理解中 / 开单中 */
const creatingPhase = ref('');
const loading = ref(false);
const rows = ref<ProductionRow[]>([]);
const attachments = ref<PromptImageAttachment[]>([]);
const activeMeta = ref<ActiveMeta | null>(null);
const promptInputRef = ref<InstanceType<typeof AiPromptInput> | null>(null);

const homeModes: PromptModeOption[] = HOME_CREATE_MODES;

const imageModelOptions = computed(() => aiModelsToPrefOptions(modelsOf('image')));
const videoModelOptions = computed(() => aiModelsToPrefOptions(modelsOf('video')));
const chatModelOptions = computed(() => aiModelsToPrefOptions(modelsOf('chat')));
const chatModelId = computed(() => defaultOf('chat') || '');

function syncPrefsForMedia(mode: HomeGenMode) {
  const model = mode === 'video' ? defaultOf('video') : defaultOf('image');
  genPrefs.value = {
    ...genPrefs.value,
    mediaKind: mode,
    model,
    quality: mode === 'video' ? '480p' : '1.5k',
    aspectRatio: genPrefs.value.aspectRatio === 'auto' ? '16:9' : genPrefs.value.aspectRatio,
  };
}

const quickSkills = [
  { id: 'script-video', label: '剧本转视频提示词', skillId: 'image-prompt-pro' },
  { id: 'multi-view', label: '人物多视角生成', skillId: 'character-sheet' },
  { id: 'script-board', label: '剧本转分镜故事板', skillId: 'storyboard-director' },
  { id: 'board-reverse', label: '分镜提示词逆向', skillId: 'shot-table' },
] as const;

const featuredList = ref<CatalogSkill[]>([]);

const featuredSkills = computed(() => {
  const official = featuredList.value.filter((s) => s.official);
  const list = official.length ? official : featuredList.value;
  return [...list].sort((a, b) => b.likes - a.likes).slice(0, 6);
});

const recent = computed(() =>
  [...rows.value]
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
    )
    .slice(0, 7),
);

function formatUses(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')} k`;
  return String(n);
}

function featuredTone(i: number) {
  return { background: FEATURED_TONES[i % FEATURED_TONES.length] };
}

function skillCover(s: CatalogSkill) {
  if (s.coverUrl) return s.coverUrl;
  const map: Record<SkillCategory, string> = {
    story: '都市',
    video: '运动',
    image: '日系',
    design: '赛博朋克',
    commerce: '写实',
  };
  const kind =
    s.category === 'video'
      ? 'shot'
      : s.category === 'image'
        ? 'character'
        : s.category === 'story'
          ? 'script'
          : 'style';
  return libraryCoverByCategory(map[s.category] || '都市', kind as 'style' | 'shot' | 'character' | 'script');
}

const placeholder = computed(() => {
  if (activeMeta.value) {
    return createMode.value === 'agent'
      ? `补充「${activeMeta.value.name}」的目标与约束，Agent 会理解后生成工作流…`
      : genMode.value === 'video'
        ? `补充「${activeMeta.value.name}」的镜头与运动细节…`
        : `补充「${activeMeta.value.name}」的画面细节…`;
  }
  if (createMode.value === 'agent') {
    return '描述你想做的漫剧/短视频/立绘… Agent 会先理解意图，再生成规范工作流';
  }
  return genMode.value === 'video'
    ? '描述你想生成的视频画面、镜头运动与节奏…'
    : '描述你想生成的画面风格、主体与构图…';
});

const placeholderHints = computed(() => {
  if (activeMeta.value) {
    return [placeholder.value];
  }
  if (createMode.value === 'agent') {
    return [
      '描述你想做的漫剧/短视频/立绘… Agent 会先理解意图，再生成规范工作流',
      '国风少年拔刀释放大招，先出定妆关键，再生成 10 秒成片…',
      '赛博朋克女主立绘，半身，干净背景，精细衣纹…',
      '雨夜追逐短视频：镜头推进，脚步溅水，霓虹反光…',
    ];
  }
  if (genMode.value === 'video') {
    return [
      '描述你想生成的视频画面、镜头运动与节奏…',
      '雨夜霓虹街道，镜头缓缓推进，脚步溅起水花…',
      '角色回头一笑，浅景深，暖色逆光扫过发丝…',
      '航拍掠过云海，云层翻涌，阳光从缝隙洒下…',
    ];
  }
  return [
    '描述你想生成的画面风格、主体与构图…',
    '半身定妆立绘，干净背景，精细衣纹与五官…',
    '赛博朋克夜市，潮湿地面反光，远处全息招牌…',
    '古风庭院雪景，朱红廊柱，一盏纸灯摇曳…',
  ];
});

const canStart = computed(
  () => !!prompt.value.trim() || !!activeMeta.value || attachments.value.length > 0,
);
const sendTitle = computed(() => {
  if (creating.value && creatingPhase.value) return creatingPhase.value;
  if (createMode.value === 'agent') return 'Agent 理解并生成工作流';
  return genMode.value === 'video' ? '创建文本+视频工作流' : '创建文本+图片工作流';
});

function onHomeSend() {
  if (creating.value || !canStart.value) return;
  void onPromptSubmit(prompt.value);
}

async function load() {
  loading.value = true;
  try {
    const [productions, plaza] = await Promise.all([
      fetchProductions(),
      fetchSkillPlaza().catch(() => null),
    ]);
    rows.value = productions;
    if (plaza) {
      const skills = plaza.skills.map(toCatalogSkill);
      setRuntimeSkillCatalog(skills);
      featuredList.value = skills;
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function clearSkill() {
  activeMeta.value = null;
  promptInputRef.value?.applySkillTag?.('');
}

function focusPrompt() {
  nextTick(() => promptInputRef.value?.focus?.());
}

function onModeUpdate(v: string) {
  const opt = homeModes.find((m) => m.value === v);
  if (opt?.disabled) {
    ElMessage.info('该创作类型即将开放');
    return;
  }
  createMode.value = v;
  if (v === 'agent') {
    // Agent 管线默认带视频偏好（比例/时长/参考模式）
    genMode.value = 'video';
    syncPrefsForMedia('video');
    return;
  }
  const mode: HomeGenMode = v === 'image' ? 'image' : 'video';
  genMode.value = mode;
  syncPrefsForMedia(mode);
}

watch(
  () => genPrefs.value.mediaKind,
  (kind) => {
    const mode: HomeGenMode = kind === 'image' ? 'image' : 'video';
    if (genMode.value !== mode) {
      genMode.value = mode;
      if (createMode.value === 'image' || createMode.value === 'video') {
        createMode.value = mode;
      }
      syncPrefsForMedia(mode);
    }
  },
);

/** 生成时：提示词描述 + 用户补充（去掉输入框里的名称 tag） */
function composeGeneratePrompt(userRaw: string, meta: ActiveMeta | null) {
  let user = String(userRaw || '').trim();
  const skillName = String(meta?.name || '').trim();
  if (skillName) {
    if (user === skillName) {
      user = '';
    } else if (user.startsWith(skillName)) {
      user = user
        .slice(skillName.length)
        .replace(/^[\s,，、:：\-—]+/, '')
        .trim();
    }
  }
  const skillBody = String(meta?.prompt || '').trim();
  return [skillBody, user].filter(Boolean).join('\n\n');
}

let applyingSkill = false;

/**
 * 从广场接入：只在输入框插入名称 tag，正文进 activeMeta，生成时再拼接。
 * Skill（kind=agent）切到 Agent 模式；提示词仍走图/视频模式。
 */
function applyPromptFill(opts: {
  id?: string;
  name?: string;
  desc?: string;
  text: string;
  mode: HomeGenMode;
  kind?: 'prompt' | 'agent';
  slash?: string;
  /** @deprecated 不再把提示词正文回填进输入框 */
  replacePrompt?: boolean;
}) {
  const kind = opts.kind === 'agent' ? 'agent' : 'prompt';
  if (kind === 'agent') {
    createMode.value = 'agent';
    genMode.value = 'video';
    syncPrefsForMedia('video');
  } else {
    genMode.value = opts.mode;
    createMode.value = opts.mode;
    syncPrefsForMedia(opts.mode);
  }
  const name = String(opts.name || '').trim();
  const body = String(opts.text || '').trim();
  applyingSkill = true;
  if (name || body) {
    activeMeta.value = {
      id: opts.id || name || 'skill',
      name: name || (kind === 'agent' ? 'Skill' : '提示词'),
      desc: opts.desc,
      prompt: body || name,
      kind,
      slash: opts.slash,
    };
  }
  nextTick(() => {
    promptInputRef.value?.applySkillTag?.(name || (kind === 'agent' ? 'Skill' : '提示词'));
    nextTick(() => {
      applyingSkill = false;
      focusPrompt();
    });
  });
}

function applyCatalogSkill(sk: CatalogSkill) {
  applyPromptFill({
    id: sk.id,
    name: sk.name,
    desc: sk.desc,
    text: skillPromptText(sk),
    mode: resolvePlazaGenMode({
      mode: sk.mode,
      category: sk.category,
    }),
  });
}

function onStarter(s: (typeof quickSkills)[number]) {
  const sk = findSkill(s.skillId);
  if (!sk) {
    router.push({ path: '/skills' });
    return;
  }
  applyCatalogSkill(sk);
}

function relativeTime(p: ProductionRow) {
  const raw = p.updatedAt || p.createdAt;
  if (!raw) return '刚刚';
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return '刚刚';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

async function onPromptSubmit(raw: string) {
  const meta = activeMeta.value;
  const userRaw = String(raw || '').trim() || prompt.value.trim();
  const text = composeGeneratePrompt(userRaw, meta);
  if (!text && !attachments.value.length) return;
  /** Skill 广场：落 ai.chat Agent 节点；首页自由 Agent：意图理解开图/视频管线 */
  const isSkillAgent = meta?.kind === 'agent';
  const isHomeAgent = createMode.value === 'agent' && !isSkillAgent;
  creating.value = true;
  creatingPhase.value = isSkillAgent
    ? '创建 Agent…'
    : isHomeAgent
      ? 'AI 理解中…'
      : '创建中…';
  try {
    const mode: HomeGenMode = isHomeAgent || isSkillAgent
      ? 'video'
      : createMode.value === 'image'
        ? 'image'
        : 'video';
    const prefs = genPrefs.value;

    let agentPlan = null as Awaited<ReturnType<typeof planHomeAgentWorkflow>> | null;
    if (isHomeAgent) {
      agentPlan = await planHomeAgentWorkflow({
        prompt: text || meta?.name || '根据参考创作',
        hasReferenceImage: attachments.value.length > 0,
        aspect: prefs.auto ? undefined : prefs.aspectRatio,
        durationSec: prefs.durationSec,
        model: defaultOf('chat'),
        forceKind: prefs.auto ? undefined : prefs.mediaKind === 'image' ? 'image' : 'video',
      });
      creatingPhase.value = '生成工作流…';
    }

    const name =
      agentPlan?.title ||
      meta?.name ||
      text.slice(0, 40) ||
      (isSkillAgent || isHomeAgent ? 'Agent 项目' : mode === 'video' ? '视频项目' : '图片项目');

    const { production } = await ensureCompiledProduction({
      create: {
        name,
        description:
          agentPlan?.summary ||
          meta?.desc ||
          (isSkillAgent
            ? `Skill Agent：${meta?.name || '任务'}`
            : isHomeAgent
              ? 'Agent：理解意图后生成规范工作流'
              : mode === 'video'
                ? '首页文生视频'
                : '首页文生图'),
        script: text || name,
        tags: [
          '首页',
          isSkillAgent ? 'Skill' : isHomeAgent ? 'Agent' : mode === 'video' ? '视频' : '图片',
          ...(meta ? [isSkillAgent ? 'Skill' : '提示词', meta.name] : []),
        ],
        meta: {
          fromHome: true,
          genMode: isSkillAgent ? 'skill-agent' : isHomeAgent ? 'agent' : mode,
          agentSummary: agentPlan?.summary || '',
          agentKind: agentPlan?.kind || '',
          skillId: meta?.id || '',
          skillName: meta?.name || '',
          skillKind: meta?.kind || '',
        },
        status: 'draft',
      },
      forceRecompile: true,
    });

    let referenceImage = '';
    const first = attachments.value[0];
    if (first?.file) {
      const projectId = resolveAssetProjectId({ projectId: production.projectId });
      const uploaded = await uploadProjectAsset(projectId, first.file, {
        type: 'other',
        name: first.name,
        workflowId: production.workflowId || undefined,
        workflowName: production.name,
      });
      referenceImage = uploaded.url;
    }

    if (production.workflowId) {
      if (isSkillAgent) {
        await updateWorkflow(production.workflowId, {
          graph: homeAgentSkillGraph({
            name: meta?.name || name,
            prompt: text || name,
            system: meta?.desc || undefined,
            skillId: meta?.id,
            slash: meta?.slash,
          }),
        });
      } else if (isHomeAgent && agentPlan) {
        const graph = buildHomeAgentWorkflowGraph(
          {
            ...agentPlan,
            aspect: prefs.auto ? agentPlan.aspect : prefs.aspectRatio || agentPlan.aspect,
            durationSec: prefs.durationSec || agentPlan.durationSec,
            refMode: prefs.refMode || agentPlan.refMode,
          },
          {
            referenceImage,
            imageModel: defaultOf('image'),
            videoModel: modelsOf('video').some((m) => m.value === prefs.model)
              ? prefs.model
              : defaultOf('video'),
            quality: prefs.quality,
            count: prefs.count,
          },
        );
        await updateWorkflow(production.workflowId, { graph });
      } else {
        await updateWorkflow(production.workflowId, {
          graph: homePromptWorkflowGraph(text || name, {
            mode,
            label: meta?.name,
            referenceImage,
            aspect: prefs.auto ? 'auto' : prefs.aspectRatio,
            model: prefs.model,
            quality: prefs.quality,
            durationSec: prefs.durationSec,
            refMode: prefs.refMode,
            count: prefs.count,
          }),
        });
      }
    }

    ElMessage.success(
      isSkillAgent
        ? `已创建 Agent：${meta?.name || name}`
        : isHomeAgent
          ? agentPlan?.summary
            ? `已理解：${agentPlan.summary.slice(0, 48)}`
            : '已生成 Agent 项目'
          : mode === 'video'
            ? '已创建视频项目'
            : '已创建图片项目',
    );
    router.push('/productions');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '开单失败');
  } finally {
    creating.value = false;
    creatingPhase.value = '';
  }
}

async function createBlank() {
  creating.value = true;
  try {
    const production = await createBlankProduction({ name: '未命名项目' });
    ElMessage.success('已创建项目');
    router.push('/productions');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function openProduction(p: ProductionRow) {
  try {
    const { production } = await ensureCompiledProduction({ production: p });
    if (!production.workflowId) {
      ElMessage.error('项目尚未关联画布');
      return;
    }
    router.push('/productions');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '打开失败');
  }
}

function modeFromQuery(): HomeGenMode | null {
  const m = String(route.query.mode || '').toLowerCase();
  if (m === 'video' || m === 'image') return m;
  return null;
}

async function applySkillFromQuery() {
  const draft = takeHomePlazaDraft();
  if (draft) {
    applyPromptFill({
      id: draft.skillId,
      name: draft.name,
      desc: draft.desc,
      text: draft.prompt,
      mode: draft.mode,
      kind: draft.kind,
      slash: draft.slash,
    });
    if (route.query.skill || route.query.mode) {
      router.replace({ path: '/home' });
    }
    return;
  }

  const id = String(route.query.skill || '').trim();
  if (!id) return;

  const local = findSkill(id);
  if (local) {
    applyPromptFill({
      id: local.id,
      name: local.name,
      desc: local.desc,
      text: skillPromptText(local),
      mode:
        modeFromQuery() ||
        resolvePlazaGenMode({ mode: local.mode, category: local.category }),
    });
    router.replace({ path: '/home' });
    return;
  }

  try {
    const plaza = await fetchSkillPlaza();
    const remote = plaza.skills.find((s) => s.id === id);
    if (remote) {
      applyPromptFill({
        id: remote.id,
        name: remote.name,
        desc: remote.desc,
        text: String(remote.prompt || remote.starter || remote.desc || remote.name).trim(),
        mode:
          modeFromQuery() ||
          resolvePlazaGenMode({
            mode: remote.mode,
            category: remote.category,
            tags: remote.tags,
          }),
      });
      router.replace({ path: '/home' });
      return;
    }
  } catch {
    /* ignore */
  }

  try {
    const agents = await fetchAgentsPlaza();
    const agent = agents.items.find((s) => s.id === id);
    if (!agent) return;
    applyPromptFill({
      id: agent.id,
      name: agent.name,
      desc: agent.desc,
      text: String(agent.prompt || agent.desc || agent.name).trim(),
      mode: modeFromQuery() || 'video',
      kind: 'agent',
      slash: agent.slash,
    });
    router.replace({ path: '/home' });
  } catch {
    /* ignore */
  }
}

/** 用户删掉输入框里的名称 tag 后，解除绑定 */
watch(prompt, (v) => {
  if (applyingSkill) return;
  const meta = activeMeta.value;
  if (!meta?.name) return;
  if (!String(v || '').includes(meta.name)) {
    activeMeta.value = null;
  }
});

watch(
  () => route.query.skill,
  () => {
    void applySkillFromQuery();
  },
);

onMounted(() => {
  void (async () => {
    await ensureAiSettings();
    const list = genMode.value === 'video' ? modelsOf('video') : modelsOf('image');
    const preferred = defaultOf(genMode.value);
    if (preferred && list.some((m) => m.value === preferred)) {
      genPrefs.value = { ...genPrefs.value, model: preferred };
    } else if (list[0]?.value) {
      genPrefs.value = { ...genPrefs.value, model: list[0].value };
    }
  })();
  void load();
  void applySkillFromQuery();
});
</script>

<style scoped>
.home-bench {
  --home-pad-x: clamp(24px, 3.5vw, 48px);
  --home-content-w: min(1360px, 100%);
  position: relative;
  min-height: 100%;
  overflow: visible;
  padding: 56px var(--home-pad-x) 72px;
  box-sizing: border-box;
  background: var(--studio-bg);
  color: var(--studio-ink);
  font-family: var(--font);
}

/* 浅色：首页背景加一点淡氛围光，卡片带柔和投影 */
[data-theme='light'] .home-bench {
  background:
    radial-gradient(1100px 560px at 50% -14%, rgba(99, 102, 241, 0.07), transparent 62%),
    var(--studio-bg);
}

.glow {
  position: absolute;
  pointer-events: none;
  z-index: 0;
  filter: blur(80px);
}
.glow-1 {
  top: 140px;
  left: calc(50% - 260px);
  width: 520px;
  height: 96px;
  background: radial-gradient(50% 50%, rgba(177, 126, 215, 0.55), transparent 70%);
}
.glow-2 {
  top: 260px;
  left: calc(50% + 40px);
  width: 360px;
  height: 66px;
  background: radial-gradient(50% 50%, rgba(231, 113, 175, 0.5), transparent 70%);
  filter: blur(70px);
}

.home-center {
  position: relative;
  z-index: 5;
  width: min(740px, 100%);
  margin: 0 auto 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.hero-title {
  margin: 0;
  text-align: center;
  font-size: 32px;
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.2;
  background-image: linear-gradient(
    95deg,
    #fffef5,
    #fff2d9,
    #ffbee5,
    #a6b4ff,
    #77f8ff,
    #fffef5
  );
  background-size: 300% auto;
  background-position: 0% center;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: hero-gradient-shift 12s linear infinite;
}

/* 浅色：用更饱和的渐变保证文字显眼 */
[data-theme='light'] .hero-title {
  background-image: linear-gradient(
    95deg,
    #4f46e5,
    #2563eb,
    #0ea5e9,
    #0891b2,
    #d946ef,
    #f59e0b,
    #4f46e5
  );
}
@keyframes hero-gradient-shift {
  0% {
    background-position: 0% center;
  }
  100% {
    background-position: 300% center;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero-title {
    animation: none;
    background-position: 40% center;
  }
}

.chip-x {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  font-size: 14px;
}
.skill-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(77, 175, 201, 0.12);
  border: 1px solid rgba(77, 175, 201, 0.2);
  color: #7dd3e8;
  font-size: 12px;
  max-width: 180px;
}
.skill-inline em {
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-skills {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.quick-pill {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--studio-line);
  border-radius: 999px;
  background: var(--studio-glass);
  color: var(--studio-text);
  font: inherit;
  font-size: 12.5px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.quick-pill:hover {
  background: var(--studio-glass-2);
  border-color: var(--studio-line-strong);
}

.recent-sec {
  position: relative;
  z-index: 5;
  width: var(--home-content-w);
  max-width: 100%;
  margin: 0 auto;
}
.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.sec-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.view-all {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.view-all:hover {
  color: var(--studio-ink);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}
.project-card {
  border: 1px solid transparent;
  border-radius: 16px;
  background: var(--studio-panel);
  color: var(--studio-ink);
  padding: 10px 10px 0;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  font: inherit;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  box-shadow: var(--studio-card-shadow);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.project-card:hover {
  border-color: var(--studio-line-strong);
  background: var(--studio-panel-2);
  box-shadow: var(--shadow-hover);
}
.project-card.create {
  min-height: 200px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--studio-muted);
  padding: 0;
}
.project-card.create span {
  font-size: 14px;
  font-weight: 500;
}
.project-card.create:hover:not(:disabled) {
  color: var(--studio-ink);
  background: var(--studio-panel-3);
  border-color: var(--studio-line-strong);
}
.project-card.create:disabled {
  opacity: 0.6;
  cursor: wait;
}
.thumb {
  aspect-ratio: 16 / 10;
  border-radius: 12px;
  overflow: hidden;
  background: var(--studio-inset);
}
.thumb.empty {
  background: var(--studio-inset-2);
  box-shadow: inset 0 0 0 1px var(--studio-line);
}
.thumb :deep(.media-thumb) {
  width: 100%;
  height: 100%;
}
.meta {
  padding: 10px 4px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.meta strong {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta em {
  font-style: normal;
  font-size: 12px;
  color: var(--studio-faint);
}

.featured-sec {
  position: relative;
  z-index: 5;
  width: var(--home-content-w);
  max-width: 100%;
  margin: 40px auto 0;
}
.featured-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
.featured-card {
  display: grid;
  grid-template-columns: 1fr 112px;
  gap: 14px;
  min-height: 168px;
  padding: 18px 16px 16px 20px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  cursor: pointer;
  color: #fff;
  box-sizing: border-box;
  overflow: hidden;
  transition: transform 0.18s ease, filter 0.18s ease;
}
.featured-card:hover {
  transform: translateY(-2px);
  filter: brightness(1.05);
}
.featured-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.featured-ico {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.22);
  display: grid;
  place-items: center;
  margin-bottom: 2px;
}
.featured-body strong {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.featured-author {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
}
.featured-body p {
  margin: 2px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.88);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.featured-uses {
  margin-top: auto;
  padding-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}
.featured-cover {
  width: 112px;
  height: 132px;
  border-radius: 12px;
  overflow: hidden;
  align-self: center;
  background: rgba(0, 0, 0, 0.2);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}
.featured-cover :deep(.lazy-cover) {
  width: 100%;
  height: 100%;
}

@media (max-width: 1200px) {
  .home-bench {
    --home-content-w: 100%;
  }
}
@media (max-width: 960px) {
  .featured-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 560px) {
  .hero-title {
    font-size: 26px;
  }
}
</style>
