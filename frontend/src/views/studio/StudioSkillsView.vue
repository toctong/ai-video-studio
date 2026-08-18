<template>
  <div class="skills-page">
    <div class="skills-toolbar">
      <div class="filter-row">
        <div class="type-dd" :class="{ open: typeOpen }" @click.stop>
          <button
            type="button"
            class="type-dd-btn"
            :aria-expanded="typeOpen"
            aria-haspopup="listbox"
            aria-label="类型"
            @click="typeOpen = !typeOpen"
          >
            <span>{{ typeKindLabel }}</span>
            <UiIcon name="chevron-down" :size="14" class="type-dd-caret" />
          </button>
          <div v-if="typeOpen" class="type-dd-menu" role="listbox">
            <button
              v-for="opt in typeOptions"
              :key="opt.value"
              type="button"
              class="type-dd-item"
              :class="{ on: typeKind === opt.value }"
              role="option"
              :aria-selected="typeKind === opt.value"
              @click="pickType(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <button
          v-for="f in filters"
          :key="`${f.id}::${f.label}`"
          type="button"
          class="filter-pill"
          :class="{ on: filter === f.id }"
          @click="filter = f.id"
        >
          {{ f.label }}
        </button>
      </div>
      <div class="toolbar-end">
        <label class="search-pill">
          <UiIcon name="search" :size="15" />
          <input v-model="keyword" type="search" placeholder="搜索提示词" />
        </label>
      </div>
    </div>

    <VirtualCardGrid
      class="skill-grid"
      v-loading="loading"
      :items="filtered"
      :min-column-width="320"
      :gap="16"
      :estimate-size="148"
      :show-done="false"
      :get-key="(s) => s.id"
    >
      <template #default="{ item: s }">
        <article
          class="skill-card"
          @click="openDetail(s)"
        >
          <div class="cover" :style="coverStyle(s)">
            <LazyCoverImage v-if="coverOf(s)" :src="coverOf(s)" :alt="s.name" />
            <span
              v-if="modeLabel(s)"
              class="cover-type"
              :class="modeTone(s)"
            >{{ modeLabel(s) }}</span>
          </div>
          <div class="body">
            <strong>{{ s.name }}</strong>
            <span class="author">
              <UiIcon name="user" :size="12" />
              {{ s.author }}
            </span>
            <p>{{ s.desc }}</p>
            <div class="foot">
              <span class="uses">
                <UiIcon name="zap" :size="12" />
                使用 {{ formatUses(useCount(s)) }}
              </span>
              <div class="ops" @click.stop>
                <button
                  type="button"
                  class="fav"
                  :class="{ on: isFav(s.id) }"
                  title="收藏"
                  @click="toggleFav(s.id)"
                >
                  <UiIcon name="sparkles" :size="14" />
                </button>
                <button type="button" class="use-btn" @click="useSkill(s)">去使用</button>
              </div>
            </div>
          </div>
        </article>
      </template>
    </VirtualCardGrid>

    <p v-if="!loading && !filtered.length" class="empty">没有匹配的提示词</p>

    <el-dialog
      v-model="detailOpen"
      class="prompt-detail-dialog"
      width="1040px"
      top="4vh"
      append-to-body
      destroy-on-close
      :show-close="true"
      :title="null"
      aria-label="提示词详情"
    >
      <div v-if="detail" class="prompt-detail">
        <div class="detail-media" :style="coverStyle(detail)">
          <LazyCoverImage
            v-if="coverOf(detail)"
            :src="coverOf(detail)"
            :alt="detail.name"
          />
          <span
            v-if="modeLabel(detail)"
            class="cover-type lg"
            :class="modeTone(detail)"
          >{{ modeLabel(detail) }}</span>
        </div>

        <div class="detail-panel">
          <UiScroll class="detail-scroll" always>
            <div class="detail-cats">
              <span v-if="detail.official" class="cat-pill">官方</span>
              <span v-if="modeLabel(detail)" class="cat-pill">{{ modeLabel(detail) }}</span>
              <span
                v-for="t in subjectTags(detail)"
                :key="t"
                class="cat-pill"
              >{{ t }}</span>
            </div>

            <h2 class="detail-title">{{ detail.name }}</h2>
            <p v-if="detail.desc" class="detail-desc">{{ detail.desc }}</p>

            <div v-if="detailTags.length" class="detail-tags">
              <span v-for="t in detailTags" :key="t" class="tag-pill">{{ t }}</span>
            </div>

            <div class="detail-toolbar">
              <button
                type="button"
                class="outline-btn"
                :class="{ on: isFav(detail.id) }"
                @click="toggleFav(detail.id)"
              >
                <UiIcon name="sparkles" :size="15" />
                {{ isFav(detail.id) ? '已收藏' : '收藏' }}
              </button>
              <button type="button" class="outline-btn" @click="copyDetailPrompt">
                <UiIcon name="copy" :size="15" />
                复制提示词
              </button>
            </div>

            <div class="prompt-head">
              <span>提示词</span>
            </div>
            <div class="prompt-box">
              <UiScroll class="prompt-scroll" :max-height="420" always>
                <div class="prompt-body md-body" v-html="detailPromptHtml" />
              </UiScroll>
            </div>
          </UiScroll>

          <div class="detail-footer">
            <span class="footer-hint">
              <UiIcon name="user" :size="12" />
              {{ detail.author }}
              · 使用 {{ formatUses(useCount(detail)) }}
            </span>
            <button type="button" class="cta-btn" @click="useDetailSkill">去使用</button>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  fetchSkillPlaza,
  reportHubResourceUse,
  type PlazaFilterDto,
  type PlazaSkillDto,
} from '@/api/skills';
import type { SkillCategory } from '@/utils/skill-catalog';
import { libraryCoverByCategory } from '@/libraries/cover-images';
import {
  loadFavoriteIds,
  toggleFavoriteId,
} from '@/utils/my-prompts';
import { resolvePlazaGenMode, saveHomePlazaDraft } from '@/utils/home-plaza-draft';
import {
  resolvePromptPlazaFilters,
  skillMatchesPromptFilter,
  sanitizePromptTags,
} from '@/utils/prompt-plaza-filters';
import { copyText } from '@/utils/clipboard';
import { renderMarkdown } from '@/utils/markdown';
import UiIcon from '@/components/icons/UiIcon.vue';
import LazyCoverImage from '@/components/LazyCoverImage.vue';
import VirtualCardGrid from '@/components/VirtualCardGrid.vue';
import { UiScroll } from '@/components/ui';

