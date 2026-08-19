<template>
  <div class="home-dashboard">
    <div class="home-inner">
      <section class="hero-carousel" aria-label="活动轮播">
        <div class="hero-track">
          <button
            v-for="(b, i) in banners"
            :key="b.id"
            type="button"
            class="hero-slide"
            :data-role="slideRole(i)"
            :data-exit="slideExitSide(i)"
            :aria-hidden="slideRole(i) === 'hidden'"
            :tabindex="slideRole(i) === 'hidden' ? -1 : 0"
            @click="onHeroSlideClick(i, b)"
          >
            <LazyCoverImage
              class="hero-slide__img"
              :src="b.cover"
              :alt="b.title"
              :eager="slideRole(i) !== 'hidden'"
            />
          </button>
        </div>
        <div class="hero-dots" role="tablist" aria-label="轮播指示">
          <button
            v-for="(b, i) in banners"
            :key="'dot-' + b.id"
            type="button"
            class="hero-dot"
            :class="{ on: i === heroIndex }"
            role="tab"
            :aria-selected="i === heroIndex"
            :aria-label="'第 ' + (i + 1) + ' 张'"
            @click="goHero(i)"
          />
        </div>
      </section>

      <section class="entry-section">
        <button
          v-for="card in entryCards"
          :key="card.path + card.title"
          type="button"
          class="entry-card"
          :class="card.tone"
          @click="goPath(card.path)"
        >
          <LazyCoverImage v-if="card.cover" class="entry-bg" :src="card.cover" alt="" />
          <span class="entry-shade" aria-hidden="true" />
          <div class="entry-visual" aria-hidden="true">
            <span v-if="card.icon === 'plus'" class="entry-plus">+</span>
            <span v-else class="entry-icon"><UiIcon :name="card.icon" :size="22" /></span>
          </div>
          <div class="entry-copy">
            <strong>{{ card.title }}</strong>
            <em>{{ card.desc }}</em>
          </div>
          <span v-if="card.badgeImg" class="entry-badge-img-wrap" aria-hidden="true">
            <img class="entry-badge-img" :src="card.badgeImg" alt="" />
          </span>
          <span v-else-if="card.badge" class="entry-badge">{{ card.badge }}</span>
        </button>
      </section>

      <section class="works-section">
        <header class="works-head">
          <h2>爆款作品</h2>
          <div class="filter-row" role="tablist" aria-label="作品分类">
            <button
              v-for="tab in filterTabs"
              :key="tab.key"
              type="button"
              class="filter-pill"
              :class="{ on: activeFilter === tab.key }"
              role="tab"
              :aria-selected="activeFilter === tab.key"
              @click="activeFilter = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
        </header>

        <div v-loading="loading" class="works-grid">
          <article
            v-for="item in filteredShowcase"
            :key="item.id"
            class="work-card"
            @click="openShowcase(item)"
          >
            <div class="work-thumb">
              <LazyVideo
                v-if="item.mediaKind === 'video' && item.url"
                class="work-video"
                :src="item.url"
              />
              <LazyCoverImage
                v-else-if="item.url"
                :src="item.url"
                :alt="item.title"
              />
              <LazyCoverImage
                v-else-if="item.cover"
                :src="item.cover"
                :alt="item.title"
              />
              <span v-else class="empty-thumb">{{ item.placeholder }}</span>
              <span class="work-tag">{{ item.subtitle }}</span>
            </div>
            <div class="work-body">
              <strong>{{ item.title }}</strong>
            </div>
          </article>

          <el-empty
            v-if="!loading && !filteredShowcase.length"
            class="empty"
            description="还没有作品，先去「制作大片」生成一个吧"
          >
            <el-button type="primary" round @click="goPath('/films?new=1')">立即制作</el-button>
          </el-empty>
        </div>
      </section>

      <footer class="home-foot">
        <span>使用协议</span>
        <span>|</span>
        <span>隐私条款</span>
        <span>|</span>
        <span>AIGC 视频工厂</span>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { listGenerateAssets, type GenerateAssetItem } from '@/api/generate';
import { fetchCmsHome, type CmsItem } from '@/api/cms';
import UiIcon from '@/components/icons/UiIcon.vue';
import type { IconName } from '@/components/icons/types';
import LazyCoverImage from '@/components/LazyCoverImage.vue';
import LazyVideo from '@/components/LazyVideo.vue';

type ShowcaseItem = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  url: string;
  cover?: string;
  mediaKind: 'image' | 'video' | 'cover';
  target: string;
  placeholder?: string;
};

type Banner = {
  id: string;
  kicker: string;
  title: string;
  desc: string;
  path: string;
  cover: string;
};

