<script setup lang="ts">
import { computed } from 'vue';
import {
  BOOK_SCALE_PRESETS,
  clampBookScale,
  formatBookScaleLabel,
  matchBookScalePreset,
  type BookScale,
} from '@/utils/book-scale';

const props = defineProps<{
  modelValue: BookScale;
  /** 紧凑模式：用于底部工具条上方 */
  compact?: boolean;
  /** 嵌入抽屉/面板：去边框，由外层提供标题 */
  embedded?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: BookScale];
}>();

const scale = computed({
  get: () => clampBookScale(props.modelValue),
  set: (v) => emit('update:modelValue', clampBookScale(v)),
});

const activePreset = computed(() => matchBookScalePreset(scale.value));

const summary = computed(() => formatBookScaleLabel(scale.value));

function pickPreset(id: string) {
  const p = BOOK_SCALE_PRESETS.find((x) => x.id === id);
  if (!p) return;
  scale.value = { wordsWan: p.wordsWan, volumes: p.volumes };
}

function onWords(e: Event) {
  const n = Number((e.target as HTMLInputElement).value);
  scale.value = { ...scale.value, wordsWan: n };
}

function onVolumes(e: Event) {
  const n = Number((e.target as HTMLInputElement).value);
  scale.value = { ...scale.value, volumes: n };
}
</script>

<template>
  <div class="book-scale" :class="{ compact, embedded }">
    <div v-if="!embedded" class="scale-head">
      <strong>成书篇幅</strong>
      <span>{{ summary }}</span>
    </div>
    <p v-else class="scale-summary">{{ summary }}</p>
    <div class="scale-presets" role="listbox" aria-label="篇幅预设">
      <button
        v-for="p in BOOK_SCALE_PRESETS"
        :key="p.id"
        type="button"
        class="preset"
        :class="{ on: activePreset === p.id }"
        role="option"
        :aria-selected="activePreset === p.id"
        @click="pickPreset(p.id)"
      >
        {{ p.label }}
      </button>
    </div>
    <div class="scale-custom">
      <label>
        <span>总字数</span>
        <input
          type="number"
          min="30"
          max="500"
          step="10"
          :value="scale.wordsWan"
          @change="onWords"
          @blur="onWords"
        />
        <em>万字</em>
      </label>
      <label>
        <span>卷数</span>
        <input
          type="number"
          min="3"
          max="20"
          step="1"
          :value="scale.volumes"
          @change="onVolumes"
          @blur="onVolumes"
        />
        <em>卷</em>
      </label>
    </div>
  </div>
</template>

<style scoped>
.book-scale {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
}
.book-scale.compact {
  padding: 10px 12px;
  gap: 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 92%, var(--surface-2));
}
.book-scale.embedded {
  padding: 0;
  gap: 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.scale-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}
.scale-head strong {
  font-size: 13px;
  font-weight: 720;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.scale-head span,
.scale-summary {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}
.scale-head span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scale-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset {
  height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition:
    border-color 0.15s var(--ease),
    background 0.15s var(--ease),
    color 0.15s var(--ease);
}
.preset:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  color: var(--ink);
}
.preset.on {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
}

.scale-custom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg-0) 55%, var(--surface-2));
}
.scale-custom label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--muted);
}
.scale-custom label span {
  flex-shrink: 0;
  font-weight: 650;
  color: var(--ink);
}
.scale-custom input {
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  text-align: center;
}
.scale-custom input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.scale-custom em {
  flex-shrink: 0;
  font-style: normal;
  color: var(--muted);
}
.book-scale.compact .scale-custom {
  padding: 8px;
  gap: 8px;
}
.book-scale.compact .scale-custom input {
  height: 32px;
}
</style>
