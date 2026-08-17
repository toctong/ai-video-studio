<template>
  <div class="page overview-page studio-book nested">
    <header class="tool-head">
      <p class="tool-sub">
        <span class="status-dot" :class="statusClass" aria-hidden="true" />
        {{ statusLabel }}
        <span class="pipe">·</span>
        {{ chapterCount }} 章
        <span class="pipe">·</span>
        {{ formatWords(wordCount) }} 字
        <span class="pipe">·</span>
        {{ characterCount }} 角色
        <template v-if="updatedLabel">
          <span class="pipe">·</span>
          更新于 {{ updatedLabel }}
        </template>
      </p>
      <div class="tool-actions">
        <button type="button" class="pill-btn" @click="pickCover">
          {{ coverUrl ? '换封面' : '设封面' }}
        </button>
        <button type="button" class="pill-btn" :disabled="generatingCover" @click="openCoverGen">
          AI 封面
        </button>
        <button type="button" class="pill-btn" @click="scaleDrawer = true">篇幅</button>
        <button type="button" class="pill-btn primary" @click="goWrite()">
          {{ chapterCount ? '继续写作' : '开始写作' }}
        </button>
      </div>
    </header>

    <div v-if="outlineGenerating" class="stream-banner" role="status">
      <div class="stream-copy">
        <strong>长篇大纲正在后台生成</strong>
        <span>{{ outlineStatusText }}</span>
      </div>
      <el-progress :percentage="outlineProgress" :stroke-width="4" :show-text="false" />
    </div>

    <section class="detail" aria-label="作品详情">
      <div class="cover-col">
        <button
          type="button"
          class="cover"
          :aria-label="coverUrl ? '预览封面' : '设置封面'"
          @click="coverUrl ? previewCover() : pickCover()"
        >
          <img v-if="coverUrl" :src="coverUrl" :alt="title" />
          <div v-else class="cover-ph" :style="coverFallbackStyle">
            <span>{{ title.slice(0, 1) || '书' }}</span>
          </div>
        </button>
        <div v-if="coverUrl" class="cover-tools" @click.stop>
          <button type="button" class="tool" title="预览" @click="previewCover">
            <el-icon :size="14"><ZoomIn /></el-icon>
          </button>
          <button type="button" class="tool" title="下载" @click="downloadCover">
            <el-icon :size="14"><Download /></el-icon>
          </button>
        </div>
      </div>

      <div class="info">
        <div v-if="overviewTags.length" class="tags">
          <span
            v-for="(t, i) in overviewTags"
            :key="`${t.text}-${i}`"
            class="tag"
            :class="{ solid: t.solid }"
          >
            {{ t.text }}
          </span>
        </div>
        <p class="desc">
          {{ description || '还没有简介。完善设定与大纲后，这里会成为作品的第一印象。' }}
        </p>
        <div class="people">
          <span>作者：{{ displayName }}</span>
          <span v-if="castNames" class="people-main">主角：{{ castNames }}</span>
          <span v-else>主角：待设定</span>
        </div>
        <p class="update">
          <template v-if="latestChapter">
            {{ formatWords(wordCount) }}字 · {{ chapterCount }}章 · 进度 {{ scaleProgress.pct }}%
            · 更新至 第{{ latestChapter.orderIndex + 1 }}章
            {{ latestChapter.title || '未命名' }}
            <em v-if="updatedLabel">{{ updatedLabel }}</em>
          </template>
          <template v-else>
            {{ formatWords(wordCount) }}字 · {{ chapterCount }}章 · 进度 {{ scaleProgress.pct }}%
            · 暂无章节
            <em v-if="updatedLabel">{{ updatedLabel }}</em>
          </template>
        </p>
        <div class="detail-actions">
          <button type="button" class="pill-btn primary" @click="goWrite()">
            {{ chapterCount ? '继续写作' : '开始写作' }}
          </button>
          <button type="button" class="pill-btn" :disabled="generatingCover" @click="openCoverGen">
            AI 封面设计
          </button>
          <button type="button" class="pill-btn" @click="goOutline">
            {{ hasOutline ? '打开大纲' : '去生成大纲' }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="hasOutline || outlineHtml" class="outline-snip" aria-label="大纲摘录">
      <div class="snip-head">
        <strong>大纲摘录</strong>
        <button type="button" class="pill-btn" @click="goOutline">打开全文</button>
      </div>
      <div v-if="outlineHtml" class="outline-md" v-html="outlineHtml" />
      <p v-else class="empty-line">点开查看完整分卷结构。</p>
    </section>

    <el-image-viewer
      v-if="coverPreviewOpen && coverUrl"
      :url-list="[coverUrl]"
      teleported
      hide-on-click-modal
      :z-index="4000"
      @close="coverPreviewOpen = false"
    />

    <input ref="coverInput" type="file" accept="image/*" hidden @change="onCoverPicked" />

    <el-dialog
      v-model="coverGenOpen"
      title="AI 生成封面"
      width="480px"
      destroy-on-close
      :close-on-click-modal="!generatingCover"
    >
      <p class="cover-gen-hint">
        竖版网文书封（角色特写 + 书法书名）。默认 gpt-image-2；提交后可切页，完成后封面会自动更新。偶发繁忙会自动重试，不会改换模型。
      </p>
      <el-form label-position="top">
        <el-form-item label="封面模型">
          <el-select v-model="coverModel" style="width: 100%">
            <el-option
              v-for="m in coverModels"
              :key="m.value"
              :label="m.label"
              :value="m.value"
            >
              <div class="cover-opt">
                <span>{{ m.label }}</span>
                <em v-if="m.description">{{ m.description }}</em>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="补充说明（可选）">
          <el-input
            v-model="coverHint"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="如：男女主近距离对峙，暧昧张力，烫金书法书名，冷暖对比光"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="generatingCover" @click="coverGenOpen = false">取消</el-button>
        <el-button type="primary" :loading="generatingCover" @click="generateCover">
          开始生成
        </el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="scaleDrawer"
      title="成书篇幅"
      direction="rtl"
      size="400px"
      append-to-body
      class="overview-scale-drawer"
      :destroy-on-close="false"
    >
      <div class="scale-drawer-body">
        <p class="scale-drawer-hint">写作接近目标字数时会自动收束悬念；改完记得保存。</p>
        <BookScalePicker v-model="bookScale" embedded />
        <div class="scale-drawer-actions">
          <el-button
            round
            :disabled="savingScale || !scaleDirty"
            @click="saveBookScale"
          >
            {{ savingScale ? '保存中…' : '保存篇幅' }}
          </el-button>
          <el-button
            type="primary"
            round
            :disabled="regenOutlineBusy || outlineGenerating"
            @click="regenOutline"
          >
            {{ regenOutlineBusy ? '提交中…' : hasOutline ? '按篇幅重生成大纲' : '生成大纲' }}
          </el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, ZoomIn } from '@element-plus/icons-vue';
