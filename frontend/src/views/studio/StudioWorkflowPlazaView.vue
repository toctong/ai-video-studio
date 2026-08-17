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
          <input v-model="keyword" type="search" placeholder="搜索工作流" />
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
      :get-key="(card) => card.id"
    >
      <template #default="{ item: card }">
        <article
          class="skill-card text-only"
          :class="{ busy: creatingId === card.id }"
          @click="openDetail(card)"
        >
          <div class="body">
            <strong>{{ card.name }}</strong>
            <span class="author">
              <UiIcon name="workflow" :size="12" />
              {{ card.author }}
              <em v-if="categoryLabel(card)" class="cat-tag">{{ categoryLabel(card) }}</em>
            </span>
            <p>{{ card.desc }}</p>
            <div class="foot">
              <span class="uses">
                <UiIcon name="zap" :size="12" />
                {{ creatingId === card.id ? '创建中…' : `使用 ${formatUses(card.uses ?? card.likes)}` }}
              </span>
              <button type="button" class="go" @click.stop="useWorkflow(card)">
                {{ creatingId === card.id ? '创建中…' : '使用' }}
              </button>
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
      aria-label="工作流详情"
    >
      <div v-if="detail" class="plaza-detail">
        <div class="detail-scroll">
          <div class="detail-cats">
            <span v-if="categoryLabel(detail)" class="cat-pill">{{ categoryLabel(detail) }}</span>
            <span
              v-for="t in (detail.tags || []).filter((x) => x !== 'image' && x !== 'video')"
              :key="t"
              class="cat-pill"
            >{{ t }}</span>
          </div>
          <h2 class="detail-title">{{ detail.name }}</h2>
          <p v-if="detail.desc" class="detail-desc">{{ detail.desc }}</p>
          <p class="graph-hint">{{ graphSummary(detail) }}</p>
        </div>
        <div class="detail-footer">
          <span class="footer-hint">
            <UiIcon name="user" :size="12" />
            {{ detail.author }}
            · 使用 {{ formatUses(detail.uses ?? detail.likes) }}
          </span>
          <button
            type="button"
            class="cta-btn"
            :disabled="creatingId === detail.id"
            @click="useFromDetail"
          >
            {{ creatingId === detail.id ? '创建中…' : '使用' }}
          </button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { updateWorkflow } from '@/api/workflows';
import { fetchWorkflowsPlaza, type WorkflowPlazaItem } from '@/api/plaza';
import { reportHubResourceUse } from '@/api/skills';
import { ensureCompiledProduction } from '@/utils/compile-production';
import UiIcon from '@/components/icons/UiIcon.vue';
import VirtualCardGrid from '@/components/VirtualCardGrid.vue';

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const filter = ref('all');
const keyword = ref('');
const filters = ref<{ id: string; label: string }[]>([]);
const items = ref<WorkflowPlazaItem[]>([]);
const creatingId = ref('');
const hubReady = ref(false);
const detailOpen = ref(false);
const detail = ref<WorkflowPlazaItem | null>(null);

const scope = computed<'community' | 'mine'>(() =>
  route.meta.plazaScope === 'mine' || route.path.endsWith('/mine') ? 'mine' : 'community',
);

const emptyTitle = computed(() =>
  scope.value === 'mine' ? '暂无我的工作流' : '暂无社区工作流',
);
const emptyHint = computed(() =>
  scope.value === 'mine'
    ? 'Hub 个人 Workflow 接口就绪后，收藏/发布的内容会出现在这里。'
    : '请先在设置中同步 AIGC 视频工厂 Hub；同步后将展示带可落地 graph 的工作流。',
);

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return items.value.filter((s) => {
    const vis = String(s.visibility || '').toLowerCase();
    if (scope.value === 'mine') {
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
      s.author.toLowerCase().includes(q)
    );
  });
});

function categoryLabel(card: WorkflowPlazaItem) {
  const c = String(card.category || '').toLowerCase();
  if (c === 'image') return '图片';
  if (c === 'video') return '视频';
  if (c === 'agent') return 'Agent';
  return card.category || '';
}

