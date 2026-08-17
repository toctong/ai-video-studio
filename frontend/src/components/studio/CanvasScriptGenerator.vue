<template>
  <Teleport to="body">
    <div v-if="open" class="sg-mask" @mousedown.self="close">
      <div class="sg-stack" role="dialog" aria-label="脚本生成器">
        <section class="sg-card">
          <header class="sg-head">
            <span class="sg-ico" aria-hidden="true">☰</span>
            <strong>脚本生成器</strong>
            <button type="button" class="x" title="关闭" @click="close">×</button>
          </header>

          <div class="sg-hero">
            <div class="doc-mark">
              <i /><i /><i />
            </div>
          </div>

          <div class="sg-try">
            <div class="try-label">尝试:</div>
            <button
              v-for="m in modes"
              :key="m.id"
              type="button"
              class="try-row"
              :class="{ on: mode === m.id }"
              @click="mode = m.id"
            >
              <span class="try-ico">{{ m.icon }}</span>
              <span>{{ m.label }}</span>
            </button>
          </div>

          <div class="sg-chips">
            <button
              v-if="styleLabel"
              type="button"
              class="chip"
              @click="emit('open-style')"
            >
              风格 · {{ styleLabel }}
            </button>
            <button v-else type="button" class="chip ghost" @click="emit('open-style')">
              + 从风格库选用
            </button>
            <button
              v-if="shotLabel"
              type="button"
              class="chip"
              @click="emit('open-shot')"
            >
              镜头 · {{ shotLabel }}
            </button>
            <button
              v-else-if="mode === 'shot'"
              type="button"
              class="chip ghost"
              @click="emit('open-shot')"
            >
              + 从镜头库选用
            </button>
            <span v-if="categoryChip" class="chip static" :title="categoryChip">
              画风 · {{ categoryChip }}
            </span>
            <button
              v-if="characterLabel"
              type="button"
              class="chip"
              @click="emit('open-character')"
            >
              角色 · {{ characterLabel }}
            </button>
            <button
              v-else-if="mode === 'character'"
              type="button"
              class="chip ghost"
              @click="emit('open-character')"
            >
              + 从角色库选用
            </button>
            <button
              v-if="novelLabel"
              type="button"
              class="chip"
              :title="novelLabel"
              @click="novelPickerOpen = true"
            >
              小说 · {{ novelLabel }}
            </button>
            <button
              v-else-if="mode === 'script' || mode === 'manual'"
              type="button"
              class="chip ghost"
              @click="novelPickerOpen = true"
            >
              + 从书库选用
            </button>
          </div>

          <div class="sg-dur">
            <span class="dur-label">成片时长</span>
            <div class="dur-opts" role="group" aria-label="成片时长">
              <button
                v-for="d in durationOptions"
                :key="d"
                type="button"
                class="dur-btn"
                :class="{ on: targetDurationSec === d }"
                @click="targetDurationSec = d"
              >
                {{ d }}s
              </button>
            </div>
          </div>
        </section>

        <section class="sg-composer">
          <textarea
            v-model="prompt"
            rows="4"
            :placeholder="placeholder"
            @keydown.meta.enter.prevent="submit"
            @keydown.ctrl.enter.prevent="submit"
          />
          <div class="sg-bar">
            <div class="model">
              <span class="swirl">◎</span>
              <select v-model="model">
                <option v-for="m in chatModels" :key="m.value || 'default'" :value="m.value">
                  {{ m.label || m.value || '默认模型' }}
                </option>
              </select>
            </div>
            <div class="bar-right">
              <button
                type="button"
                class="icon-btn"
                :disabled="!canSubmit"
                :title="mode === 'manual' ? '放到画布' : '确认后关闭，后台生成到画布'"
                @click="submit"
              >
                ↑
              </button>
            </div>
          </div>
        </section>
      </div>

      <CanvasNovelPicker
        :open="novelPickerOpen"
        @close="novelPickerOpen = false"
        @pick="onNovelPick"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useAiSettings } from '@/composables/useAiSettings';
import CanvasNovelPicker, {
  type NovelPickPayload,
} from '@/components/studio/CanvasNovelPicker.vue';

/** 工作室短片上下文：正文过长时截取前段 */
const NOVEL_BODY_MAX = 8000;

export type ScriptGenMode = 'script' | 'shot' | 'character' | 'manual';

