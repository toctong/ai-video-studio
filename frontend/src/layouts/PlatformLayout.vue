<template>
  <div
    class="app-shell app-shell--updream app-shell--nami"
    :class="{
      'app-shell--compact': immersive,
      'app-shell--settings': onSettings,
      'app-shell--canvas': onCanvas,
      'app-shell--film': onFilmWorkspace,
    }"
  >
    <div class="app-body">
      <aside v-if="!chromeHidden" class="app-rail" aria-label="主导航">
        <router-link
          :to="brandHome"
          class="rail-brand"
          :title="brandTitle"
          :aria-label="brandTitle"
        >
          <span class="app-brand-mark" aria-hidden="true">
            <BrandLogo :src="brandLogoUrl" />
          </span>
        </router-link>

        <div v-if="noticeText && showSystemNotice" class="rail-notice" role="status">
          <button type="button" class="rail-notice-close" aria-label="关闭公告" @click="dismissNotice">
            ×
          </button>
          <strong>{{ noticeTitle }}</strong>
          <p>{{ noticeText }}</p>
          <router-link v-if="noticeLink" :to="noticeLink" class="rail-notice-link" @click="dismissNotice">
            查看
          </router-link>
        </div>

        <UiScroll class="rail-nav-scroll" always>
        <nav class="app-rail-nav">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="app-rail-item"
            :class="{ active: isActive(item.path) }"
            :title="item.label"
            :aria-label="item.label"
          >
            <span class="rail-ico">
              <UiIcon :name="item.icon" :size="22" />
            </span>
            <span class="rail-label">{{ item.label }}</span>
          </router-link>
        </nav>
        </UiScroll>

        <div class="rail-footer">
          <JobQueuePanel compact />
          <UserMenu rail />
        </div>
      </aside>

      <main class="app-main">
        <header v-if="showTopSeg" class="app-topbar app-topbar--seg">
          <div class="app-topbar-center">
            <div class="top-seg" role="tablist" :aria-label="topSegLabel">
              <router-link
                v-for="t in topSegTabs"
                :key="t.path"
                :to="t.path"
                class="top-seg-item"
                :class="{ on: isTopSegOn(t.path) }"
                role="tab"
                :aria-selected="isTopSegOn(t.path)"
              >
                {{ t.label }}
              </router-link>
            </div>
          </div>
        </header>

        <UiScroll v-if="!scrollLocked" class="app-scroll" always>
          <div class="app-main-inner" :class="{ flush: canvasFlush }">
            <router-view v-slot="{ Component }">
              <component :is="Component" v-if="Component" />
            </router-view>
          </div>
        </UiScroll>
        <div v-else class="app-main-inner flush lock">
          <router-view v-slot="{ Component }">
            <component :is="Component" v-if="Component" />
          </router-view>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { PLATFORM_NAV, type NavItem } from '@/constants/app-nav';
import { fetchCmsHome } from '@/api/cms';
import { resolveMediaUrl } from '@/constants/oss-public';
import { useAuthStore } from '@/stores/auth';
import UserMenu from '@/components/UserMenu.vue';
import JobQueuePanel from '@/components/JobQueuePanel.vue';
import BrandLogo from '@/components/BrandLogo.vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import type { IconName } from '@/components/icons/types';
import { UiScroll } from '@/components/ui';

const route = useRoute();
const auth = useAuthStore();

const navItems = ref<NavItem[]>([...PLATFORM_NAV]);
const brandTitle = ref('AIGC 视频工厂');
const brandHome = ref('/home');
const brandLogoUrl = ref('');
const noticeTitle = ref('');
const noticeText = ref('');
const noticeLink = ref('');
const noticeDismissed = ref(false);

const showSystemNotice = computed(
  () => !noticeDismissed.value && auth.user?.notifyPrefs?.systemAnnounce !== false,
);

const promptTabs = [
  { path: '/skills', label: '提示词广场' },
  { path: '/skills/mine', label: '我的提示词' },
] as const;

const onPrompts = computed(
  () =>
    route.path === '/skills' ||
    route.path === '/skills/mine' ||
    route.path === '/home/plaza',
);

const topSegTabs = computed(() => (onPrompts.value ? promptTabs : []));
const showTopSeg = computed(() => topSegTabs.value.length > 0 && !chromeHidden.value);
const topSegLabel = computed(() => (onPrompts.value ? '提示词视图' : '视图切换'));

function isTopSegOn(path: string) {
  if (path === '/skills') {
    return route.path === '/skills' || route.path === '/home/plaza';
  }
  return route.path === path;
}

function dismissNotice() {
  noticeDismissed.value = true;
  noticeText.value = '';
}

function asIcon(name: unknown): IconName {
  const n = String(name || '').trim() as IconName;
  const allowed = new Set(PLATFORM_NAV.map((x) => x.icon));
  return allowed.has(n) ? n : 'home';
}

