<template>
  <div class="make-studio">
    <aside class="timeline">
      <header class="timeline-head">
        <p class="eyebrow">AI 影视生产流程</p>
        <h1>制作大片</h1>
      </header>

      <nav class="steps">
        <button
          v-for="(s, i) in steps"
          :key="s.id"
          type="button"
          class="step"
          :class="{ on: activeStep === s.id, done: isDone(s.id, i) }"
          @click="goStep(s.id)"
        >
          <span class="step-line" aria-hidden="true" />
          <span class="step-node">
            <UiIcon v-if="isDone(s.id, i)" name="check" :size="14" />
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span class="step-copy">
            <strong>{{ s.title }}</strong>
            <em>{{ s.desc }}</em>
          </span>
        </button>
      </nav>

      <footer class="timeline-foot">
        <el-button text :disabled="activeStepIndex === 0" @click="prevStep">上一步</el-button>
        <el-button
          v-if="activeStepIndex < steps.length - 1"
          type="primary"
          @click="nextStep"
        >
          下一步
        </el-button>
        <el-button v-else type="primary" @click="saveDraft">保存项目</el-button>
      </footer>
    </aside>

    <main class="stage">
      <header class="stage-head">
        <div>
          <h2>{{ currentStep.title }}</h2>
          <p>{{ currentStep.desc }}</p>
        </div>
        <div class="project-badge">
          <span>{{ form.title || '未命名项目' }}</span>
          <el-button size="small" text @click="saveDraft">保存草稿</el-button>
        </div>
      </header>

      <section v-if="activeStep === 'script'" class="panel">
        <div class="section-title">
          <div>
            <h3>剧本编辑</h3>
            <p>先写故事梗概或完整剧本，后续设定、分镜和视频都从这里推进。</p>
          </div>
          <el-button
            type="primary"
            :loading="aiBusy === 'script'"
            @click="generateScript"
          >
            AI 生成剧本
          </el-button>
        </div>
        <AiPromptInput
          v-model="form.script"
          v-model:attachments="scriptAttachments"
          v-model:prefs="scriptPrefs"
          :mode="scriptMode"
          :modes="scriptModes"
          :models="imageModelOptions"
          :video-models="videoModelOptions"
          :chat-models="chatModelOptions"
          :chat-model="settings?.defaultChatModel || ''"
          :placeholder="'输入故事灵感或完整剧本，支持上传参考图；也可以直接粘贴已有分镜'"
          :min-height="220"
          :show-templates="false"
          :templates="[]"
          :show-prefs="true"
          :prefs-kinds="['image', 'video']"
          :show-mention="true"
          :show-send="false"
          enable-attachments
          tone="default"
          @update:mode="scriptMode = $event"
          @submit="generateScript"
        />
      </section>

      <section v-else-if="activeStep === 'settings'" class="panel">
        <div class="section-title">
          <div>
            <h3>视频设定</h3>
            <p>确定片名、题材、画风、画幅、时长与生成模型。</p>
          </div>
        </div>
        <div class="form-grid">
          <label class="field">
            <span>片名</span>
            <el-input v-model="form.title" placeholder="例如：记忆猎手" />
          </label>
          <label class="field">
            <span>题材 / 类型</span>
            <el-select v-model="form.genre" class="full-input">
              <el-option label="AI 视频" value="AI 视频" />
              <el-option label="AI 动漫" value="AI 动漫" />
              <el-option label="AI 短剧" value="AI 短剧" />
              <el-option label="AI 漫剧" value="AI 漫剧" />
            </el-select>
          </label>
          <label class="field">
            <span>视频模型</span>
            <el-select v-model="form.model" filterable allow-create default-first-option class="full-input">
              <el-option v-for="m in videoModelOptions" :key="m.value" :label="m.label" :value="m.value" />
            </el-select>
          </label>
          <label class="field">
            <span>画幅</span>
            <el-select v-model="form.aspectRatio" class="full-input">
              <el-option label="16:9 横屏" value="16:9" />
              <el-option label="9:16 竖屏" value="9:16" />
              <el-option label="1:1 方形" value="1:1" />
            </el-select>
          </label>
          <label class="field">
            <span>单镜时长（秒）</span>
            <el-input-number v-model="form.duration" :min="2" :max="30" :step="1" class="full-input" />
          </label>
          <label class="field">
            <span>分辨率</span>
            <el-select v-model="form.resolution" class="full-input">
              <el-option label="480P" value="480p" />
              <el-option label="720P" value="720p" />
              <el-option label="1080P" value="1080p" />
            </el-select>
          </label>
          <label class="field full">
            <span>视觉风格 / 统一约束</span>
            <el-input
              v-model="form.style"
              type="textarea"
              :rows="5"
              placeholder="例如：冷峻赛博朋克、电影感打光、角色服装保持统一、禁止字幕……"
            />
          </label>
        </div>
      </section>

      <section v-else-if="activeStep === 'assets'" class="panel">
        <div class="section-title">
          <div>
            <h3>场景、角色与道具</h3>
            <p>把剧本里会反复出现的元素整理出来，后面分镜会引用这些描述。</p>
          </div>
        </div>

        <div class="asset-cols">
          <div class="asset-card">
            <div class="asset-head">
              <h4>场景</h4>
              <el-button size="small" @click="addItem('scenes')">+ 添加</el-button>
            </div>
            <div v-for="(item, idx) in form.scenes" :key="item.id" class="asset-item">
              <el-input v-model="item.name" placeholder="场景名" />
              <el-input v-model="item.desc" type="textarea" :rows="2" placeholder="场景描述" />
              <el-button size="small" text type="danger" @click="removeItem('scenes', idx)">删除</el-button>
            </div>
          </div>

          <div class="asset-card">
            <div class="asset-head">
              <h4>角色</h4>
              <el-button size="small" @click="addItem('characters')">+ 添加</el-button>
            </div>
            <div v-for="(item, idx) in form.characters" :key="item.id" class="asset-item">
              <el-input v-model="item.name" placeholder="角色名" />
              <el-input v-model="item.desc" type="textarea" :rows="2" placeholder="外貌、服装、性格" />
              <el-button size="small" text type="danger" @click="removeItem('characters', idx)">删除</el-button>
            </div>
          </div>

          <div class="asset-card">
            <div class="asset-head">
              <h4>道具</h4>
              <el-button size="small" @click="addItem('props')">+ 添加</el-button>
            </div>
            <div v-for="(item, idx) in form.props" :key="item.id" class="asset-item">
              <el-input v-model="item.name" placeholder="道具名" />
              <el-input v-model="item.desc" type="textarea" :rows="2" placeholder="道具外观与作用" />
              <el-button size="small" text type="danger" @click="removeItem('props', idx)">删除</el-button>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="activeStep === 'shots'" class="panel">
        <div class="section-title">
          <div>
            <h3>分镜脚本</h3>
            <p>把剧情拆成可生成的镜头，每个镜头对应一条视频提示词。</p>
          </div>
          <el-button type="primary" :loading="aiBusy === 'shots'" @click="generateShots">
            AI 拆分分镜
          </el-button>
        </div>

        <div class="shot-list">
          <article v-for="(shot, idx) in shots" :key="shot.id" class="shot-card">
            <header>
              <strong>镜头 {{ idx + 1 }}</strong>
              <el-input-number v-model="shot.duration" :min="2" :max="30" :step="1" size="small" />
            </header>
            <el-input v-model="shot.scene" placeholder="场景 / 内容" />
            <el-input v-model="shot.prompt" type="textarea" :rows="4" placeholder="镜头提示词：主体、动作、运镜、光影、风格" />
          </article>
          <el-empty v-if="!shots.length" description="还没有分镜，先写剧本或点击 AI 拆分分镜" />
        </div>
      </section>

      <section v-else-if="activeStep === 'videos'" class="panel">
        <div class="section-title">
          <div>
            <h3>分镜视频</h3>
            <p>按镜头生成视频，任务会在后台队列执行，生成后可到预览页查看。</p>
          </div>
          <el-button :loading="generatingAny" @click="generateAllShots">
            批量生成全部
          </el-button>
        </div>

        <div class="video-list">
          <article v-for="(shot, idx) in shots" :key="shot.id" class="video-row">
            <div class="video-thumb">
              <video v-if="shot.videoUrl" :src="shot.videoUrl" controls muted />
              <span v-else class="thumb-placeholder">{{ idx + 1 }}</span>
            </div>
            <div class="video-info">
              <strong>镜头 {{ idx + 1 }} · {{ shot.scene || '未命名' }}</strong>
              <p>{{ shot.prompt }}</p>
              <el-tag :type="shotTagType(shot.status)" size="small">
                {{ shotStatusText(shot.status) }}
              </el-tag>
              <el-button
                v-if="shot.status === 'idle' || shot.status === 'error'"
                size="small"
                type="primary"
                :loading="generatingShotId === shot.id"
                @click="generateShot(shot)"
              >
                {{ shot.status === 'error' ? '重新生成' : '生成视频' }}
              </el-button>
            </div>
          </article>
        </div>
      </section>

      <section v-else class="panel">
        <div class="section-title">
          <div>
            <h3>视频预览</h3>
            <p>查看已生成的分镜视频，确认后可在项目列表中继续整理。</p>
          </div>
        </div>

        <div v-if="doneShots.length" class="preview-grid">
          <figure v-for="(shot, idx) in doneShots" :key="shot.id" class="preview-item">
            <video :src="shot.videoUrl" controls muted />
            <figcaption>
              <strong>镜头 {{ idx + 1 }}</strong>
              <span>{{ shot.scene || shot.prompt }}</span>
            </figcaption>
          </figure>
        </div>
        <el-empty v-else description="暂无可预览视频，请先到「分镜视频」生成" />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/api';