const props = defineProps<{
  open: boolean;
  styleLabel?: string;
  styleBrief?: string;
  characterLabel?: string;
  characterBrief?: string;
  shotLabel?: string;
  shotBrief?: string;
  shotId?: string;
  category?: string;
  subStyle?: string;
  tags?: string[];
  initialMode?: ScriptGenMode;
  initialPrompt?: string;
  initialDurationSec?: 10 | 15 | number;
}>();

const emit = defineEmits<{
  close: [];
  'open-style': [];
  'open-character': [];
  'open-shot': [];
  /** 确认即关弹窗；AI 在后台跑，不阻塞本组件 */
  confirm: [
    payload: {
      mode: ScriptGenMode;
      prompt: string;
      model: string;
      styleLabel: string;
      styleBrief: string;
      characterLabel: string;
      characterBrief: string;
      shotLabel: string;
      shotBrief: string;
      shotId: string;
      category: string;
      subStyle: string;
      tags: string[];
      targetDurationSec: 10 | 15;
    },
  ];
}>();

const { modelsOf, ensureAiSettings } = useAiSettings();

const modes: Array<{ id: ScriptGenMode; label: string; icon: string }> = [
  { id: 'script', label: '剧本生成分镜脚本', icon: '≡' },
  { id: 'shot', label: '镜头生成分镜脚本', icon: '▶' },
  { id: 'character', label: '角色生成分镜脚本', icon: '☺' },
  { id: 'manual', label: '自己编写分镜脚本', icon: '✎' },
];

const durationOptions = [10, 15] as const;
const mode = ref<ScriptGenMode>('script');
const prompt = ref('');
const model = ref('');
const targetDurationSec = ref<10 | 15>(10);
const novelPickerOpen = ref(false);
const novelLabel = ref('');

const chatModels = computed(() => {
  const list = modelsOf('chat') || [];
  return list.length ? list : [{ value: '', label: '默认模型' }];
});

const categoryChip = computed(() => {
  const cat = String(props.category || '').trim();
  const sub =
    String(props.subStyle || '').trim() ||
    (props.tags || []).find((t) => {
      const s = String(t || '').trim();
      return s && s !== '画风' && s !== '动漫风';
    }) ||
    '';
  return [cat, sub].filter(Boolean).join(' · ');
});

const canSubmit = computed(
  () => !!prompt.value.trim() || !!String(props.shotId || '').trim(),
);

const placeholder = computed(() => {
  if (props.shotId || mode.value === 'shot') {
    return props.shotId
      ? '将调用镜头库细案扩写：定妆 + 场景 + 三关键帧 + 一条成片（选 10s/15s）；可再补充细节…'
      : '镜头概念会扩写成一条成片提示词（选 10s/15s）；可再补充细节…';
  }
  if (mode.value === 'character') return '描述角色处境与冲突，生成一条成片用的分镜脚本…';
  if (mode.value === 'manual') return '直接编写分镜描述（会合并进同一条成片提示词）…';
  return '描述剧情片段、故事，生成一条成片用的分镜脚本';
});

watch(
  () => props.open,
  async (v) => {
    if (!v) {
      novelPickerOpen.value = false;
      return;
    }
    await ensureAiSettings();
    mode.value =
      props.initialMode ||
      (props.shotLabel || props.shotId ? 'shot' : props.characterLabel ? 'character' : 'script');
    novelLabel.value = '';
    if (props.initialPrompt) prompt.value = props.initialPrompt;
    else if (props.shotBrief && !prompt.value) prompt.value = props.shotBrief;
    model.value = chatModels.value[0]?.value || '';
    const bootDur = Number(props.initialDurationSec) === 15 ? 15 : 10;
    targetDurationSec.value = bootDur;
  },
);

watch(
  () => props.initialMode,
  (m) => {
    if (m && props.open) mode.value = m;
  },
);

function onNovelPick(payload: NovelPickPayload) {
  const body = String(payload.body || '').trim();
  if (!body) {
    ElMessage.warning('该章节没有正文');
    return;
  }
  const truncated = body.length > NOVEL_BODY_MAX;
  const excerpt = truncated ? body.slice(0, NOVEL_BODY_MAX) : body;
  const order = payload.chapterOrder || '?';
  const chapTitle = String(payload.chapterTitle || '').trim() || `第${order}章`;
  novelLabel.value = `${payload.projectTitle} · ${chapTitle}`;
  novelPickerOpen.value = false;
  if (mode.value !== 'manual') mode.value = 'script';
  const dur = targetDurationSec.value;
  prompt.value = [
    `【小说节选】《${payload.projectTitle}》${chapTitle}`,
    excerpt,
    truncated
      ? `（正文较长，已截取前 ${NOVEL_BODY_MAX} 字；可再删改或补充关键冲突）`
      : '',
    `请根据以上小说节选，改编为约 ${dur} 秒的漫剧分镜脚本：保留主要人物与关键剧情节拍，适合一条成片。`,
  ]
    .filter(Boolean)
    .join('\n\n');
  ElMessage.success('已填入章节正文，可改写后生成');
}

