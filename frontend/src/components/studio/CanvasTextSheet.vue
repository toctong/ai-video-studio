<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="ctsElRef"
      class="cts"
      :class="{ anchored: !!anchorStyle }"
      :style="anchorStyle || undefined"
      @mousedown.stop
    >
      <div class="cts-top">
        <div class="cts-refs">
          <button type="button" class="ref-slot" title="添加参考图" @click="emit('pick-asset')">
            <UiIcon name="image" :size="18" />
          </button>
          <div
            v-for="r in refs"
            :key="r.id"
            class="ref-chip"
            :class="{ img: r.kind === 'image' && r.url }"
            :data-ref-chip="r.id"
            :title="r.label"
          >
            <img v-if="r.kind === 'image' && r.url" class="chip-img" :src="r.url" alt="" />
            <span v-else class="chip-t">T</span>
            <span class="chip-lab">{{ r.label }}</span>
            <button
              type="button"
              class="chip-x"
              title="移除连线"
              @click.stop="emit('remove-ref', r.id)"
            >
              ×
            </button>
          </div>
        </div>
        <button type="button" class="expand" title="展开编辑" @click="emit('edit')">
          <UiIcon name="maximize" :size="14" />
        </button>
      </div>

      <div class="cts-input-wrap">
        <textarea
          class="cts-input"
          rows="3"
          :value="prompt"
          :placeholder="showTypewriter ? '' : modePlaceholder"
          @input="onPrompt"
        />
        <div v-if="showTypewriter" class="cts-typewriter" aria-hidden="true">
          {{ typedHint }}<span class="caret" />
        </div>
      </div>

      <div class="cts-bar">
        <div class="prompt-modes" role="tablist" aria-label="提示词类型">
          <button
            v-for="m in STUDIO_TEXT_PROMPT_MODES"
            :key="m.id"
            type="button"
            class="prompt-mode"
            :class="{ on: m.id === effectiveMode }"
            role="tab"
            :aria-selected="m.id === effectiveMode"
            @click="pickMode(m.id)"
          >
            {{ m.label }}
          </button>
        </div>

        <div class="model-wrap">
          <button
            type="button"
            class="model-trigger"
            :class="{ open: modelOpen }"
            @click.stop="modelOpen = !modelOpen"
          >
            <span>{{ currentModelLabel }}</span>
            <UiIcon name="chevron-down" :size="12" />
          </button>
          <div v-if="modelOpen" class="model-menu" @mousedown.stop>
            <button
              v-for="m in menuModels"
              :key="m.value"
              type="button"
              class="model-row"
              :class="{ on: m.value === effectiveModel, locked: m.locked }"
              :disabled="m.locked"
              @click="pickModel(m)"
            >
              <UiIcon v-if="m.locked" name="lock" :size="13" class="lock" />
              <span class="lab">{{ m.label }}</span>
              <span v-if="m.value === effectiveModel && !m.locked" class="check">✓</span>
            </button>
          </div>
        </div>

        <span class="gap" />
        <button
          type="button"
          class="send"
          :disabled="running || !prompt.trim()"
          title="生成出图提示词"
          @click="emit('run')"
        >
          <UiIcon name="arrow-up" :size="18" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import {
  STUDIO_TEXT_PROMPT_MODES,
  studioTextPromptModeMeta,
  type StudioTextPromptMode,
} from '@/utils/studio-text-prompt';

type ModelOpt = { value: string; label: string; locked?: boolean };

export type TextSheetRef = {
  id: string;
  label: string;
  url?: string;
  kind?: 'text' | 'image';
};

const props = defineProps<{
  open: boolean;
  prompt: string;
  model: string;
  /** 提示词模式：人物 / 场景 / 关键帧 / 通用 */
  mode?: StudioTextPromptMode;
  running?: boolean;
  modelOptions: Array<{ value: string; label: string }>;
  /** 上游已连入的节点（如文本1 → 当前），展示为 chip */
  refs?: TextSheetRef[];
  /** 贴在节点底部的屏幕坐标 */
  anchor?: { left: number; top: number } | null;
}>();

