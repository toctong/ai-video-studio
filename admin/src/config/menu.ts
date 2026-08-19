import type { Component } from 'vue';
import {
  IconApps,
  IconBook,
  IconCalendar,
  IconDashboard,
  IconFolder,
  IconMenu,
  IconMindMapping,
  IconRobot,
  IconSettings,
  IconStorage,
  IconThunderbolt,
  IconUser,
  IconUserGroup,
  IconVideoCamera,
} from '@arco-design/web-vue/es/icon';

export const iconMap: Record<string, Component> = {
  'icon-dashboard': IconDashboard,
  'icon-user': IconUser,
  'icon-user-group': IconUserGroup,
  'icon-book': IconBook,
  'icon-video-camera': IconVideoCamera,
  'icon-folder': IconFolder,
  'icon-calendar': IconCalendar,
  'icon-apps': IconApps,
  'icon-settings': IconSettings,
  'icon-storage': IconStorage,
  'icon-thunderbolt': IconThunderbolt,
  'icon-robot': IconRobot,
  'icon-mind-mapping': IconMindMapping,
  'icon-menu': IconMenu,
};

export type ApiMenuNode = {
  id: string;
  parentId: string;
  type: number;
  title: string;
  path: string;
  icon: string;
  component: string;
  permission: string;
  sort: number;
  hidden: boolean;
  children?: ApiMenuNode[];
};

/** 静态兜底（接口失败时） */
export const fallbackMenuGroups = [
  {
    key: 'overview',
    title: '概览',
    children: [{ path: '/dashboard', title: '工作台', icon: 'icon-dashboard' }],
  },
  {
    key: 'ops',
    title: '运营中心',
    children: [
      { path: '/cms', title: '内容运营', icon: 'icon-apps' },
      { path: '/discover', title: '发现广场', icon: 'icon-apps' },
    ],
  },
  {
    key: 'resource',
    title: '资源配置',
    children: [
      { path: '/storage', title: '对象存储', icon: 'icon-storage' },
      { path: '/channels', title: '渠道管理', icon: 'icon-thunderbolt' },
      { path: '/models', title: '模型管理', icon: 'icon-robot' },
    ],
  },
  {
    key: 'biz',
    title: '业务数据',
    children: [
      { path: '/projects', title: '书库项目', icon: 'icon-book' },
      { path: '/productions', title: '制作项目', icon: 'icon-video-camera' },
      { path: '/assets', title: '资产管理', icon: 'icon-folder' },
      { path: '/jobs', title: '任务中心', icon: 'icon-calendar' },
    ],
  },
  {
    key: 'system',
    title: '系统管理',
    children: [
      { path: '/system/users', title: '用户管理', icon: 'icon-user' },
      { path: '/system/roles', title: '角色管理', icon: 'icon-user-group' },
      { path: '/system/depts', title: '部门管理', icon: 'icon-mind-mapping' },
      { path: '/system/menus', title: '菜单管理', icon: 'icon-menu' },
      { path: '/settings', title: '系统设置', icon: 'icon-settings' },
    ],
  },
];

/** 将静态分组转成接口同构树，供侧栏兜底 */
export function fallbackMenusAsTree(): ApiMenuNode[] {
  return fallbackMenuGroups.map((g, gi) => ({
    id: `fb-${g.key}`,
    parentId: '',
    type: 1,
    title: g.title,
    path: '',
    icon: g.children[0]?.icon || 'icon-apps',
    component: '',
    permission: '',
    sort: (gi + 1) * 10,
    hidden: false,
    children: g.children.map((c, ci) => ({
      id: `fb-${g.key}-${ci}`,
      parentId: `fb-${g.key}`,
      type: 2,
      title: c.title,
      path: c.path,
      icon: c.icon,
      component: '',
      permission: '',
      sort: (ci + 1) * 10,
      hidden: false,
    })),
  }));
}

export function findMenuTitle(path: string, menus?: ApiMenuNode[]) {
  const walk = (nodes: ApiMenuNode[]): string => {
    for (const n of nodes) {
      if (n.path === path) return n.title;
      if (n.children?.length) {
        const hit = walk(n.children);
        if (hit) return hit;
      }
    }
    return '';
  };
  if (menus?.length) {
    const t = walk(menus);
    if (t) return t;
  }
  const flat = fallbackMenuGroups.flatMap((g) => g.children);
  return flat.find((m) => m.path === path)?.title || '后台';
}