type EntryCard = {
  path: string;
  title: string;
  desc: string;
  icon: IconName | 'plus';
  tone: string;
  badge?: string;
  badgeImg?: string;
  cover?: string;
};

type HeroRole = 'main' | 'prev' | 'next' | 'hidden';

const router = useRouter();
const loading = ref(false);
const generateAssets = ref<GenerateAssetItem[]>([]);
const activeFilter = ref('all');
const heroIndex = ref(0);
let heroTimer: ReturnType<typeof setInterval> | null = null;

const banners = ref<Banner[]>([]);
const entryCards = ref<EntryCard[]>([]);
const demoShowcase = ref<ShowcaseItem[]>([]);

const filterTabs = [
  { key: 'all', label: '全部作品' },
  { key: 'drama', label: '真人短剧' },
  { key: 'ad', label: '商业广告' },
  { key: 'history', label: '历史故事' },
  { key: 'anime', label: '游戏动漫' },
  { key: 'video', label: 'AI 视频' },
  { key: 'image', label: 'AI 图片' },
];

function mapBanners(items: CmsItem[]): Banner[] {
  return items.map((b) => ({
    id: b.slug || b.id,
    kicker: b.subtitle || '',
    title: b.title || '',
    desc: String(b.description || ''),
    path: b.linkPath || '/home',
    cover: b.coverUrl || '',
  }));
}

function mapEntries(items: CmsItem[]): EntryCard[] {
  return items.map((e) => {
    const meta = (e.meta || {}) as Record<string, unknown>;
    return {
      path: e.linkPath || '/home',
      title: e.title || '',
      desc: String(e.description || ''),
      icon: (String(meta.icon || 'plus') as IconName | 'plus'),
      tone: String(meta.tone || ''),
      badge: meta.badge ? String(meta.badge) : undefined,
      badgeImg: meta.badgeImg ? String(meta.badgeImg) : undefined,
      cover: e.coverUrl || undefined,
    };
  });
}

function mapShowcases(items: CmsItem[]): ShowcaseItem[] {
  return items.map((s) => {
    const meta = (s.meta || {}) as Record<string, unknown>;
    return {
      id: s.slug || s.id,
      title: s.title || '',
      subtitle: s.subtitle || '',
      category: String(meta.category || 'all'),
      url: '',
      cover: s.coverUrl || '',
      mediaKind: (String(meta.mediaKind || 'cover') as ShowcaseItem['mediaKind']),
      target: s.linkPath || '/generate',
    };
  });
}

const showcaseItems = computed<ShowcaseItem[]>(() => {
  const generated: ShowcaseItem[] = generateAssets.value.map((a) => ({
    id: `generate:${a.id}`,
    title: a.name || a.sessionTitle || '生成作品',
    subtitle: a.kind === 'video' ? 'AI 视频' : 'AI 图片',
    category: a.kind === 'video' ? 'video' : 'image',
    url: a.url,
    mediaKind: a.kind === 'video' ? 'video' : 'image',
    target: '/assets',
  }));
  if (generated.length) return generated;
  return demoShowcase.value;
});

const filteredShowcase = computed(() => {
  if (activeFilter.value === 'all') return showcaseItems.value;
  return showcaseItems.value.filter((item) => item.category === activeFilter.value);
});

function goPath(raw: string) {
  const [path, qs] = String(raw || '').split('?');
  void router.push({
    path,
    query: qs ? Object.fromEntries(new URLSearchParams(qs)) : {},
  });
}

function slideRole(i: number): HeroRole {
  const n = banners.value.length;
  if (!n) return 'hidden';
  const prev = (heroIndex.value - 1 + n) % n;
  const next = (heroIndex.value + 1) % n;
  if (i === heroIndex.value) return 'main';
  if (i === prev) return 'prev';
  if (i === next) return 'next';
  return 'hidden';
}

/** 隐藏卡按滑动方向停在外侧，避免穿过主卡 */
function slideExitSide(i: number): 'left' | 'right' | 'center' {
  if (slideRole(i) !== 'hidden') return 'center';
  const n = banners.value.length;
  if (!n) return 'center';
  const dist = (i - heroIndex.value + n) % n;
  if (dist > n / 2) return 'left';
  return 'right';
}

function setHeroIndex(i: number) {
  const n = banners.value.length;
  if (!n) return;
  const next = ((i % n) + n) % n;
  if (next === heroIndex.value) return;
  heroIndex.value = next;
}

function goHero(i: number) {
  setHeroIndex(i);
  restartHeroTimer();
}

function onHeroSlideClick(i: number, b: Banner) {
  const role = slideRole(i);
  if (role === 'prev' || role === 'next') {
    goHero(i);
    return;
  }
  if (role === 'main') goPath(b.path);
}

