<template>
  <a-layout class="admin-layout">
    <a-layout-sider
      class="admin-layout__sider"
      :class="{ 'admin-layout__sider--light': !app.menuDark, 'app-menu-dark': app.menuDark }"
      collapsible
      breakpoint="lg"
      :width="232"
      :collapsed-width="64"
      :collapsed="app.menuCollapsed"
      :hide-trigger="true"
      @collapse="(v: boolean) => (app.menuCollapsed = v)"
    >
      <div class="brand" :class="{ 'brand--collapsed': app.menuCollapsed }" @click="router.push('/dashboard')">
        <BrandLogo :size="app.menuCollapsed ? 'sm' : 'md'" class="brand__mark" />
        <div v-if="!app.menuCollapsed" class="brand__text">
          <div class="brand__title">Video Studio</div>
          <div class="brand__sub">Admin Console</div>
        </div>
      </div>

      <a-scrollbar outer-class="admin-layout__menu-scroll" style="height: 100%">
        <a-menu
          :selected-keys="[active]"
          v-model:open-keys="openKeys"
          :collapsed="app.menuCollapsed"
          :theme="app.menuDark ? 'dark' : 'light'"
          :accordion="true"
          auto-open-selected
          @menu-item-click="onMenu"
        >
          <template v-for="group in sidebarGroups" :key="group.key">
            <a-menu-item
              v-if="group.children.length === 1 && group.children[0].path"
              :key="group.children[0].path"
            >
              <template #icon>
                <component :is="iconMap[group.children[0].icon] || iconMap['icon-apps']" />
              </template>
              {{ group.children[0].title }}
            </a-menu-item>
            <a-sub-menu v-else :key="group.key">
              <template #icon>
                <component :is="iconMap[group.icon] || iconMap['icon-apps']" />
              </template>
              <template #title>{{ group.title }}</template>
              <a-menu-item v-for="item in group.children" :key="item.path">
                <template #icon>
                  <component :is="iconMap[item.icon] || iconMap['icon-apps']" />
                </template>
                {{ item.title }}
              </a-menu-item>
            </a-sub-menu>
          </template>
        </a-menu>
      </a-scrollbar>
    </a-layout-sider>

    <a-layout class="admin-layout__main">
      <a-layout-header class="admin-layout__header">
        <div class="header-left">
          <a-button class="header-icon-btn" type="text" @click="app.toggleMenu()">
            <icon-menu-fold v-if="!app.menuCollapsed" :size="18" />
            <icon-menu-unfold v-else :size="18" />
          </a-button>
          <a-breadcrumb class="header-breadcrumb">
            <a-breadcrumb-item>管理后台</a-breadcrumb-item>
            <a-breadcrumb-item v-if="groupTitle">{{ groupTitle }}</a-breadcrumb-item>
            <a-breadcrumb-item>{{ currentTitle }}</a-breadcrumb-item>
          </a-breadcrumb>
        </div>

        <div class="header-right">
          <a-tooltip content="打开前台">
            <a-button class="header-icon-btn" type="text" @click="openFrontend">
              <icon-launch :size="18" />
            </a-button>
          </a-tooltip>
          <a-tooltip content="全屏">
            <a-button class="header-icon-btn" type="text" @click="toggle">
              <icon-fullscreen v-if="!isFullscreen" :size="18" />
              <icon-fullscreen-exit v-else :size="18" />
            </a-button>
          </a-tooltip>
          <a-tooltip :content="app.isDark ? '切换浅色' : '切换深色'">
            <a-button class="header-icon-btn" type="text" @click="app.toggleTheme()">
              <icon-moon v-if="!app.isDark" :size="18" />
              <icon-sun v-else :size="18" />
            </a-button>
          </a-tooltip>
          <a-tooltip :content="app.menuDark ? '浅色侧栏' : '深色侧栏'">
            <a-button class="header-icon-btn" type="text" @click="app.toggleMenuDark()">
              <icon-skin :size="18" />
            </a-button>
          </a-tooltip>

          <a-dropdown trigger="hover">
            <div class="user-chip">
              <a-avatar :size="32" :style="{ background: 'linear-gradient(135deg,#165dff,#0fc6c2)' }">
                {{ avatarLetter }}
              </a-avatar>
              <span class="user-chip__name">{{ displayName }}</span>
              <icon-down :size="12" />
            </div>
            <template #content>
              <a-doption @click="router.push('/settings')">
                <template #icon><icon-settings /></template>
                系统设置
              </a-doption>
              <a-doption @click="openFrontend">
                <template #icon><icon-launch /></template>
                打开前台
              </a-doption>
              <a-divider :margin="4" />
              <a-doption @click="logout">
                <template #icon><icon-export /></template>
                退出登录
              </a-doption>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>

      <LayoutTabs />

      <a-layout-content class="admin-layout__content">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" v-if="app.reloadFlag" :key="route.path" />
          </transition>
        </router-view>
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFullscreen } from '@vueuse/core';
import { findMenuTitle, iconMap, type ApiMenuNode } from '@/config/menu';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import LayoutTabs from './components/LayoutTabs.vue';
import BrandLogo from '@/components/BrandLogo.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const app = useAppStore();
const { isFullscreen, toggle } = useFullscreen();

