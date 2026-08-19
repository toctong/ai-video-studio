<template>
  <a-layout class="admin-layout">
    <a-layout-sider
      class="admin-layout__sider"
      collapsible
      breakpoint="lg"
      :width="220"
      :collapsed-width="64"
      v-model:collapsed="collapsed"
    >
      <div class="brand" :class="{ 'brand--collapsed': collapsed }">
        <div class="brand__mark">AV</div>
        <div v-if="!collapsed" class="brand__text">
          <div class="brand__title">Video Studio</div>
          <div class="brand__sub">后台管理</div>
        </div>
      </div>
      <a-menu
        :selected-keys="[active]"
        :collapsed="collapsed"
        theme="dark"
        @menu-item-click="onMenu"
      >
        <a-menu-item v-for="item in menuRoutes" :key="item.path">
          <template #icon>
            <component :is="iconMap[item.icon]" />
          </template>
          {{ item.title }}
        </a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout class="admin-layout__main">
      <a-layout-header class="admin-layout__header">
        <div class="header-left">
          <a-breadcrumb>
            <a-breadcrumb-item>管理后台</a-breadcrumb-item>
            <a-breadcrumb-item>{{ currentTitle }}</a-breadcrumb-item>
          </a-breadcrumb>
        </div>
        <div class="header-right">
          <a-button type="text" @click="openFrontend">打开前台</a-button>
          <a-dropdown trigger="click">
            <a-button type="text">
              <icon-user />
              {{ displayName }}
            </a-button>
            <template #content>
              <a-doption @click="logout">退出登录</a-doption>
            </template>
          </a-dropdown>
        </div>
      </a-layout-header>
      <a-layout-content class="admin-layout__content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IconApps,
  IconBook,
  IconCalendar,
  IconDashboard,
  IconFolder,
  IconRobot,
  IconSettings,
  IconStorage,
  IconThunderbolt,
  IconUser,
  IconVideoCamera,
} from '@arco-design/web-vue/es/icon';
import { menuRoutes } from '@/router';
import { useAuthStore } from '@/stores/auth';

const collapsed = ref(false);
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const iconMap: Record<string, unknown> = {
  'icon-dashboard': IconDashboard,
  'icon-user': IconUser,
  'icon-book': IconBook,
  'icon-video-camera': IconVideoCamera,
  'icon-folder': IconFolder,
  'icon-calendar': IconCalendar,
  'icon-apps': IconApps,
  'icon-settings': IconSettings,
  'icon-storage': IconStorage,
  'icon-thunderbolt': IconThunderbolt,
  'icon-robot': IconRobot,
};

const active = computed(() => route.path);
const currentTitle = computed(() => {
  const hit = menuRoutes.find((m) => m.path === route.path);
  return hit?.title || '后台';
});
const displayName = computed(
  () => auth.user?.nickname || auth.user?.username || '管理员',
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
  height: 100%;

  &__sider {
    background: var(--admin-sider) !important;

    :deep(.arco-layout-sider-children) {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    :deep(.arco-menu) {
      flex: 1;
      overflow: auto;
      background: transparent;
    }
  }

  &__main {
    overflow: hidden;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 20px;
    background: #fff;
    border-bottom: 1px solid var(--color-border-2);
  }

  &__content {
    padding: 16px;
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

  &--collapsed {
    justify-content: center;
    padding: 0;
  }

  &__mark {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, #165dff, #0fc6c2);
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 12px;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
  }

  &__sub {
    margin-top: 2px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