function restartHeroTimer() {
  if (heroTimer) clearInterval(heroTimer);
  if (banners.value.length < 2) return;
  heroTimer = setInterval(() => {
    setHeroIndex(heroIndex.value + 1);
  }, 4800);
}

function openShowcase(item: ShowcaseItem) {
  goPath(item.target);
}

async function loadHome() {
  loading.value = true;
  try {
    const [cms, gen] = await Promise.all([
      fetchCmsHome(),
      listGenerateAssets({ take: 24, skip: 0 }),
    ]);
    banners.value = mapBanners(cms.banners);
    entryCards.value = mapEntries(cms.entries);
    demoShowcase.value = mapShowcases(cms.showcases);
    generateAssets.value = gen.items || [];
    heroIndex.value = 0;
    restartHeroTimer();
  } catch (e: any) {
    ElMessage.error(String(e?.response?.data?.message || e?.message || '首页数据加载失败'));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadHome();
});

onUnmounted(() => {
  if (heroTimer) clearInterval(heroTimer);
});
</script>

<style scoped>
/* 首页与全站深色 token 对齐 */
.home-dashboard {
  min-height: 100%;
  max-width: 100%;
  background: var(--studio-bg, #111);
  color: var(--studio-ink, #f5f5f5);
  overflow: hidden;
}
.home-inner {
  max-width: min(1280px, 100%);
  margin: 0 auto;
  padding: 16px 24px 40px;
  overflow: hidden;
  box-sizing: border-box;
}

.hero-carousel {
  --hero-gap: 3.2%;
  --hero-side-w: 26%;
  --hero-main-w: 41.6%; /* 100% - 2*26% - 2*3.2% */
  --hero-side-scale: 0.97;
  --hero-track-h: clamp(140px, 16vw, 220px);
  --hero-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  margin: 8px 0 18px;
  padding: 0 0 32px;
  overflow: visible;
}
.hero-track {
  position: relative;
  width: 100%;
  height: var(--hero-track-h);
  min-height: 140px;
  perspective: 1100px;
  perspective-origin: 50% 45%;
}
.hero-slide {
  position: absolute;
  top: 50%;
  left: calc((100% - var(--hero-main-w)) / 2);
  width: var(--hero-main-w);
  height: 90%;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 16px;
  overflow: hidden;
  background: #1c1e20;
  color: #fff;
  text-align: left;
  cursor: pointer;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
  filter: brightness(0.45);
  transform-style: preserve-3d;
  transform: translate3d(0, -50%, 0) scale(0.92);
  will-change: transform, opacity, filter, left, width, height;
  transition:
    left 0.7s var(--hero-ease),
    width 0.7s var(--hero-ease),
    height 0.7s var(--hero-ease),
    transform 0.7s var(--hero-ease),
    opacity 0.55s var(--hero-ease),
    filter 0.55s ease,
    box-shadow 0.45s ease;
}
.hero-slide[data-role='main'] {
  left: calc((100% - var(--hero-main-w)) / 2);
  width: var(--hero-main-w);
  height: 100%;
  z-index: 3;
  opacity: 1;
  pointer-events: auto;
  filter: brightness(1);
  transform: translate3d(0, -50%, 0) rotateY(0deg) scale(1);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.28);
}
.hero-slide[data-role='prev'] {
  left: 0;
  width: var(--hero-side-w);
  height: 90%;
  z-index: 2;
  opacity: 1;
  pointer-events: auto;
  filter: brightness(0.62) saturate(0.9);
  transform-origin: 85% 50%;
  transform: translate3d(0, -50%, -40px) rotateY(14deg) scale(var(--hero-side-scale));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.38);
}
.hero-slide[data-role='next'] {
  left: calc(100% - var(--hero-side-w));
  width: var(--hero-side-w);
  height: 90%;
  z-index: 2;
  opacity: 1;
  pointer-events: auto;
  filter: brightness(0.62) saturate(0.9);
  transform-origin: 15% 50%;
  transform: translate3d(0, -50%, -40px) rotateY(-14deg) scale(var(--hero-side-scale));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.38);
}
.hero-slide[data-role='hidden'] {
  height: 86%;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
  filter: brightness(0.4);
  transform: translate3d(0, -50%, 0) scale(0.9);
}
.hero-slide[data-role='hidden'][data-exit='left'] {
  left: calc(0% - var(--hero-side-w) - var(--hero-gap));
  width: var(--hero-side-w);
  transform-origin: 85% 50%;
  transform: translate3d(0, -50%, -70px) rotateY(18deg) scale(0.88);
}
.hero-slide[data-role='hidden'][data-exit='right'] {
  left: calc(100% + var(--hero-gap));
  width: var(--hero-side-w);
  transform-origin: 15% 50%;
  transform: translate3d(0, -50%, -70px) rotateY(-18deg) scale(0.88);
}
.hero-slide[data-role='hidden'][data-exit='center'] {
  left: calc((100% - var(--hero-main-w)) / 2);
  width: var(--hero-main-w);
}
.hero-slide[data-role='prev']:hover {
  filter: brightness(0.84) saturate(0.96);
  transform: translate3d(0, -50%, -22px) rotateY(11deg) scale(calc(var(--hero-side-scale) + 0.015));
}
.hero-slide[data-role='next']:hover {
  filter: brightness(0.84) saturate(0.96);
  transform: translate3d(0, -50%, -22px) rotateY(-11deg) scale(calc(var(--hero-side-scale) + 0.015));
}
.hero-slide__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  pointer-events: none;
}
.hero-slide__img :deep(.el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  display: flex;
  justify-content: center;
  gap: 6px;
  z-index: 5;
}
.hero-dot {
  width: 14px;
  height: 3px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.28);
  cursor: pointer;
  transition: width 0.35s var(--hero-ease, ease), background 0.35s ease;
}
.hero-dot.on {
  width: 24px;
  background: #fff;
}

