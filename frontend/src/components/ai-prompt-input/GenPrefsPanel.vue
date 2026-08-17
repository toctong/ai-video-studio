<script setup lang="ts">
import { computed } from 'vue';
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_QUALITY_OPTIONS,
  type PromptGenPrefs,
  type PromptMediaKind,
  type PromptPrefOption,
} from './prefs';

const props = withDefaults(
  defineProps<{
    modelValue: PromptGenPrefs;
    kinds?: PromptMediaKind[];
    models?: PromptPrefOption[];
    videoModels?: PromptPrefOption[];
    qualities?: PromptPrefOption[];
    showAspect?: boolean;
    showQuality?: boolean;
    showKinds?: boolean;
    showModel?: boolean;
    showCount?: boolean;
    keepAuto?: boolean;
    /** 与 AiPromptInput tone 一致；home 时下拉 Teleport 后仍用暗色 */
    tone?: 'default' | 'home';
  }>(),
  {
    kinds: () => ['image'] as PromptMediaKind[],
    models: () => [],
    videoModels: () => [],
    qualities: () => [],
    showAspect: true,
    showQuality: true,
    showKinds: false,
    showModel: false,
    showCount: false,
    keepAuto: false,
    tone: 'default',
  },
);

const selectPopperClass = computed(() =>
  props.tone === 'home'
    ? 'ai-prompt-pref-select ai-prompt-pref-select--home'
    : 'ai-prompt-pref-select',
);

const emit = defineEmits<{
  'update:modelValue': [value: PromptGenPrefs];
}>();

function patch(partial: Partial<PromptGenPrefs>) {
  emit('update:modelValue', { ...props.modelValue, ...partial });
}

const activeModels = computed(() =>
  props.modelValue.mediaKind === 'video' && props.videoModels.length
    ? props.videoModels
    : props.models,
);

const qualityOptions = computed(() =>
  props.qualities.length ? props.qualities : DEFAULT_QUALITY_OPTIONS,
);

const showKinds = computed(() => props.showKinds && props.kinds.length > 1);
const showHead = computed(() => showKinds.value || props.showModel);
/** 「其他设置」仅在有模型下拉时用并排下拉；纯清晰度走下方按钮轨 */
const showOther = computed(() => props.showModel && activeModels.value.length > 0);

const ratioOptions = computed(() => [
  { value: 'auto', label: '智能', w: 14, h: 14, smart: true as const },
  ...ASPECT_RATIO_OPTIONS.map((r) => ({ ...r, smart: false as const })),
]);

function isRatioOn(value: string) {
  if (value === 'auto') {
    return props.modelValue.auto || props.modelValue.aspectRatio === 'auto';
  }
  if (props.modelValue.auto || props.modelValue.aspectRatio === 'auto') return false;
  return props.modelValue.aspectRatio === value;
}

function pickRatio(value: string) {
  if (value === 'auto') {
    patch({ aspectRatio: 'auto', auto: true });
    return;
  }
  if (props.keepAuto) {
    patch({ aspectRatio: value });
    return;
  }
  patch({ aspectRatio: value, auto: false });
}
</script>