const sidebarGroups = computed(() => {
  const trees = auth.menus || [];
  return trees
    .filter((n) => n.type === 1 || n.path)
    .map((n) => {
      if (n.type === 2 && n.path) {
        return {
          key: n.id,
          title: n.title,
          icon: n.icon || 'icon-apps',
          children: [{ path: n.path, title: n.title, icon: n.icon || 'icon-apps' }],
        };
      }
      const children = (n.children || [])
        .filter((c: ApiMenuNode) => c.type === 2 && c.path)
        .map((c: ApiMenuNode) => ({
          path: c.path,
          title: c.title,
          icon: c.icon || 'icon-apps',
        }));
      return {
        key: n.id,
        title: n.title,
        icon: n.icon || children[0]?.icon || 'icon-apps',
        children,
      };
    })
    .filter((g) => g.children.length);
});

const active = computed(() => route.path);
const currentTitle = computed(() => findMenuTitle(route.path, auth.menus));
const groupTitle = computed(() => {
  const g = sidebarGroups.value.find((x) => x.children.some((c) => c.path === route.path));
  return g && g.children.length > 1 ? g.title : '';
});
const displayName = computed(
  () => auth.user?.nickname || auth.user?.username || '管理员',
);
const avatarLetter = computed(() => {
  const n = displayName.value.trim();
  return (n[0] || 'A').toUpperCase();
});

const openKeys = ref<string[]>([]);

watch(
  () => route.path,
  (path) => {
    const g = sidebarGroups.value.find((x) => x.children.some((c) => c.path === path));
    if (g && g.children.length > 1) {
      openKeys.value = [g.key];
    }
  },
  { immediate: true },
);

function onMenu(key: string) {
  router.push(key);
}

function openFrontend() {
  window.open('/', '_blank');
}

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped lang="scss">
.admin-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100vh;
  overflow: hidden;

  &__sider {
    flex-shrink: 0;
    height: 100vh;
    background: var(--color-menu-light-bg) !important;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04);

    &.app-menu-dark {
      background: var(--color-menu-dark-bg, var(--admin-sider)) !important;
      box-shadow: 2px 0 12px rgba(0, 0, 0, 0.18);
    }

    &--light {
      border-right: 1px solid var(--color-border-2);
      box-shadow: none;

      .brand {
        color: var(--color-text-1);
        border-bottom-color: var(--color-border-2);

        &__sub {
          color: var(--color-text-3);
        }
      }
    }

    :deep(.arco-layout-sider-children) {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    :deep(.admin-layout__menu-scroll) {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    :deep(.arco-menu) {
      background: transparent;
      width: 100%;
      padding-bottom: 12px;
    }

    :deep(.arco-menu.arco-menu-vertical.arco-menu-collapsed) {
      .arco-menu-icon {
        padding: 10px 0;
        margin-right: 0;
      }

      .arco-menu-has-icon {
        justify-content: center;
        padding: 0;
      }

      .arco-menu-title {
        display: none;
      }
    }
  }

  &__main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    height: 100vh;
    overflow: hidden;
    background: var(--admin-bg);
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    height: 56px;
    padding: 0 16px 0 8px;
    background: var(--color-bg-2);
    border-bottom: 1px solid var(--color-border-2);
  }

  &__content {
    flex: 1;
    min-height: 0;
    padding: var(--padding);
    overflow: auto;
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 64px;
  padding: 0 16px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  user-select: none;

  &--collapsed {
    justify-content: center;
    padding: 0;
  }

  &__mark {
    flex-shrink: 0;
    filter: drop-shadow(0 6px 16px rgba(22, 93, 255, 0.28));
  }

  &__title {
    font-size: 15px;
    font-weight: 650;
    line-height: 1.2;
  }

  &__sub {
    margin-top: 2px;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.header-breadcrumb {
  margin-left: 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.header-icon-btn {
  color: var(--color-text-2) !important;
  width: 32px;
  height: 32px;
}

.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  padding: 4px 8px 4px 4px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--color-fill-2);
  }

  &__name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-1);
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