import {
  createGenerateSession,
  generateVideo,
  listGenerateMessages,
} from '@/api/generate';
import UiIcon from '@/components/icons/UiIcon.vue';
import type { IconName } from '@/components/icons/types';
import AiPromptInput from '@/components/ai-prompt-input/AiPromptInput.vue';
import type { PromptImageAttachment } from '@/components/ai-prompt-input/attachment';
import {
  aiModelsToPrefOptions,
  createDefaultPrefs,
  HOME_CREATE_MODES,
  type PromptGenPrefs,
  type PromptModeOption,
} from '@/components/ai-prompt-input/prefs';

type StepId = 'script' | 'settings' | 'assets' | 'shots' | 'videos' | 'preview';

type AssetItem = { id: string; name: string; desc: string };
type Shot = {
  id: string;
  scene: string;
  prompt: string;
  duration: number;
  status: 'idle' | 'running' | 'done' | 'error';
  messageId?: string;
  videoUrl?: string;
  errorMessage?: string;
};

const steps: Array<{ id: StepId; title: string; desc: string; icon: IconName }> = [
  { id: 'script', title: '剧本编辑', desc: '输入故事梗概或完整剧本', icon: 'file-text' },
  { id: 'settings', title: '视频设定', desc: '确定片名、模型、画幅与风格', icon: 'clapperboard' },
  { id: 'assets', title: '场景角色道具', desc: '整理场景、角色和道具设定', icon: 'users' },
  { id: 'shots', title: '分镜脚本', desc: '把剧情拆分为可生成镜头', icon: 'list-todo' },
  { id: 'videos', title: '分镜视频', desc: '逐镜生成视频任务', icon: 'film' },
  { id: 'preview', title: '视频预览', desc: '预览并确认生成结果', icon: 'eye' },
];