const router = useRouter();
const loading = ref(true);
const filter = ref('all');
/** 类型：全部 / 图片 / 视频（与题材筛选项分开） */
const typeKind = ref<'all' | 'image' | 'video'>('all');
const typeOpen = ref(false);
const typeOptions = [
  { value: 'all' as const, label: '全部' },
  { value: 'image' as const, label: '图片' },
  { value: 'video' as const, label: '视频' },
];
const typeKindLabel = computed(
  () => typeOptions.find((o) => o.value === typeKind.value)?.label || '全部',
);

function pickType(v: 'all' | 'image' | 'video') {
  typeKind.value = v;
  typeOpen.value = false;
}

function onDocPointerDown(ev: PointerEvent) {
  if (!typeOpen.value) return;
  const el = ev.target as HTMLElement | null;
  if (el?.closest?.('.type-dd')) return;
  typeOpen.value = false;
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
});

const keyword = ref('');
const favIds = ref<string[]>(loadFavoriteIds());
/** 题材分类：全部 / 人像写真…（收藏在「我的提示词」） */
const filters = ref<PlazaFilterDto[]>([{ id: 'all', label: '全部' }]);
const plazaSkills = ref<PlazaSkillDto[]>([]);
const coverHintMap = ref<Record<string, string>>({});
const coverUrlMap = ref<Record<string, string>>({});
const detailOpen = ref(false);
const detail = ref<PlazaSkillDto | null>(null);

function isFav(id: string) {
  return favIds.value.includes(id);
}

function toggleFav(id: string) {
  favIds.value = toggleFavoriteId(id);
}

function promptOf(s: PlazaSkillDto) {
  return String(s.prompt || s.starter || s.desc || '').trim();
}

const detailPromptHtml = computed(() => {
  if (!detail.value) return '';
  const text = promptOf(detail.value) || '（暂无提示词正文）';
  return renderMarkdown(text).html;
});

function openDetail(s: PlazaSkillDto) {
  detail.value = s;
  detailOpen.value = true;
}

async function copyDetailPrompt() {
  if (!detail.value) return;
  const ok = await copyText(promptOf(detail.value));
  if (ok) ElMessage.success('已复制提示词');
  else ElMessage.error('复制失败');
}