async function loadCmsShell() {
  try {
    const home = await fetchCmsHome();
    if (home.nav?.length) {
      navItems.value = home.nav
        .filter((x) => x.linkPath)
        .map((x) => ({
          path: x.linkPath,
          label: x.title || x.slug,
          icon: asIcon(x.meta?.icon),
          short: x.subtitle || undefined,
        }));
    }
    const brand = home.brand?.[0];
    if (brand) {
      brandTitle.value = brand.title || brandTitle.value;
      brandHome.value = brand.linkPath || '/home';
      if (brand.coverUrl) brandLogoUrl.value = resolveMediaUrl(brand.coverUrl);
    }
    const notice = home.notices?.[0];
    if (notice && showSystemNotice.value) {
      noticeTitle.value = notice.title || '公告';
      noticeText.value = String(notice.description || notice.subtitle || '').trim();
      noticeLink.value = notice.linkPath || '';
    }
  } catch {
    /* keep defaults */
  }
}

onMounted(() => {
  document.body.classList.add('shell-updream', 'shell-nami');
  void loadCmsShell();
});

onUnmounted(() => {
  document.body.classList.remove('shell-updream', 'shell-nami');
});

const onSettings = computed(() => route.path.startsWith('/settings'));
const onCanvas = computed(() => route.path.startsWith('/w/'));
const onFilmWorkspace = computed(
  () => /^\/films\/[^/]+/.test(route.path) && !route.path.startsWith('/films/c/'),
);
const chromeHidden = computed(() => onSettings.value || onCanvas.value);

const onBooks = computed(
  () => route.path === '/books' || route.path.startsWith('/books/'),
);

const studioRoute = computed(
  () =>
    route.path === '/home' ||
    route.path.startsWith('/home/') ||
    route.path === '/generate' ||
    route.path.startsWith('/generate/') ||
    route.path.startsWith('/skills') ||
    route.path.startsWith('/agents') ||
    route.path.startsWith('/workflows') ||
    route.path === '/productions' ||
    route.path.startsWith('/w/') ||
    route.path.startsWith('/runs/') ||
    route.path === '/assets' ||
    route.path.startsWith('/films') ||
    route.path === '/tools' ||
    route.path === '/models' ||
    onBooks.value ||
    onSettings.value,
);
const immersive = computed(() => studioRoute.value);

const canvasFlush = computed(
  () =>
    route.path === '/home' ||
    route.path.startsWith('/home/') ||
    route.path === '/generate' ||
    route.path.startsWith('/generate/') ||
    route.path.startsWith('/skills') ||
    route.path.startsWith('/agents') ||
    route.path.startsWith('/workflows') ||
    route.path === '/productions' ||
    route.path.startsWith('/w/') ||
    route.path.startsWith('/runs/') ||
    route.path === '/assets' ||
    route.path.startsWith('/films') ||
    route.path === '/tools' ||
    route.path === '/models' ||
    onBooks.value ||
    route.path.startsWith('/settings'),
);

const onBookWorkspace = computed(() =>
  /\/books\/[^/]+\/(chapters|outline|timeline|characters)(?:\/|$)/.test(route.path),
);

const scrollLocked = computed(
  () =>
    route.path.startsWith('/w/') ||
    route.path.startsWith('/runs/') ||
    route.path === '/assets' ||
    route.path === '/generate' ||
    route.path.startsWith('/generate/') ||
    onFilmWorkspace.value ||
    onBookWorkspace.value,
);

function isActive(path: string) {
  if (path === '/home') {
    return route.path === '/home';
  }
  if (path === '/generate') {
    return route.path === '/generate' || route.path.startsWith('/generate/');
  }
  if (path === '/productions') {
    return (
      route.path === '/productions' ||
      route.path.startsWith('/w/') ||
      route.path.startsWith('/runs/')
    );
  }
  if (path === '/assets') {
    return route.path === '/assets' || route.path.startsWith('/assets/');
  }
  if (path === '/films') {
    return route.path === '/films' || route.path.startsWith('/films/');
  }
  if (path === '/books') {
    return onBooks.value;
  }
  return route.path === path || route.path.startsWith(`${path}/`);
}
</script>

<style scoped>
.rail-notice {
  margin: 0 10px 10px;
  padding: 10px 12px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--studio-panel) 88%, #3b82f6 12%);
  color: var(--studio-ink);
  font-size: 12px;
  line-height: 1.45;
  position: relative;
}
.rail-notice strong {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
}
.rail-notice p {
  margin: 0;
  color: var(--studio-muted);
}
.rail-notice-close {
  position: absolute;
  top: 4px;
  right: 6px;
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.rail-notice-link {
  display: inline-block;
  margin-top: 6px;
  color: var(--studio-ink);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
