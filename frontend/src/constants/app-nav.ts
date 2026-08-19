import type { IconName } from '@/components/icons/types';

export type NavItem = {
  path: string;
  label: string;
  icon: IconName;
  short?: string;
  section?: string;
};

/** 平台侧栏：首页 / 制作大片 / 工具箱 / 我的项目 / 资产管理 */
export const PLATFORM_NAV: NavItem[] = [
  { path: '/home', label: '首页', short: '首页', icon: 'home' },
  { path: '/films', label: '制作大片', short: '制作', icon: 'clapperboard' },
  { path: '/tools', label: '工具箱', short: '工具', icon: 'terminal' },
  { path: '/productions', label: '我的项目', short: '项目', icon: 'folder' },
  { path: '/assets', label: '资产管理', short: '资产', icon: 'images' },
];

/** 登录后默认落地 */
export const DEFAULT_HOME = '/home';