/** 生成类型角标（开单用 mode，不当顶栏题材） */
function modeLabel(s: PlazaSkillDto) {
  if (s.mode === 'video' || s.category === 'video') return '视频';
  if (s.mode === 'image' || s.category === 'image') return '图片';
  return '';
}

function modeTone(s: PlazaSkillDto): 'video' | 'image' | '' {
  const label = modeLabel(s);
  if (label === '视频') return 'video';
  if (label === '图片') return 'image';
  return '';
}

function matchesType(s: PlazaSkillDto): boolean {
  if (typeKind.value === 'all') return true;
  const kind = resolvePlazaGenMode({
    mode: s.mode,
    category: s.category,
    tags: s.tags,
  });
  return kind === typeKind.value;
}

function subjectTags(s: PlazaSkillDto) {
  return sanitizePromptTags(s.tags).slice(0, 4);
}

function useCount(s: PlazaSkillDto) {
  const n = Number(s.uses);
  if (Number.isFinite(n) && n > 0) return n;
  return Number(s.likes) || 0;
}

const detailTags = computed(() => {
  const s = detail.value;
  if (!s) return [] as string[];
  return subjectTags(s).slice(0, 6);
});

function matchesFilter(s: PlazaSkillDto, f: string): boolean {
  return skillMatchesPromptFilter(s, f);
}

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  let list = plazaSkills.value.filter(
    (s) => matchesType(s) && matchesFilter(s, filter.value),
  );
  if (q) {
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.desc.toLowerCase().includes(q) ||
        s.author.toLowerCase().includes(q) ||
        (s.tags || []).some((t) => t.toLowerCase().includes(q)),
    );
  }
  return list;
});

