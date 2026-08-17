<template>
  <div class="share-page" v-loading="loading">
    <header class="topbar">
      <div class="topbar-left">
        <button type="button" class="icon-btn" title="返回首页" @click="$router.push('/home')">
          <IconBack :size="18" />
        </button>
        <div class="crumb">
          <span class="crumb-root">发现</span>
          <span class="crumb-sep">/</span>
          <strong>分享</strong>
        </div>
      </div>
    </header>

    <article v-if="post" class="card">
      <div class="thumb" :style="thumbStyle">
        <MediaThumb v-if="post.thumbUrl" :url="post.thumbUrl" />
        <span v-else class="ph">{{ kindLabel(post.kind) }}</span>
      </div>
      <div class="body">
        <span class="kind">{{ kindLabel(post.kind) }}</span>
        <h1>{{ post.title }}</h1>
        <p v-if="post.description">{{ post.description }}</p>
        <div class="meta">
          <span>来自 {{ post.authorName || '创作者' }}</span>
          <span>♥ {{ post.likeCount || 0 }}</span>
        </div>
        <div class="actions">
          <button type="button" class="primary-btn" :disabled="importing" @click="importPost">
            {{ importing ? '导入中…' : importLabel }}
          </button>
          <button type="button" class="ghost-btn" @click="copyLink">复制链接</button>
          <button type="button" class="ghost-btn" :disabled="liking" @click="onLike">点赞</button>
        </div>
      </div>
    </article>

    <p v-else-if="!loading" class="empty">分享链接无效或已下架</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import IconBack from '@/components/IconBack.vue';
import MediaThumb from '@/components/MediaThumb.vue';
import {
  fetchDiscoverByToken,
  likeDiscoverPost,
  type DiscoverPost,
} from '@/api/discover';
import { createWorkflow } from '@/api/workflows';
import { ensureCompiledProduction } from '@/utils/compile-production';
import { migrateGraphV1ToDocument } from '@ai-video-studio/shared';
import { copyText } from '@/utils/clipboard';
import {
  resolvePlazaGenMode,
  saveHomePlazaDraft,
} from '@/utils/home-plaza-draft';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const importing = ref(false);
const liking = ref(false);
const post = ref<DiscoverPost | null>(null);

const token = computed(() => String(route.params.token || '').trim());

const importLabel = computed(() => {
  const k = post.value?.kind;
  if (k === 'skill') return '用于创作';
  if (k === 'production') return '导入为项目';
  return '导入工作流';
});

const thumbStyle = computed(() =>
  post.value?.thumbUrl ? {} : { background: 'linear-gradient(135deg,#1e293b,#334155)' },
);

function kindLabel(kind: string) {
  const map: Record<string, string> = {
    skill: '技能',
    workflow: '工作流',
    template: '模板',
    production: '项目',
  };
  return map[kind] || kind;
}

async function load() {
  if (!token.value) return;
  loading.value = true;
  try {
    post.value = await fetchDiscoverByToken(token.value);
  } catch {
    post.value = null;
  } finally {
    loading.value = false;
  }
}

async function copyLink() {
  const url = window.location.href;
  try {
    await copyText(url);
    ElMessage.success('链接已复制');
  } catch {
    ElMessage.error('复制失败');
  }
}

async function onLike() {
  if (!post.value) return;
  liking.value = true;
  try {
    const r = await likeDiscoverPost(post.value.id);
    post.value = { ...post.value, likeCount: r.likeCount };
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '点赞失败（需登录）');
  } finally {
    liking.value = false;
  }
}