import api from '@/api';
import UiIcon from '@/components/icons/UiIcon.vue';
import { useAiSettings } from '@/composables/useAiSettings';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import BookScalePicker from '@/components/BookScalePicker.vue';
import { clearOutlinePending, markOutlinePending, readOutlinePending } from '@/utils/outline-pending';
import { scrubOutlineLengthConfusion } from '@/utils/outline-text';
import { renderMarkdown } from '@/utils/markdown';
import {
  clampBookScale,
  DEFAULT_BOOK_SCALE,
  formatBookScaleIdeaBlock,
  formatBookScaleLabel,
  type BookScale,
} from '@/utils/book-scale';
import { waitJob } from '@/utils/wait-job';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const projectStore = useProjectStore();
const projectId = computed(() => String(route.params.projectId));
const overview = ref<any>(null);
const coverInput = ref<HTMLInputElement | null>(null);
const coverGenOpen = ref(false);
const generatingCover = ref(false);
const coverHint = ref('');
const { modelsOf, pickDefault, ensureAiSettings } = useAiSettings();
const coverModels = computed(() => modelsOf('image'));
const coverModel = ref(pickDefault('image') || 'gpt-image-2');
const coverPreviewOpen = ref(false);
const outlineGenerating = ref(false);
const outlineProgress = ref(8);
const outlineStatusText = ref('正在整合积木素材并生成分卷大纲…');
let outlineAbort: AbortController | null = null;