function formatUses(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function coverCategory(s: PlazaSkillDto): string {
  if (coverHintMap.value[s.id]) return coverHintMap.value[s.id];
  const map: Record<SkillCategory, string> = {
    story: '都市',
    video: '运动',
    image: '日系',
    design: '赛博朋克',
    commerce: '写实',
  };
  return map[s.category] || '都市';
}

function coverKind(s: PlazaSkillDto): 'style' | 'shot' | 'character' | 'script' {
  if (s.category === 'video') return 'shot';
  if (s.category === 'image') return 'character';
  if (s.category === 'story') return 'script';
  return 'style';
}

function coverOf(s: PlazaSkillDto) {
  if (coverUrlMap.value[s.id]) return coverUrlMap.value[s.id];
  return libraryCoverByCategory(coverCategory(s), coverKind(s));
}

function coverStyle(s: PlazaSkillDto) {
  if (coverOf(s)) return {};
  const hues = [300, 220, 30, 160];
  const h = hues[(s.name.length || 0) % hues.length];
  return {
    background: `linear-gradient(135deg, hsla(${h},50%,42%,0.9), #1a1a1a)`,
  };
}

function useSkill(s: PlazaSkillDto, promptOverride?: string) {
  const mode = resolvePlazaGenMode({
    mode: s.mode,
    category: s.category,
    tags: s.tags,
  });
  const prompt = String(promptOverride ?? promptOf(s)).trim();
  saveHomePlazaDraft({
    skillId: s.id,
    name: s.name,
    desc: s.desc,
    prompt: prompt || s.name,
    mode,
  });
  // Hub 使用次数 +1（不阻塞跳转）
  void reportHubResourceUse(s.id, 'prompt').then((r) => {
    if (r?.uses != null) s.uses = r.uses;
  });
  detailOpen.value = false;
  router.push('/home');
}

function useDetailSkill() {
  if (!detail.value) return;
  useSkill(detail.value);
}

onMounted(async () => {
  loading.value = true;
  try {
    const payload = await fetchSkillPlaza();
    plazaSkills.value = payload.skills.map((s) => ({
      ...s,
      tags: sanitizePromptTags(s.tags),
    }));
    filters.value = resolvePromptPlazaFilters(payload.filters, plazaSkills.value);
    filter.value = 'all';
    const hints: Record<string, string> = {};
    const urls: Record<string, string> = {};
    for (const s of plazaSkills.value) {
      if (s.coverHint) hints[s.id] = s.coverHint;
      if (s.coverUrl) urls[s.id] = s.coverUrl;
    }
    coverHintMap.value = hints;
    coverUrlMap.value = urls;
  } catch (e: any) {
    ElMessage.error(e?.message || '提示词广场加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.skills-page {
  min-height: 100%;
  overflow: visible;
  padding: 16px 28px 48px;
  box-sizing: border-box;
  background: var(--studio-bg);
  color: var(--studio-ink);
}

.skills-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  align-items: center;
}

.type-dd {
  position: relative;
  flex-shrink: 0;
  z-index: 5;
}
.type-dd-btn {
  height: 32px;
  padding: 0 10px 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-ink);
  color: var(--studio-bg);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s ease, color 0.15s ease;
}
.type-dd-btn:hover {
  background: color-mix(in srgb, var(--studio-ink) 88%, var(--studio-bg));
}
.type-dd.open .type-dd-btn {
  background: var(--studio-ink);
}
.type-dd-caret {
  opacity: 0.55;
  transition: transform 0.15s ease;
}
.type-dd.open .type-dd-caret {
  transform: rotate(180deg);
}
.type-dd-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 112px;
  padding: 6px;
  border-radius: 12px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.type-dd-item {
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.type-dd-item:hover {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}
.type-dd-item.on {
  background: var(--studio-glass-3);
  color: var(--studio-ink);
  font-weight: 600;
}

.filter-pill {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s ease, color 0.15s ease;
}
.filter-pill:hover {
  color: var(--studio-ink);
  background: var(--studio-glass-2);
}
.filter-pill.on {
  background: var(--studio-ink);
  color: var(--studio-bg);
}
.filter-pill.more {
  color: var(--studio-faint);
}

.toolbar-end {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  min-width: 180px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--studio-panel);
  color: var(--studio-faint);
}
.search-pill input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.search-pill input::placeholder {
  color: var(--studio-faint);
}

.skill-grid {
  width: 100%;
}

.skill-card {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 14px;
  padding: 12px;
  border-radius: 16px;
  background: var(--studio-panel);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.skill-card:hover {
  background: var(--studio-panel);
  transform: translateY(-1px);
}

.cover {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--studio-panel-2);
  flex-shrink: 0;
}
.cover :deep(.lazy-cover) {
  width: 100%;
  height: 100%;
}
.cover-type {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 650;
  font-style: normal;
  line-height: 22px;
  letter-spacing: 0.02em;
  color: #fff;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(8px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.cover-type.image {
  background: rgba(14, 116, 144, 0.88);
}
.cover-type.video {
  background: rgba(124, 58, 237, 0.88);
}
.cover-type.lg {
  top: 14px;
  left: 14px;
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
  line-height: 26px;
  border-radius: 8px;
}

.body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 2px;
}
.body strong {
  font-size: 15px;
  font-weight: 650;
  line-height: 1.3;
}
.author {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--studio-faint);
}
.body p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--studio-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.foot {
  margin-top: auto;
  padding-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.uses {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--studio-faint);
}
.ops {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.fav {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.fav:hover,
.fav.on {
  color: #f472b6;
}
.use-btn {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: var(--studio-glass-3);
  color: var(--studio-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}
.use-btn:hover {
  background: var(--studio-line-strong);
}
.use-btn.primary {
  height: 34px;
  padding: 0 16px;
  background: var(--studio-ink);
  color: var(--studio-bg);
}
.use-btn.primary:hover {
  background: var(--studio-text);
}

.empty {
  margin: 48px 0 0;
  text-align: center;
  color: var(--studio-muted);
  font-size: 13px;
}

.prompt-detail {
  display: grid;
  grid-template-columns: minmax(320px, 1.05fr) minmax(360px, 0.95fr);
  gap: 0;
  min-height: min(78vh, 720px);
  max-height: min(86vh, 820px);
}

.detail-media {
  position: relative;
  min-height: 100%;
  border-radius: 14px 0 0 14px;
  overflow: hidden;
  background: var(--studio-panel);
}
.detail-media :deep(.lazy-cover) {
  width: 100%;
  height: 100%;
  min-height: min(78vh, 720px);
}
.detail-media :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 4px 4px 22px;
  box-sizing: border-box;
}
.detail-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding-right: 8px;
}
.detail-scroll :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat-pill {
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--studio-line-strong);
  color: var(--studio-text);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
  text-transform: uppercase;
}

.detail-title {
  margin: 4px 0 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: #fff;
}
.detail-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--studio-muted);
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-pill {
  height: 26px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--studio-panel-2);
  color: var(--studio-text);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
}