const DRAFT_KEY = 'aivideo.makeMovie.draft.v1';
const activeStep = ref<StepId>('script');
const aiBusy = ref<'script' | 'shots' | ''>('');
const settings = ref<any>({});
const sessionId = ref('');
const generatingShotId = ref('');
const shots = ref<Shot[]>([]);
const scriptMode = ref('video');
const scriptModes = HOME_CREATE_MODES as PromptModeOption[];
const scriptAttachments = ref<PromptImageAttachment[]>([]);
const scriptPrefs = ref<PromptGenPrefs>(
  createDefaultPrefs({
    auto: true,
    mediaKind: 'video',
    aspectRatio: '16:9',
    model: '',
    quality: '480p',
  }),
);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const form = reactive<{
  title: string;
  genre: string;
  style: string;
  script: string;
  aspectRatio: string;
  duration: number;
  resolution: string;
  model: string;
  scenes: AssetItem[];
  characters: AssetItem[];
  props: AssetItem[];
}>({
  title: '',
  genre: 'AI 视频',
  style: '',
  script: '',
  aspectRatio: '16:9',
  duration: 8,
  resolution: '720p',
  model: '',
  scenes: [],
  characters: [],
  props: [],
});

const activeStepIndex = computed(() => steps.findIndex((s) => s.id === activeStep.value));
const currentStep = computed(() => steps[activeStepIndex.value] || steps[0]);

