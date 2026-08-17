<template>
  <div class="page write-page outline-page studio-book nested">
    <header class="tool-head">
      <p class="tool-sub">
        {{
          generating
            ? outlineStatusText
            : outlineText.trim()
              ? '只读查看 · 左侧目录可跳转'
              : '创建项目时会自动生成；也可按成书篇幅重新生成'
        }}
      </p>
      <div class="tool-actions">
        <button type="button" class="pill-btn" :disabled="loading || generating" @click="load">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
        <button
          type="button"
          class="pill-btn primary"
          :disabled="generating || regenBusy"
          @click="regenOutline"
        >
          {{ regenBusy ? '生成中…' : hasContent ? '按篇幅重生成' : '生成大纲' }}
        </button>
      </div>
    </header>

    <div class="write-body">
      <div v-if="generating" class="stream-banner" role="status">
        <span class="stream-dot on" />
        <span>{{ outlineStatusText }}</span>
        <span class="muted">{{ outlineProgress }}%</span>
      </div>

      <section v-loading="loading" class="outline-workspace panel-card">
        <ScriptDocPreview
          v-if="outlineText.trim()"
          workspace
          :content="outlineText"
          :title="outlineTitle"
        />
        <div v-else-if="!loading && !generating" class="pane-empty">
          <p>暂无大纲内容</p>
          <button type="button" class="pill-btn primary" :disabled="regenBusy" @click="regenOutline">
            {{ regenBusy ? '生成中…' : '生成大纲' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '@/api';
import ScriptDocPreview from '@/components/ScriptDocPreview.vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import { useProjectStore } from '@/stores/project';
import {
  clampBookScale,
  DEFAULT_BOOK_SCALE,
  formatBookScaleIdeaBlock,
  formatBookScaleLabel,
} from '@/utils/book-scale';
import { clearOutlinePending, markOutlinePending, readOutlinePending } from '@/utils/outline-pending';
import { scrubOutlineLengthConfusion } from '@/utils/outline-text';

const route = useRoute();
const store = useProjectStore();
const projectId = computed(() => String(route.params.projectId));

const loading = ref(false);
const outlineText = ref('');
const generating = ref(false);
const outlineProgress = ref(8);
const outlineStatusText = ref('正在整合积木素材并生成分卷大纲…');
const regenBusy = ref(false);
let outlineAbort: AbortController | null = null;

const title = computed(() => store.current?.title || '');
const outlineTitle = computed(() => `《${title.value || '项目'}》小说大纲`);
const hasContent = computed(() => !!outlineText.value.trim());

function pickOutlineAsset(assets: any[]) {
  if (!assets?.length) return null;
  return (
    assets.find((a) => String(a.name || '') === '小说大纲') ||
    assets.find((a) => String(a.name || '').includes('小说大纲')) ||
    assets.find((a) => String(a.name || '').includes('大纲')) ||
    null
  );
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get(`/projects/${projectId.value}/assets`, {
      params: { type: 'script' },
    });
    const hit = pickOutlineAsset(data || []);
    outlineText.value = scrubOutlineLengthConfusion(String(hit?.meta?.content || ''));
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载大纲失败');
  } finally {
    loading.value = false;
  }
}

async function regenOutline() {
  if (generating.value || regenBusy.value) return;
  const scale = clampBookScale(
    (store.current as any)?.bookScale ?? (store.current as any)?.meta?.bookScale ?? DEFAULT_BOOK_SCALE,
  );
  try {
    await ElMessageBox.confirm(
      `将按「${formatBookScaleLabel(scale)}」重新生成长篇大纲。已有大纲会被覆盖，确定继续？`,
      '重新生成大纲',
      { type: 'warning', confirmButtonText: '开始生成', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  regenBusy.value = true;
  try {
    const { data: job } = await api.post(`/projects/${projectId.value}/script/generate-skeleton`, {
      bookScale: scale,
      ideaBlock: formatBookScaleIdeaBlock(scale),
    });
    markOutlinePending(projectId.value, String(job?.id || ''));
    ElMessage.success('已开始生成大纲');
    void trackOutlinePending();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '启动失败');
  } finally {
    regenBusy.value = false;
  }
}

async function trackOutlinePending() {
  outlineAbort?.abort();
  outlineAbort = null;
  let pending = readOutlinePending(projectId.value);
  if (!pending) return;

  if (!pending.jobId) {
    await load();
    if (outlineText.value.trim()) {
      clearOutlinePending(projectId.value);
      return;
    }
  }

  generating.value = true;
  outlineProgress.value = 12;
  outlineStatusText.value = '正在整合素材并生成分卷大纲…';
  const ac = new AbortController();
  outlineAbort = ac;

  try {
    const started = Date.now();
    while (!ac.signal.aborted && Date.now() - started < 12 * 60_000) {
      if (pending.jobId) {
        const { data: j } = await api.get(`/jobs/runs/${pending.jobId}`);
        if (ac.signal.aborted) return;
        outlineProgress.value = Math.max(12, Math.min(99, Number(j.progress) || 12));
        if (j.message) outlineStatusText.value = String(j.message);
        if (j.status === 'completed') break;
        if (j.status === 'failed' || j.status === 'cancelled') {
          throw new Error(j.error || j.message || '大纲生成失败');
        }
      } else {
        await load();
        if (outlineText.value.trim()) break;
        pending = readOutlinePending(projectId.value) || pending;
        outlineProgress.value = Math.min(90, outlineProgress.value + 6);
      }
      await new Promise((r) => setTimeout(r, 1600));
    }
    await load();
    outlineProgress.value = 100;
    generating.value = false;
    clearOutlinePending(projectId.value);
    if (outlineText.value.trim()) {
      outlineStatusText.value = '大纲已生成';
      ElMessage.success('长篇大纲已生成');
    } else {
      outlineStatusText.value = '大纲尚未就绪';
      ElMessage.warning('大纲生成未完成，可点击「生成大纲」重试');
    }
  } catch (e: any) {
    if (ac.signal.aborted) return;
    clearOutlinePending(projectId.value);
    generating.value = false;
    ElMessage.warning(e?.message || '大纲生成未完成，可点击「生成大纲」重试');
  }
}

onMounted(async () => {
  if (!store.current || store.current.id !== projectId.value) {
    await store.setCurrent(projectId.value);
  }
  await load();
  void trackOutlinePending();
});

onUnmounted(() => {
  outlineAbort?.abort();
  outlineAbort = null;
});

watch(projectId, async () => {
  outlineAbort?.abort();
  outlineText.value = '';
  if (!store.current || store.current.id !== projectId.value) {
    await store.setCurrent(projectId.value);
  }
  await load();
  void trackOutlinePending();
});
</script>

<style scoped>
.outline-page.nested {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 !important;
  background: transparent !important;
}
.tool-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.tool-sub {
  margin: 0;
  color: var(--studio-faint);
  font-size: 12px;
  line-height: 1.5;
}
.tool-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.stream-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line-strong);
  color: var(--studio-ink);
  font-size: 12.5px;
  font-weight: 500;
  flex-shrink: 0;
}
.stream-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--studio-muted);
}
.stream-dot.on {
  background: var(--studio-text);
  box-shadow: 0 0 0 3px var(--studio-glass-3);
  animation: pulse 1.2s ease infinite;
}
.muted {
  color: var(--studio-faint);
  font-weight: 500;
}
@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}

.outline-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.outline-workspace :deep(.doc) {
  flex: 1;
  min-height: 0;
  background: transparent;
  color: var(--studio-ink);
}

.pane-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--studio-faint);
  font-size: 14px;
  min-height: 240px;
}
.pane-empty p {
  margin: 0;
}
</style>
