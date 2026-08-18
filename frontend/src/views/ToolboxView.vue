<template>
  <div class="toolbox-page">
    <header class="page-hero">
      <h1>工具箱</h1>
      <p class="sub">一站式 AI 创作工具，按类型筛选后进入对应能力；下方可浏览社区发现内容。</p>
    </header>

    <nav class="tool-tabs" aria-label="工具分类">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tool-tab"
        :class="{ on: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <section class="tool-grid">
      <button
        v-for="tool in filteredTools"
        :key="tool.path + tool.title"
        type="button"
        class="tool-card"
        @click="open(tool)"
      >
        <LazyCoverImage v-if="tool.cover" class="tool-cover" :src="tool.cover" alt="" />
        <span v-else class="tool-cover tool-cover-ph" aria-hidden="true" />
        <span class="tool-shade" aria-hidden="true" />
        <div class="tool-copy">
          <strong>{{ tool.title }}</strong>
          <em>{{ tool.desc }}</em>
        </div>
        <img
          v-if="tool.badgeImg"
          class="tool-badge-img"
          :src="tool.badgeImg"
          alt=""
        />
        <span v-else-if="tool.badge" class="tool-badge">{{ tool.badge }}</span>
      </button>
    </section>

    <section id="discover" class="discover-section" aria-label="发现">
      <header class="discover-head">
        <div>
          <h2>发现</h2>
          <p>悬停预览精选视频；社区发布的工作流、技能、模板与项目也可在此浏览。</p>
        </div>
        <button type="button" class="refresh-btn" :disabled="discoverLoading" @click="loadDiscover">
          {{ discoverLoading ? '加载中…' : '刷新' }}
        </button>
      </header>

      <nav class="discover-tabs" aria-label="发现分类">
        <button
          v-for="tab in discoverTabs"
          :key="tab.key"
          type="button"
          class="tool-tab"
          :class="{ on: discoverKind === tab.key }"
          @click="discoverKind = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div v-loading="discoverLoading" class="discover-grid">
        <article
          v-for="item in visibleDiscover"
          :key="item.id"
          class="discover-card"
          :class="{ video: item.kind === 'video', playing: playingId === item.id }"
          @click="openDiscover(item)"
          @mouseenter="playDiscover(item)"
          @mouseleave="stopDiscover(item)"
        >
          <div class="discover-thumb">
            <LazyCoverImage
              v-if="item.thumbUrl"
              class="discover-cover"
              :src="item.thumbUrl"
              :alt="item.title || '发现视频'"
            />
            <LazyVideo
              v-if="item.videoUrl"
              class="discover-hover-video"
              :src="item.videoUrl"
              hover
              :active="playingId === item.id"
            />
            <span v-if="!item.thumbUrl && !item.videoUrl" class="discover-ph">{{ kindLabel(item.kind) }}</span>
            <span class="discover-kind">{{ kindLabel(item.kind) }}</span>
          </div>
          <div v-if="item.title" class="discover-body">
            <strong :title="item.title">{{ item.title }}</strong>
            <em v-if="item.description">{{ item.description }}</em>
            <div v-if="item.authorName" class="discover-meta">
              <span>{{ item.authorName }}</span>
              <span v-if="item.likeCount">♥ {{ item.likeCount }}</span>
            </div>
          </div>
        </article>
      </div>

      <p v-if="!discoverLoading && !visibleDiscover.length" class="discover-empty">
        暂无发现内容。可在项目 / 提示词里发布到发现，或稍后再来看看。
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { namiAsset } from '@/constants/oss-public';
import { namiDiscoverClips } from '@/constants/nami-discover';
import LazyCoverImage from '@/components/LazyCoverImage.vue';
import LazyVideo from '@/components/LazyVideo.vue';
import {
  fetchDiscoverFeed,
  type DiscoverKind,
  type DiscoverPost,
} from '@/api/discover';

type ToolCat = 'video' | 'image' | 'script';

type Tool = {
  path: string;
  title: string;
  desc: string;
  cover?: string;
  category: ToolCat;
  badge?: string;
  badgeImg?: string;
};

type DiscoverCard = DiscoverPost & {
  kind: DiscoverKind | 'video';
  videoUrl?: string;
};