<template>
  <div class="gen-prefs">
    <div v-if="showHead" class="prefs-head">
      <span class="prefs-title">生成偏好</span>
      <label class="auto-switch">
        <span>自动</span>
        <el-switch
          :model-value="modelValue.auto"
          size="small"
          @update:model-value="
            (v: string | number | boolean) =>
              patch(v ? { auto: true, aspectRatio: 'auto' } : { auto: false })
          "
        />
      </label>
    </div>

    <div v-if="showKinds" class="kind-track">
      <button
        v-for="k in kinds"
        :key="k"
        type="button"
        class="kind-tab"
        :class="{ on: modelValue.mediaKind === k }"
        @click="patch({ mediaKind: k, auto: false })"
      >
        {{ k === 'image' ? '图片' : '视频' }}
      </button>
    </div>

    <template v-if="showAspect">
      <div class="sec-label">选择比例</div>
      <div class="ratio-track">
        <button
          v-for="r in ratioOptions"
          :key="r.value"
          type="button"
          class="ratio-item"
          :class="{ on: isRatioOn(r.value) }"
          @click="pickRatio(r.value)"
        >
          <span v-if="r.smart" class="ratio-smart" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none">
              <path
                d="M2.5 5.5V3.5a1 1 0 0 1 1-1h2M13.5 5.5V3.5a1 1 0 0 0-1-1h-2M2.5 10.5v2a1 1 0 0 0 1 1h2M13.5 10.5v2a1 1 0 0 1-1 1h-2"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span
            v-else
            class="ratio-frame"
            :style="{ width: `${r.w}px`, height: `${r.h}px` }"
          />
          <span class="ratio-label">{{ r.label }}</span>
        </button>
      </div>
    </template>

    <template v-if="showOther">
      <div class="sec-label">其他设置</div>
      <div class="other-row" :class="{ dual: showQuality }">
        <el-select
          :model-value="modelValue.model || activeModels[0]?.value"
          class="pref-select pref-select-model"
          placeholder="模型"
          placement="bottom-start"
          teleported
          :fit-input-width="false"
          :popper-options="{ modifiers: [{ name: 'offset', options: { offset: [0, 6] } }] }"
          :popper-class="`${selectPopperClass} ai-prompt-pref-select--model`"
          @update:model-value="(v: string) => patch({ model: v, auto: false })"
        >
          <template #prefix>
            <span class="sel-ico" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1.6 13.2 4.5v7L8 14.4 2.8 11.5v-7L8 1.6Z"
                  stroke="currentColor"
                  stroke-width="1.35"
                  stroke-linejoin="round"
                />
                <path
                  d="M8 8.2V14.4M8 8.2 2.8 5.3M8 8.2l5.2-2.9"
                  stroke="currentColor"
                  stroke-width="1.35"
                  stroke-linecap="round"
                />
              </svg>
            </span>
          </template>
          <el-option
            v-for="m in activeModels"
            :key="m.value"
            :label="m.label"
            :value="m.value"
          >
            <div class="opt-row">
              <span class="opt-ico" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1.6 13.2 4.5v7L8 14.4 2.8 11.5v-7L8 1.6Z"
                    stroke="currentColor"
                    stroke-width="1.35"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M8 8.2V14.4M8 8.2 2.8 5.3M8 8.2l5.2-2.9"
                    stroke="currentColor"
                    stroke-width="1.35"
                    stroke-linecap="round"
                  />
                </svg>
              </span>
              <span class="opt-label">{{ m.label }}</span>
              <span v-if="m.badge" class="opt-badge">{{ m.badge }}</span>
            </div>
          </el-option>
        </el-select>

        <el-select
          v-if="showQuality"
          :model-value="modelValue.quality"
          class="pref-select pref-select-quality"
          placeholder="清晰度"
          placement="bottom-end"
          teleported
          :fit-input-width="true"
          :popper-options="{ modifiers: [{ name: 'offset', options: { offset: [0, 6] } }] }"
          :popper-class="`${selectPopperClass} ai-prompt-pref-select--compact`"
          @update:model-value="
            (v: string) => patch({ quality: v, auto: keepAuto ? modelValue.auto : false })
          "
        >
          <template #prefix>
            <span class="sel-ico hd" aria-hidden="true">
              <svg viewBox="0 0 20 14" fill="none">
                <rect
                  x="0.75"
                  y="0.75"
                  width="18.5"
                  height="12.5"
                  rx="2.5"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
                <text
                  x="10"
                  y="10"
                  text-anchor="middle"
                  fill="currentColor"
                  font-size="7.5"
                  font-weight="800"
                  font-family="system-ui, sans-serif"
                >
                  HD
                </text>
              </svg>
            </span>
          </template>
          <el-option
            v-for="q in qualityOptions"
            :key="q.value"
            :label="q.label"
            :value="q.value"
          >
            <div class="opt-row">
              <span class="opt-ico hd" aria-hidden="true">
                <svg viewBox="0 0 20 14" fill="none">
                  <rect
                    x="0.75"
                    y="0.75"
                    width="18.5"
                    height="12.5"
                    rx="2.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                  />
                  <text
                    x="10"
                    y="10"
                    text-anchor="middle"
                    fill="currentColor"
                    font-size="7.5"
                    font-weight="800"
                    font-family="system-ui, sans-serif"
                  >
                    HD
                  </text>
                </svg>
              </span>
              <span class="opt-label">{{ q.label }}</span>
            </div>
          </el-option>
        </el-select>
      </div>
    </template>

    <template v-else-if="showQuality">
      <div class="sec-label">选择清晰度</div>
      <div class="quality-track">
        <button
          v-for="q in qualityOptions"
          :key="q.value"
          type="button"
          class="quality-item"
          :class="{ on: modelValue.quality === q.value }"
          @click="patch({ quality: q.value, auto: keepAuto ? modelValue.auto : false })"
        >
          {{ q.label }}
          <span class="spark" aria-hidden="true">✦</span>
        </button>
      </div>
    </template>

    <template v-if="showCount">
      <div class="sec-label">选择生成数量</div>
      <div class="count-track">
        <button
          v-for="n in [1, 2, 3, 4]"
          :key="n"
          type="button"
          class="count-item"
          :class="{ on: (modelValue.count || 1) === n }"
          @click="patch({ count: n, auto: keepAuto ? modelValue.auto : false })"
        >
          {{ n }}
        </button>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.gen-prefs {
  width: 100%;
  max-width: 360px;
  box-sizing: border-box;
  padding: 4px 4px 8px;
  color: var(--ink);
}