function formatUses(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n || 0);
}

function resolveGraph(card: WorkflowPlazaItem): unknown | null {
  let graph: unknown = card.graph;
  if (!graph) return null;
  try {
    if (typeof graph === 'string') graph = JSON.parse(graph);
    else if (graph && typeof graph === 'object' && 'payload' in (graph as any)) {
      const p = (graph as any).payload;
      graph = typeof p === 'string' ? JSON.parse(p) : p;
    }
  } catch {
    return null;
  }
  return graph && typeof graph === 'object' ? graph : null;
}

function graphSummary(card: WorkflowPlazaItem) {
  const graph = resolveGraph(card) as { nodes?: unknown[] } | null;
  if (!graph) return '暂无可落地的工作流图';
  const n = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  return n > 0 ? `包含 ${n} 个节点，使用后将创建到「我的项目」` : '已提供工作流图，使用后将创建到「我的项目」';
}

function openDetail(card: WorkflowPlazaItem) {
  detail.value = card;
  detailOpen.value = true;
}

async function useWorkflow(card: WorkflowPlazaItem) {
  if (creatingId.value) return;
  const rawGraph = resolveGraph(card);
  if (!rawGraph) {
    ElMessage.info('该工作流尚未提供可落地的 graph，等 Hub 数据就绪后再试');
    return;
  }
  creatingId.value = card.id;
  try {
    const graph = normalizePlazaWorkflowGraph(rawGraph);

    // 项目列表读的是 Production；只 createWorkflow 不会出现在「我的项目」
    const { production } = await ensureCompiledProduction({
      create: {
        name: card.name,
        description: card.desc || '来自工作流广场',
        script: '',
        tags: [
          '工作流',
          '广场',
          ...(card.tags || []).filter((t) => t !== 'image' && t !== 'video').slice(0, 4),
        ],
        meta: {
          fromWorkflowPlaza: true,
          plazaId: card.id,
          plazaCategory: card.category || '',
        },
        status: 'draft',
      },
    });
    if (!production.workflowId) {
      throw new Error('项目未关联画布');
    }
    await updateWorkflow(production.workflowId, {
      name: card.name,
      description: card.desc,
      graph: graph as any,
    });
    void reportHubResourceUse(card.id, 'workflow').then((r) => {
      if (r?.uses != null) card.uses = r.uses;
    });
    detailOpen.value = false;
    ElMessage.success(`已创建项目「${card.name}」`);
    router.push({
      path: `/w/${production.workflowId}`,
      query: { productionId: production.id },
    });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  } finally {
    creatingId.value = '';
  }
}

function useFromDetail() {
  if (!detail.value) return;
  void useWorkflow(detail.value);
}

/** Hub 偶发 refMode=image → 本端 frames；避免创建后视频节点参数非法 */
function normalizePlazaWorkflowGraph(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const doc = raw as { nodes?: Array<{ type?: string; params?: Record<string, unknown> }> };
  if (!Array.isArray(doc.nodes)) return raw;
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      if (n?.type !== 'ai.video' || !n.params) return n;
      const ref = String(n.params.refMode || '').toLowerCase();
      if (ref === 'image' || ref === 'img' || ref === '参考图') {
        return { ...n, params: { ...n.params, refMode: 'frames' } };
      }
      return n;
    }),
  };
}

async function load() {
  loading.value = true;
  try {
    const payload = await fetchWorkflowsPlaza();
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
    ElMessage.error(e?.message || '工作流广场加载失败');
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
.skill-card.text-only.busy {
  opacity: 0.7;
  pointer-events: none;
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
.cat-tag {
  margin-left: 4px;
  font-style: normal;
  font-size: 11px;
  color: var(--studio-muted);
  background: var(--studio-glass-2);
  border-radius: 999px;
  padding: 1px 7px;
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
  max-width: 460px;
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
.graph-hint {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--studio-faint);
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
.cta-btn:hover:not(:disabled) {
  background: var(--studio-text);
}
.cta-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
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