const router = useRouter();
const activeTab = ref<'all' | ToolCat>('all');
const discoverKind = ref<'all' | DiscoverKind | 'video'>('all');
const discoverLoading = ref(false);
const discoverPosts = ref<DiscoverPost[]>([]);
const playingId = ref('');

const namiDiscoverCards: DiscoverCard[] = namiDiscoverClips().map((clip) => ({
  id: `nami-discover-${clip.id}`,
  kind: 'video',
  title: '',
  description: '',
  thumbUrl: clip.cover,
  videoUrl: clip.video,
  sourceId: clip.id,
  authorUserId: 0,
  authorName: '',
  shareToken: '',
  likeCount: 0,
}));

const tabs = [
  { key: 'all' as const, label: '全部' },
  { key: 'video' as const, label: '视频' },
  { key: 'image' as const, label: '图片' },
  { key: 'script' as const, label: '剧本' },
];

const discoverTabs = [
  { key: 'all' as const, label: '全部' },
  { key: 'video' as const, label: '视频' },
  { key: 'workflow' as const, label: '工作流' },
  { key: 'skill' as const, label: '技能' },
  { key: 'template' as const, label: '模板' },
  { key: 'production' as const, label: '项目' },
];

const tools: Tool[] = [
  {
    path: '/films?new=1',
    title: '制作大片',
    desc: '六步流水线：剧本 · 设定 · 分镜 · 成片',
    cover: namiAsset('entry/film.png'),
    category: 'video',
  },
  {
    path: '/generate',
    title: 'AI 生视频',
    desc: '全能参考生视频，支持真人出镜',
    cover: namiAsset('entry/aiVideo.png'),
    category: 'video',
    badgeImg: namiAsset('entry/seedanceBadge.png'),
  },
  {
    path: '/films?new=1&from=article',
    title: '文章转视频',
    desc: '输入文章 / 一句话，生成完整短片',
    cover: namiAsset('entry/article.png'),
    category: 'video',
  },
  {
    path: '/generate?mode=image',
    title: 'AI 生图',
    desc: '文生图 / 参考生图，沉淀到资产库',
    category: 'image',
  },
  {
    path: '/skills',
    title: '提示词',
    desc: '可复用的创作提示词与技能广场',
    category: 'script',
  },
];

const filteredTools = computed(() =>
  activeTab.value === 'all'
    ? tools
    : tools.filter((t) => t.category === activeTab.value),
);

const visibleDiscover = computed((): DiscoverCard[] => {
  if (discoverKind.value === 'video') return namiDiscoverCards;
  if (discoverKind.value === 'all') return [...namiDiscoverCards, ...discoverPosts.value];
  return discoverPosts.value.filter((p) => p.kind === discoverKind.value);
});

function kindLabel(kind: string) {
  if (kind === 'video') return '视频';
  if (kind === 'skill') return '技能';
  if (kind === 'template') return '模板';
  if (kind === 'production') return '项目';
  return '工作流';
}

function playDiscover(item: DiscoverCard) {
  if (!item.videoUrl) return;
  playingId.value = item.id;
}

function stopDiscover(item: DiscoverCard) {
  if (playingId.value !== item.id) return;
  playingId.value = '';
}

function open(tool: Tool) {
  const [path, query] = tool.path.split('?');
  void router.push({
    path,
    query: query ? Object.fromEntries(new URLSearchParams(query)) : {},
  });
}

function openDiscover(item: DiscoverCard) {
  if (item.shareToken) {
    void router.push(`/share/${encodeURIComponent(item.shareToken)}`);
    return;
  }
  if (item.kind === 'video') {
    void router.push('/generate');
    return;
  }
  ElMessage.info('该内容暂不可打开');
}

async function loadDiscover() {
  discoverLoading.value = true;
  try {
    const kind =
      discoverKind.value === 'all' || discoverKind.value === 'video'
        ? undefined
        : discoverKind.value;
    discoverPosts.value = await fetchDiscoverFeed({ kind, take: 48 });
  } catch (e: any) {
    discoverPosts.value = [];
    ElMessage.warning(e?.response?.data?.message || e?.message || '发现内容加载失败');
  } finally {
    discoverLoading.value = false;
  }
}

watch(discoverKind, () => {
  void loadDiscover();
});

onMounted(() => {
  void loadDiscover();
});

onBeforeUnmount(() => {
  playingId.value = '';
});
</script>

