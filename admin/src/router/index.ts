import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { auth: true },
      children: [
        { path: '', redirect: '/dashboard' },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: '工作台', icon: 'icon-dashboard' },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: { title: '用户管理', icon: 'icon-user' },
        },
        {
          path: 'cms',
          name: 'cms',
          component: () => import('@/views/CmsView.vue'),
          meta: { title: '内容运营', icon: 'icon-apps' },
        },
        {
          path: 'storage',
          name: 'storage',
          component: () => import('@/views/StorageView.vue'),
          meta: { title: '对象存储', icon: 'icon-storage' },
        },
        {
          path: 'channels',
          name: 'channels',
          component: () => import('@/views/ChannelsView.vue'),
          meta: { title: '渠道管理', icon: 'icon-thunderbolt' },
        },
        {
          path: 'models',
          name: 'models',
          component: () => import('@/views/ModelsView.vue'),
          meta: { title: '模型管理', icon: 'icon-robot' },
        },
        {
          path: 'projects',
          name: 'projects',
          component: () => import('@/views/ProjectsView.vue'),
          meta: { title: '书库项目', icon: 'icon-book' },
        },
        {
          path: 'productions',
          name: 'productions',
          component: () => import('@/views/ProductionsView.vue'),
          meta: { title: '制作项目', icon: 'icon-video-camera' },
        },
        {
          path: 'assets',
          name: 'assets',
          component: () => import('@/views/AssetsView.vue'),
          meta: { title: '资产管理', icon: 'icon-folder' },
        },
        {
          path: 'jobs',
          name: 'jobs',
          component: () => import('@/views/JobsView.vue'),
          meta: { title: '任务中心', icon: 'icon-calendar' },
        },
        {
          path: 'discover',
          name: 'discover',
          component: () => import('@/views/DiscoverView.vue'),
          meta: { title: '发现广场', icon: 'icon-apps' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { title: '系统设置', icon: 'icon-settings' },
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    if (!auth.hydrated) await auth.hydrate();
    if (auth.isAuthenticated && to.path === '/login') return '/dashboard';
    return true;
  }
  await auth.hydrate();
  if (!auth.isAuthenticated) return '/login';
  if (!auth.isAdmin) {
    auth.logout();
    return '/login';
  }
  return true;
});

export default router;

export const menuRoutes = [
  { path: '/dashboard', title: '工作台', icon: 'icon-dashboard' },
  { path: '/users', title: '用户管理', icon: 'icon-user' },
  { path: '/cms', title: '内容运营', icon: 'icon-apps' },
  { path: '/storage', title: '对象存储', icon: 'icon-storage' },
  { path: '/channels', title: '渠道管理', icon: 'icon-thunderbolt' },
  { path: '/models', title: '模型管理', icon: 'icon-robot' },
  { path: '/projects', title: '书库项目', icon: 'icon-book' },
  { path: '/productions', title: '制作项目', icon: 'icon-video-camera' },
  { path: '/assets', title: '资产管理', icon: 'icon-folder' },
  { path: '/jobs', title: '任务中心', icon: 'icon-calendar' },
  { path: '/discover', title: '发现广场', icon: 'icon-apps' },
  { path: '/settings', title: '系统设置', icon: 'icon-settings' },
];
