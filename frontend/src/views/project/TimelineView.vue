<template>
  <div class="page timeline-page studio-book nested">
    <header class="tool-head">
      <p class="tool-sub">
        {{
          nodes.length
            ? `共 ${nodes.length} 个节点 · 写章时自动维护`
            : '按章记录时间、地点与关键节点'
        }}
      </p>
      <div class="tool-actions">
        <button type="button" class="pill-btn" :disabled="busy" @click="load">
          {{ busy ? '刷新中…' : '刷新' }}
        </button>
        <button type="button" class="pill-btn primary" @click="goWrite">去写章</button>
      </div>
    </header>

    <section v-if="timelineNote" class="overview-strip">
      <div class="overview-label">故事总览</div>
      <p class="overview-text">{{ timelineNote }}</p>
    </section>

    <div v-if="!nodes.length" class="empty panel-card">
      <p>还没有时间线。生成章节后会自动出现。</p>
      <button type="button" class="pill-btn primary" @click="goWrite">去生成章节</button>
    </div>

    <ol v-else class="rail">
      <li v-for="(n, i) in nodes" :key="n.id" class="rail-item">
        <div class="rail-axis" aria-hidden="true">
          <span class="rail-ord">{{ padOrd(n.chapterOrder) }}</span>
          <span v-if="i < nodes.length - 1" class="rail-line" />
        </div>
        <article class="node-card panel-card">
          <header class="node-head">
            <h2 class="node-title">{{ n.chapterTitle || `第${n.chapterOrder}章` }}</h2>
            <p v-if="n.when || n.where" class="node-meta">
              <template v-if="n.when">{{ n.when }}</template>
              <template v-if="n.when && n.where"> · </template>
              <template v-if="n.where">{{ n.where }}</template>
            </p>
          </header>
          <p v-if="n.summary" class="node-summary">{{ n.summary }}</p>
          <ul v-if="n.events?.length" class="node-events">
            <li v-for="(ev, ei) in n.events" :key="ei">{{ ev }}</li>
          </ul>
          <footer v-if="n.fallback" class="node-foot">暂由章摘要拼成 · 再生成后会补全</footer>
        </article>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import api from '@/api';
import { useProjectStore } from '@/stores/project';

type TimelineNode = {
  id: string;
  chapterId?: string;
  chapterOrder: number;
  chapterTitle?: string;
  when?: string;
  where?: string;
  events?: string[];
  summary?: string;
  fallback?: boolean;
};

const route = useRoute();
const router = useRouter();
const store = useProjectStore();
const projectId = computed(() => String(route.params.projectId));
const busy = ref(false);
const chapters = ref<any[]>([]);

const timelineNote = computed(() =>
  String(store.current?.storyState?.timelineNote || '').trim(),
);

const nodes = computed(() => {
  const stored = Array.isArray(store.current?.storyState?.timeline)
    ? store.current!.storyState!.timeline!
    : [];
  const byOrder = new Map<number, TimelineNode>();
  for (const e of stored) {
    const order = Number(e.chapterOrder) || 0;
    if (!order) continue;
    byOrder.set(order, {
      id: String(e.id || `tl-${order}`),
      chapterId: e.chapterId,
      chapterOrder: order,
      chapterTitle: e.chapterTitle,
      when: String(e.when || '').trim() || undefined,
      where: String(e.where || '').trim() || undefined,
      events: Array.isArray(e.events)
        ? e.events.map((x) => String(x || '').trim()).filter(Boolean)
        : [],
      summary: String(e.summary || '').trim() || undefined,
    });
  }
  for (const ch of chapters.value) {
    const order = Number(ch.orderIndex) || 0;
    if (!order) continue;
    const existing = byOrder.get(order);
    if (existing) {
      if (!existing.chapterId) existing.chapterId = ch.id;
      if (!existing.chapterTitle) existing.chapterTitle = ch.title;
      continue;
    }
    const summary = String(ch.continuitySummary || ch.synopsis || '').trim();
    if (!summary && !String(ch.novelBody || '').trim()) continue;
    byOrder.set(order, {
      id: `fallback-${ch.id}`,
      chapterId: ch.id,
      chapterOrder: order,
      chapterTitle: ch.title,
      summary: summary || '（有正文，尚未生成时间线节点）',
      events: [],
      fallback: true,
    });
  }
  return [...byOrder.values()].sort((a, b) => a.chapterOrder - b.chapterOrder);
});

function padOrd(n: number) {
  return String(n).padStart(2, '0');
}

function goWrite() {
  router.push(`/books/${projectId.value}/chapters`);
}

async function load() {
  busy.value = true;
  try {
    await store.setCurrent(projectId.value);
    const { data } = await api.get(`/projects/${projectId.value}/chapters`);
    chapters.value = data || [];
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.timeline-page.nested {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.tool-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.tool-sub {
  margin: 0;
  font-size: 13px;
  color: var(--studio-faint);
}
.tool-actions {
  display: flex;
  gap: 8px;
}
.overview-strip {
  margin-bottom: 18px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
}
.overview-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--studio-faint);
  margin-bottom: 8px;
}
.overview-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--studio-text);
}
.empty {
  padding: 48px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--studio-faint);
  font-size: 14px;
}
.empty p {
  margin: 0;
}
.rail {
  list-style: none;
  margin: 0;
  padding: 0 0 24px;
}
.rail-item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 14px;
}
.rail-axis {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 14px;
}
.rail-ord {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--studio-ink);
  line-height: 1.2;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-line-strong);
  z-index: 1;
}
.rail-line {
  flex: 1;
  width: 1px;
  min-height: 24px;
  background: var(--studio-line-strong);
}
.node-card {
  margin-bottom: 12px;
  padding: 16px 18px;
}
.node-head {
  margin-bottom: 8px;
}
.node-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--studio-ink);
  line-height: 1.35;
}
.node-meta {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--studio-faint);
}
.node-summary {
  margin: 0 0 8px;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--studio-text);
}
.node-events {
  margin: 0;
  padding: 0 0 0 1.15em;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--studio-muted);
}
.node-foot {
  margin-top: 10px;
  font-size: 12px;
  color: var(--studio-muted);
}
</style>
