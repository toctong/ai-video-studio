export type CmsType =
  | 'banner'
  | 'entry'
  | 'showcase'
  | 'discover'
  | 'tool'
  | 'skill'
  | 'nav'
  | 'brand'
  | 'notice';

export type CmsTypeMeta = {
  value: CmsType;
  label: string;
  description: string;
  path: string;
};

export const CMS_TYPES: CmsTypeMeta[] = [
  { value: 'banner', label: '轮播', description: '首页轮播图（封面 + 可选视频）', path: '/cms/banner' },
  { value: 'entry', label: '入口卡', description: '首页快捷入口', path: '/cms/entry' },
  { value: 'showcase', label: '精选作品', description: '首页精选展示', path: '/cms/showcase' },
  { value: 'discover', label: '官方发现', description: '发现页官方视频', path: '/cms/discover' },
  { value: 'tool', label: '工具箱', description: '工具箱卡片', path: '/cms/tool' },
  { value: 'skill', label: '技能精选', description: '技能推荐位', path: '/cms/skill' },
  { value: 'nav', label: '侧栏导航', description: '前台侧栏导航项', path: '/cms/nav' },
  { value: 'brand', label: '品牌 Logo', description: '品牌与 Logo 素材', path: '/cms/brand' },
  { value: 'notice', label: '公告', description: '全站公告条', path: '/cms/notice' },
];

export function cmsTypeLabel(type: string) {
  return CMS_TYPES.find((x) => x.value === type)?.label || type;
}
