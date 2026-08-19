import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { DEFAULT_HOME } from '@/constants/app-nav';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 旧登录页：进首页并弹出登录框，避免与业务路由互相跳转闪屏
    {
      path: '/login',
      redirect: () => {
        const auth = useAuthStore();
        queueMicrotask(() => auth.openLoginDialog());
        return DEFAULT_HOME;
      },
    },
    {
      path: '/',
      component: () => import('@/layouts/PlatformLayout.vue'),
      children: [
        // 新 IA
        { path: 'home', component: () => import('@/views/HomeDashboardView.vue') },
        /** 制作大片：直接创建并进入六步流水线（项目列表在「我的项目」） */
        { path: 'films', component: () => import('@/views/studio/FilmLaunchView.vue') },
        {
          path: 'films/c/:collectionId',
          component: () => import('@/views/studio/FilmSeriesView.vue'),
        },
        { path: 'films/:id', component: () => import('@/views/studio/FilmProjectLayout.vue') },
        { path: 'tools', component: () => import('@/views/ToolboxView.vue') },
        { path: 'models', redirect: '/home' },
        {
          path: 'generate',
          component: () => import('@/views/studio/StudioGenerateView.vue'),
        },
        {
          path: 'home/plaza',
          redirect: (to) => ({ path: '/skills', query: to.query }),
        },
        {
          path: 'skills',
          component: () => import('@/views/studio/StudioSkillsView.vue'),
        },
        {
          path: 'skills/mine',
          component: () => import('@/views/studio/StudioMyPromptsView.vue'),
        },
        { path: 'skills/agents', redirect: '/home' },
        { path: 'skills/my-agents', redirect: '/home' },
        { path: 'skills/workflows', redirect: '/home' },
        { path: 'skills/my-workflows', redirect: '/home' },
        { path: 'agents', redirect: '/home' },
        { path: 'agents/mine', redirect: '/home' },
        { path: 'workflows', redirect: '/home' },
        { path: 'workflows/mine', redirect: '/home' },
        { path: 'productions', component: () => import('@/views/studio/StudioProjectsView.vue') },
        { path: 'w/:workflowId', redirect: '/home' },
        { path: 'runs/:runId', redirect: '/home' },
        { path: 'assets', component: () => import('@/views/AssetManagementView.vue') },
        { path: 'books', component: () => import('@/views/HomeView.vue') },
        { path: 'logs', redirect: '/home' },
        {
          path: 'books/:projectId',
          component: () => import('@/layouts/BookDetailLayout.vue'),
          children: [
            { path: '', redirect: { name: 'book-overview' } },
            {
              path: 'overview',
              name: 'book-overview',
              component: () => import('@/views/project/OverviewView.vue'),
            },
            {
              path: 'chapters',
              name: 'book-chapters',
              component: () => import('@/views/project/ScriptView.vue'),
            },
            {
              path: 'outline',
              name: 'book-outline',
              component: () => import('@/views/project/OutlineView.vue'),
            },
            {
              path: 'timeline',
              name: 'book-timeline',
              component: () => import('@/views/project/TimelineView.vue'),
            },
            {
              path: 'characters',
              name: 'book-characters',
              component: () => import('@/views/project/ScriptView.vue'),
            },
            {
              path: 'script',
              redirect: (to) => {
                const tab = String(to.query.tab || '');
                if (tab === 'characters') return `/books/${to.params.projectId}/characters`;
                return `/books/${to.params.projectId}/chapters`;
              },
            },
          ],
        },
        { path: 'settings', component: () => import('@/views/SettingsView.vue') },
        {
          path: 'share/:token',
          component: () => import('@/views/studio/DiscoverShareView.vue'),
        },

        // 旧入口 → 新路由
        { path: '', redirect: DEFAULT_HOME },
        { path: 'studio', redirect: '/home' },
        { path: 'studio/chat', redirect: '/home' },
        {
          path: 'studio/chat/:sessionId',
          redirect: '/home',
        },
        { path: 'chat', redirect: '/home' },
        { path: 'chat/:sessionId', redirect: '/home' },
        { path: 'studio/projects', redirect: '/productions' },
        { path: 'studio/w/:workflowId', redirect: '/home' },
        { path: 'studio/runs/:runId', redirect: '/home' },
        { path: 'studio/assets', redirect: '/assets' },
        { path: 'plugins', redirect: '/settings' },
        // 未知子路径兜底回首页（兼容旧的 /library /refs 等链接）
        { path: ':pathMatch(.*)*', redirect: DEFAULT_HOME },
      ],
    },
    // 旧书库项目壳 → /books/:id
    {
      path: '/p/:projectId/:pathMatch(.*)*',
      redirect: (to) => {
        const id = String(to.params.projectId || '');
        const match = to.params.pathMatch;
        const rest = Array.isArray(match)
          ? match.filter(Boolean).join('/')
          : String(match || '').replace(/^\//, '');
        const leaf = rest.split('/').filter(Boolean)[0] || 'overview';
        if (leaf === 'outline') return `/books/${id}/outline`;
        if (leaf === 'overview') return `/books/${id}/overview`;
        if (leaf === 'characters') return `/books/${id}/characters`;
        if (leaf === 'timeline') return `/books/${id}/timeline`;
        if (leaf === 'chapters' || leaf === 'script') return `/books/${id}/chapters`;
        return `/books/${id}/overview`;
      },
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // 不强制跳登录页；静默恢复会话即可，需要操作时弹登录框
  if (!auth.hydrated) await auth.hydrate();
  if (auth.isAuthenticated) useThemeStore().syncFromUser(auth.user);
  return true;
});

export default router;