.detail-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}
.outline-btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--studio-line-strong);
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.outline-btn:hover {
  background: var(--studio-glass-2);
  border-color: var(--studio-line-bright);
}
.outline-btn.on {
  color: #f472b6;
  border-color: rgba(244, 114, 182, 0.45);
  background: rgba(244, 114, 182, 0.08);
}

.prompt-head {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--studio-text);
}

.prompt-box {
  position: relative;
  flex: 1;
  min-height: 180px;
  border-radius: 12px;
  background: var(--studio-inset);
  border: 1px solid var(--studio-glass-2);
  overflow: hidden;
}
.prompt-scroll {
  height: 100%;
}
.prompt-body {
  box-sizing: border-box;
  padding: 14px 16px;
  color: var(--studio-text);
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
}
.prompt-body :deep(h1),
.prompt-body :deep(h2),
.prompt-body :deep(h3),
.prompt-body :deep(h4) {
  margin: 0.85em 0 0.35em;
  font-weight: 650;
  line-height: 1.3;
  color: var(--studio-ink);
}
.prompt-body :deep(h1) { font-size: 1.25em; }
.prompt-body :deep(h2) { font-size: 1.12em; }
.prompt-body :deep(h3),
.prompt-body :deep(h4) { font-size: 1.05em; }
.prompt-body :deep(p) {
  margin: 0.45em 0;
}
.prompt-body :deep(ul),
.prompt-body :deep(ol) {
  margin: 0.45em 0;
  padding-left: 1.35em;
}
.prompt-body :deep(li) {
  margin: 0.2em 0;
}
.prompt-body :deep(strong) {
  color: var(--studio-ink);
  font-weight: 650;
}
.prompt-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--studio-glass-2);
}
.prompt-body :deep(pre) {
  margin: 0.55em 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  overflow: visible;
}
.prompt-body :deep(pre code) {
  padding: 0;
  background: transparent;
}
.prompt-body :deep(blockquote) {
  margin: 0.55em 0;
  padding: 0.2em 0 0.2em 0.9em;
  border-left: 3px solid var(--studio-line-strong);
  color: var(--studio-muted);
}
.prompt-body :deep(a) {
  color: #93c5fd;
}
.prompt-body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--studio-glass-3);
  margin: 0.85em 0;
}
.prompt-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.55em 0;
  font-size: 12px;
}
.prompt-body :deep(th),
.prompt-body :deep(td) {
  border: 1px solid var(--studio-glass-3);
  padding: 6px 8px;
  text-align: left;
}

.detail-footer {
  flex-shrink: 0;
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.footer-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(212, 175, 55, 0.35);
  color: #d4af37;
  font-size: 12px;
}
.cta-btn {
  width: 100%;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: #14b8a6;
  color: #042f2e;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.15s ease, background 0.15s ease;
}
.cta-btn:hover {
  filter: brightness(1.06);
}

@media (max-width: 720px) {
  .skill-card {
    grid-template-columns: 96px 1fr;
  }
  .cover {
    width: 96px;
    height: 96px;
  }
  .prompt-detail {
    grid-template-columns: 1fr;
    max-height: none;
    min-height: 0;
  }
  .detail-media {
    border-radius: 14px 14px 0 0;
    aspect-ratio: 4 / 5;
    max-height: 320px;
  }
  .detail-media :deep(.lazy-cover) {
    min-height: 0;
    height: 100%;
  }
  .detail-panel {
    padding: 16px 4px 4px;
  }
  .detail-title {
    font-size: 22px;
  }
}
</style>

<style>
.prompt-detail-dialog.el-dialog {
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-2);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
}
.prompt-detail-dialog .el-dialog__header {
  margin: 0 !important;
  padding: 0 !important;
  padding-bottom: 0 !important;
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 2;
  width: auto;
  border: 0 !important;
  border-bottom: 0 !important;
}
.prompt-detail-dialog .el-dialog__title {
  display: none;
}
.prompt-detail-dialog .el-dialog__headerbtn {
  position: static;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
}
.prompt-detail-dialog .el-dialog__headerbtn .el-dialog__close {
  color: var(--studio-ink);
  font-size: 16px;
}
.prompt-detail-dialog .el-dialog__body {
  padding: 14px;
  color: var(--studio-ink);
}
</style>