const videoModelOptions = computed(() => {
  const items = Array.isArray(settings.value?.localModels) ? settings.value.localModels : [];
  return items
    .filter((m: any) => {
      const mods = Array.isArray(m.modalities) ? m.modalities : [];
      return mods.includes('video') || /seedance|video/i.test(String(m.modelId || ''));
    })
    .map((m: any) => ({
      label: String(m.title || m.label || m.modelId || '').trim(),
      value: String(m.modelId || '').trim(),
    }))
    .filter((x: any) => x.value);
});

const imageModelOptions = computed(() => {
  const items = Array.isArray(settings.value?.localModels) ? settings.value.localModels : [];
  return aiModelsToPrefOptions(
    items
      .filter((m: any) => {
        const mods = Array.isArray(m.modalities) ? m.modalities : [];
        return mods.includes('image') || /seedream|image/i.test(String(m.modelId || ''));
      })
      .map((m: any) => ({
        label: String(m.title || m.label || m.modelId || '').trim(),
        value: String(m.modelId || '').trim(),
      })),
  );
});

const chatModelOptions = computed(() => {
  const items = Array.isArray(settings.value?.localModels) ? settings.value.localModels : [];
  return aiModelsToPrefOptions(
    items
      .filter((m: any) => {
        const mods = Array.isArray(m.modalities) ? m.modalities : [];
        return mods.includes('text') || /doubao|chat|seed|deepseek/i.test(String(m.modelId || ''));
      })
      .map((m: any) => ({
        label: String(m.title || m.label || m.modelId || '').trim(),
        value: String(m.modelId || '').trim(),
      })),
  );
});

const doneShots = computed(() => shots.value.filter((s) => s.status === 'done' && s.videoUrl));
const generatingAny = computed(() => shots.value.some((s) => s.status === 'running'));

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isDone(step: StepId, index: number) {
  const current = activeStepIndex.value;
  if (index < current) return true;
  if (step === 'script' && index === current && form.script.trim()) return true;
  if (step === 'settings' && index === current && form.title.trim()) return true;
  if (step === 'assets' && index === current && (form.scenes.length || form.characters.length || form.props.length)) return true;
  if (step === 'shots' && index === current && shots.value.length) return true;
  if (step === 'videos' && index === current && shots.value.some((s) => s.status !== 'idle')) return true;
  if (step === 'preview' && index === current && doneShots.value.length) return true;
  return false;
}

function goStep(id: StepId) {
  activeStep.value = id;
}

function nextStep() {
  const idx = activeStepIndex.value;
  if (idx < steps.length - 1) activeStep.value = steps[idx + 1].id;
}

function prevStep() {
  const idx = activeStepIndex.value;
  if (idx > 0) activeStep.value = steps[idx - 1].id;
}

function addItem(kind: 'scenes' | 'characters' | 'props') {
  form[kind].push({ id: uid(kind), name: '', desc: '' });
}

function removeItem(kind: 'scenes' | 'characters' | 'props', idx: number) {
  form[kind].splice(idx, 1);
}

