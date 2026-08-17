<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  CharacterLibraryItem,
  LibraryKind,
  ScriptLibraryItem,
  StyleLibraryItem,
} from '@/libraries';
import { useLibrariesStore } from '@/stores/libraries';
import FilterTabs from '@/components/FilterTabs.vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    kind: LibraryKind;
    title?: string;
  }>(),
  {
    title: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  apply: [item: ScriptLibraryItem | StyleLibraryItem | CharacterLibraryItem];
}>();

const libraries = useLibrariesStore();
const category = ref('全部');
const keyword = ref('');

watch(
  () => [props.modelValue, props.kind] as const,
  ([open, kind]) => {
    category.value = '全部';
    keyword.value = '';
    if (open) void libraries.ensureKind(kind);
  },
);

const dialogTitle = computed(() => {
  if (props.title) return props.title;
  if (props.kind === 'script') return '灵感库';
  if (props.kind === 'style') return '风格库';
  return '角色库';
});

const rawItems = computed(
  () =>
    libraries.itemsOf(props.kind) as Array<
      ScriptLibraryItem | StyleLibraryItem | CharacterLibraryItem
    >,
);

const tabOptions = computed(() => {
  const cats = ['全部', ...libraries.categoriesOf(props.kind)];
  return cats.map((c) => ({
    value: c,
    label: c,
    count:
      c === '全部'
        ? rawItems.value.length
        : rawItems.value.filter((i) => i.category === c).length,
  }));
});

const items = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return rawItems.value.filter((item) => {
    if (category.value !== '全部' && item.category !== category.value) return false;
    if (!kw) return true;
    const hay = [item.label, item.blurb, item.category, ...(item.tags || [])]
      .join(' ')
      .toLowerCase();
    return hay.includes(kw);
  });
});

function close() {
  emit('update:modelValue', false);
}

function apply(item: ScriptLibraryItem | StyleLibraryItem | CharacterLibraryItem) {
  emit('apply', item);
  close();
}

function previewText(item: ScriptLibraryItem | StyleLibraryItem | CharacterLibraryItem) {
  if ('idea' in item) return item.idea;
  if ('styleBrief' in item) return item.styleBrief;
  return item.description;
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="920px"
    class="library-dialog"
    align-center
    append-to-body
    teleported
    destroy-on-close
    :z-index="3400"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="lib-shell">
      <header class="lib-toolbar">
        <label class="lib-search">
          <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path
              d="M12.5 12.5 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索名称、标签…"
            autocomplete="off"
          />
        </label>
        <FilterTabs v-model="category" :options="tabOptions" />
      </header>

      <div class="lib-grid">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="lib-card"
          @click="apply(item)"
        >
          <div class="lib-top">
            <span class="lib-cat">{{ item.category }}</span>
            <div v-if="item.tags?.length" class="lib-tags">
              <span v-for="t in item.tags.slice(0, 3)" :key="t">{{ t }}</span>
            </div>
          </div>

          <h3>{{ item.label }}</h3>
          <p class="blurb">{{ item.blurb }}</p>
          <p class="preview">{{ previewText(item) }}</p>

          <div class="lib-actions">
            <span class="apply-hint">选用这条</span>
            <span class="apply-btn">应用</span>
          </div>
        </button>
      </div>

      <el-empty v-if="!items.length" description="没有匹配的条目" :image-size="56" />
    </div>
  </el-dialog>
</template>

<style scoped>
.lib-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.lib-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.lib-search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: min(300px, 100%);
  height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--muted);
  transition:
    border-color 0.15s var(--ease),
    background 0.15s var(--ease),
    box-shadow 0.15s var(--ease);
}
.lib-search:focus-within {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
  color: var(--ink);
}
.lib-search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
}
.lib-search input::placeholder {
  color: var(--muted);
}
.lib-search input::-webkit-search-cancel-button {
  -webkit-appearance: none;
}

/* 分类：单行横滑，禁止换行挤成团 */
.lib-toolbar :deep(.filter-bar) {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  min-width: 0;
}
.lib-toolbar :deep(.tabs-wrap) {
  min-width: 0;
  flex: 1;
}
.lib-toolbar :deep(.filter-tabs) {
  gap: 6px;
}
.lib-toolbar :deep(.tab) {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 650;
  border: 1px solid transparent;
  background: var(--surface-2);
  color: var(--muted);
  flex: 0 0 auto;
  white-space: nowrap;
}
.lib-toolbar :deep(.tab.on) {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
  box-shadow: none;
}
.lib-toolbar :deep(.tab em) {
  margin-left: 5px;
  font-style: normal;
  opacity: 0.75;
  font-weight: 600;
}

.lib-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  max-height: min(56vh, 560px);
  overflow: auto;
  padding: 2px 6px 6px 2px;
  margin: 0 -2px;
  scrollbar-gutter: stable;
}

.lib-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
  gap: 0;
  min-height: 188px;
  padding: 16px 16px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition:
    border-color 0.15s var(--ease),
    background 0.15s var(--ease),
    box-shadow 0.15s var(--ease),
    transform 0.15s var(--ease);
}
.lib-card:hover {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--line));
  box-shadow: var(--shadow-hover);
  transform: translateY(-1px);
}
.lib-card:hover .apply-btn {
  background: var(--accent-2);
}
.lib-card:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-hover);
}

.lib-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.lib-cat {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--accent-soft);
  line-height: 1.25;
}
.lib-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}
.lib-tags span {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--line);
}

h3 {
  margin: 0 0 6px;
  font-size: 15.5px;
  font-weight: 720;
  letter-spacing: -0.02em;
  line-height: 1.3;
  color: var(--ink);
}

.blurb {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.preview {
  margin: 0 0 14px;
  padding: 0;
  border: none;
  background: transparent;
  flex: 1;
  font-size: 12.5px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--ink) 78%, var(--muted));
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lib-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  margin-top: auto;
}
.apply-hint {
  font-size: 12px;
  color: var(--muted);
}
.apply-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  min-width: 64px;
  padding: 0 14px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 13px;
  font-weight: 680;
  letter-spacing: 0.02em;
}

@media (max-width: 760px) {
  .lib-grid {
    grid-template-columns: 1fr;
    max-height: min(50vh, 480px);
  }
}
</style>

<style>
.library-dialog.el-dialog {
  max-width: calc(100vw - 40px);
  margin: 0 auto !important;
  border-radius: 16px !important;
  overflow: hidden;
}
.library-dialog .el-dialog__header {
  padding: 18px 22px 10px !important;
  margin-right: 0 !important;
}
.library-dialog .el-dialog__headerbtn {
  top: 16px !important;
  right: 16px !important;
  width: 32px;
  height: 32px;
}
.library-dialog .el-dialog__body {
  padding: 8px 22px 20px !important;
}
.library-dialog .el-dialog__title {
  font-size: 17px;
  font-weight: 720;
  letter-spacing: -0.02em;
  color: var(--ink);
}

/* 遮罩略深，避免底部输入栏抢焦点 */
.el-overlay:has(.library-dialog) {
  background-color: rgba(15, 23, 42, 0.48) !important;
}
</style>