const emit = defineEmits<{
  'update:prompt': [value: string];
  'update:model': [value: string];
  'update:mode': [value: StudioTextPromptMode];
  run: [];
  edit: [];
  'pick-asset': [];
  'remove-ref': [nodeId: string];
  layout: [];
}>();

const refs = computed(() => props.refs || []);
const ctsElRef = ref<HTMLElement | null>(null);
let sheetResizeObs: ResizeObserver | null = null;

const modelOpen = ref(false);
const typedHint = ref('');
const hintIndex = ref(0);
let typeTimer: ReturnType<typeof setTimeout> | null = null;

const effectiveMode = computed<StudioTextPromptMode>(() => props.mode || 'general');
const modePlaceholder = computed(() => studioTextPromptModeMeta(effectiveMode.value).placeholder);

const placeholderHints = computed(() => [
  '试试说「一个穿红衣的少年站在天台」随时为你开启下一轮对话',
  modePlaceholder.value,
]);

const showTypewriter = computed(() => props.open && !String(props.prompt || '').trim());

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

function clearTypeTimer() {
  if (typeTimer != null) {
    clearTimeout(typeTimer);
    typeTimer = null;
  }
}

function runTypewriter() {
  clearTypeTimer();
  if (!showTypewriter.value) {
    typedHint.value = '';
    return;
  }
  const hints = placeholderHints.value;
  if (!hints.length) return;
  const full = hints[hintIndex.value % hints.length] || '';
  let i = 0;
  typedHint.value = '';

  const tick = () => {
    if (!showTypewriter.value) return;
    if (i <= full.length) {
      typedHint.value = full.slice(0, i);
      i += 1;
      typeTimer = setTimeout(tick, i === 1 ? 420 : 42);
      return;
    }
    typeTimer = setTimeout(() => {
      if (!showTypewriter.value) return;
      hintIndex.value = (hintIndex.value + 1) % hints.length;
      runTypewriter();
    }, 2200);
  };
  tick();
}

function pickMode(id: StudioTextPromptMode) {
  emit('update:mode', id);
}

const menuModels = computed((): ModelOpt[] => {
  const list = (props.modelOptions || []).map((m) => {
    const label = String(m.label || m.value);
    const locked = /会员|专享|vip/i.test(label) || /会员|专享|vip/i.test(m.value);
    return { value: m.value, label, locked };
  });
  if (!list.length) return [{ value: '', label: '默认模型' }];
  // 保证有「默认」项
  if (!list.some((m) => !m.value)) {
    return [{ value: '', label: '默认模型' }, ...list];
  }
  return list;
});

const effectiveModel = computed(() => props.model || '');

const currentModelLabel = computed(() => {
  const hit = menuModels.value.find((m) => m.value === effectiveModel.value);
  return hit?.label || '默认模型';
});

watch(
  () => props.open,
  (v) => {
    if (!v) modelOpen.value = false;
  },
);

watch(
  [showTypewriter, placeholderHints, () => props.open],
  () => {
    hintIndex.value = 0;
    runTypewriter();
  },
  { immediate: true },
);

watch(
  () => [props.open, ctsElRef.value] as const,
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

function onPrompt(ev: Event) {
  emit('update:prompt', (ev.target as HTMLTextAreaElement).value);
}

function pickModel(m: ModelOpt) {
  if (m.locked) return;
  emit('update:model', m.value);
  modelOpen.value = false;
}

function onDocDown(e: MouseEvent) {
  if (!modelOpen.value) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('.model-wrap')) return;
  modelOpen.value = false;
}

defineExpose({
  getSheetRect: () => ctsElRef.value?.getBoundingClientRect() ?? null,
});