const bookScale = ref<BookScale>({ ...DEFAULT_BOOK_SCALE });
const savedScale = ref<BookScale>({ ...DEFAULT_BOOK_SCALE });
const savingScale = ref(false);
const regenOutlineBusy = ref(false);
const scaleDrawer = ref(false);

const project = computed(() => overview.value?.project || {});
const title = computed(() => project.value?.title || '');
const description = computed(() => project.value?.description || '');
const styleBrief = computed(() => project.value?.styleBrief || '');
const coverUrl = computed(() => project.value?.coverUrl || '');
const chapterCount = computed(() => overview.value?.stats?.chapterCount ?? 0);
const characterCount = computed(() => overview.value?.stats?.characterCount ?? 0);
const wordCount = computed(() => overview.value?.stats?.wordCount ?? 0);
const latestChapter = computed(() => overview.value?.stats?.latestChapter || null);
const hasOutline = computed(() => !!overview.value?.stats?.hasOutline);
const castPreview = computed(() => {
  const rows = overview.value?.stats?.castPreview;
  return Array.isArray(rows) ? rows : [];
});
const castNames = computed(() =>
  castPreview.value
    .slice(0, 3)
    .map((c: any) => String(c?.name || '').trim())
    .filter(Boolean)
    .join(' '),
);
const outlineMarkdown = computed(() =>
  scrubOutlineLengthConfusion(String(overview.value?.stats?.outlineMarkdown || '')),
);
const outlineHtml = computed(() => renderMarkdown(outlineMarkdown.value).html);

const scaleDirty = computed(() => {
  const a = clampBookScale(bookScale.value);
  const b = clampBookScale(savedScale.value);
  return a.wordsWan !== b.wordsWan || a.volumes !== b.volumes;
});

function syncBookScaleFromProject() {
  const state = project.value?.storyState || {};
  const next = clampBookScale({
    wordsWan: Number(state.targetWordsWan) || DEFAULT_BOOK_SCALE.wordsWan,
    volumes: Number(state.volumeCount) || DEFAULT_BOOK_SCALE.volumes,
  });
  bookScale.value = { ...next };
  savedScale.value = { ...next };
}