function submit() {
  const body = prompt.value.trim();
  const shotId = String(props.shotId || '').trim();
  // 镜头库细案路径允许仅有 shotId（brief 已写入 prompt）
  if (!body && !shotId) return;
  const subStyle =
    String(props.subStyle || '').trim() ||
    (props.tags || []).find((t) => {
      const s = String(t || '').trim();
      return s && s !== '画风' && s !== '动漫风';
    }) ||
    '';
  emit('confirm', {
    mode: mode.value,
    prompt: body || props.shotBrief || props.shotLabel || '',
    model: model.value,
    styleLabel: props.styleLabel || '',
    styleBrief: props.styleBrief || '',
    characterLabel: props.characterLabel || '',
    characterBrief: props.characterBrief || '',
    shotLabel: props.shotLabel || '',
    shotBrief: props.shotBrief || '',
    shotId,
    category: String(props.category || '').trim(),
    subStyle: String(subStyle || '').trim(),
    tags: [...(props.tags || [])],
    targetDurationSec: targetDurationSec.value,
  });
  emit('close');
}

function close() {
  emit('close');
}
</script>

<style scoped>
.sg-mask {
  position: fixed;
  inset: 0;
  z-index: 95;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 20px;
}

.sg-stack {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sg-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow: hidden;
  color: var(--ink);
  box-shadow:
    0 2px 8px rgba(17, 24, 39, 0.05),
    0 18px 48px rgba(17, 24, 39, 0.14);
}

.sg-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
}

.sg-ico {
  opacity: 0.7;
  font-size: 14px;
}

.sg-head strong {
  flex: 1;
  font-size: 14px;
}

.x {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 20px;
  cursor: pointer;
}

.x:hover {
  background: var(--studio-panel-3);
  color: var(--ink);
}

.sg-hero {
  margin: 0 14px;
  height: 120px;
  border-radius: 12px;
  background: var(--bg-1);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
}

.doc-mark {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 72px;
}

.doc-mark i {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: var(--studio-panel-3);
}

.doc-mark i:nth-child(1) {
  width: 100%;
}
.doc-mark i:nth-child(2) {
  width: 78%;
}
.doc-mark i:nth-child(3) {
  width: 56%;
}

.sg-try {
  padding: 14px;
}

.try-label {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 8px;
}

.try-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: #d8d8e0;
  padding: 10px 8px;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
}

.try-row:hover,
.try-row.on {
  background: var(--studio-panel-3);
}

.try-ico {
  width: 22px;
  text-align: center;
  opacity: 0.75;
}

.sg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 14px 10px;
}

.sg-dur {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px 14px;
}

.dur-label {
  font-size: 12px;
  color: var(--muted);
}

.dur-opts {
  display: inline-flex;
  gap: 6px;
}

.dur-btn {
  min-width: 52px;
  border: 1px solid var(--line);
  background: var(--bg-1);
  color: var(--muted);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}

.dur-btn.on {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.15);
  color: #dbeafe;
}

.chip {
  border: 1px solid #3b82f6;
  background: rgba(59, 130, 246, 0.15);
  color: #dbeafe;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}

.chip.ghost {
  border-color: var(--studio-line-strong);
  background: var(--bg-1);
  color: var(--muted);
}

.chip.static {
  cursor: default;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sg-composer {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 12px 14px;
  box-shadow: var(--shadow);
}

.sg-composer textarea {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ink);
  resize: vertical;
  min-height: 88px;
  outline: none;
  font-size: 14px;
  line-height: 1.5;
  font-family: inherit;
}

.sg-composer textarea:disabled {
  opacity: 0.6;
}

.sg-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}

.model {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 12px;
}

.swirl {
  opacity: 0.7;
}

.model select {
  border: 0;
  background: transparent;
  color: var(--ink);
  outline: none;
  max-width: 160px;
}

.bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.busy {
  font-size: 12px;
  color: var(--muted);
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 999px;
  background: #f4f4f5;
  color: var(--studio-inset);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-btn:not(:disabled):hover {
  background: var(--studio-ink);
}
</style>
