import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { findMenuTitle } from '@/config/menu';

const router = createRouter({
  history: createWebHistory('/admin/'),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/index.vue'),
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
          component: () => import('@/views/dashboard/index.vue'),
          meta: { title: '工作台', affix: true },
        },
        { path: 'users', redirect: '/system/users' },
        {
          path: 'system/users',
          name: 'system-users',
          component: () => import('@/views/system/users/index.vue'),
          meta: { title: '用户管理' },
        },
        {
          path: 'system/roles',
          name: 'system-roles',
          component: () => import('@/views/system/roles/index.vue'),
          meta: { title: '角色管理' },
        },
        {
          path: 'system/depts',
          name: 'system-depts',
          component: () => import('@/views/system/depts/index.vue'),
          meta: { title: '部门管理' },
        },
        {
          path: 'system/menus',
          name: 'system-menus',
          component: () => import('@/views/system/menus/index.vue'),
          meta: { title: '菜单管理' },
        },
        {
          path: 'cms',
          name: 'cms',
          component: () => import('@/views/ops/cms/index.vue'),
          meta: { title: '内容总览' },
        },
        {
          path: 'cms/banner',
          name: 'cms-banner',
          component: () => import('@/views/ops/cms/CmsTypePage.vue'),
          props: { cmsType: 'banner' },
          meta: { title: '轮播' },
        },
        {
          path: 'cms/entry',
          name: 'cms-entry',
          component: () => import('@/views/ops/cms/CmsTypePage.vue'),
          props: { cmsType: 'entry' },
          meta: { title: '入口卡' },
        },
        {
          path: 'cms/showcase',
          name: 'cms-showcase',
          component: () => import('@/views/ops/cms/CmsTypePage.vue'),
          props: { cmsType: 'showcase' },
          meta: { title: '精选作品' },
        },
        {
          path: 'cms/discover',
          name: 'cms-discover',
          component: () => import('@/views/ops/cms/CmsTypePage.vue'),
          props: { cmsType: 'discover' },
          meta: { title: '官方发现' },
        },
        {
          path: 'cms/tool',
          name: 'cms-tool',
          component: () => import('@/views/ops/cms/CmsTypePage.vue'),
          props: { cmsType: 'tool' },
          meta: { title: '工具箱' },
        },
        {
          path: 'cms/skill',
          name: 'cms-skill',
          component: () => import('@/views/ops/cms/CmsTypePage.vue'),
          props: { cmsType: 'skill' },
          meta: { title: '技能精选' },
        },
        {
          path: 'cms/nav',
          name: 'cms-nav',
          component: () => import('@/views/ops/cms/CmsTypePage.vue'),
          props: { cmsType: 'nav' },
          meta: { title: '侧栏导航' },
        },
        {
          path: 'cms/brand',
          name: 'cms-brand',
          component: () => import('@/views/ops/cms/CmsTypePage.vue'),
          props: { cmsType: 'brand' },
          meta: { title: '品牌 Logo' },
        },
        {
          path: 'cms/notice',
          name: 'cms-notice',
          component: () => import('@/views/ops/cms/CmsTypePage.vue'),
          props: { cmsType: 'notice' },
          meta: { title: '公告' },
        },
        {
          path: 'storage',
          name: 'storage',
          component: () => import('@/views/resource/storage/index.vue'),
          meta: { title: '对象存储' },
        },
        {
          path: 'channels',
          name: 'channels',
          component: () => import('@/views/resource/channels/index.vue'),
          meta: { title: '渠道管理' },
        },
        {
          path: 'models',
          name: 'models',
          component: () => import('@/views/resource/models/index.vue'),
          meta: { title: '模型管理' },
        },
        {
          path: 'projects',
          name: 'projects',
          component: () => import('@/views/biz/projects/index.vue'),
          meta: { title: '书库项目' },
        },
        {
          path: 'productions',
          name: 'productions',
          component: () => import('@/views/biz/productions/index.vue'),
          meta: { title: '制作项目' },
        },
        {
          path: 'assets',
          name: 'assets',
          component: () => import('@/views/biz/assets/index.vue'),
          meta: { title: '资产管理' },
        },
        {
          path: 'jobs',
          name: 'jobs',
          component: () => import('@/views/biz/jobs/index.vue'),
          meta: { title: '任务中心' },
        },
        {
          path: 'discover',
          name: 'discover',
          component: () => import('@/views/ops/discover/index.vue'),
          meta: { title: '发现广场' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/system/settings/index.vue'),
          meta: { title: '系统设置' },
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
  // admin / ops 均可进后台；无菜单则 hydrate 已踢出
  const role = String(auth.user?.role || '');
  if (role !== 'admin' && role !== 'ops') {
    auth.logout();
    return '/login';
  }
  return true;
});

export default router;

export { findMenuTitle };
