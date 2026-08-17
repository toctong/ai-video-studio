<template>
  <div class="skills-page">
    <div class="skills-toolbar">
      <div class="filter-row">
        <button
          v-for="f in filters"
          :key="f.id"
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
          <input v-model="keyword" type="search" placeholder="搜索 Skill" />
        </label>
      </div>
    </div>

    <VirtualCardGrid
      class="skill-grid"
      v-loading="loading"
      :items="filtered"
      :min-column-width="280"
      :gap="16"
      :estimate-size="176"
      :show-done="false"
      :get-key="(s) => s.id"
    >
      <template #default="{ item: s }">
        <article class="skill-card text-only" @click="openDetail(s)">
          <div class="body">
            <strong>{{ s.name }}</strong>
            <span class="author">
              <UiIcon name="wand" :size="12" />
              {{ s.author }}
            </span>
            <p>{{ s.desc }}</p>
            <div class="foot">
              <span class="uses">
                <UiIcon name="zap" :size="12" />
                使用 {{ formatUses(s.uses ?? s.likes) }}
              </span>
              <button type="button" class="go" @click.stop="useAgent(s)">使用</button>
            </div>
          </div>
        </article>
      </template>
    </VirtualCardGrid>

    <div v-if="!loading && !filtered.length" class="empty-box">
      <strong>{{ emptyTitle }}</strong>
      <p>{{ emptyHint }}</p>
    </div>

    <el-dialog
      v-model="detailOpen"
      class="plaza-detail-dialog"
      width="560px"
      top="12vh"
      append-to-body
      destroy-on-close
      :show-close="true"
      :title="null"
      aria-label="Skill 详情"
    >
      <div v-if="detail" class="plaza-detail">
        <div class="detail-scroll">
          <div class="detail-cats">
            <span v-if="detail.slash" class="cat-pill">/{{ detail.slash }}</span>
            <span v-for="t in detail.tags || []" :key="t" class="cat-pill">{{ t }}</span>
          </div>
          <h2 class="detail-title">{{ detail.name }}</h2>
          <p v-if="detail.desc" class="detail-desc">{{ detail.desc }}</p>
          <div v-if="promptOf(detail)" class="prompt-block">
            <span class="prompt-label">提示词</span>
            <div class="prompt-box">
              <UiScroll class="prompt-scroll" :max-height="320" always>
                <div class="prompt-body md-body" v-html="promptHtml(detail)" />
              </UiScroll>
            </div>
          </div>
        </div>
        <div class="detail-footer">
          <span class="footer-hint">
            <UiIcon name="user" :size="12" />
            {{ detail.author }}
            · 使用 {{ formatUses(detail.uses ?? detail.likes) }}
          </span>
          <button type="button" class="cta-btn" @click="useFromDetail">使用</button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { fetchAgentsPlaza, type AgentPlazaItem } from '@/api/plaza';
import { reportHubResourceUse } from '@/api/skills';
import { renderMarkdown } from '@/utils/markdown';
import UiIcon from '@/components/icons/UiIcon.vue';
import VirtualCardGrid from '@/components/VirtualCardGrid.vue';
import { UiScroll } from '@/components/ui';
import { saveHomePlazaDraft } from '@/utils/home-plaza-draft';

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const filter = ref('all');
const keyword = ref('');
const filters = ref<{ id: string; label: string }[]>([]);
const items = ref<AgentPlazaItem[]>([]);
/** Hub 是否已返回可用广场数据（无本地回填） */
const hubReady = ref(false);
const detailOpen = ref(false);
const detail = ref<AgentPlazaItem | null>(null);

const scope = computed<'community' | 'mine'>(() =>
  route.meta.plazaScope === 'mine' || route.path.endsWith('/mine') ? 'mine' : 'community',
);

const emptyTitle = computed(() =>
  scope.value === 'mine' ? '暂无我的技能' : '暂无社区技能',
);
const emptyHint = computed(() =>
  scope.value === 'mine'
    ? 'Hub 个人 Skill 接口就绪后，收藏/发布的内容会出现在这里。'
    : '请先在设置中同步 AIGC 视频工厂 Hub；同步后将展示 Agent Skill（无需封面图）。',
);

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return items.value.filter((s) => {
    const vis = String(s.visibility || '').toLowerCase();
    if (scope.value === 'mine') {
      // Hub 未区分「我的」前保持空，避免把社区数据塞进来
      if (!hubReady.value || (vis !== 'private' && vis !== 'mine')) return false;
    } else if (vis === 'private' || vis === 'mine') {
      return false;
    }
    if (filter.value !== 'all') {
      const tagHit = (s.tags || []).some((t) => t === filter.value);
      if (!tagHit && s.category !== filter.value) return false;
    }
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q) ||
      (s.slash || '').toLowerCase().includes(q)
    );
  });
});

