<script setup lang="ts">
/**
 * Always-visible ChoicePicker — chips or detail cards (dialog overflow safe).
 */
import { computed, ref, type PropType } from 'vue';
import { useDynamicComponent } from 'a2ui-vue';
import { takeCardFresh } from './card-motion';
import { UiScroll } from '@/components/ui';

type ChoiceOpt = {
  label: string;
  value: string;
  description?: string;
  mark?: string;
  badge?: string;
  tone?: 'ai' | 'local';
};

const props = defineProps({
  surfaceId: { type: String, required: true },
  component: { type: Object as PropType<Record<string, unknown>>, required: true },
  weight: { type: [Number, String], default: undefined },
  options: { type: Array as PropType<ChoiceOpt[]>, default: () => [] },
  value: { type: null as unknown as PropType<unknown>, default: undefined },
  label: { type: String, default: undefined },
  description: { type: String, default: undefined },
  filterable: { type: Boolean, default: false },
  variant: { type: String, default: undefined },
  displayStyle: { type: String, default: 'chips' },
});

const { bound } = useDynamicComponent({
  surfaceId: props.surfaceId,
  component: props.component as any,
  weight: props.weight ?? '',
});

const filter = ref('');
/** 本实例内保持 fresh class，避免重绘打断入场动画 */
const localFresh = new Set<string>();

const multi = computed(() => bound.value.variant === 'multipleSelection');
const groupLabel = computed(
  () => bound.value.label ?? bound.value.description ?? props.description ?? props.label ?? '',
);
const allOptions = computed<ChoiceOpt[]>(() => {
  const raw = bound.value.options ?? props.options ?? [];
  return Array.isArray(raw) ? (raw as ChoiceOpt[]) : [];
});
const selected = computed<string[]>(() => {
  const raw = bound.value.value;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (raw == null || raw === '') return [];
  return [String(raw)];
});
const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return allOptions.value;
  return allOptions.value.filter((o) => {
    const hay = [o.label, o.description, o.value, o.badge].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
});
const asCards = computed(() => {
  const style = String(bound.value.displayStyle ?? props.displayStyle ?? 'chips');
  if (style === 'cards') return true;
  if (style === 'chips') return false;
  return allOptions.value.some((o) => !!o.description);
});
const showFilter = computed(
  () => !!(bound.value.filterable ?? props.filterable) || allOptions.value.length > 12,
);
const invalid = computed(() => bound.value.isValid === false);
const errorText = computed(() => {
  const errs = bound.value.validationErrors;
  return Array.isArray(errs) && errs.length ? String(errs[0]) : '';
});

function isSelected(v: string) {
  return selected.value.includes(v);
}

function isSkeleton(opt: ChoiceOpt) {
  const v = String(opt.value || '');
  return v.startsWith('_loading_') || v.startsWith('_empty_');
}

function isFresh(opt: ChoiceOpt) {
  if (isSkeleton(opt)) return false;
  const v = String(opt.value);
  if (localFresh.has(v)) return true;
  if (!takeCardFresh(v)) return false;
  localFresh.add(v);
  return true;
}

function optMark(opt: ChoiceOpt) {
  if (isSkeleton(opt)) return '·';
  return String(opt.mark || opt.label || '').slice(0, 1) || '·';
}

function optTone(opt: ChoiceOpt): 'ai' | 'local' | 'neutral' {
  if (opt.tone === 'ai' || opt.tone === 'local') return opt.tone;
  const badge = String(opt.badge || '');
  if (/AI|扩/i.test(badge)) return 'ai';
  if (/本地/i.test(badge)) return 'local';
  const v = String(opt.value || '');
  if (v.startsWith('ai-')) return 'ai';
  if (v.includes('_loading_') && /_x|_y|_ai/.test(v)) return 'ai';
  // 未标注来源时保持中性，避免 Agent 表单等被误标成「本地」
  return 'neutral';
}

function optBadge(opt: ChoiceOpt) {
  if (opt.badge) return opt.badge;
  // 未显式传 badge 时不臆造「本地/AI」（Agent 表单等纯 AI 选项会误标本地）
  return '';
}