const styleParts = computed(() => {
  const raw = String(styleBrief.value || '').trim();
  if (!raw) return [] as string[];
  return raw
    .split(/[，,、/\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
});

const overviewTags = computed(() => {
  const items: Array<{ text: string; solid?: boolean }> = [];
  if (hasOutline.value) items.push({ text: '有大纲', solid: true });
  for (const part of styleParts.value) {
    items.push({ text: part });
  }
  return items;
});

const displayName = computed(() => auth.displayName || '作者');

const scaleProgress = computed(() => {
  const wordsWan = clampBookScale(bookScale.value).wordsWan;
  const target = Math.max(1, wordsWan * 10000);
  const current = wordCount.value || 0;
  const pct = Math.min(100, Math.round((current / target) * 100));
  const remaining = Math.max(0, target - current);
  const remainingWan = Math.round((remaining / 10000) * 10) / 10;
  return { pct, target, remainingWan };
});

const statusLabel = computed(() => {
  if (project.value?.archived) return '已归档';
  if (chapterCount.value > 0) return '连载中';
  if (hasOutline.value) return '筹备中';
  return '待开写';
});

const statusClass = computed(() => {
  if (project.value?.archived) return 'dim';
  if (chapterCount.value > 0) return 'live';
  return 'idle';
});

const updatedLabel = computed(() => {
  const v = latestChapter.value?.updatedAt || project.value?.updatedAt;
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
});

const coverFallbackStyle = computed(() => {
  const hues = [22, 32, 8, 340, 200, 150];
  const s = title.value || projectId.value;
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0;
  const h = hues[Math.abs(n) % hues.length];
  return {
    background: `linear-gradient(155deg, hsl(${h} 48% 48%), hsl(${h + 18} 42% 24%))`,
  };
});

function formatWords(n?: number) {
  const v = n || 0;
  if (v >= 10000) return `${(v / 10000).toFixed(v >= 100000 ? 1 : 2)}万`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

async function load() {
  const id = projectId.value;
  const [ovRes, castRes, scriptRes] = await Promise.all([
    api.get(`/projects/${id}/overview`),
    api.get(`/projects/${id}/characters`).catch(() => ({ data: [] as any[] })),
    api.get(`/projects/${id}/assets`, { params: { type: 'script' } }).catch(() => ({ data: [] as any[] })),
  ]);
  const data = ovRes.data || {};
  const stats = { ...(data.stats || {}) };
  const characters = Array.isArray(castRes.data) ? castRes.data : [];
  const scripts = Array.isArray(scriptRes.data) ? scriptRes.data : [];

  if (characters.length) {
    stats.castPreview = characters.slice(0, 12).map((c: any) => ({
      id: c.id,
      name: c.name,
      blurb: String(c.description || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 36),
    }));
  }
  const outlineHit = scripts.find((a: any) => {
    const n = String(a?.name || '').trim();
    return n === '小说大纲' || n.includes('小说大纲');
  });
  stats.outlineMarkdown = scrubOutlineLengthConfusion(String(outlineHit?.meta?.content || ''));
  overview.value = { ...data, stats };
  syncBookScaleFromProject();
}

async function saveBookScale() {
  if (savingScale.value || !scaleDirty.value) return;
  savingScale.value = true;
  try {
    const scale = clampBookScale(bookScale.value);
    await api.put(`/projects/${projectId.value}`, {
      storyState: {
        targetWordsWan: scale.wordsWan,
        volumeCount: scale.volumes,
      },
    });
    bookScale.value = { ...scale };
    savedScale.value = { ...scale };
    if (overview.value?.project) {
      overview.value.project = {
        ...overview.value.project,
        storyState: {
          ...(overview.value.project.storyState || {}),
          targetWordsWan: scale.wordsWan,
          volumeCount: scale.volumes,
        },
      };
    }
    ElMessage.success(`已保存：${formatBookScaleLabel(scale)}`);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '保存篇幅失败');
  } finally {
    savingScale.value = false;
  }
}

async function regenOutline() {
  if (regenOutlineBusy.value || outlineGenerating.value) return;
  const scale = clampBookScale(bookScale.value);
  const scaleLabel = formatBookScaleLabel(scale);
  try {
    await ElMessageBox.confirm(
      hasOutline.value
        ? `将按当前成书篇幅「${scaleLabel}」重新生成大纲，现有大纲内容会被覆盖。确定继续？`
        : `将按当前成书篇幅「${scaleLabel}」生成长篇大纲。确定开始？`,
      hasOutline.value ? '按篇幅重生成大纲' : '生成大纲',
      {
        type: 'warning',
        confirmButtonText: hasOutline.value ? '确定重生成' : '开始生成',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }
  if (scaleDirty.value) {
    await saveBookScale();
  }
  regenOutlineBusy.value = true;
  try {
    const idea = [
      `请根据项目《${title.value || '未命名'}》重新生成长篇连载大纲。`,
      formatBookScaleIdeaBlock(scale),
      '',
      '【简介】',
      description.value || '（暂无简介，请按书名合理扩展）',
      '',
      '【画面风格】',
      styleBrief.value || '（未指定）',
      '',
      '要求：分卷大纲 + 首卷细目录（30章以上）+ 后续卷关键大节点；禁止把大纲文档字数写成成书字数。',
    ].join('\n');
    const { data: job } = await api.post(`/projects/${projectId.value}/script/generate-skeleton`, {
      idea,
      targetWordsWan: scale.wordsWan,
      volumeCount: scale.volumes,
    });
    markOutlinePending(projectId.value, String(job?.id || ''));
    ElMessage.success('已提交大纲生成，请稍候');
    void trackOutlinePending();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '提交大纲生成失败');
  } finally {
    regenOutlineBusy.value = false;
  }
}

async function trackOutlinePending() {
  outlineAbort?.abort();
  outlineAbort = null;
  let pending = readOutlinePending(projectId.value);
  if (!pending) {
    outlineGenerating.value = false;
    return;
  }
  // 超过 30 分钟的标记视为过期
  if (Date.now() - pending.at > 30 * 60 * 1000) {
    clearOutlinePending(projectId.value);
    outlineGenerating.value = false;
    return;
  }
  outlineGenerating.value = true;
  outlineProgress.value = 12;
  outlineStatusText.value = '正在整合素材并生成分卷大纲…';
  const ac = new AbortController();
  outlineAbort = ac;
  try {
    // 创建后可能稍后才写入 jobId，先短轮询等 jobId
    if (!pending.jobId) {
      const waitJobIdUntil = Date.now() + 20_000;
      while (!pending.jobId && Date.now() < waitJobIdUntil && !ac.signal.aborted) {
        await new Promise((r) => setTimeout(r, 800));
        pending = readOutlinePending(projectId.value) || pending;
        if (hasOutline.value) break;
        await load();
        if (hasOutline.value) break;
      }
    }

    if (pending.jobId && !hasOutline.value) {
      await waitJob(pending.jobId, {
        intervalMs: 1800,
        onUpdate: (j) => {
          if (ac.signal.aborted) return;
          outlineProgress.value = Math.max(12, Math.min(99, Number(j.progress) || 12));
          if (j.message) outlineStatusText.value = String(j.message);
        },
      });
    } else if (!hasOutline.value) {
      // 无 jobId：按「小说大纲」资产轮询（不会把灵感误判完成）
      const start = Date.now();
      while (Date.now() - start < 10 * 60 * 1000 && !ac.signal.aborted) {
        await new Promise((r) => setTimeout(r, 2500));
        pending = readOutlinePending(projectId.value) || pending;
        if (pending.jobId) {
          await waitJob(pending.jobId, {
            intervalMs: 1800,
            onUpdate: (j) => {
              if (ac.signal.aborted) return;
              outlineProgress.value = Math.max(12, Math.min(99, Number(j.progress) || 12));
              if (j.message) outlineStatusText.value = String(j.message);
            },
          });
          break;
        }
        await load();
        if (hasOutline.value) break;
        outlineProgress.value = Math.min(90, outlineProgress.value + 6);
      }
    }
    if (ac.signal.aborted) return;
    await load();
    outlineProgress.value = 100;
    clearOutlinePending(projectId.value);
    outlineGenerating.value = false;
    if (hasOutline.value) {
      outlineStatusText.value = '大纲已生成';
      ElMessage.success('长篇大纲已生成，可在「项目大纲」查看');
    } else {
      outlineStatusText.value = '大纲尚未就绪';
      ElMessage.warning('大纲生成未完成，可在成书篇幅里「生成大纲」重试');
    }
  } catch (e: any) {
    if (ac.signal.aborted) return;
    clearOutlinePending(projectId.value);
    outlineGenerating.value = false;
    ElMessage.warning(e?.message || '大纲生成未完成，可在下方「生成大纲」重试');
  }
}

function goWrite(tab?: string) {
  router.push(
    tab === 'characters'
      ? `/books/${projectId.value}/characters`
      : `/books/${projectId.value}/chapters`,
  );
}

function goOutline() {
  router.push(`/books/${projectId.value}/outline`);
}

function pickCover() {
  coverInput.value?.click();
}

function previewCover() {
  if (!coverUrl.value) return;
  coverPreviewOpen.value = true;
}

async function downloadCover() {
  const url = coverUrl.value;
  if (!url) return;
  const name = String(title.value || '封面')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim() || '封面';
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const mime = String(blob.type || '').toLowerCase();
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('gif')
          ? 'gif'
          : 'jpg';
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${name}-封面.${ext}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    ElMessage.success('封面已开始下载');
  } catch {
    // 跨域等场景：新开标签，用户可另存为
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = `${name}-封面`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      ElMessage.error('下载失败，请右键封面另存为');
    }
  }
}

function openCoverGen() {
  coverGenOpen.value = true;
}

async function generateCover() {
  generatingCover.value = true;
  try {
    await api.post(`/projects/${projectId.value}/cover/generate`, {
      hint: coverHint.value.trim() || undefined,
      model: coverModel.value,
    });
    coverGenOpen.value = false;
    coverHint.value = '';
    ElMessage.success('封面任务已提交，完成后会自动更新');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '提交封面任务失败');
  } finally {
    generatingCover.value = false;
  }
}