.entry-section {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.entry-card {
  position: relative;
  min-height: 96px;
  padding: 16px 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  text-align: left;
  color: #fff;
  cursor: pointer;
  overflow: hidden;
  background: #1a1a1a;
  transition: transform 0.18s ease, border-color 0.18s ease;
}
.entry-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.14);
}
.entry-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.35;
}
.entry-bg :deep(.el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.entry-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(12, 12, 12, 0.92) 0%, rgba(12, 12, 12, 0.55) 100%);
}
.entry-card.tone-film {
  background: #10261c;
}
.entry-card.tone-film .entry-shade {
  background: linear-gradient(90deg, rgba(10, 40, 28, 0.92) 0%, rgba(10, 40, 28, 0.45) 100%);
}
.entry-card.tone-video .entry-shade {
  background: linear-gradient(90deg, rgba(18, 18, 18, 0.94) 0%, rgba(18, 18, 18, 0.5) 100%);
}
.entry-card.tone-article .entry-shade {
  background: linear-gradient(90deg, rgba(15, 25, 48, 0.94) 0%, rgba(15, 25, 48, 0.5) 100%);
}
.entry-visual,
.entry-copy {
  position: relative;
  z-index: 1;
}
.entry-plus {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: #3b82f6;
  color: #fff;
  font-size: 28px;
  font-weight: 400;
  line-height: 1;
}
.entry-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.entry-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.entry-copy strong {
  font-size: 15px;
  font-weight: 700;
}
.entry-copy em {
  font-style: normal;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.72;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.entry-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  height: 20px;
  padding: 0 7px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
  font-size: 10px;
  font-weight: 700;
}
.entry-badge-img-wrap {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  height: 20px;
  pointer-events: none;
}
.entry-badge-img {
  display: block;
  height: 20px;
  width: auto;
}

.works-section {
  margin-bottom: 16px;
}
.works-head {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 16px;
}
.works-head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.filter-pill {
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #a3a3a3;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.filter-pill:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}
.filter-pill.on {
  background: #2a2a2a;
  color: #fff;
}

.works-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
  min-height: 180px;
}
.work-card {
  overflow: hidden;
  border-radius: 14px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.work-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.14);
}
.work-thumb {
  position: relative;
  aspect-ratio: 16 / 10;
  background: #141414;
  overflow: hidden;
}
.work-thumb :deep(.lazy-cover),
.work-thumb img,
.work-thumb video,
.work-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.empty-thumb {
  display: grid;
  place-items: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.28);
  font-size: 28px;
  font-weight: 700;
}
.work-tag {
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
.work-body {
  padding: 10px 12px 12px;
}
.work-body strong {
  display: block;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  grid-column: 1 / -1;
  min-height: 220px;
  display: grid;
  place-items: center;
}

.home-foot {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 28px 0 8px;
  color: #525252;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .entry-section {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hero-carousel {
    --hero-side-w: 25%;
    --hero-main-w: 42%;
    --hero-gap: 4%;
    --hero-track-h: clamp(130px, 18vw, 200px);
  }
}
@media (max-width: 720px) {
  .home-inner {
    padding: 12px 12px 32px;
  }
  .hero-carousel {
    --hero-side-w: 22%;
    --hero-main-w: 48%;
    --hero-side-scale: 0.95;
    --hero-track-h: clamp(110px, 28vw, 160px);
    overflow: hidden;
  }
  .entry-section {
    grid-template-columns: 1fr;
  }
}
</style>