<style scoped>
.toolbox-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 22px 28px 56px;
  color: #f5f5f5;
}
.page-hero {
  margin-bottom: 18px;
}
.page-hero h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.sub {
  margin: 8px 0 0;
  color: #a3a3a3;
  font-size: 13px;
  line-height: 1.6;
}
.tool-tabs,
.discover-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}
.tool-tab {
  height: 32px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: transparent;
  color: #a3a3a3;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.tool-tab:hover {
  color: #eee;
  border-color: rgba(255, 255, 255, 0.18);
}
.tool-tab.on {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
  font-weight: 600;
}
.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.tool-card {
  position: relative;
  min-height: 220px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  overflow: hidden;
  background: #1a1a1a;
  color: #fff;
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition: transform 0.18s ease, border-color 0.18s ease;
}
.tool-card:hover {
  transform: translateY(-3px);
  border-color: rgba(59, 130, 246, 0.4);
}
.tool-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.62;
  transform: scale(1.04);
  transition: opacity 0.2s ease, transform 0.35s ease;
}
.tool-cover :deep(.el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tool-cover-ph {
  opacity: 1;
  transform: none;
  background: linear-gradient(160deg, #1e3a5f 0%, #0f172a 55%, #111827 100%);
}
.tool-card:hover .tool-cover {
  opacity: 0.78;
  transform: scale(1.08);
}
.tool-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.08) 18%, rgba(0, 0, 0, 0.78) 100%);
  pointer-events: none;
}
.tool-copy {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 220px;
  padding: 20px 18px 18px;
}
.tool-copy strong {
  font-size: 20px;
  font-weight: 650;
}
.tool-copy em {
  margin-top: 8px;
  font-style: normal;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.78);
}
.tool-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  font-size: 11px;
  font-weight: 650;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.88);
  color: #ffffff;
}
.tool-badge-img {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1;
  height: 28px;
  width: auto;
  display: block;
  pointer-events: none;
}

.discover-section {
  margin-top: 36px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.discover-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin: 18px 0 14px;
}
.discover-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
}
.discover-head p {
  margin: 6px 0 0;
  color: #a3a3a3;
  font-size: 13px;
  line-height: 1.5;
}
.refresh-btn {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: #d4d4d4;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.refresh-btn:hover:not(:disabled) {
  border-color: rgba(59, 130, 246, 0.45);
  color: #fff;
}
.refresh-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.discover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 14px;
  min-height: 160px;
}
.discover-card {
  overflow: hidden;
  border-radius: 14px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.discover-card:hover {
  transform: translateY(-2px);
  border-color: rgba(59, 130, 246, 0.4);
}
.discover-thumb {
  position: relative;
  aspect-ratio: 16 / 10;
  background: #141414;
  overflow: hidden;
}
.discover-card.video .discover-thumb {
  aspect-ratio: 9 / 16;
}
.discover-thumb :deep(.lazy-cover),
.discover-thumb img,
.discover-thumb video,
.discover-hover-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.discover-cover {
  z-index: 1;
  transition: opacity 0.2s ease;
}
.discover-hover-video {
  z-index: 2;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.discover-card.playing .discover-cover {
  opacity: 0;
}
.discover-card.playing .discover-hover-video {
  opacity: 1;
}
.discover-ph {
  display: grid;
  place-items: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.3);
  font-size: 18px;
  font-weight: 650;
}
.discover-kind {
  position: absolute;
  left: 10px;
  bottom: 10px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
}
.discover-body {
  padding: 10px 12px 12px;
}
.discover-body strong {
  display: block;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.discover-body em {
  display: -webkit-box;
  margin-top: 6px;
  min-height: 36px;
  font-style: normal;
  font-size: 12px;
  line-height: 1.45;
  color: #a3a3a3;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.discover-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  color: #737373;
  font-size: 11px;
}
.discover-empty {
  margin: 8px 0 0;
  padding: 36px 12px;
  text-align: center;
  color: #737373;
  font-size: 13px;
}

@media (max-width: 980px) {
  .tool-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 640px) {
  .toolbox-page {
    padding: 16px 14px 40px;
  }
  .tool-grid {
    grid-template-columns: 1fr;
  }
  .discover-head {
    flex-direction: column;
  }
}
</style>