async function onCoverPicked(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await api.post(`/projects/${projectId.value}/cover`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (overview.value?.project) {
      overview.value.project = {
        ...overview.value.project,
        coverAssetId: data.coverAssetId,
        coverUrl: data.coverUrl,
      };
    }
    ElMessage.success('封面已更新');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '上传失败');
  }
}

/** 任务抽屉轮询到封面完成后会刷新 project store，这里同步到本页展示 */
watch(
  () =>
    [
      projectStore.current?.id,
      projectStore.current?.coverUrl,
      projectStore.current?.coverAssetId,
    ] as const,
  ([id, url, assetId]) => {
    if (!id || id !== projectId.value || !overview.value?.project) return;
    if (url == null && assetId == null) return;
    overview.value.project = {
      ...overview.value.project,
      coverUrl: url ?? overview.value.project.coverUrl,
      coverAssetId: assetId ?? overview.value.project.coverAssetId,
    };
  },
);

onMounted(async () => {
  await ensureAiSettings();
  coverModel.value = pickDefault('image');
  await load();
  void trackOutlinePending();
});

onUnmounted(() => {
  outlineAbort?.abort();
  outlineAbort = null;
});

watch(projectId, async () => {
  outlineAbort?.abort();
  await load();
  void trackOutlinePending();
});
</script>