async function loadSettings() {
  try {
    const { data } = await api.get('/settings');
    settings.value = data || {};
    if (!form.model) {
      form.model =
        String(data?.defaultVideoModel || videoModelOptions.value[0]?.value || '').trim();
    }
  } catch {
    /* keep defaults */
  }
}

async function generateScript() {
  if (!form.script.trim()) {
    ElMessage.warning('先输入一句话灵感');
    return;
  }
  aiBusy.value = 'script';
  try {
    const { data } = await api.post<{ text?: string } | string>('/ai/chat', {
      model: settings.value?.defaultChatModel || undefined,
      messages: [
        {
          role: 'system',
          content:
            '你是专业短剧编剧。把用户灵感扩写为可直接用于视频生成的剧本，包含片名、题材、角色、场景、冲突、三到五场情节，并尽量使用视觉化描述。只输出剧本正文，不要解释。',
        },
        { role: 'user', content: form.script.trim() },
      ],
    });
    const text = typeof data === 'string' ? data.trim() : String(data?.text || '').trim();
    if (!text) throw new Error('剧本生成返回为空');
    form.script = text;
    ElMessage.success('剧本已生成');
  } catch (e: any) {
    ElMessage.error(String(e?.response?.data?.message || e?.message || '剧本生成失败'));
  } finally {
    aiBusy.value = '';
  }
}

function parseJsonArray(raw: string): Array<Record<string, any>> {
  const text = String(raw || '').trim();
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const arr = JSON.parse(match[0]);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
}

async function generateShots() {
  if (!form.script.trim()) {
    ElMessage.warning('请先完成剧本编辑');
    return;
  }
  aiBusy.value = 'shots';
  try {
    const context = `
题材：${form.genre || 'AI 视频'}
画幅：${form.aspectRatio}
单镜时长：${form.duration} 秒
风格约束：${form.style || '无'}
场景：${form.scenes.map((s) => `${s.name}:${s.desc}`).join('；') || '无'}
角色：${form.characters.map((c) => `${c.name}:${c.desc}`).join('；') || '无'}
道具：${form.props.map((p) => `${p.name}:${p.desc}`).join('；') || '无'}
剧本：
${form.script}
`;
    const { data } = await api.post<{ text?: string } | string>('/ai/chat', {
      model: settings.value?.defaultChatModel || undefined,
      messages: [
        {
          role: 'system',
          content:
            '你是视频分镜师。根据剧本输出 JSON 数组，每项包含 scene（场景/内容）和 prompt（可直接用于视频生成的完整提示词，包含主体、动作、运镜、光影、风格、禁止字幕）。只输出 JSON 数组，不要解释。',
        },
        { role: 'user', content: context },
      ],
    });
    const raw = typeof data === 'string' ? data : String(data?.text || '');
    const arr = parseJsonArray(raw);
    if (!arr.length) {
      shots.value = [
        {
          id: uid('shot'),
          scene: '开场',
          prompt: form.script.slice(0, 1200),
          duration: form.duration,
          status: 'idle',
        },
      ];
      ElMessage.warning('AI 未返回结构化分镜，已根据剧本创建 1 个镜头');
      return;
    }
    shots.value = arr.slice(0, 24).map((item, idx) => ({
      id: uid('shot'),
      scene: String(item.scene || item.name || `镜头 ${idx + 1}`),
      prompt: String(item.prompt || item.description || ''),
      duration: Number(item.duration) || form.duration,
      status: 'idle' as const,
    }));
    ElMessage.success(`已拆分 ${shots.value.length} 个镜头`);
  } catch (e: any) {
    ElMessage.error(String(e?.response?.data?.message || e?.message || '分镜生成失败'));
  } finally {
    aiBusy.value = '';
  }
}

async function ensureSession() {
  if (sessionId.value) return sessionId.value;
  const session = await createGenerateSession(form.title || '未命名大片');
  sessionId.value = session.id;
  return session.id;
}