function toggle(v: string) {
  if (v.startsWith('_loading_') || v.startsWith('_empty_')) return;
  const setValue = bound.value.setValue;
  if (typeof setValue !== 'function') return;
  if (multi.value) {
    if (isSelected(v)) setValue(selected.value.filter((x) => x !== v));
    else setValue([...selected.value, v]);
  } else {
    setValue([v]);
  }
}
</script>

<template>
  <section class="choice-picker" :class="{ invalid, cards: asCards }">
    <label v-if="groupLabel" class="choice-label">{{ groupLabel }}</label>
    <div v-if="showFilter" class="choice-filter-wrap">
      <svg class="choice-search-ico" viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8" />
        <path d="M16.2 16.2 20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <input
        v-model="filter"
        type="search"
        class="choice-filter"
        :placeholder="asCards ? '搜索…' : '搜索题材…'"
        aria-label="筛选选项"
      />
    </div>
    <UiScroll
      class="choice-scroll"
      always
      :max-height="asCards ? 'min(68vh, 720px)' : 'min(320px, 42vh)'"
    >
    <div
      class="choice-list"
      :class="asCards ? 'choice-grid' : 'choice-chips'"
      role="listbox"
      :aria-multiselectable="multi"
      :aria-invalid="invalid"
    >
      <button
        v-for="(opt, idx) in filtered"
        :key="opt.value"
        type="button"
        :class="[
          asCards ? 'choice-card' : 'chip',
          `tone-${optTone(opt)}`,
          {
            selected: !isSkeleton(opt) && isSelected(String(opt.value)),
            skeleton: isSkeleton(opt),
            fresh: isFresh(opt),
          },
        ]"
        :style="asCards ? { animationDelay: `${Math.min(idx, 7) * 55}ms` } : undefined"
        role="option"
        :aria-selected="!isSkeleton(opt) && isSelected(String(opt.value))"
        :aria-busy="isSkeleton(opt) || undefined"
        :disabled="isSkeleton(opt)"
        @click="toggle(String(opt.value))"
      >
        <template v-if="asCards">
          <span v-if="optBadge(opt)" class="choice-badge">{{ optBadge(opt) }}</span>
          <span class="choice-mark" aria-hidden="true">{{ optMark(opt) }}</span>
          <span class="choice-copy">
            <strong>{{ opt.label }}</strong>
            <em>{{ opt.description || '点击选择' }}</em>
          </span>
        </template>
        <span v-else class="chip-text">
          <span v-if="optBadge(opt)" class="chip-badge">{{ optBadge(opt) }}</span>
          {{ opt.label }}
        </span>
      </button>
      <span v-if="!filtered.length" class="choice-empty">无匹配选项</span>
    </div>
    </UiScroll>
    <p v-if="errorText" class="choice-error" role="alert">{{ errorText }}</p>
  </section>
</template>