<style scoped>
.outline-snip {
  margin-top: 20px;
  padding: 16px 18px;
  border: 1px solid var(--studio-line-strong);
  border-radius: 16px;
  background: var(--studio-panel);
}
.snip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.snip-head strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--studio-ink);
}
.outline-snip .outline-md {
  max-height: 220px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.55;
  color: var(--studio-text);
}
.overview-page.nested {
  max-width: none;
  width: 100%;
  color: var(--studio-ink);
}
.tool-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.tool-sub {
  margin: 0;
  color: var(--studio-faint);
  font-size: 12px;
  line-height: 1.5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 2px;
}
.tool-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.status-dot {
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--studio-text);
  flex-shrink: 0;
}
.status-dot.live {
  background: #4ade80;
}
.status-dot.dim {
  background: var(--studio-muted);
}
.pipe {
  margin: 0 6px;
  color: color-mix(in srgb, var(--muted) 55%, transparent);
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
}
.pill-btn {
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-panel);
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.pill-btn:hover:not(:disabled) {
  background: var(--studio-panel-3);
  color: var(--studio-ink);
}
.pill-btn.primary {
  background: var(--studio-text);
  color: var(--studio-bg);
  font-weight: 600;
}
.pill-btn.primary:hover:not(:disabled) {
  background: var(--studio-ink);
}
.ghost-link {
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 6px 4px;
}
.ghost-link:hover {
  color: var(--studio-ink);
}

.stream-banner {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line-strong);
  display: grid;
  gap: 8px;
}
.stream-copy {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: baseline;
}
.stream-copy strong {
  font-size: 13px;
  color: var(--studio-ink);
}
.stream-copy span {
  font-size: 12.5px;
  color: var(--studio-muted);
}

.detail {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  padding: 16px 18px;
  border: 1px solid var(--studio-line-strong);
  border-radius: 16px;
  background: var(--studio-panel);
  box-shadow: none;
  margin-bottom: 4px;
}
.cover-col {
  position: relative;
  width: 160px;
}
.cover {
  display: block;
  width: 160px;
  aspect-ratio: 3 / 4;
  padding: 0;
  border: 1px solid var(--studio-line-strong);
  border-radius: 12px;
  overflow: hidden;
  background: var(--studio-inset);
  cursor: pointer;
  box-shadow: none;
}
.cover img,
.cover-ph {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  display: block;
}
.cover-ph {
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 40px;
  font-weight: 800;
}
.cover-tools {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s var(--ease);
}
.cover-col:hover .cover-tools {
  opacity: 1;
}
.tool {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  color: var(--studio-ink);
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.tool:hover {
  background: rgba(0, 0, 0, 0.75);
}

.info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 2px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: var(--studio-muted);
  background: var(--studio-panel-3);
  white-space: nowrap;
}
.tag.solid {
  background: var(--studio-text);
  color: var(--studio-bg);
  font-weight: 700;
}
.desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--studio-text);
  max-width: 52em;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.people {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 13px;
  color: var(--studio-faint);
}
.people-main {
  color: var(--studio-text);
}
.stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 0;
  font-size: 13px;
  color: var(--muted);
}
.stats b {
  color: var(--ink);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.stats .pipe {
  display: inline-block;
  width: 1px;
  height: 12px;
  margin: 0 10px;
  background: var(--line);
  vertical-align: middle;
}
.update {
  margin: 0;
  font-size: 12.5px;
  color: var(--studio-faint);
  line-height: 1.5;
}
.update em {
  font-style: normal;
  margin-left: 8px;
  color: var(--studio-muted);
}
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 4px;
}