async function generateShot(shot: Shot) {
  if (!shot.prompt.trim()) {
    ElMessage.warning('请先填写该镜头的提示词');
    return;
  }
  generatingShotId.value = shot.id;
  try {
    const sid = await ensureSession();
    const res = await generateVideo({
      sessionId: sid,
      prompt: shot.prompt.trim(),
      model: form.model || undefined,
      aspectRatio: form.aspectRatio,
      durationSec: shot.duration || form.duration,
      resolution: form.resolution,
      prefs: {
        aspectRatio: form.aspectRatio,
        model: form.model,
        durationSec: shot.duration || form.duration,
        quality: form.resolution,
      },
    });
    shot.messageId = res.assistantMessage?.id;
    shot.status = 'running';
    shot.videoUrl = '';
    startPolling();
    ElMessage.success('视频任务已提交');
    void refreshMessages();
  } catch (e: any) {
    shot.status = 'error';
    shot.errorMessage = String(e?.response?.data?.message || e?.message || '生成失败');
    ElMessage.error(shot.errorMessage);
  } finally {
    generatingShotId.value = '';
  }
}

async function generateAllShots() {
  if (!shots.value.length) {
    ElMessage.warning('请先完成分镜脚本');
    return;
  }
  for (const shot of shots.value) {
    if (shot.status === 'idle' || shot.status === 'error') {
      await generateShot(shot);
    }
  }
}