.prefs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.prefs-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.auto-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}

.kind-track {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  padding: 3px;
  margin-bottom: 14px;
  border-radius: 999px;
  background: var(--surface-2);
}

.kind-tab {
  height: 34px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s var(--ease, ease), color 0.15s var(--ease, ease);
}

.kind-tab.on {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

.sec-label {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 8px;
}

.ratio-track,
.count-track,
.quality-track {
  display: flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: var(--surface-2);
}

.ratio-item {
  flex: 1 1 0;
  min-width: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  color: var(--muted);
  font-family: inherit;
  padding: 8px 1px 6px;
  min-height: 50px;
  transition: background 0.15s var(--ease, ease), color 0.15s var(--ease, ease);
}

.ratio-item:hover {
  color: var(--ink);
}

.ratio-item.on {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}

.ratio-frame {
  display: block;
  border: 1.5px solid currentColor;
  border-radius: 2px;
  opacity: 0.9;
}

.ratio-smart {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;

  svg {
    width: 16px;
    height: 16px;
    display: block;
  }
}

.ratio-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.other-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 2px;

  &.dual {
    grid-template-columns: minmax(0, 1.55fr) minmax(96px, 0.72fr);
  }
}

.pref-select-model,
.pref-select-quality {
  position: relative;
  z-index: 2;
}

.pref-select {
  width: 100%;
  min-width: 0;
}

.sel-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--muted);
  flex: 0 0 auto;

  svg {
    width: 16px;
    height: 16px;
    display: block;
  }

  &.hd svg {
    width: 18px;
    height: 13px;
  }
}