function formatUses(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function promptOf(s: AgentPlazaItem) {
  return String(s.prompt || s.desc || '').trim();
}

function promptHtml(s: AgentPlazaItem) {
  return renderMarkdown(promptOf(s)).html;
}

function openDetail(s: AgentPlazaItem) {
  detail.value = s;
  detailOpen.value = true;
}

function useAgent(s: AgentPlazaItem) {
  const prompt = promptOf(s) || s.name;
  saveHomePlazaDraft({
    skillId: s.id,
    name: s.name,
    desc: s.desc,
    prompt,
    mode: 'video',
    kind: 'agent',
    slash: s.slash,
  });
  void reportHubResourceUse(s.id, 'skill').then((r) => {
    if (r?.uses != null) s.uses = r.uses;
  });
  detailOpen.value = false;
  router.push('/home');
}

function useFromDetail() {
  if (!detail.value) return;
  useAgent(detail.value);
}

async function load() {
  loading.value = true;
  try {
    const payload = await fetchAgentsPlaza();
    hubReady.value =
      payload.source !== 'empty' &&
      (payload.items.length > 0 || Number(payload.version) > 0);
    items.value = payload.items;
    filters.value = payload.filters?.length
      ? payload.filters
      : payload.items.length
        ? [{ id: 'all', label: '全部' }]
        : [];
    if (filters.value.length && !filters.value.some((f) => f.id === 'all')) {
      filters.value = [{ id: 'all', label: '全部' }, ...filters.value];
    }
    filter.value = 'all';
  } catch (e: any) {
    items.value = [];
    hubReady.value = false;
    ElMessage.error(e?.message || '技能广场加载失败');
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.path,
  () => {
    keyword.value = '';
    detailOpen.value = false;
  },
);

onMounted(() => {
  void load();
});
</script>

<style scoped src="./plaza-shared.css"></style>
<style scoped>
.skill-card.text-only {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  grid-template-columns: unset;
  padding: 14px 14px 12px;
}
.skill-card.text-only .body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 0;
}
.skill-card.text-only .body p {
  flex: 0 0 auto;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  min-height: calc(12px * 1.45 * 2);
}
.go {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: var(--studio-glass-3);
  color: var(--studio-ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.go:hover {
  background: var(--studio-line-strong);
}
.empty-box {
  margin: 64px auto 0;
  max-width: 440px;
  text-align: center;
  color: var(--studio-faint);
}
.empty-box strong {
  display: block;
  color: var(--studio-muted);
  font-size: 15px;
  margin-bottom: 8px;
}
.empty-box p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.plaza-detail {
  display: flex;
  flex-direction: column;
  max-height: min(72vh, 640px);
  color: var(--studio-ink);
}
.detail-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 36px 16px 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.detail-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cat-pill {
  font-size: 12px;
  color: var(--studio-muted);
  background: var(--studio-glass-2);
  border-radius: 999px;
  padding: 2px 10px;
}
.detail-title {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  line-height: 1.25;
}
.detail-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--studio-muted);
  white-space: pre-wrap;
}
.prompt-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.prompt-label {
  font-size: 12px;
  color: var(--studio-faint);
}
.prompt-box {
  border-radius: 12px;
  background: var(--studio-glass);
  border: 1px solid var(--studio-glass-2);
  overflow: hidden;
}
.prompt-scroll {
  height: 100%;
}
.prompt-body {
  box-sizing: border-box;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--studio-text);
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
  overflow: auto;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--studio-glass-2);
}
.footer-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--studio-faint);
  min-width: 0;
}
.cta-btn {
  height: 36px;
  padding: 0 18px;
  border: 0;
  border-radius: 10px;
  background: var(--studio-ink);
  color: var(--studio-bg);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.cta-btn:hover {
  background: var(--studio-text);
}
</style>

<style>
.plaza-detail-dialog.el-dialog {
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-3);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
}
.plaza-detail-dialog .el-dialog__header {
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
.plaza-detail-dialog .el-dialog__title {
  display: none;
}
.plaza-detail-dialog .el-dialog__headerbtn {
  position: static;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
}
.plaza-detail-dialog .el-dialog__headerbtn:hover {
  background: var(--studio-glass-3);
}
.plaza-detail-dialog .el-dialog__headerbtn .el-dialog__close {
  color: var(--studio-ink);
  font-size: 16px;
}
.plaza-detail-dialog .el-dialog__body {
  padding: 20px 20px 18px;
  color: var(--studio-ink);
}
</style>