.strip {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.9fr);
  gap: 12px;
  margin-top: 14px;
  align-items: stretch;
}
.strip-col {
  padding: 16px 16px 14px;
  min-width: 0;
  min-height: 0;
  height: 280px;
  text-align: left;
  color: inherit;
  font: inherit;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}
.strip-col:last-child {
  border-right: 1px solid var(--line);
}
.strip-btn {
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
.strip-goal {
  align-items: center;
  text-align: center;
  justify-content: flex-start;
}
.strip-goal .strip-head {
  width: 100%;
}
.strip-goal .goal-title {
  margin-top: 0;
}
.strip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.strip-label {
  font-size: 12px;
  font-weight: 750;
  color: var(--muted);
  letter-spacing: 0.02em;
}
.strip-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}
.strip-badge.on {
  color: var(--accent);
}
.outline-md {
  margin: 0 0 10px;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 160px;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text);
  mask-image: linear-gradient(to bottom, #000 70%, transparent 100%);
}
.outline-md :deep(h2),
.outline-md :deep(h3),
.outline-md :deep(h4) {
  margin: 0.55em 0 0.25em;
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  line-height: 1.35;
}
.outline-md :deep(h2) {
  font-size: 14.5px;
}
.outline-md :deep(h3) {
  font-size: 13.5px;
}
.outline-md :deep(h4) {
  font-size: 13px;
}
.outline-md :deep(p) {
  margin: 0.3em 0;
}
.outline-md :deep(ul),
.outline-md :deep(ol) {
  margin: 0.3em 0;
  padding-left: 1.25em;
}
.outline-md :deep(li) {
  margin: 0.15em 0;
}
.outline-md :deep(strong) {
  color: var(--ink);
  font-weight: 700;
}
.outline-md :deep(code) {
  font-size: 0.92em;
  padding: 0.05em 0.3em;
  border-radius: 4px;
  background: var(--surface-2);
}
.outline-md :deep(h2:first-child),
.outline-md :deep(h3:first-child),
.outline-md :deep(h4:first-child),
.outline-md :deep(p:first-child) {
  margin-top: 0;
}
.empty-line {
  margin: 0 0 10px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--muted);
  flex: 1 1 auto;
}
.goal-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}
.goal-meta {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.45;
}
.text-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--accent);
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  margin-top: auto;
  align-self: flex-start;
}
.text-link:hover {
  color: var(--accent-2);
}
.text-link.sm {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--muted);
  margin-top: 0;
  align-self: auto;
}
.text-link.sm:hover {
  color: var(--accent);
}

.cast {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 12px;
  flex: 1 1 auto;
  align-content: flex-start;
  min-height: 0;
  overflow: hidden;
}
.cast-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  max-width: 100%;
}
.cast-item i {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-style: normal;
  font-size: 12px;
  font-weight: 750;
  color: #fff;
}
.cast-item span {
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cover-gen-hint {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--muted);
}
.cover-opt {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cover-opt em {
  font-style: normal;
  font-size: 11px;
  color: var(--muted);
}
.scale-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.scale-drawer-hint {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--muted);
}
.scale-drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tl-card {
  margin-top: 12px;
  padding: 16px 16px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

@media (max-width: 960px) {
  .strip {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 720px) {
  .tool-head {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .tool-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .detail {
    grid-template-columns: 1fr;
    justify-items: start;
  }
  .cover-col {
    margin: 0 auto;
  }
}
</style>






<style>
.overview-scale-drawer.el-drawer {
  background: var(--surface);
}
.overview-scale-drawer .el-drawer__header {
  margin-bottom: 8px;
  color: var(--ink);
}
.overview-scale-drawer .el-drawer__body {
  padding-top: 4px;
}
</style>