.quality-item,
.count-item {
  flex: 1 1 0;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.quality-item.on,
.count-item.on {
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.quality-item .spark {
  color: var(--accent);
  font-size: 11px;
}
</style>

<style lang="scss">
.gen-prefs .pref-select .el-select__wrapper {
  min-height: 42px !important;
  border-radius: 10px !important;
  background: var(--surface-2) !important;
  box-shadow: none !important;
  border: 1px solid transparent !important;
  padding: 6px 12px !important;
  gap: 8px;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.gen-prefs .pref-select .el-select__wrapper:hover {
  border-color: var(--line) !important;
}
.gen-prefs .pref-select .el-select__wrapper.is-focused {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line)) !important;
  box-shadow: 0 0 0 3px var(--accent-ring) !important;
}
.gen-prefs .pref-select .el-select__selection {
  min-width: 0;
}
.gen-prefs .pref-select .el-select__selected-item {
  font-size: 13px !important;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gen-prefs .pref-select .el-select__placeholder {
  font-size: 13px;
  font-weight: 500;
}
.gen-prefs .pref-select .el-select__prefix {
  color: var(--muted);
  margin-right: 2px;
}
.gen-prefs .pref-select .el-select__caret {
  color: var(--muted);
}
.gen-prefs .pref-select-quality .el-select__selected-item {
  font-variant-numeric: tabular-nums;
}

[data-theme='dark'] .gen-prefs .pref-select .el-select__wrapper {
  background: rgba(255, 255, 255, 0.08) !important;
}

.ai-prompt-home-popper .gen-prefs .pref-select .el-select__wrapper {
  background: var(--studio-glass-2) !important;
  color: var(--studio-ink);
}
.ai-prompt-home-popper .gen-prefs .pref-select .el-select__selected-item,
.ai-prompt-home-popper .gen-prefs .pref-select .el-select__placeholder {
  color: var(--studio-ink) !important;
}
.ai-prompt-home-popper .gen-prefs .prefs-title,
.ai-prompt-home-popper .gen-prefs .kind-tab.on {
  color: var(--studio-ink);
}
.ai-prompt-home-popper .gen-prefs .kind-tab.on {
  background: var(--studio-glass-3);
  box-shadow: none;
}
.ai-prompt-home-popper .gen-prefs .ratio-item.on,
.ai-prompt-home-popper .gen-prefs .quality-item.on,
.ai-prompt-home-popper .gen-prefs .count-item.on {
  background: var(--studio-glass-3);
  box-shadow: none;
  color: var(--studio-ink);
}

.ai-prompt-pref-select.el-select__popper,
.ai-prompt-pref-select.el-popper {
  --ai-pop-bg: var(--bg-elevated, var(--surface));
  background: var(--ai-pop-bg) !important;
  border: 1px solid var(--line) !important;
  border-radius: 12px !important;
  box-shadow: var(--shadow) !important;
  overflow: hidden;
  padding: 4px !important;
  min-width: 280px !important;
  max-width: min(420px, calc(100vw - 24px)) !important;
}
/* 模型列表：按文案撑开，不要锁成触发器半宽导致省略号 */
.ai-prompt-pref-select--model.el-select__popper,
.ai-prompt-pref-select--model.el-popper {
  min-width: min(360px, calc(100vw - 32px)) !important;
  width: max-content !important;
  max-width: min(420px, calc(100vw - 24px)) !important;
}
.ai-prompt-pref-select--model .el-select-dropdown__item {
  padding-right: 12px !important;
}
.ai-prompt-pref-select--model .opt-row {
  width: auto;
  min-width: 280px;
}
.ai-prompt-pref-select--model .opt-label {
  flex: 0 1 auto;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}
/* 抹平 EP 内层 dropdown：全局样式会再给它描边/阴影，形成「弹框里套卡片」 */
.ai-prompt-pref-select .el-select-dropdown,
.ai-prompt-pref-select.el-popper .el-select-dropdown,
.ai-prompt-pref-select .el-scrollbar,
.ai-prompt-pref-select .el-select-dropdown__wrap,
.ai-prompt-pref-select .el-select-dropdown__list {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
}
/* 分辨率下拉：贴合触发宽度，别撑成大卡片 */
.ai-prompt-pref-select--compact.el-select__popper,
.ai-prompt-pref-select--compact.el-popper {
  min-width: 0 !important;
  max-width: 140px !important;
  width: max-content !important;
  padding: 4px !important;
  border-radius: 10px !important;
}
.ai-prompt-pref-select--compact .el-select-dropdown__item {
  min-height: 34px !important;
  padding: 6px 10px !important;
  margin: 1px 0;
}
.ai-prompt-pref-select--compact .opt-row {
  gap: 6px;
}
.ai-prompt-pref-select--compact .opt-label {
  font-size: 12.5px;
}
.ai-prompt-pref-select--compact .opt-ico.hd {
  width: 14px;
  height: 14px;
}
.ai-prompt-pref-select--compact .opt-ico.hd svg {
  width: 16px;
  height: 11px;
}
.ai-prompt-pref-select .el-select-dropdown__item {
  height: auto !important;
  min-height: 40px;
  padding: 10px 12px !important;
  border-radius: 8px;
  margin: 1px 0;
  color: var(--ink);
  font-weight: 550;
  line-height: 1.35;
}
.ai-prompt-pref-select .el-select-dropdown__item.is-hovering,
.ai-prompt-pref-select .el-select-dropdown__item:hover {
  background: var(--surface-2) !important;
}
.ai-prompt-pref-select .el-select-dropdown__item.is-selected {
  color: var(--accent) !important;
  font-weight: 650;
  background: color-mix(in srgb, var(--accent) 10%, transparent) !important;
}
.ai-prompt-pref-select .opt-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 100%;
}
.ai-prompt-pref-select .opt-ico {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: var(--muted);
  display: grid;
  place-items: center;
}
.ai-prompt-pref-select .opt-ico svg {
  width: 16px;
  height: 16px;
  display: block;
}
.ai-prompt-pref-select .opt-ico.hd svg {
  width: 18px;
  height: 13px;
}
.ai-prompt-pref-select .opt-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13.5px;
  white-space: nowrap;
}
.ai-prompt-pref-select:not(.ai-prompt-pref-select--model) .opt-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.ai-prompt-pref-select .opt-badge {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  line-height: 1.2;
}
.ai-prompt-pref-select .el-select-dropdown__item.is-selected .opt-ico {
  color: var(--accent);
}