async function importPost() {
  if (!post.value?.payload) {
    ElMessage.warning('无可导入内容');
    return;
  }
  importing.value = true;
  try {
    const payload = post.value.payload;
    const kind = post.value.kind;

    if (kind === 'skill') {
      const skill = (payload.skill || payload) as Record<string, unknown>;
      const prompt = String(skill.starter || skill.prompt || '').trim();
      if (prompt) {
        saveHomePlazaDraft({
          skillId: skill.id != null ? String(skill.id) : undefined,
          name: skill.name != null ? String(skill.name) : undefined,
          desc: skill.desc != null ? String(skill.desc) : undefined,
          prompt,
          mode: resolvePlazaGenMode({
            mode: skill.mode != null ? String(skill.mode) : undefined,
            category: skill.category != null ? String(skill.category) : undefined,
            tags: Array.isArray(skill.tags) ? skill.tags.map(String) : undefined,
          }),
        });
        await copyText(prompt);
      }
        await router.push('/home');
      ElMessage.success(prompt ? '已带入提示词名称，可补充描述后生成' : '已打开首页');
      return;
    }

    if (kind === 'production') {
      const prod = (payload.production || payload) as Record<string, unknown>;
      const { production } = await ensureCompiledProduction({
        create: {
          name: String(prod.name || post.value.title || '发现·项目'),
          description: String(prod.description || post.value.description || ''),
          script: String(prod.script || ''),
          cast: Array.isArray(prod.cast) ? (prod.cast as any) : [],
          scenes: Array.isArray(prod.scenes) ? (prod.scenes as any) : [],
          style: (prod.style as any) || {},
          templateId: String(prod.templateId || ''),
          tags: [...(Array.isArray(prod.tags) ? (prod.tags as string[]) : []), 'discover'],
          thumbUrl: String(prod.thumbUrl || post.value.thumbUrl || ''),
          meta: {
            ...(typeof prod.meta === 'object' && prod.meta ? (prod.meta as object) : {}),
            fromDiscover: post.value.id,
          },
        },
        forceRecompile: true,
      });
      if (production.workflowId) {
        await router.push({
          path: `/w/${production.workflowId}`,
          query: { productionId: production.id },
        });
      } else {
        await router.push('/productions');
      }
      ElMessage.success('已导入项目');
      return;
    }

    // workflow / template / nodepack
    if (payload.format === 'lumina-nodepack-v1' && payload.document) {
      const created = await createWorkflow({
        name: String(payload.name || post.value.title || '发现·节点包'),
        description: String(payload.description || post.value.description || ''),
        graph: payload.document as any,
        tags: ['discover', 'nodepack'],
      });
      await router.push(`/w/${created.id}`);
      ElMessage.success('已导入节点包');
      return;
    }
    const wf = (payload.workflow || payload) as Record<string, unknown>;
    const graph = wf.graph ? migrateGraphV1ToDocument(wf.graph as any) : undefined;
    const created = await createWorkflow({
      name: String(wf.name || post.value.title || '发现·工作流'),
      description: String(wf.description || post.value.description || ''),
      graph,
      tags: [
        ...(Array.isArray(wf.tags) ? (wf.tags as string[]) : []),
        'discover',
      ],
    });
    await router.push(`/w/${created.id}`);
    ElMessage.success('已导入工作流');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '导入失败（需登录）');
  } finally {
    importing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.share-page {
  min-height: 100%;
  padding: 16px 20px 40px;
}
.topbar {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-btn {
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  background: transparent;
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
  color: inherit;
  display: grid;
  place-items: center;
}
.crumb {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: 14px;
}
.crumb-root {
  opacity: 0.55;
}
.crumb-sep {
  opacity: 0.35;
}
.card {
  display: grid;
  grid-template-columns: minmax(160px, 280px) 1fr;
  gap: 20px;
  border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--ink) 3%, transparent);
  max-width: 880px;
}
.thumb {
  min-height: 200px;
  background: #1e293b;
  position: relative;
}
.thumb :deep(.media-thumb) {
  width: 100%;
  height: 100%;
}
.ph {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  opacity: 0.7;
  font-size: 18px;
}
.body {
  padding: 20px 20px 20px 0;
}
.kind {
  font-size: 12px;
  opacity: 0.55;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
h1 {
  margin: 6px 0 10px;
  font-size: 22px;
  font-weight: 720;
}
.body > p {
  margin: 0 0 12px;
  opacity: 0.75;
  line-height: 1.5;
}
.meta {
  display: flex;
  gap: 14px;
  font-size: 13px;
  opacity: 0.6;
  margin-bottom: 16px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.primary-btn,
.ghost-btn {
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
  background: transparent;
  color: inherit;
}
.primary-btn {
  background: color-mix(in srgb, #3b82f6 55%, transparent);
  border-color: color-mix(in srgb, #3b82f6 70%, transparent);
}
.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.empty {
  opacity: 0.6;
}
@media (max-width: 720px) {
  .card {
    grid-template-columns: 1fr;
  }
  .body {
    padding: 16px;
  }
}
</style>
