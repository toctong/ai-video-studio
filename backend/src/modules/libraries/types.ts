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
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  description: string;
  consistencyPrompt: string;
};

export type TemplateLibraryItem = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  content: string;
};

/** 技能库：命名招式，供 AI 镜头库打斗扩写调用 */
export type SkillLibraryItem = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  /** 详情正文（资源库可复制） */
  content: string;
  /** 可见形状，写进成片半秒轴 */
  shape: string;
  /** 兵器/手段或功法门类 */
  weaponHint: string;
  /** 起手 | 连招 | 身法 | 大招 | 防御 | 增益 | 控制 | 禁招 | 组合 */
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
  /** 命中/生效规则一句 */
  hitRule: string;
  /** 能量气质：真气/仙法/魔功/雷罡/毒元等 */
  energyType?: string;
  /** 爆表特效一句（必写进高潮格） */
  vfxBurst?: string;
  /** 组合公式，如 身法(迷踪步)+剑法(点星刺) */
  comboFormula?: string;
};

/** AI 镜头库：概念种子，点击后由 AI 扩写为成片+人物+场景 */
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
  /** 地点/环境一句话，供场景出图 */
  sceneHint?: string;
  seed: string;
  durationSec?: number;
  /** 可选：绑定技能库 id，扩写优先调用 */
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
    sub: '玄幻修仙向命名招式：兵器谱/拳脚/身法/感知/规则技/组合奥义/禁招等，每类约50条；AI镜头库打斗扩写调用，特效须爆表且打中对手',
    logo: 'SK',
    assetType: 'script',
  },
  shot: {
    route: 'shots',
    title: 'AI镜头库',
    sub: '画风族镜头工坊：一律动漫风呈现；子风格作色板/特效味，AI 现写成片与定妆并可一键出图；禁止真人写真',
    logo: 'SH',
    assetType: 'video',
  },
};

export const LIBRARY_KINDS = Object.keys(LIBRARY_KIND_META) as LibraryKind[];

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

export function normalizeLibraryKind(raw: string): LibraryKind | null {
  const k = String(raw || '').trim().toLowerCase();
  if ((LIBRARY_KINDS as string[]).includes(k)) return k as LibraryKind;
  const fromRoute = libraryKindFromRoute(k);
  if (k && fromRoute) {
    // only accept if map hit something meaningful
    if (
      k === fromRoute ||
      k === LIBRARY_KIND_META[fromRoute].route ||
      k === `${fromRoute}s`
    ) {
      return fromRoute;
    }
    // route plural forms
    if (libraryKindFromRoute(k) !== 'script' || k.startsWith('script')) return fromRoute;
  }
  return (LIBRARY_KINDS as string[]).includes(k) ? (k as LibraryKind) : null;
}