/* 首页 / 生成页：单层实心菜单 */
.ai-prompt-pref-select--home.el-select__popper,
.ai-prompt-pref-select--home.el-popper {
  --ai-pop-bg: var(--studio-panel);
  --bg-elevated: var(--studio-panel);
  --surface: var(--studio-panel);
  --surface-2: var(--studio-panel-3);
  --ink: var(--studio-ink);
  --muted: var(--studio-text-soft);
  --line: var(--studio-line-strong);
  --accent: #7dd3e8;
  --accent-soft: rgba(77, 175, 201, 0.16);
  --el-bg-color-overlay: var(--studio-panel);
  --el-bg-color: var(--studio-panel);
  --el-fill-color-blank: var(--studio-panel);
  --el-text-color-regular: var(--studio-ink);
  --el-fill-color-light: var(--studio-panel-3);
  --el-border-color-light: transparent;
  z-index: 4100 !important;
  background: var(--studio-panel) !important;
  background-color: var(--studio-panel) !important;
  border: 1px solid var(--studio-line-strong) !important;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55) !important;
  color: var(--studio-ink) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  opacity: 1 !important;
}
.ai-prompt-pref-select--home .el-select-dropdown,
.ai-prompt-pref-select--home.el-popper .el-select-dropdown,
.ai-prompt-pref-select--home .el-scrollbar,
.ai-prompt-pref-select--home .el-select-dropdown__wrap,
.ai-prompt-pref-select--home .el-select-dropdown__list {
  background: transparent !important;
  background-color: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}
.ai-prompt-pref-select--home .el-popper__arrow {
  display: none !important;
}
.ai-prompt-pref-select--home .el-select-dropdown__item {
  color: var(--studio-text-strong) !important;
}
.ai-prompt-pref-select--home .el-select-dropdown__item.is-hovering,
.ai-prompt-pref-select--home .el-select-dropdown__item:hover {
  background: var(--studio-panel-3) !important;
  color: var(--studio-ink) !important;
}
.ai-prompt-pref-select--home .el-select-dropdown__item.is-selected {
  color: #7dd3e8 !important;
  background: rgba(77, 175, 201, 0.16) !important;
}
.ai-prompt-pref-select--home .opt-ico {
  color: var(--studio-text-faint);
}
.ai-prompt-pref-select--home .el-select-dropdown__item.is-selected .opt-ico {
  color: #7dd3e8;
}
.ai-prompt-pref-select--home .opt-badge {
  background: rgba(77, 175, 201, 0.18);
  color: #7dd3e8;
}
</style>
