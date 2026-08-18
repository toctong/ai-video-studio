/** 本机内置画风名称（不是纳米素材库爬取结果）。封面等用户在资产管理「风格」里上传后再显示。 */
export type FilmStyleItem = {
  id: string;
  label: string;
  group: string;
  brief: string;
  coverUrl: string;
  tags?: string[];
};

export const FILM_STYLE_FILTERS = [
  { id: 'all', label: '全部' },
  { id: '真人', label: '真人' },
  { id: '3D', label: '3D' },
  { id: '2D', label: '2D' },
];

export const FILM_STYLES: FilmStyleItem[] = [
  {
    id: 'live-cinematic',
    label: '电影质感',
    group: '真人',
    brief: '真人电影感，侧光轮廓、浅景深、胶片颗粒，色彩克制。',
    coverUrl: '',
    tags: ['真人'],
  },
  {
    id: 'live-ad',
    label: '商业广告',
    group: '真人',
    brief: '高对比产品光、干净背景、品牌调性明确，适合短广告。',
    coverUrl: '',
    tags: ['真人'],
  },
  {
    id: 'live-drama',
    label: '都市短剧',
    group: '真人',
    brief: '生活化布光，皮肤质感自然，情绪特写清晰。',
    coverUrl: '',
    tags: ['真人'],
  },
  {
    id: '3d-cg',
    label: '三维写实',
    group: '3D',
    brief: '高精度 CG，材质细腻，体积光与反射真实。',
    coverUrl: '',
    tags: ['3D'],
  },
  {
    id: '3d-toon',
    label: '三维卡通',
    group: '3D',
    brief: '圆润造型、饱和色彩、干净边缘光，适合国漫风。',
    coverUrl: '',
    tags: ['3D'],
  },
  {
    id: '2d-anime',
    label: '日式动漫',
    group: '2D',
    brief: '赛璐璐上色、清晰线稿、大眼睛角色，背景精致。',
    coverUrl: '',
    tags: ['2D'],
  },
  {
    id: '2d-ink',
    label: '国风水墨',
    group: '2D',
    brief: '水墨晕染、留白构图、青绿或赭石点缀。',
    coverUrl: '',
    tags: ['2D'],
  },
  {
    id: '2d-game',
    label: '游戏立绘',
    group: '2D',
    brief: '角色设计清晰、服装细节丰富、适合分镜关键帧。',
    coverUrl: '',
    tags: ['2D'],
  },
  {
    id: 'live-history',
    label: '古装史诗',
    group: '真人',
    brief: '厚重服饰、自然光影、史诗构图，适合历史题材。',
    coverUrl: '',
    tags: ['真人'],
  },
  {
    id: '3d-scifi',
    label: '科幻机甲',
    group: '3D',
    brief: '金属材质、霓虹点缀、未来都市或机甲场景。',
    coverUrl: '',
    tags: ['3D'],
  },
];