<style scoped>
.choice-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.choice-label {
  font-size: 13px;
  font-weight: 650;
  color: var(--muted);
  letter-spacing: 0.01em;
}
.choice-filter-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.choice-search-ico {
  position: absolute;
  left: 12px;
  color: var(--muted);
  pointer-events: none;
}
.choice-filter {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 14px 11px 36px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, transparent);
  background: color-mix(in srgb, var(--bg-0) 70%, var(--surface));
  font: inherit;
  font-size: 14px;
  color: var(--ink);
  transition:
    border-color 0.15s var(--ease, ease),
    box-shadow 0.15s var(--ease, ease),
    background 0.15s var(--ease, ease);
}
.choice-filter::placeholder {
  color: color-mix(in srgb, var(--muted) 80%, transparent);
}
.choice-filter:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.choice-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px 0;
}
.chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  height: 34px;
  max-width: 100%;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--bg-0) 85%, var(--surface));
  color: color-mix(in srgb, var(--ink) 88%, var(--muted));
  font: inherit;
  font-size: 13px;
  line-height: 1.2;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  transition:
    border-color 0.15s var(--ease, ease),
    background 0.15s var(--ease, ease),
    color 0.15s var(--ease, ease),
    transform 0.15s var(--ease, ease);
}
.chip:hover {
  background: var(--surface);
  border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
  color: var(--ink);
  transform: translateY(-1px);
}
.chip.selected {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: var(--accent-soft);
  color: var(--accent-2);
  font-weight: 650;
}
.chip.tone-local {
  background: color-mix(in srgb, #0f766e 8%, var(--surface));
  border-color: color-mix(in srgb, #0f766e 18%, var(--line));
}
.chip.tone-ai {
  background: color-mix(in srgb, #c2410c 9%, var(--surface));
  border-color: color-mix(in srgb, #c2410c 20%, var(--line));
}
.chip.tone-local.selected {
  background: color-mix(in srgb, #0f766e 16%, var(--surface));
  border-color: color-mix(in srgb, #0f766e 45%, transparent);
  color: #0f766e;
}
.chip.tone-ai.selected {
  background: color-mix(in srgb, #c2410c 16%, var(--surface));
  border-color: color-mix(in srgb, #c2410c 45%, transparent);
  color: #c2410c;
}
.chip-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.chip-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.02em;
  padding: 1px 5px;
  border-radius: 999px;
  line-height: 1.3;
}
.chip.tone-local .chip-badge {
  color: #0f766e;
  background: color-mix(in srgb, #0f766e 14%, transparent);
}
.chip.tone-ai .chip-badge {
  color: #c2410c;
  background: color-mix(in srgb, #c2410c 14%, transparent);
}

.choice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
  gap: 12px;
  padding: 4px 2px 8px;
  align-items: stretch;
}
@media (min-width: 1100px) {
  .choice-grid {
    grid-template-columns: repeat(auto-fill, minmax(188px, 1fr));
  }
}
@media (min-width: 1400px) {
  .choice-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}
@media (max-width: 520px) {
  .choice-grid {
    grid-template-columns: 1fr;
  }
}
.choice-card {
  position: relative;
  display: flex;
  gap: 11px;
  align-items: flex-start;
  text-align: left;
  height: 100%;
  min-height: 104px;
  width: 100%;
  box-sizing: border-box;
  padding: 14px 12px 12px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  background: var(--surface);
  cursor: pointer;
  font: inherit;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--ink) 4%, transparent);
  transition:
    border-color 0.16s var(--ease, ease),
    background 0.16s var(--ease, ease),
    box-shadow 0.16s var(--ease, ease),
    transform 0.16s var(--ease, ease);
}
.choice-card.tone-local {
  background:
    linear-gradient(165deg, color-mix(in srgb, #0f766e 9%, var(--surface)) 0%, var(--surface) 58%);
  border-color: color-mix(in srgb, #0f766e 20%, var(--line));
}
.choice-card.tone-ai {
  background:
    linear-gradient(165deg, color-mix(in srgb, #c2410c 10%, var(--surface)) 0%, var(--surface) 58%);
  border-color: color-mix(in srgb, #c2410c 22%, var(--line));
}
.choice-card.tone-local:hover:not(:disabled):not(.skeleton) {
  border-color: color-mix(in srgb, #0f766e 40%, var(--line));
  box-shadow: 0 6px 18px color-mix(in srgb, #0f766e 10%, transparent);
  transform: translateY(-1px);
}
.choice-card.tone-ai:hover:not(:disabled):not(.skeleton) {
  border-color: color-mix(in srgb, #c2410c 40%, var(--line));
  box-shadow: 0 6px 18px color-mix(in srgb, #c2410c 10%, transparent);
  transform: translateY(-1px);
}
.choice-card.fresh {
  animation: card-gen-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.choice-card.selected {
  box-shadow: none;
}
.choice-card.tone-local.selected {
  border-color: color-mix(in srgb, #0f766e 58%, transparent);
  background: color-mix(in srgb, #0f766e 12%, var(--surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #0f766e 18%, transparent);
}
.choice-card.tone-ai.selected {
  border-color: color-mix(in srgb, #c2410c 58%, transparent);
  background: color-mix(in srgb, #c2410c 12%, var(--surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #c2410c 18%, transparent);
}
.choice-card.skeleton {
  cursor: wait;
  pointer-events: none;
  border-color: transparent;
  box-shadow: none;
  background: linear-gradient(
    110deg,
    color-mix(in srgb, var(--bg-0) 78%, var(--surface)) 30%,
    color-mix(in srgb, var(--accent-soft) 55%, var(--surface)) 45%,
    color-mix(in srgb, var(--bg-0) 78%, var(--surface)) 60%
  );
  background-size: 200% 100%;
  animation: card-shimmer 1.35s ease-in-out infinite;
}
.choice-card.tone-ai.skeleton {
  background: linear-gradient(
    110deg,
    color-mix(in srgb, #c2410c 7%, var(--surface)) 28%,
    color-mix(in srgb, #fb923c 18%, var(--surface)) 48%,
    color-mix(in srgb, #c2410c 7%, var(--surface)) 68%
  );
  background-size: 200% 100%;
  border-color: color-mix(in srgb, #c2410c 14%, transparent);
}
.choice-card.tone-local.skeleton {
  background: linear-gradient(
    110deg,
    color-mix(in srgb, #0f766e 7%, var(--surface)) 28%,
    color-mix(in srgb, #5eead4 16%, var(--surface)) 48%,
    color-mix(in srgb, #0f766e 7%, var(--surface)) 68%
  );
  background-size: 200% 100%;
  border-color: color-mix(in srgb, #0f766e 14%, transparent);
}
.choice-card.skeleton .choice-mark {
  color: transparent;
  background: color-mix(in srgb, var(--line) 50%, var(--surface));
}
.choice-card.skeleton .choice-copy strong,
.choice-card.skeleton .choice-copy em {
  color: transparent;
  border-radius: 6px;
  background: color-mix(in srgb, var(--line) 38%, transparent);
}
.choice-card.skeleton .choice-copy strong {
  display: inline-block;
  min-width: 4.5em;
  height: 1em;
}
.choice-card.skeleton .choice-copy em {
  display: block;
  height: 2.2em;
  margin-top: 2px;
}
.choice-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.06em;
  padding: 3px 7px;
  border-radius: 999px;
  line-height: 1.2;
}
.choice-card.tone-local .choice-badge {
  color: #0f766e;
  background: color-mix(in srgb, #0f766e 12%, var(--surface));
}
.choice-card.tone-ai .choice-badge {
  color: #c2410c;
  background: color-mix(in srgb, #c2410c 12%, var(--surface));
}
.choice-card.skeleton .choice-badge {
  opacity: 0.72;
}
@keyframes card-gen-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes card-shimmer {
  0% {
    background-position: 120% 0;
  }
  100% {
    background-position: -40% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .choice-card.fresh,
  .choice-card.skeleton {
    animation: none;
  }
}
.choice-mark {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 1px;
  font-size: 13px;
  font-weight: 800;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent-soft) 70%, var(--surface));
}
.choice-card.tone-local .choice-mark {
  color: #0f766e;
  background: color-mix(in srgb, #0f766e 12%, var(--surface));
}
.choice-card.tone-ai .choice-mark {
  color: #c2410c;
  background: color-mix(in srgb, #c2410c 12%, var(--surface));
}
.choice-card.selected .choice-mark {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}
.choice-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-self: stretch;
  padding-right: 36px;
  padding-top: 1px;
}
.choice-copy strong {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.4;
  letter-spacing: 0.01em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: calc(1.4em * 2);
}
.choice-card.selected .choice-copy strong {
  color: var(--accent-2);
}
.choice-card.tone-local.selected .choice-copy strong {
  color: #0f766e;
}
.choice-card.tone-ai.selected .choice-copy strong {
  color: #9a3412;
}
.choice-copy em {
  font-style: normal;
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--muted) 92%, var(--ink));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: calc(1.5em * 2);
}

.choice-empty {
  font-size: 13px;
  color: var(--muted);
  padding: 8px 2px;
  grid-column: 1 / -1;
}
.choice-error {
  margin: 0;
  font-size: 12.5px;
  color: var(--danger, #dc2626);
}
.choice-picker.invalid .choice-filter {
  border-color: color-mix(in srgb, var(--danger, #dc2626) 40%, var(--line));
}
</style>