async function refreshMessages() {
  if (!sessionId.value) return;
  try {
    const messages = await listGenerateMessages(sessionId.value);
    for (const shot of shots.value) {
      if (!shot.messageId) continue;
      const msg = messages.find((m) => m.id === shot.messageId);
      if (!msg) continue;
      shot.videoUrl = msg.mediaUrl || shot.videoUrl || '';
      shot.errorMessage = msg.errorMessage || shot.errorMessage || '';
      if (msg.status === 'done' && msg.mediaUrl) {
        shot.status = 'done';
      } else if (msg.status === 'error') {
        shot.status = 'error';
      } else {
        shot.status = 'running';
      }
    }
  } catch {
    /* ignore polling errors */
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => void refreshMessages(), 3000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function shotTagType(status: Shot['status']) {
  if (status === 'done') return 'success';
  if (status === 'error') return 'danger';
  if (status === 'running') return 'warning';
  return 'info';
}

function shotStatusText(status: Shot['status']) {
  if (status === 'done') return '已完成';
  if (status === 'error') return '失败';
  if (status === 'running') return '生成中';
  return '待生成';
}

function saveDraft() {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ form, shots: shots.value, activeStep: activeStep.value, sessionId: sessionId.value }),
    );
    ElMessage.success('草稿已保存');
  } catch {
    ElMessage.warning('草稿保存失败');
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    Object.assign(form, draft.form || {});
    shots.value = Array.isArray(draft.shots) ? draft.shots : [];
    activeStep.value = (draft.activeStep as StepId) || 'script';
    sessionId.value = draft.sessionId || '';
    if (sessionId.value) startPolling();
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  loadDraft();
  await loadSettings();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped>
.make-studio {
  --rail-width: 286px;
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--rail-width) minmax(0, 1fr);
  background: var(--studio-bg);
  color: var(--studio-ink);
}
.timeline {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 24px 18px;
  border-right: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.timeline-head {
  margin-bottom: 24px;
}
.eyebrow {
  margin: 0 0 6px;
  color: var(--studio-accent, #3b82f6);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.timeline-head h1 {
  margin: 0;
  font-size: 26px;
  letter-spacing: -0.04em;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.step {
  position: relative;
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 12px;
  align-items: center;
  min-height: 66px;
  padding: 8px 10px;
  border: 0;
  border-radius: 15px;
  background: transparent;
  color: var(--studio-muted);
  text-align: left;
  cursor: pointer;
}
.step:hover {
  background: var(--studio-glass);
  border-color: var(--studio-line-strong);
}
.step.on {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}
.step-line {
  position: absolute;
  left: 21px;
  top: 52px;
  bottom: -24px;
  width: 1px;
  background: var(--studio-line-strong);
  pointer-events: none;
}
.step:last-child .step-line {
  display: none;
}
.step-node {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--studio-panel-3);
  color: var(--studio-muted);
  font-size: 12px;
  font-weight: 700;
}
.step.on .step-node {
  background: var(--studio-ink);
  color: var(--studio-bg);
}
.step.done .step-node {
  background: var(--studio-accent, #3b82f6);
  color: #fff;
}
.step-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.step-copy strong {
  font-size: 14px;
}
.step-copy em {
  color: var(--studio-muted);
  font-style: normal;
  font-size: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.timeline-foot {
  display: flex;
  gap: 8px;
  padding-top: 14px;
}

/* 参考初版镜头库的左侧卡片列表，但保留六步时间轴语义 */
.step {
  min-height: 76px;
  border: 1px solid transparent;
  padding: 12px;
}
.step.on {
  border-color: var(--studio-line-bright);
  background: var(--studio-glass-2);
}
.step-node {
  width: 30px;
  height: 30px;
}
.step-copy strong {
  font-size: 15px;
}
.step-copy em {
  -webkit-line-clamp: 2;
}
.stage {
  min-width: 0;
  padding: 24px 28px 56px;
  max-width: 1220px;
  width: 100%;
  margin: 0 auto;
}
.stage-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}
.stage-head h2 {
  margin: 0;
  font-size: 30px;
  letter-spacing: -0.04em;
}
.stage-head p {
  margin: 8px 0 0;
  color: var(--studio-muted);
  font-size: 14px;
}
.project-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--studio-muted);
  font-size: 13px;
}
.panel {
  border: 1px solid var(--studio-line-strong);
  border-radius: 22px;
  padding: 20px;
  background: var(--studio-panel);
  box-shadow: var(--shadow-sm);
}
.section-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.section-title h3 {
  margin: 0 0 6px;
  font-size: 18px;
}
.section-title p {
  margin: 0;
  color: var(--studio-muted);
  font-size: 13px;
  line-height: 1.6;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field span {
  color: var(--studio-muted);
  font-size: 13px;
  font-weight: 600;
}
.full {
  grid-column: 1 / -1;
}
.full-input {
  width: 100%;
}
.asset-cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.asset-card {
  border: 1px solid var(--studio-line-strong);
  border-radius: 16px;
  padding: 14px;
  background: var(--studio-bg);
}
.asset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.asset-head h4 {
  margin: 0;
  font-size: 15px;
}
.asset-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-top: 1px dashed var(--studio-line-strong);
}
.asset-item:first-of-type {
  border-top: 0;
}
.shot-list,
.video-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.shot-card,
.video-row {
  border: 1px solid var(--studio-line-strong);
  border-radius: 16px;
  padding: 14px;
  background: var(--studio-bg);
}
.shot-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.shot-card :deep(.el-input),
.shot-card :deep(.el-textarea) {
  margin-bottom: 8px;
}
.video-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
}
.video-thumb {
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background: var(--studio-panel-3);
}
.video-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--studio-muted);
  font-size: 32px;
  font-weight: 700;
}
.video-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.video-info p {
  margin: 0;
  color: var(--studio-muted);
  font-size: 13px;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.preview-item {
  margin: 0;
}
.preview-item video {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 16px;
  background: #000;
}
.preview-item figcaption {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 2px 0;
}
.preview-item strong {
  font-size: 14px;
}
.preview-item span {
  color: var(--studio-muted);
  font-size: 12px;
  line-height: 1.5;
}
:deep(.el-textarea__inner),
:deep(.el-input__inner),
:deep(.el-select__wrapper),
:deep(.el-input-number) {
  background: var(--studio-panel) !important;
  color: var(--studio-ink) !important;
}
:deep(.el-textarea__inner) {
  line-height: 1.7;
}
@media (max-width: 920px) {
  .make-studio {
    grid-template-columns: 1fr;
  }
  .timeline {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--studio-line-strong);
  }
  .steps {
    flex-direction: row;
    overflow-x: auto;
  }
  .step {
    min-width: 170px;
  }
  .step-line {
    display: none;
  }
  .form-grid,
  .asset-cols,
  .preview-grid {
    grid-template-columns: 1fr;
  }
  .video-row {
    grid-template-columns: 1fr;
  }
}
</style>
