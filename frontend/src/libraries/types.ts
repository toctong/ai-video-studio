export type LibraryKind =
  | 'script'
  | 'style'
  | 'character'
  | 'trope'
  | 'dialogue'
  | 'hook'
  | 'lore'
  | 'pacing'
  | 'title'
  | 'skill'
  | 'shot';

export const LIBRARY_KINDS: LibraryKind[] = [
  'script',
  'style',
  'character',
  'trope',
  'dialogue',
  'hook',
  'lore',
  'pacing',
  'title',
  'skill',
  'shot',
];

export type ScriptLibraryItem = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  idea: string;
  sampleSkeleton?: string;
};

export type StyleLibraryItem = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  styleBrief: string;
};

export type CharacterLibraryItem = {
  id: string;
  /** 人设原型名，如「冷面青年总裁」——不是剧中姓名 */
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  /** 外形与气质描述（不含剧中姓名） */
  description: string;
  consistencyPrompt: string;
};

/** 通用文案模板库条目（桥段 / 台词 / 钩子 / 设定 / 节奏 / 标题简介） */
export type TemplateLibraryItem = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  /** 可复制 / 导入的正文模板 */
  content: string;
};

/** 技能库：命名招式，供 AI 镜头库打斗扩写调用 */
export type SkillLibraryItem = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  content: string;
  shape: string;
  weaponHint: string;
  tier:
    | '起手'
    | '连招'
    | '身法'
    | '大招'
    | '防御'
    | '增益'
    | '控制'
    | '禁招'
    | '组合';
  hitRule: string;
  energyType?: string;
  vfxBurst?: string;
  comboFormula?: string;
};

/** AI 镜头库：概念种子，点击后由 AI 扩写 */
export type ShotLibraryItem = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  castCount: number;
  castRoles: string[];
  cameraFocus: string;
  moveFocus: string;
  vfxFocus: string;
  sceneHint?: string;
  seed: string;
  durationSec?: number;
  skillIds?: string[];
};

export type AnyLibraryItem =
  | ScriptLibraryItem
  | StyleLibraryItem
  | CharacterLibraryItem
  | TemplateLibraryItem
  | SkillLibraryItem
  | ShotLibraryItem;

export const LIBRARY_KIND_META: Record<
  LibraryKind,
  { route: string; title: string; sub: string; logo: string; assetType: string }
> = {
  script: {
    route: 'scripts',
    title: '灵感库',
    sub: '长篇网文灵感与开篇骨架；默认百万字连载向，男主主视角，女主多为情感线或关键配',
    logo: 'IN',
    assetType: 'script',
  },
  style: {
    route: 'styles',
    title: '风格库',
    sub: '项目画风与封面气质；服务小说封面与角色定妆，不是漫剧分镜',
    logo: 'ST',
    assetType: 'style',
  },
  character: {
    route: 'characters',
    title: '角色库',
    sub: '外形人设原型（无姓名）。标签「男主向」宜标主角主视角；「女主向」宜标主角团/重要配角作女主或情感线',
    logo: 'CH',
    assetType: 'character_ref',
  },
  trope: {
    route: 'tropes',
    title: '桥段库',
    sub: '长线桥段与反转节拍；按男主推进主线套用，落到具体卷/章',
    logo: 'TR',
    assetType: 'script',
  },
  dialogue: {
    route: 'dialogues',
    title: '台词库',
    sub: '告白、对峙、吐槽等对白模板；偏男主口吻与双人对手戏，润色章节时可参考',
    logo: 'DL',
    assetType: 'script',
  },
  hook: {
    route: 'hooks',
    title: '钩子库',
    sub: '开篇抓人与章末悬念（含付费钩）；服务日更连载断章，不是短剧集末',
    logo: 'HK',
    assetType: 'script',
  },
  lore: {
    route: 'lore',
    title: '设定库',
    sub: '世界观、力量体系、势力与禁忌；要撑得住百万字长线，服务男主成长与对抗',
    logo: 'LO',
    assetType: 'script',
  },
  pacing: {
    route: 'pacing',
    title: '节奏库',
    sub: '优先长篇分卷 / 网文日更；短线爽点仅作局部参考，不要当全书结构',
    logo: 'PC',
    assetType: 'script',
  },
  title: {
    route: 'titles',
    title: '标题库',
    sub: '书名与一句话卖点示例；优先落在男主处境与核心矛盾',
    logo: 'TI',
    assetType: 'script',
  },
  skill: {
    route: 'skills',
    title: '技能库',
    sub: '玄幻修仙向命名招式：刀剑枪戟/软兵暗器/盾与重兵/风雅与概念兵器等，每类约110条；打斗扩写调用，特效须爆表且打中对手',
    logo: 'SK',
    assetType: 'script',
  },
  shot: {
    route: 'shots',
    title: 'AI镜头库',
    sub: '画风族镜头工坊：一律动漫风呈现；子风格作色板/特效味，点击可加载脚本并创建生图/成片项目',
    logo: 'SH',
    assetType: 'video',
  },
};

export function libraryKindFromRoute(param: string): LibraryKind {
  const map: Record<string, LibraryKind> = {
    scripts: 'script',
    script: 'script',
    styles: 'style',
    style: 'style',
    characters: 'character',
    character: 'character',
    tropes: 'trope',
    trope: 'trope',
    dialogues: 'dialogue',
    dialogue: 'dialogue',
    hooks: 'hook',
    hook: 'hook',
    lore: 'lore',
    settings: 'lore',
    pacing: 'pacing',
    titles: 'title',
    title: 'title',
    skills: 'skill',
    skill: 'skill',
    shots: 'shot',
    shot: 'shot',
  };
  return map[param] || 'script';
}
