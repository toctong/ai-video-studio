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
        <router-link to="/home" class="rail-brand" title="AIGC 视频工厂" aria-label="首页">
          <span class="app-brand-mark" aria-hidden="true">
            <BrandLogo />
          </span>
        </router-link>

        <UiScroll class="rail-nav-scroll" always>
        <nav class="app-rail-nav">
          <router-link
            v-for="item in PLATFORM_NAV"
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
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { PLATFORM_NAV } from '@/constants/app-nav';
import UserMenu from '@/components/UserMenu.vue';
import JobQueuePanel from '@/components/JobQueuePanel.vue';
import BrandLogo from '@/components/BrandLogo.vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import { UiScroll } from '@/components/ui';

const route = useRoute();

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

onMounted(() => {
  document.body.classList.add('shell-updream', 'shell-nami');
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