onMounted(() => window.addEventListener('mousedown', onDocDown));
onUnmounted(() => {
  window.removeEventListener('mousedown', onDocDown);
  clearTypeTimer();
  sheetResizeObs?.disconnect();
  sheetResizeObs = null;
});
</script>

<style scoped>
.cts {
  position: fixed;
  left: 50%;
  bottom: 88px;
  transform: translateX(-50%);
  z-index: 58;
  width: min(680px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 14px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--studio-panel) 97%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  color: var(--studio-text);
  backdrop-filter: blur(16px);
}
.cts.anchored {
  left: auto;
  bottom: auto;
  transform: none;
}
.cts-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.cts-refs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.ref-slot {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px dashed var(--studio-line-strong);
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.ref-slot:hover {
  border-color: var(--studio-text-faint);
  color: #fff;
}
.ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  height: 32px;
  padding: 0 8px 0 6px;
  border-radius: 999px;
  background: var(--studio-glass-3);
  border: 1px solid var(--studio-line-strong);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}
.chip-t {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--studio-line-strong);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}
.ref-chip.img {
  padding-left: 4px;
  height: 36px;
}
.chip-img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--studio-inset);
}
.chip-lab {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-x {
  width: 16px;
  height: 16px;
  margin-left: 2px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-faint);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.chip-x:hover {
  color: #fff;
  background: var(--studio-glass-3);
}
.expand {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}
.expand:hover {
  background: var(--studio-glass-2);
  color: #fff;
}
.cts-input-wrap {
  position: relative;
  width: 100%;
}
.cts-typewriter {
  position: absolute;
  inset: 0;
  padding: 2px 2px;
  pointer-events: none;
  color: var(--studio-text-faint);
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.cts-typewriter .caret {
  display: inline-block;
  width: 1.5px;
  height: 1em;
  margin-left: 1px;
  vertical-align: -0.12em;
  background: var(--studio-text-soft);
  animation: cts-caret 1s steps(1) infinite;
}
@keyframes cts-caret {
  50% {
    opacity: 0;
  }
}
.cts-input {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  resize: none;
  background: transparent;
  color: #fff;
  caret-color: #fff;
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  outline: none;
  min-height: 64px;
  max-height: 140px;
  padding: 0 2px;
  overflow: auto;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
  /* 覆盖 UA / Element Plus 默认白底 */
  -webkit-appearance: none;
  appearance: none;
  field-sizing: content;
}
.cts-input::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
  background: transparent;
}
.cts-input::placeholder {
  color: var(--studio-line-bright);
}
.cts-input:focus {
  outline: none;
  background: transparent;
  color: #fff;
}
.cts-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.prompt-modes {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-glass);
  flex-shrink: 0;
}
.prompt-mode {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.prompt-mode:hover {
  color: var(--studio-text-strong);
}
.prompt-mode.on {
  background: var(--studio-line-strong);
  color: #fff;
}
.model-wrap {
  position: relative;
}
.model-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-glass-2);
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  max-width: 200px;
}
.model-trigger span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-trigger:hover,
.model-trigger.open {
  border-color: var(--studio-line-bright);
  background: var(--studio-glass-3);
  color: #fff;
}
.model-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 5;
  min-width: 220px;
  max-width: min(320px, 70vw);
  max-height: 280px;
  overflow: auto;
  padding: 6px;
  border-radius: 14px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.model-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--studio-text);
  text-align: left;
  padding: 9px 10px;
  border-radius: 10px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.model-row:hover:not(:disabled) {
  background: var(--studio-glass-2);
}
.model-row.on {
  background: var(--studio-glass-2);
}
.model-row.locked {
  color: var(--studio-text-faint);
  cursor: not-allowed;
}
.model-row .lock {
  flex-shrink: 0;
  color: var(--studio-line-bright);
}
.model-row .lab {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-row .check {
  flex-shrink: 0;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.gap {
  flex: 1;
}
.send {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-ink);
  color: var(--studio-inset);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.send:not(:disabled):hover {
  background: #f0f0f0;
}
</style>
