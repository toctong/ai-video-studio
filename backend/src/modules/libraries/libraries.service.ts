import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import { SCRIPT_LIBRARY, SCRIPT_CATEGORIES } from './data/scripts';
import { STYLE_LIBRARY, STYLE_CATEGORIES } from './data/styles';
import { CHARACTER_LIBRARY, CHARACTER_CATEGORIES } from './data/characters';
import { TROPE_LIBRARY, TROPE_CATEGORIES } from './data/tropes';
import { DIALOGUE_LIBRARY, DIALOGUE_CATEGORIES } from './data/dialogues';
import { HOOK_LIBRARY, HOOK_CATEGORIES } from './data/hooks';
import { LORE_LIBRARY, LORE_CATEGORIES } from './data/lore';
import { PACING_LIBRARY, PACING_CATEGORIES } from './data/pacing';
import { TITLE_LIBRARY, TITLE_CATEGORIES } from './data/titles';
import { SHOT_LIBRARY, SHOT_CATEGORIES } from './data/shots';
import { SKILL_LIBRARY, SKILL_CATEGORIES } from './data/skills';
import { SCRIPT_CATEGORY_META } from './data/script-category-meta';
import { AiProviderService } from '../ai/ai-provider.service';
import {
  buildCharacterSheetLayoutLock,
  buildImageGridLayoutLock,
} from '../ai/visual-prompt';
import { AssetsService } from '../assets/assets.service';
import { ShotLibraryExpand } from '../../entities/shot-library-expand.entity';
import type { AssetType } from '@ai-video-studio/shared';
import {
  AnyLibraryItem,
  LIBRARY_KIND_META,
  LIBRARY_KINDS,
  LibraryKind,
  libraryKindFromRoute,
  type ShotLibraryItem,
  type SkillLibraryItem,
} from './types';

const ROUTE_ALIASES: Record<string, LibraryKind> = {
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

/** 平台级镜头库出图落盘用的虚拟项目 ID */
const LIBRARY_SHOTS_PROJECT = '_library_shots';

/** 成片 / 定妆 / 场景提示词硬上限：每段不超过 4000 字 */
const PROMPT_MAX_CHARS = 4000;

/**
 * 目标成片气质对齐「抖音高燃 AIGC 国漫短片」。
 * 成片时长由用户配置；半秒时间轴按 0.0s / 0.5s 拆分（豆包友好）。
 */
function clampShotDurationSec(raw?: number, fallback = 10): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(5, Math.min(60, n));
}

type BeatClockSlot = { phase: string; from: number; to: number };

/** 半秒刻度步长（0 / 0.5 / 1.0 / 1.5 …） */
const BEAT_TICK_SEC = 0.5;

/** 按目标秒数拆五段骨架，再在 format 里展开成「每 0.5 秒一行」 */
function buildBeatClockSlots(durationSec: number): BeatClockSlot[] {
  const d = clampShotDurationSec(durationSec);
  // 起势/收束极短；加速/交锋/高潮吃满
  const phases: Array<{ phase: string; w: number }> = [
    { phase: '起势', w: 0.08 },
    { phase: '加速', w: 0.18 },
    { phase: '交锋/推进', w: 0.34 },
    { phase: '高潮', w: 0.3 },
    { phase: '收束', w: 0.1 },
  ];
  const cuts = [0];
  let acc = 0;
  for (let i = 0; i < phases.length - 1; i++) {
    acc += phases[i].w;
    const remainSlots = phases.length - 1 - i;
    let cut = Math.round(d * acc);
    const prev = cuts[cuts.length - 1];
    const maxCut = d - remainSlots;
    cut = Math.max(prev + 1, Math.min(cut, maxCut));
    cuts.push(cut);
  }
  cuts.push(d);
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i] <= cuts[i - 1]) cuts[i] = Math.min(d, cuts[i - 1] + 1);
  }
  cuts[cuts.length - 1] = d;
  return phases.map((p, i) => ({
    phase: p.phase,
    from: cuts[i],
    to: cuts[i + 1],
  }));
}

function beatPhaseTickHint(phase: string, isCore: boolean): string {
  const core: Record<string, string> = {
    起势: '核心钩子：手+专武握持必须正确入画；二次运动启动；禁止慢推氛围、禁止只拍刃尖无手',
    加速: '核心升级：位移/接触/拖尾之一；握持关系不断；禁止重置 pose',
    '交锋/推进': '核心招式：命名技能形状+命中/交锋点；握柄不断；禁止互捅',
    高潮: '核心大招：截图级冲击；本命兵器仍握在手里；打中对手；禁止空结印御剑、禁止烧录技能文字',
    收束: '核心落点：胜负一眼可读；衣发尾惯性；禁止拖沓',
  };
  if (isCore) return core[phase] || '本格写清一个核心卖点';
  return '承接格：延续上一格动作惯性/二次运动/跟拍，可微调景别；禁止另起新大招、禁止换握持方式';
}

/** 格式化半秒刻度标签：0 → 0.0s，0.5 → 0.5s，1 → 1.0s */
function formatBeatTickLabel(t: number): string {
  return `${t.toFixed(1)}s`;
}

/**
 * 每 0.5 秒一行时间轴（豆包友好：0.0s：… 禁止【1-3s】区间）。
 * 例：0.0s：… / 0.5s：… / 1.0s：…
 */
function formatBeatClockPlan(durationSec: number): string {
  const d = clampShotDurationSec(durationSec);
  const slots = buildBeatClockSlots(d);
  const tickCount = Math.round(d / BEAT_TICK_SEC);
  const phaseAt = (t: number): string =>
    slots.find((s) => t >= s.from && t < s.to)?.phase ||
    (t < 0.5 ? '起势' : t >= d - 0.5 ? '收束' : '交锋/推进');
  /** 每阶段首格 + 高潮中点 + 末格 = 核心；其余承接，避免 10s 塞满新招 */
  const coreTicks = new Set<number>();
  for (const s of slots) {
    coreTicks.add(Number(s.from.toFixed(1)));
    if (s.phase === '高潮') {
      const mid =
        Math.round((s.from + (s.to - s.from) * 0.5) / BEAT_TICK_SEC) *
        BEAT_TICK_SEC;
      coreTicks.add(Number(mid.toFixed(1)));
    }
  }
  coreTicks.add(0);
  coreTicks.add(Number((d - BEAT_TICK_SEC).toFixed(1)));

  const lines: string[] = [
    `· 写法：半秒轴共 ${tickCount} 行必须写满，但全片只需 ${Math.min(6, Math.max(4, slots.length + 1))} 个「核心卖点」；标「核心」的格子写新招/新结果，标「承接」的格子只延续握持与惯性，禁止每 0.5s 换一个大招。`,
  ];
  for (let i = 0; i < tickCount; i++) {
    const t = Number((i * BEAT_TICK_SEC).toFixed(1));
    const label = formatBeatTickLabel(t);
    const phase = phaseAt(t);
    const next = formatBeatTickLabel(t + BEAT_TICK_SEC);
    const isCore = coreTicks.has(t);
    lines.push(
      `· ${label}：只写 ${label}（禁止写到 ${next}）；镜头+动作同一句；${isCore ? '【核心】' : '【承接】'}阶段=${phase}；${beatPhaseTickHint(phase, isCore)}`,
    );
  }
  return lines.join('\n');
}

function beatTickCount(durationSec: number): number {
  return Math.round(clampShotDurationSec(durationSec) / BEAT_TICK_SEC);
}

/** 仅二次元族或明确动画子风格才走动漫语法；其它族只禁真人，不默认动画开脸 */
function wantsAnimeLook(family: string, subStyle: string): boolean {
  if (String(family || '').trim() === '二次元动漫') return true;
  const s = String(subStyle || '').trim();
  return /^(日系动画|二次元插画|平涂|Q版卡通|赛璐璐|韩系漫画|MBE卡通)$/.test(s);
}

/** 全库仅禁真人；不默认塞动画开脸/赛璐璐 */
function noLiveActionHardLock(): string {
  return (
    '【禁止真人硬锁·全库适用】禁止真实人脸、真人演员、live-action、网红棚拍写真、照片级皮肤毛孔精模；' +
    '画风按「画风族·子风格」落地：插画/概念美术/国风绘卷/暗黑奇幻厚涂/电影感CG角色造型均可；' +
    '禁止默认写成「动画开脸、清晰描边、赛璐璐、二次元比例」——仅当画风族为二次元动漫、或子风格明确是日系动画/赛璐璐等时才用动漫语法；' +
    '子风格只决定色板、材质与氛围；禁止串风，禁止纯静物展/手工过程片抢戏。'
  );
}

/** 二次元族专用动漫语法 */
function animeLookHardLock(): string {
  return (
    '【二次元动漫硬锁】本场为二次元/动画语法：动画开脸、清晰描边或赛璐璐上色、二次元或国漫人物比例与表演；' +
    '禁止照片级皮肤毛孔、真人演员、live-action、网红棚拍。'
  );
}

/** 八大画风族 + 子风格的扩写硬锁提示 */
function yancaiFlameStyleRecipe(kind: '岩彩' | '炎彩' = '炎彩'): string {
  const head =
    kind === '炎彩'
      ? '炎彩（岩彩同族·鎏金光焰向·国风动漫）：'
      : '岩彩（炎彩同族·矿物颜料向·国风动漫）：';
  return (
    head +
    '以国风动漫人物开脸+动画上色呈现，矿物色与鎏金是特效/服饰材质不是壁画临摹；' +
    '色板硬锁：冷矿物青蓝青绿 vs 赤金/鎏金高光，可有朱砂/橙红暖晕与浅粉莲色；暗底让金与青跳出来；' +
    '金必须是材质：金箔颗粒、熔金流纹、鎏金碎光、云母闪，禁止扁平黄漆；' +
    '光影族内可变但必有其一：圆月/金晕背光烫轮廓、侧逆金边光、或洞窟体积光柱扫过矿物尘；' +
    '流体签名：半透明披帛/青蓝矿物浪/熔金丝带翻涌，发丝衣袂有惯性二次运动；' +
    '可叠加族内变体：金叶冠、莲蓬金饰、飞天金粒子拖尾、额间花钿——禁止每镜照抄同一构图；' +
    '美炫核心：动漫人物可读 + 矿物色浓郁 + 金光材质 + 流体动势；' +
    '禁止真人棚拍、禁止照片皮肤、禁止只有灰墙皮剥落却无鎏金与青蓝矿物浪、禁止赛博霓虹主调。'
  );
}

function buildFamilyStyleLockHint(family: string, subStyle: string): string {
  const s = String(subStyle || '');
  const anime = wantsAnimeLook(family, s);
  const bySub: Record<string, string> = {
    水墨: anime
      ? '水墨味国风动漫：动画开脸+古风衣装；剑气/拖尾可用墨痕飞白作特效；场景可有淡墨远山与留白感，但人物必须是可演戏打斗的动漫角色。禁止宣纸静物画、禁止只有泼墨不见人、禁止真人写真。'
      : '水墨：国风绘卷气质；墨分五色与飞白作色板/特效；人物可演戏；禁止宣纸静物展、禁止真人写真、禁止默认赛璐璐开脸。',
    青绿山水: anime
      ? '青绿味国风动漫：石青石绿+金碧点缀的动画上色；仙山云海作场景，人物仍是动漫开脸。禁止山水挂画静物、禁止写真皮肤。'
      : '青绿山水：石青石绿金碧色板的国风绘卷/概念美术；禁止挂画静物、禁止真人写真。',
    工笔: anime
      ? '工笔味国风动漫：细腻线描+柔和晕染的动画人物；发丝衣纹精致可读。禁止临摹工笔画静物、禁止真人棚拍。'
      : '工笔：细腻线描晕染的国风插画气质；禁止静物临摹、禁止真人棚拍。',
    国潮: anime
      ? '国潮动漫：高饱和传统纹样+潮服的二次元/国漫插画风。禁止古装写实剧、禁止网红棚拍脸。'
      : '国潮：高饱和传统纹样+潮服插画；禁止古装写实剧写真、禁止网红棚拍。',
    敦煌: anime
      ? '敦煌味国风动漫：矿物色金箔作服饰与特效；原创飞天/供养人气场，动画开脸。禁止抄袭真实壁画IP、禁止壁画临摹静物、禁止写真。'
      : '敦煌：矿物色金箔材质的国风绘卷；原创气场；禁止壁画临摹静物、禁止真人写真。',
    岩彩: yancaiFlameStyleRecipe('岩彩'),
    炎彩: yancaiFlameStyleRecipe('炎彩'),
    青花瓷: anime
      ? '青花瓷味国风动漫：钴蓝白地纹样作衣袍/场景点缀，人物动画开脸。禁止拍瓷器静物、禁止写真皮肤。'
      : '青花瓷：钴蓝白地纹样点缀的国风插画；禁止瓷器静物展、禁止真人写真。',
    年画: anime
      ? '年画味国风动漫：高饱和民俗色+平涂感动画上色；门神气场可借用，人物仍是动漫脸。禁止木版年画静物海报、禁止写真。'
      : '年画：高饱和民俗色平涂插画；禁止木版静物海报、禁止真人写真。',
    皮影: anime
      ? '皮影味国风动漫：暖幕透光与锯齿剪影作光影特效，人物仍是可表演的动画角色（可偏侧影），禁止纯皮片道具展览、禁止写真。'
      : '皮影：暖幕透光与剪影光影特效的国风叙事；禁止纯皮片展览、禁止真人写真。',
    新中式: anime
      ? '新中式国风动漫：极简中式空间+克制纹样，动画人物。禁止堆满龙纹庙宇、禁止棚拍脸。'
      : '新中式：极简中式空间+克制纹样插画；禁止堆满龙纹、禁止棚拍脸。',
    剪纸: anime
      ? '剪纸味国风动漫：红纸镂空/窗花可作前景与特效纹样，人物必须是动漫开脸与可动身体，禁止整幅变成剪纸手工展、禁止写实皮肤。'
      : '剪纸：镂空纹样可作前景/特效，人物可演戏；禁止整幅剪纸手工展、禁止真人写真。',
    唐卡: anime
      ? '唐卡味国风动漫：金线宝石色纹样点缀，动画人物；原创敬畏表达。禁止亵渎符号化、禁止写真。'
      : '唐卡：金线宝石色纹样点缀的绘卷气质；原创敬畏；禁止亵渎符号化、禁止真人写真。',
    日系动画: '日系动画电影感柔和阴影赛璐璐；禁止真人、禁止赛博主调。',
    二次元插画: '二次元插画海报感高光装饰线；禁止烧录字幕、禁止真人写真。',
    厚涂: anime
      ? '厚涂向动漫插画：可见笔触的二次元/国漫厚涂，仍是动漫人物。禁止真人。'
      : '厚涂：可见笔触的数字绘画/概念美术；禁止真人写真。',
    平涂: '平涂大色块硬边阴影的动漫插画；禁止三维写实。',
    Q版卡通: 'Q版大头短身弹性变形卡通；禁止写实人体、禁止电影精模皮肤。',
    赛璐璐: '赛璐璐：清晰描边平涂网点速度线；禁止三维次世代写实皮肤。',
    韩系漫画: '韩系漫画细线柔灰；禁止美漫粗墨、禁止真人。',
    水彩: anime
      ? '水彩味动漫：透明叠色湿边作上色与背景，人物动画开脸。禁止照片级皮肤为主。'
      : '水彩：透明叠色湿边的绘画气质；禁止照片级皮肤为主。',
    油画: anime
      ? '油画味动漫：厚堆笔触感作材质点缀的动画/插画人物。禁止照片直出。'
      : '油画：厚堆笔触的绘画气质；禁止照片直出、禁止真人棚拍。',
    素描: anime
      ? '素描味动漫：炭笔明暗作风格化动画线面。禁止照片滤镜冒充。'
      : '素描：炭笔明暗绘画气质；禁止照片滤镜冒充。',
    版画: anime
      ? '版画味动漫：刀痕套色印刷感作色面，人物仍可读为动画角色。禁止照片写实。'
      : '版画：刀痕套色印刷感；禁止照片写实。',
    水粉: anime
      ? '水粉味动漫：粉质覆盖感动画上色。禁止写真。'
      : '水粉：粉质覆盖绘画气质；禁止真人写真。',
    速写: anime
      ? '速写味动漫：残线动势的动画角色。禁止写真。'
      : '速写：残线动势绘画气质；禁止真人写真。',
    像素风: '像素网格有限调色板（像素动漫）；禁止高清写实。',
    手绘: anime
      ? '手绘味动漫：马克笔纸本感的动画角色。禁止写真。'
      : '手绘：马克笔纸本感；禁止真人写真。',
    赛博朋克: anime
      ? '赛博朋克动漫：冷青品红霓虹湿反射，动画/赛璐璐人物与义体。禁止真人写真、禁止古风水墨主调。'
      : '赛博朋克：冷青品红霓虹湿反射；科幻概念美术/CG气质；禁止真人写真、禁止古风水墨主调。',
    废土: anime
      ? '废土动漫：锈蚀沙尘警示漆，动画人物。禁止干净赛博霓虹主调。'
      : '废土：锈蚀沙尘警示漆；禁止干净赛博霓虹主调、禁止真人写真。',
    蒸汽朋克: anime
      ? '蒸汽朋克动漫：黄铜蒸汽铆钉，动画人物。禁止赛博冷光主调。'
      : '蒸汽朋克：黄铜蒸汽铆钉；禁止赛博冷光主调、禁止真人写真。',
    太空科幻: anime
      ? '太空科幻动漫：舰战/零重力，动画人物。禁止蒸汽朋克黄铜主调。'
      : '太空科幻：舰战/零重力概念美术；禁止蒸汽朋克黄铜主调、禁止真人写真。',
    机能风: anime
      ? '机能风动漫：硬表面接口灯，动画人物。'
      : '机能风：硬表面接口灯；禁止真人写真。',
    胶片: anime
      ? '胶片味动漫：颗粒漏光色偏叠在动画画面上。禁止写成真人胶片写真。'
      : '胶片：颗粒漏光色偏；禁止真人胶片写真。',
    复古港风: anime
      ? '复古港风动漫：霓虹湿街烟，动画人物。禁止赛博机能义体主调。'
      : '复古港风：霓虹湿街烟氛围；禁止赛博机能义体主调、禁止真人写真。',
    '80年代复古': anime
      ? '80年代复古动漫：录像带CRT噪点色溢的动画风。禁止现代写实。'
      : '80年代复古：录像带CRT噪点色溢；禁止现代真人写真。',
    蒸汽波: anime
      ? '蒸汽波动漫：粉青棋盘雕像气质的动画/插画。禁止写实战争。'
      : '蒸汽波：粉青棋盘雕像气质；禁止写实战争、禁止真人写真。',
    复古美式画报: anime
      ? '复古美式画报网点味的卡通/动漫印刷感。禁止写真。'
      : '美式画报：网点印刷感；禁止真人写真。',
    怪诞: anime
      ? '怪诞动漫：扭曲荒诞比例的动画角色。禁止日常都市跳吓写真。'
      : '怪诞：扭曲荒诞比例与不合常理揭示；暗黑奇幻概念美术/厚涂插画气质；禁止日常都市跳吓写真、禁止默认赛璐璐动画开脸。',
    超现实: anime
      ? '超现实动漫：梦境拼接的动画影像。禁止写实解释。'
      : '超现实：梦境拼接的概念影像；禁止写实解释、禁止真人写真、禁止默认赛璐璐。',
    克苏鲁: anime
      ? '克苏鲁动漫：不可名状混沌的暗黑动画美学。禁止把怪物画成清晰写实标本。'
      : '克苏鲁：不可名状混沌的暗黑奇幻美学；禁止清晰写实标本、禁止真人写真、禁止默认赛璐璐。',
    哥特: anime
      ? '哥特动漫：暗黑阴森尖拱，动画人物。禁止明亮童话写真。'
      : '哥特：暗黑阴森尖拱；暗黑奇幻概念美术；禁止明亮童话写真、禁止默认赛璐璐。',
    阈限空间: anime
      ? '阈限空间动漫：空旷均质诡异的动画场景。禁止堆满写实怪物跳吓。'
      : '阈限空间：空旷均质诡异场景；禁止堆满写实怪物跳吓、禁止真人写真。',
    扁平插画: '扁平无渐变几何色块矢量感；禁止写实光影、禁止皮肤毛孔。',
    极简: '极简大留白少元素；禁止细节堆砌写真。',
    MBE卡通: 'MBE细线浅彩圆润卡通；禁止暗黑厚涂、禁止写真。',
    '3D黏土': anime
      ? '3D黏土卡通：指纹材质柔光的萌系三维卡通（非真人）。禁止金属机甲写实、禁止真人皮肤。'
      : '3D黏土：指纹材质柔光三维卡通（非真人）。',
    OC渲染: anime
      ? 'OC干净商业三维动漫感；禁止脏废土写实。'
      : 'OC渲染：干净商业三维角色造型；禁止真人皮肤写真、禁止脏废土堆砌。',
    'Blender写实3D':
      'Blender三维角色造型与材质可读；禁止真人皮肤照片感、禁止PBR写真精模冒充真人。',
    电影写实:
      '电影感光影与运动镜头；戏剧性实用光；禁止真人质感、禁止照片皮肤毛孔精模；不要默认赛璐璐。',
    照片级写实:
      '高细节材质与光影可读的概念美术/CG；禁止真人、禁止毛孔写真；不要默认赛璐璐动画开脸。',
    影视质感:
      '影视调色与运动镜头；禁止真人演员、禁止 live-action。',
    自然光纪实:
      '自然光外景氛围；禁止纪实摄影人脸、禁止棚拍写真。',
  };
  const byFamily: Record<string, string> = {
    国风东方:
      '国风东方族：东方神话/古风题材与色板；子风格作材质特效；禁止真人棚拍、禁止纯传统画种静物展；非二次元时不要默认赛璐璐开脸。',
    二次元动漫: '二次元动漫族：锁定动画/漫画线条与色面语法；禁止真人实拍。',
    传统美术绘画:
      '传统美术绘画族：画种味作色板与笔触气质；人物可演戏；禁止画展临摹静物、禁止真人写真；非二次元时不要默认动画开脸。',
    科幻未来: '科幻未来族：科幻材质光色；禁止古风水墨主调、禁止真人写真；非二次元时可用概念美术/CG。',
    复古怀旧: '复古怀旧族：年代介质色偏；禁止现代真人写真。',
    奇幻暗黑怪异:
      '奇幻暗黑怪异族：暗黑奇幻/怪诞概念美术优先（厚涂插画或电影感CG角色均可）；禁止廉价都市公寓跳吓写真；禁止默认二次元赛璐璐动画开脸。',
    简约商业: '简约商业族：干净商业插画/设计语法；禁止脏废土写真堆砌。',
    写实质感:
      '写实质感族：电影感光影与材质可读；禁止真人、禁止照片级皮肤；不要默认赛璐璐。',
  };
  const subHint = bySub[s] || '';
  const famHint = byFamily[family] || `锁定「${family} · ${s}」配方，禁止串风。`;
  if (anime) {
    return [animeLookHardLock(), famHint, subHint].filter(Boolean).join(' ');
  }
  return [noLiveActionHardLock(), famHint, subHint].filter(Boolean).join(' ');
}

/** 平面/印刷等媒介（仍属动漫平面语法）：禁止被「电影精模皮肤」带偏 */
function isFlatFolkMedium(sub: string): boolean {
  return /^(像素风|扁平插画|极简|MBE卡通|Q版卡通|版画)$/.test(
    String(sub || ''),
  );
}

function isInkPaintMedium(sub: string): boolean {
  return /^(水墨|青绿山水|工笔|青花瓷|敦煌|唐卡|国潮|新中式|水彩|水粉|素描|速写|手绘|剪纸|年画|皮影)$/.test(
    String(sub || ''),
  );
}

/** 静帧出图按子风格媒介给配方，避免一律灌电影精模把剪纸等曲解成写真 */
function buildStillCraftForSubStyle(subStyle: string): {
  portrait: string;
  scene: string;
  prop: string;
  lightBit: string;
  overallPortrait: string;
  overallScene: string;
  overallProp: string;
} {
  const s = String(subStyle || '');
  if (s === '水墨') {
    return {
      overallPortrait:
        '【整体参数】竖版国风绘卷定妆静帧；水墨味色板与特效；单人占主体；禁止真人写真、禁止默认赛璐璐',
      overallScene:
        '【整体参数】横版16:9国风动漫空镜；淡墨远山与留白感氛围；服务走位；无人形抢戏',
      overallProp: '【整体参数】国风动漫静物；墨迹特效点缀；物件轮廓占主体',
      lightBit:
        '动画主光+轮廓光；墨痕飞白作特效高光；禁止皮肤微反光写真',
      portrait:
        '【水墨质量】身份外形可读；古风衣装；衣纹专武可读；墨色/飞白作气质与特效；禁止真人皮肤毛孔、禁止宣纸静物画、禁止只有泼墨不见人、禁止默认赛璐璐',
      scene:
        '【水墨动漫质量】动画场景空间；可有淡墨远山留白感；服务成片走位；禁止照片山水或展览挂画',
      prop:
        '【水墨动漫质量】物件动画造型；可有墨线飞白点缀；禁止金属PBR写真',
    };
  }
  if (s === '剪纸') {
    return {
      overallPortrait:
        '【整体参数】竖版国风定妆；剪纸纹样可作服饰/前景点缀；单人占主体；禁止真人、禁止默认赛璐璐',
      overallScene:
        '【整体参数】横版16:9国风动漫空镜；窗花镂空可作前景层；动画空间透视；无人形抢戏',
      overallProp:
        '【整体参数】国风动漫静物；可有镂空纹样点缀；物件占主体',
      lightBit:
        '动画光影；红纸/镂空纹样点缀透光；禁止皮肤高光写真',
      portrait:
        '【剪纸质量】可演戏的身体与造型；剪纸镂空只作纹样/特效，禁止整幅变成剪纸手工展；禁止真人写真',
      scene:
        '【剪纸动漫质量】动画场景；窗花层叠可作前景；禁止真实体积光雾写真建筑为主',
      prop:
        '【剪纸动漫质量】物件动画轮廓；可镂空纹样；禁止金属PBR写真',
    };
  }
  if (s === '年画') {
    return {
      overallPortrait:
        '【整体参数】竖版国风定妆；年画高饱和民俗色；单人占主体；禁止真人、禁止默认赛璐璐',
      overallScene:
        '【整体参数】横版16:9国风动漫场景；民俗色块空间；无写真透视抢戏',
      overallProp: '【整体参数】国风动漫静物；年画色点缀；物件占主体',
      lightBit: '平涂感动画上色；高饱和民俗色；禁止皮肤微反光浅景深',
      portrait:
        '【年画质量】服饰平涂民俗色；门神气场可借用；禁止真人毛孔发丝、禁止默认赛璐璐',
      scene:
        '【年画动漫质量】动画民俗背景；禁止真实雾气照片街景',
      prop: '【年画动漫质量】套色感物件；禁止PBR金属写真',
    };
  }
  if (s === '皮影') {
    return {
      overallPortrait:
        '【整体参数】竖版国风定妆；暖幕透光侧影气质；可表演；禁止真人、禁止默认赛璐璐',
      overallScene:
        '【整体参数】横版16:9国风动漫空镜；暖黄幕光氛围；禁止写真空间',
      overallProp: '【整体参数】国风动漫道具；镂刻纹样点缀；占主体',
      lightBit: '暖幕透光；动画轮廓光；禁止皮肤高光写真',
      portrait:
        '【皮影动漫质量】动画人物可演戏；侧影/透光只作光影特效；禁止纯皮片道具展览、禁止三维写实人体写真',
      scene:
        '【皮影动漫质量】戏台/幕光氛围的动画空间；禁止真实街道照片',
      prop: '【皮影动漫质量】动画物件；可镂刻纹；禁止金属写真',
    };
  }
  if (s === '版画' || s === '像素风') {
    const medium = s === '像素风' ? '像素' : '版画';
    return {
      overallPortrait: `【整体参数】竖版${medium}定妆；${s === '像素风' ? '像素网格有限色板' : '木刻刀痕套色'}；禁止写真`,
      overallScene: `【整体参数】横版16:9${medium}空镜；印刷/像素媒介空间`,
      overallProp: `【整体参数】${medium}静物占主体`,
      lightBit:
        s === '像素风'
          ? '清晰像素格；有限调色板；禁止抗锯齿糊成照片'
          : '刀痕套色印刷纸感；禁止皮肤微反光',
      portrait:
        s === '像素风'
          ? '【像素质量】角色由像素块构成；禁止高清写实皮肤'
          : '【版画质量】刀刻开脸套色；禁止照片级皮肤',
      scene:
        s === '像素风'
          ? '【像素质量】场景像素块可读；禁止照片风景'
          : '【版画质量】套色场景刀痕；禁止写真街景',
      prop:
        s === '像素风'
          ? '【像素质量】像素物件；禁止PBR'
          : '【版画质量】套色物件刀痕；禁止PBR',
    };
  }
  if (s === '扁平插画' || s === '极简' || s === 'MBE卡通' || s === 'Q版卡通') {
    return {
      overallPortrait: `【整体参数】竖版${s}定妆；平面/卡通语法；禁止电影精模皮肤`,
      overallScene: `【整体参数】横版16:9${s}空镜；平面空间`,
      overallProp: `【整体参数】${s}静物占主体`,
      lightBit: '几何色块或细线浅彩；禁止皮肤毛孔浅景深',
      portrait: `【${s}质量】按该风格开脸造型；禁止写实毛孔发丝电影光`,
      scene: `【${s}质量】平面场景；禁止照片雾与真实建筑为主`,
      prop: `【${s}质量】平面物件；禁止金属PBR写真`,
    };
  }
  if (isInkPaintMedium(s)) {
    return {
      overallPortrait: `【整体参数】竖版${s}味绘卷/插画定妆；画种色板清晰；单人占主体；禁止真人棚拍`,
      overallScene: `【整体参数】横版16:9${s}味概念场景空镜；无人形抢戏；禁止照片直出`,
      overallProp: `【整体参数】${s}味静物；物件占主体`,
      lightBit: `${s}色板与材质作主视觉；戏剧光可读；禁止照片级皮肤毛孔`,
      portrait: `【${s}质量】造型与衣纹可读；${s}味色板/纹样清晰；禁止网红磨皮棚拍脸、禁止宣纸/画布静物展、禁止真人照片`,
      scene: `【${s}质量】场景用${s}味材质层次；禁止空房间照片直出`,
      prop: `【${s}质量】物件跟${s}味材质；禁止PBR写真`,
    };
  }
  // 默认：只禁真人；画风跟族/子风格走，禁止默认赛璐璐动画开脸
  return {
    overallPortrait:
      '【整体参数】竖版定妆静帧；按本场画风族与子风格呈现（概念美术/厚涂插画/绘卷均可）；单人；人物占主体（半身/膝上优先）；禁止真人、禁止照片级皮肤',
    overallScene:
      '【整体参数】横版16:9空镜；按本场子风格写场景空间与氛围光；无清晰人脸抢戏；禁止真人实拍街景',
    overallProp: '【整体参数】静物锁定图；物件占主体；材质跟子风格；禁止真人手模写真',
    lightBit: '戏剧主光+侧逆轮廓光；材质可读；禁止写真皮肤微反光与毛孔精模',
    portrait:
      '【定妆质量】身份外形与衣纹可读；专武握柄清楚；服装主配色分离；严格跟画风族/子风格，禁止默认赛璐璐动画开脸；禁止真人皮肤毛孔、禁止网红棚拍',
    scene:
      '【场景质量】近中远层次清楚；至少一处可辨标志物；材质跟子风格；禁止空房间空平原、禁止照片直出街景、禁止真人路人',
    prop:
      '【道具质量】物件轮廓一眼可辨；材质跟子风格；禁止塑料廉价糊物、禁止PBR写真为主',
  };
}

function buildShotExpandSystem(durationSec: number): string {
  const d = clampShotDurationSec(durationSec);
  const ticks = beatTickCount(d);
  const beatPlan = formatBeatClockPlan(d);
  return `你是顶级「抖音/短视频向」AIGC 导演 + 造型总监 + 场景美术（成片正文用豆包友好格式，质量写进运镜与动作，不堆参数词）。
根据「镜头概念种子」，一次输出可解析的 JSON（不要 Markdown 围栏，不要解释）。

—— 全库统一写作范式（LibTV 式资产+故事板先行）——
竖版定妆 portraitPrompt、工业设定板 sheetPrompt、场景 imagePrompt、剧情宫格 plotGridPrompt、道具 propPrompt 用「【整体参数】→【风格气质】→【主体/空间】」密集可执行写法。
storyPlot 写四拍叙事摘要（纯文本，非出图提示）。
成片 videoPrompt 单独采用「豆包视频友好」正文格式（见下方硬性要求第 2 条）：基础设置 + 正向提示（画风→人物→场景→0.0s/0.5s…），禁止堆【成片必达】【整体参数】【风格气质】【节拍时间轴】标题壳，禁止写「10s；4K60帧观感」「IMAX/HDR」这类展示参数。
禁止写成松散企划书；禁止把运镜只写在文末空总结。

—— 子风格定位（细案极重要，禁止误解）——
**全局画风底盘（极重要）**：只硬锁「禁止真人」；呈现语法跟「画风族 + 子风格」走，**禁止默认写成赛璐璐/动画开脸**。
· 族为「二次元动漫」、或子风格为日系动画/赛璐璐/平涂/Q版等时：才用动画/漫画线条与色面语法。
· 族为「奇幻暗黑怪异」：优先暗黑奇幻概念美术/厚涂插画/电影感CG角色，怪诞比例与氛围；禁止默认二次元赛璐璐。
· 族为「国风东方 / 传统美术绘画」：优先绘卷、工笔晕染、画种笔触气质或国风概念美术；子风格作色板与特效；禁止默认动画开脸。
· 族为「科幻未来 / 复古怀旧 / 简约商业」：概念美术、CG、平面设计语言均可；禁止真人写真。
tags 里的子风格（水墨、剪纸、赛璐璐、赛博朋克、怪诞…）是**成片/定妆/场景的色板与特效语法**，用来规定「本族画面上叠什么味」。
它**不是题材**，也**不是制作过程**：
· 禁止把「水墨」理解成「去生成一幅水墨画 / 只泼墨不演戏」——正确：国风人物招式打斗，墨痕飞白作特效。
· 禁止把「剪纸」理解成「正在剪纸手工 / 整幅剪纸展」——正确：叙事镜头，镂空纹样可作前景与特效。
· 年画/皮影/工笔/油画/水彩/电影感光影等同理：风格味服务镜头事件，人物可演戏；非二次元时不要写「动画开脸/清晰描边/赛璐璐」。
· 画风段写「画风族·子风格」；半秒时间轴写人物动作与结果；不要写「生成xx画」「完成一幅xx」。
· **严禁真人**：禁止真实人脸、真人演员、live-action、照片级皮肤毛孔、网红棚拍。

—— 静帧出图硬规则（定妆/场景，极重要）——
portraitPrompt 与 imagePrompt 必须按本场**画风族 + 子风格视觉语法**写可出图细案，观感应精美、材质可读，禁止平庸空泛「好看」「华丽」。
**不要默认动漫风**：仅二次元族/明确动画子风格才写动画开脸、描边、赛璐璐；其它族写概念美术、厚涂插画、绘卷或CG角色气质。禁止灌写实皮肤毛孔、发丝写真、真人棚拍；也禁止写成「静物展览画」而丢掉可演戏的角色。
场景必须写清跟画风的材质层次与标志物；禁止空房间/空平原一句带过；用水墨淡墨远山、剪纸窗花前景等作风格点缀，代替写真雾与照片建筑。
整体参数：点名本场「画风族·子风格」；禁止廉价塑料感；禁止用「8K皮肤精模」；禁止无依据写「动漫定妆/动画开脸」。

—— 成片标杆（必须对齐，否则失败）——
目标观感 = 抖音/快手/短视频「会停下来看」的**有重点**短片：不是空气氛片，也不是平庸模板片。
每一条镜头必须先抽出一个「本镜重点」（一句话能复述的卖点），再围绕它写时间轴；观众看完应能回答「这镜最牛/最怪/最美的是哪一下」。
节奏偏「短视频有重点」：时间轴仍按 0.5 秒一行写满（0.0s： / 0.5s： / 1.0s： …），但**全片只兑现 4～6 个核心卖点**；核心格写新钩子/新招/命中，承接格只延续握持、惯性、跟拍，禁止每半秒换一个大招或堆满技能名。
五段（起势→加速→交锋/推进→高潮→收束）只是内部节奏意向，不要写进标题；标题只用 0.0s：0.5s： 这种半秒刻度，禁止【1-3s · 加速】【0-2s】【第1秒】整秒糊写。
每一格都必须独立成行，镜头运动与主体动作揉进同一句；相邻两格禁止整句复读，但承接格允许「同一招的惯性延续」。
全片核心卖点约 4～6 个即可（${d} 秒也不要硬凑 ${ticks} 个互不相关的新事件）；半秒行数仍是 ${ticks}，用承接格填满。
单一连续时空贯穿全片；节奏：起势（闪电钩）→加速→交锋/推进→高潮→收束（瞬间）。
本条成片目标时长 = ${d} 秒：基础设置写「${d} 秒，16:9 横屏」即可；时间轴从 0.0s 写到 ${(d - BEAT_TICK_SEC).toFixed(1)}s 共 ${ticks} 行；禁止改总时长、禁止合并半秒格、禁止跳格；禁止在正文展示「4K60帧观感 / IMAX / HDR」等参数词。
风格必须跟「八大画风族 + 子风格标签 / 种子」走，禁止默认串风。

—— 兵器握持硬锁（极重要，否则开场就翻车）——
凡角色持剑/刀/枪/棍等兵器：
· **手必须握住剑柄/刀柄/枪杆握把**，五指环握柄身；画面里要同时能读到「手 + 剑格/护手 + 柄」的连接关系。
· **严禁**：空手漂剑、手抓刃身/刀背当握持、剑从额头/肩背长出、鞘自抽出无人握柄、只拍刃尖墨滴却看不到手与柄。
· 兵器特写起势：优先「握柄特写」（手+剑格+柄入画），需要刃尖戏份时也必须带一段可见的握持或手腕过渡，禁止开场只有悬浮刃尖。
· 定妆与成片一致：portrait 里专武已握在手里；成片全程同一握持逻辑，不得中途改成结印空手御剑。
· 「命名大招规格表」（凡大招/禁招/组合奥义一律适用，否则失败）：
  - **万剑归宗 / 千剑齐鸣 / 万影归宗 / 万箭齐发**：满天轨迹暴雨（上百至千道，密成幕）→ 螺旋汇束刺中对手；禁止只有 3～9 把小飞剑/几支箭，禁止只吊一把巨剑摆拍。
  - **千枪齐发**：上百道枪影/弹道织网再收束穿心；禁止只有几杆枪。
  - **棍扫千军**：扇面冲击横推半边战场+土龙/气浪；禁止只扫身前一小段。
  - **一剑开天门**：天门洞开占半屏以上，金光瀑布砸敌；禁止细缝一点。
  - **刀域一闪**：刀域罩住双方站位再一闪命中；禁止脚下一圈装饰光环。
  - **焚天决**：火柱罩住对手全身并顶到云层；禁止掌心一小团火球。
  - **火龙卷**：完整火龙盘绕过半屏吞敌；禁止一条细火线。
  - **一拳破界**：多层气浪环过人宽+空间裂纹；禁止拳前一小圈光。
  - **碎兵爆发 / 代价大招**：碎片/血翼须成幕或展开过人；禁止点子特效。
  - **禁招**：天象/魔龙/血海等体量须半屏以上，并写出自身代价；禁止只有符号闪一下。
  - 通则：大招形状写清「数量/体量/范围」；特效覆盖半边战场再收束到命中点；本命兵器握持不断；禁止烧录技能字幕大字。
· 其他命名大招同理：名字里有千/万/阵/域/决/开天/破界/灭世，就必须按上表同级规格兑现，禁止缩水摆拍。

—— 爆款成片写法（极重要）——
成片正文必须遵守高燃写法（禁止空话氛围堆砌）：
1) 信息权重顺序：画风材质 → 主体身份外形 → 场景 → 半秒时间轴（镜头+动作）。禁止一上来堆空氛围词。
2) 黄金起势（闪电，约前 0.5～1.0 秒内）：必须有「可见钩子」（特写入势 / 反常识结果前置 / 力量可视化），钩子落地后 0 空档进入动作链，禁止开场发呆站桩、禁止用半段时长只做氛围推镜。
3) 每一格只写一个主运镜，与主体动作写在同一句；禁止一格里推+摇+甩全上。升格慢镜只许点缀高潮不到 1 秒。
4) 物理细节触发运动：发丝/衣袂/水面/尘土/碎金对动作的反应，写成「怎么做→碰到什么→可见效果」；核心格写清结果，承接格可只写惯性延续。
5) 参考锁形：基础设置里写清图1/图2对应什么；开启形象一致性；连贯单一时空，禁止跳切换景、禁止拼贴分屏；若有角色定妆参考，必须对齐其**握柄姿势**，禁止改成空手。
6) 去塑料感：用正向写清材质与二次运动即可；本阶段先不要输出【负向提示词】段落。
7) 全文清晰完整且严格 <4000 字：细节写够，禁止为省字写含糊空壳；也禁止为凑密而堆无关新招。
8) 质量在运镜与动作里体现（跟焦、体积光、二次运动、路径可读、握持正确），禁止把「4K60帧观感 / IMAX级冲击构图 / HDR体积光」等词直接写进成片正文展示。
category 为画风族之一：国风东方 / 二次元动漫 / 传统美术绘画 / 科幻未来 / 复古怀旧 / 奇幻暗黑怪异 / 简约商业（只禁真人；呈现跟各族走，禁止默认赛璐璐）。
tags 中的首个子风格（如水墨、赛璐璐、克苏鲁）+ 种子，共同硬锁画风段落。
族内常见子风格速查：
· 国风东方：水墨、青绿山水、工笔、国潮、敦煌、岩彩、炎彩、青花瓷、年画、皮影、新中式、剪纸、唐卡
· 二次元动漫：日系动画、二次元插画、厚涂、平涂、Q版卡通、赛璐璐、韩系漫画
· 传统美术绘画：水彩、油画、素描、版画、水粉、速写、像素风、手绘
· 科幻未来：赛博朋克、废土、蒸汽朋克、太空科幻、机能风
· 复古怀旧：胶片、复古港风、80年代复古、蒸汽波、复古美式画报
· 奇幻暗黑怪异：怪诞、超现实、克苏鲁、哥特、阈限空间
· 简约商业：扁平插画、极简、MBE卡通、3D黏土、OC渲染、Blender写实3D
若族为「奇幻暗黑怪异」：诡异暗黑奇幻/怪诞概念美术优先（扭曲/梦境/不可名状/哥特阴森/空旷阈限），禁止廉价都市公寓跳吓片，禁止默认二次元赛璐璐。
**全库禁止真人**：即使子风格带「写实/电影/照片」字样，也只作光影与材质点缀，禁止真人演员、live-action、照片级皮肤；不要因此改写成赛璐璐动画。

—— 全品类「本镜重点」硬规则（极重要，否则失败）——
本镜重点必须在正向提示的画风/人物/场景与高潮半秒格里兑现（从标题/一句话概念提炼，必须具体可见）；禁止写成「只有画风正确、没有事件」的空转。
禁止在正文写「本镜重点 = ……」这种元标题，把重点做成可见画面即可。

各族重点方向（按种子选题，不要跑题；**人物按画风族呈现并可演戏**，仅二次元族用动画开脸；子风格味作特效点缀；**场景形变一律挂招式因果**）：
· 国风东方：重点常在「国风角色把招式做满」（墨痕飞白斩弧、金晕烫轮廓、纹样特效）——场景形变只能是招式余波；禁止「天空无故开峰」；禁止宣纸静物；禁止默认赛璐璐。
· 二次元动漫：重点常在「可读招式/变身/巨大对比/海报定格」——色块冲击波/速度线须跟命中；可用动画开脸；禁止背景突然裂空抢戏
· 传统美术绘画：重点常在「画种味特效跟着命中」（水彩晕开、油画厚堆感冲击）——人物可演戏；禁止画布/纸地无故自裂；禁止默认动画开脸
· 科幻未来：重点常在「科技物件如何改变战局/身体」——全息碎裂/霓虹爆须由枪轨或拳劲触发；禁止城市屏自碎；概念美术/CG气质
· 复古怀旧：重点常在「年代介质签名瞬间」——漏光/CRT噪点挂在命中格；禁止片尾无故换裂天；禁止真人胶片写真
· 奇幻暗黑怪异：重点常在「一次不合常理的揭示」——门增殖/比例突变须挂在某一招结果上；厚涂/暗黑概念美术；禁止默认赛璐璐
· 简约商业：重点常在「设计语言 clearest 一击」——一线裂开/色块对撞从命中轴延展；平面/干净商业语法
· 单人戏：重点常在「一人如何把美/帅/怪做满」，禁止硬凑第二人站桩；若有场景形变仍须跟该人招式同轴
· 无人戏：重点常在「空间本身成为主角」，此时才允许场景主导事件；有人对打时禁止改成无人场景自演
禁止做成：廉价糊片、舞台灯光秀、分镜拼贴、每秒乱切景、满屏看不清人的特效糊；禁止把国风写成赛博霓虹主调、禁止串成写真。

禁止全品类平庸模板：
· 对称站桩对视 → 中间冲一下 → 光核/烟雾 → 结束
· 只有氛围运镜、没有「重点事件」
· 用满屏粒子/闪白假装高潮
· 「定妆摆拍连播」：每段都是漂亮静止 pose，没有甩发/甩袖/拖尾/跟拍（僵硬单调的根因）

—— 去僵硬 + 画风内「炫丽」（全品类，极重要）——
目标不是堆无关特效，而是让画面「动得起来、看得过瘾」，且炫丽必须用本场子风格自己的语汇。

禁止僵硬（写成即失败）：
· 四肢像木头、关节锁死、每秒换一个摆拍姿势
· 头发/衣袖/狐尾/披风/饰带几乎不动，或整块刚体平移
· 全程侧身对峙横移，像舞台合影；只有远中景，没有跟拍与景别呼吸

必须写出「二次运动」（至少每段点到 2 项）：
· 发丝分缕甩动、衣袖滞后回摆、腰带/红绳拖曳、狐尾/披风跟随惯性再回弹
· 落叶/墨点/尘/纸屑被动作带起再落下（按画风选）
· 接触后身体有形变感（微弓背、膝软、肩错）再恢复，禁止碰一下完全不变形

必须写出「运镜流动」（不是只会硬切）：
· 至少 1 次跟拍/甩镜跟着刃或人走；至少 1 次推近到眼/手/专武再拉开
· 景别节奏：近→远→更近，禁止五段都是同一中全景站桩

画风内炫丽（高潮至少选 2～3 个「本风格签名视觉」，禁止无种子乱加熔岩天雷；**凡涉及场景形变一律跟招式同轴因果，禁止背景自己演**）：
· 水墨：飞白拖笔斩弧、墨点被刃带起、命中处焦墨炸开；远山/天空开裂须晚于命中且同轴
· 青绿/工笔/青花/敦煌：纹样/金箔爆开跟着命中点；矿物色块崩裂重聚须由招式带起
· 岩彩/炎彩：矿物浪与鎏金拖尾跟着动作；金晕/光柱烫的是出招者或命中点，禁止空背景自己放光柱
· 年画/剪纸/皮影：平涂炸裂/镂空翻面/幕影刃光跟着交锋接触点，禁止窗花/幕布无故自裂
· 赛璐璐/日系/平涂：速度线、网点闪、色块冲击波跟着出招与命中；禁止背景突然换一张裂空海报
· 厚涂/油画/水彩：笔触炸裂/湿边冲击从命中点溅出，禁止画布纹理无故撕裂抢戏
· 赛博/机能/太空：霓虹拖尾、全息碎屏、接口灯连锁须由枪轨/刃路/拳劲触发；禁止城市屏无故自碎
· 废土/蒸汽：沙暴切开、锈屑喷溅、蒸汽幕须跟招式冲击同轴
· 胶片/港风/80s/蒸汽波/画报：漏光拖影、霓虹拉丝、CRT噪点跟命中瞬间，禁止片尾无故换裂天底
· 怪诞/超现实/克苏鲁/哥特/阈限：比例突变/门增殖/彩窗炸裂须挂在某一招结果上，禁止环境独自诡异演出
· 扁平/极简/MBE/黏土/OC/Blender：色块爆散/一线裂开须从命中轴延展，禁止全场无来由裂开
· 电影/照片/影视/纪实：尘土、积水、火花从接触点溅起，禁止天空无故裂开抢戏

若本镜明显是打斗/交锋向（含标签超燃战斗/战力天花板/大招特写，或种子含对决对斩大招），额外必须——**招式打斗·核心卖点优先**（不是乱拳，也不是 10 秒塞 20 个技能）：
· 原则：用**命名技能**打，但全片只选 ${Math.max(3, Math.min(5, Math.round(d * 0.4)))} 个核心招式写透（起手 → 1～2 连招 → 大招命中即可）；半秒承接格写惯性与握持延续；禁止「捅来捅去」；禁止每半秒换招名。
· **技能要炫**：打斗镜优先调用技能库条目（名称+形状+命中点写进**核心格**）；可按画风改材质；承接格不要重复贴技能名。
· 起势：专武**握柄特写**（手+剑格+柄）或持剑全身起手招；力量可视化；禁止开场只拍悬浮刃尖/墨滴、禁止对称站桩发呆、禁止空手结印开场。
· 加速：路径可读位移 + 拖尾；握持不断；1～2 个位移/接触结果即可。
· 交锋：上述核心招式紧咬合 + 可有 1 次反转；禁止同一捅刺复读。
· **高潮大招硬锁**：命名绝技一眼可读，并按「命名大招规格表」兑现体量（暴雨/半屏/罩敌）；禁止缩水成几道小特效；本命兵器仍握在手里打中对手；禁止双手结印空御剑、禁止烧录技能大字。
· **终局命中硬锁**：终局必须打在对手身上，对方倒地/崩飞/溃散；禁止打空地、禁止只炸场景。
· **场景特效因果硬锁**：场景形变一律是招式同轴余波；先命中再裂景；禁止人站桩背景自炸。
· 有兵器：刃轮廓可读；**握柄关系全程不断**；命中轨迹指向对方身体。
· 无兵器：拿手技能命名，仍须命中。
· 收束：对方中招后瞬间定胜负；衣发尾惯性未停。
· 运镜：特写↔全景呼吸 + 跟拍技能轨迹；禁止全程升格拖成慢片。
· 造型强对比；特效语汇跟子风格。

若本镜偏氛围/揭示/商业展示（非互殴），额外必须：
· 全片 4～6 个核心信息升级即可（其余半秒格承接）；不要为凑满 ${ticks} 个无关新事件而灌水
· 至少 1～2 次关系/空间/材质反转，且要快落点
· 高潮必须让「本镜重点」成为画面绝对中心，并带本风格签名炫丽；衣发尾仍要流动
· 禁止定妆摆拍连播式走过场；禁止用长推镜/慢飘带把时长磨掉

—— 概念兑现硬规则（极重要，否则失败）——
· 用户给出的「一句话概念 / 运镜侧重 / 招式侧重 / 特效侧重 / 种子」必须落成可见画面，禁止改写成通用模板。
· 半秒时间轴至少 1 格完整执行运镜侧重链条；至少 1 格把标题/概念卖点做满。
· 景别必须有起伏：禁止全程同一种中远景；禁止整段对称构图不动机位。
· 画风特效跟子风格走，禁止用「激光剑光核 + 熔岩地裂 + 数字闪电 + 上帝光」去套所有题材。
· 凡有人对打：场景形变（裂天/炸地/碎屏/色块爆/门增殖等）必须是招式同轴余波；八大族同一条，不只水墨。
· 水墨/青绿等：剑气=墨痕/飞白/皴擦/留白，不是发光光剑；若写远山撕开/留白吞景，必须是刀路同轴余波且晚于命中。
· 岩彩/炎彩标杆（极重要，同族多构图）：正向画风段必须写出「矿物青蓝青绿颗粒重彩 + 金箔/熔金/鎏金碎光材质 + 暗底高对比 +（金晕背光或侧逆金边或体积光柱）+ 披帛/矿物浪流体二次运动」；可走侧脸金晕、莲中飞升、飞天金粒子拖尾等变体，禁止每镜同一pose；禁止灰墙皮、禁止塑料二次元平涂美人；光柱/矿物浪须挂在人物动作上，禁止空背景自演。
· 角色身份全程稳定：发型/主色/专武轮廓开场定死；**握持关系开场定死**（手握柄，不是握刃）；允许风格化拖尾，禁止认不出；禁止凭空多兵器；刃/道具轮廓在特效中仍可读。
· 场景开场定死：同一地面逻辑、同一天空、同一远景剪影；禁止前后半场换地图感；禁止后半场突然换一张裂天/炸场背景。
· 脚落地清晰；禁止烧录字幕、平台水印、可读 UI 文字、技能名大字标题。

—— 切镜连贯硬规则（极重要，否则失败）——
本条是「一条连续成片」里的景别起伏，不是分镜拼贴。景别可以跳（特写↔全景），但时空与动作必须接得上：
· 时空连续：始终同一战场、同一时段、同一主光方向；禁止瞬移换地、禁止天空地面突变、禁止角色凭空换位到另一侧无过渡；禁止收势后天空无故新开裂缝
· 动作匹配（match on action）：下一格必须上一格未完成动作中途接住（刃还在挥、人还在冲、衣袂还在甩），禁止每格重新摆 pose 开打
· 轴线稳定：双人戏左右站位开场定死（谁在画左/画右），错身绕背要写清路径；禁止下一格突然左右对调却无绕行过程（越轴乱跳）
· 目光与朝向连续：特写抬眼/侧脸后拉回全景时，朝向与对手相对位置要一致
· 因果连续：上一格造成的裂痕、墨渍、尘雾、伤势、胜负压迫，下一格必须还在（可减弱，不可瞬空重置）；场景裂痕必须能追溯到某一招的刀路/冲击轴，禁止无端出现
· 运镜动机：每次切近/拉远写清「因为看见什么才切」（跟刃、跟眼、跟脚），禁止无动机乱切
· 禁止：分屏、跳切拼贴、九宫格、每秒换地图、格与格之间「黑场重开」感

写作总则：
· 用「导演可执行指令」写：景别、机位、动作接触点、特效可见形状、光从哪来落到哪；禁止「氛围拉满/极致震撼/电影感拉满」等空话。
· 信息密度高：一句一个可见结果；细腻写材质与光，但不灌水。
· **分镜七要素（细节硬锁，核心格必写满）**：景别、机位角度、构图重心、主光方向与受光面、色调冷暖、主体动势（含物理二次运动：衣发/披帛/刃尾/尘雾）、相邻格如何衔接。画面描述要让人「看见并感到」——不要只列名词。
· **半秒行写法**：核心格（起势/高潮/命中）按「主体细节→单一动作→单一运镜→可见物理结果」写密；承接格可短，但仍要有接触点或惯性。每格只写一种主导运镜（推/拉/摇/跟/环绕/升降择一），禁止一格堆三种运镜。
· **物理细节优先于空形容词**：写「刃锋割开雾气留下墨痕拖尾」「袖口金线随挥砍甩出弧线」「对方肩甲受击凹陷碎金」；禁止「气场拉满/压迫感爆棚」之类空话。
· **情绪与色温随剧情变**：起势→加速→高潮→收束，主光色温或饱和度至少有一次可读变化（如冷青→熔金高光），禁止全程同一灰调。
· 字数硬上限（极重要）：videoPrompt、每个 portraitPrompt、每个 sheetPrompt、imagePrompt、plotGridPrompt、每个 propPrompt 各自必须 ≤${PROMPT_MAX_CHARS} 字；storyPlot ≤600 字。
· 目标篇幅：videoPrompt 约 900～2200 字；portraitPrompt 约 600～1200 字；sheetPrompt 约 700～1400 字；plotGridPrompt 约 500～1100 字；storyPlot 约 180～400 字；imagePrompt 约 450～900 字。
· portraitPrompt=竖版9:16单人半身/膝上定妆锁脸；sheetPrompt=横版16:9工业设定板（大头档案+三视图+表情+服装细节）；有人物时二者都要有。
· 时长锁定：全文按 ${d} 秒成片写；半秒轴必须使用下方给定刻度（共 ${ticks} 行：0.0s： / 0.5s： / 1.0s： …），禁止省略格、禁止合并格、禁止改总时长。

JSON 结构严格如下：
{
  "storyPlot": "四拍故事摘要：起势→加速→高潮→收束；含冲突、情绪/色温变化、地点一句；180～400字纯叙事",
  "plotGridPrompt": "方图1:1的9宫格剧情板完整出图提示（见剧情宫格细则）",
  "videoPrompt": "成片提示词正文（见下方格式）",
  "characters": [
    {
      "name": "称谓（原创中文名或职衔称呼）",
      "role": "职能如主角/对手/配角",
      "appearance": "外形详述（见人物细则）",
      "portraitPrompt": "竖版9:16单人定妆完整出图提示词（半身锁脸）",
      "sheetPrompt": "横版16:9工业角色设定板完整出图提示词（五区拼版）"
    }
  ],
  "scene": {
    "name": "场景名（可识别地点）",
    "description": "环境详述（见场景细则）",
    "imagePrompt": "横版16:9场景环境完整出图提示词"
  },
  "props": [
    {
      "name": "道具名",
      "role": "职能如专武/法器/信物/机关",
      "description": "外形详述",
      "propPrompt": "道具单独出图提示词"
    }
  ]
}

硬性要求：
1) 全程简体中文。characters 数量必须 = 用户给出的出场角色数（可为 0 或 1 或多人）；原创，禁止明星脸与知名 IP。
1a) 若出场角色数 = 0：characters 必须输出空数组 []；成片重点放在空间/画风事件的「美、炫、帅、奇」；【人物与参考锁定】写「无人出镜，仅场景与画风事件」。
1b) 若出场角色数 = 1：单人戏，禁止硬凑对手对砍；重点可以是美型展示、战力独舞、结印施法、变身显化、孤胆穿越奇观。
1c) props 为可选关键道具，0～2 件：仅当本镜有「需要单独锁形」的标志物件时填写。角色手持兵器若已在定妆里握清楚，不要重复进 props。无关键道具则输出空数组 []。
2) videoPrompt 建议 900～2200 字（核心卖点写透即可），绝对必须 <4000（≤${PROMPT_MAX_CHARS}）；必须严格按「豆包视频友好」正文格式输出（不要 Markdown 标题壳，不要【成片必达】【整体参数】【风格气质】【人物与参考锁定】【节拍时间轴】【负向提示词】）：
基础设置：…
正向 Prompt
{画风段}
{人物段，无人则省略}
{场景段}
0.0s：…
0.5s：…
1.0s：…
…
（写满到 ${(d - BEAT_TICK_SEC).toFixed(1)}s）

写法标杆（语气与密度对齐，题材按本镜子风格改写；非写实示例）：
「基础设置：${d} 秒，16:9 横屏，上传 2 张参考图（图 1 {场景名}、图 2 {角色人设}），开启形象一致性，连贯单一时空，禁止跳切换景
正向 Prompt
国风东方·水墨：绘卷/概念美术气质，墨分五色与飞白作特效，古风衣装，发丝飘带二次运动，左上侧逆光，静谧冷魅；禁止真人、禁止默认赛璐璐。九尾狐妖，狐耳，狭长竖瞳，朱砂红点眉眼，青墨色古风长袍，九尾层叠，尾梢墨雾拖尾。场景为枯木山林空地，淡墨远山氛围，林间薄雾。
0.0s：镜头从狐尾特写缓慢推进小幅摇镜，狐妖静立，九尾半展，尾尖微颤飘散墨雾，身形半隐；
0.5s：镜头沿狐尾弧线后拉上摇，环绕半圈跟拍，狐尾大幅度甩动扬起白雾，留下淡墨拖影，狐妖侧身转身，衣袂飞扬；」

基础设置硬锁（一行写完）：
· 「${d} 秒，16:9 横屏」
· 上传 N 张参考图，并括号写清图 1 / 图 2… 各是什么（场景参考 / 角色人设 / 道具）；出场=0 时可只写场景参考
· 「开启形象一致性，连贯单一时空，禁止跳切换景」
· 禁止写：4K60帧观感、IMAX、HDR、AI电影级运镜系统驱动、成片参数硬锁 等展示参数词

正向 Prompt 硬锁：
· 先一段画风（该子风格的材质/笔触/光色/氛围，短句逗号连打）——写的是「用什么风格看」，不是「去生成一幅xx画」
· 有人物再写人物外形锚点（脸/发/装/专武/标志色），开脸跟风格语法
· 再写场景地点与材质层次（短，服务成片）
· 不要另起「风格气质」「人物与参考锁定」标题
· 不要写「生成水墨画/生成剪纸/完成一幅油画」这类元指令

半秒时间轴硬锁（共 ${ticks} 行，必须原样采用下列刻度，不可合并、不可跳格）：
${beatPlan}
标题格式：0.0s： / 0.5s： / 1.0s： … 直至 ${(d - BEAT_TICK_SEC).toFixed(1)}s：
禁止：【0.0s · 起势】【1-3s】【第1秒】；禁止拆成「运镜：」「画面：」两行；禁止写阶段名（起势/加速等）。
每一行写短写密：镜头怎么动 + 主体做什么 + 至少一个可见结果；句末可用分号；相邻两行不得雷同复读。

3) 招式/表演/特效/切镜连贯规则仍须遵守前文「去僵硬」「画风内炫丽」「切镜连贯」；全部写进正向段与各半秒行，不要另开空章节。
4) 锁定链：characters ↔ props ↔ videoPrompt ↔ scene 同一世界观；多人时造型强对比；单人时专武与气场稳定；无人时场景主光与画风签名稳定。
5) 只输出一个 JSON 对象。
6) 本阶段不要输出任何【负向提示词】段落（成片/定妆/场景/道具皆同）。

—— 人物细则 ——
有人物时：人物是成片、竖版定妆与工业设定板的第一重点。appearance 供 JSON 字段；portraitPrompt 与 sheetPrompt 必须可直接出图。

appearance（约 220～420 字，≤700）：短句密集写清身份外形；按画风族呈现（仅二次元族写动画开脸；奇幻暗黑用厚涂/概念美术气质；国风用绘卷/工笔气质）——写的是角色长什么样，不是「画种介绍」。服装主配色、专武轮廓、**握持（五指握柄、剑格可见、刃尖远离手指）**、标志锚点、气场；与对手强对比；战场痕迹一句即可。禁止只写「美丽少女/英俊男子」；持兵器禁止空手或握刃；禁止真人写真。

portraitPrompt（竖版9:16 半身锁脸，建议 600～1200 字）——标题保留；不要负向段：
【整体参数】竖版单人定妆静帧；半身或膝上；按本场画风族·子风格；禁止真人棚拍；人物占画幅主体；禁止多格设定板/三视图拼版
【风格气质】本场画风族·子风格硬锁；主色调与气场；严格沿用本角色身份与服饰/专武锚点
【主体】姓名+role；展开 appearance；**专武：手握住柄，剑格入画**；五官发丝清晰

sheetPrompt（横版16:9 工业设定板，建议 700～1400 字）——日常写实/国漫工业设定集：
【整体参数】横版角色概念设定板；模块化五区；干净浅灰底；禁止竖版单人生活照
【风格气质】本场画风族·子风格；国漫/日常写实插画；禁止真人写真、禁止 UE5 次世代堆料
【主体】同一角色贯穿：左上大头档案（姓名/身高气质/身份）+ 右上 THREE VIEW 正侧背 + 右中 EXPRESSION 6～8 表情格 + 左下 COSTUME 全身与 4～6 细节格 + 右下短说明；成年约 7.5～8 头身

—— 故事与剧情宫格 ——
storyPlot：纯叙事 180～400 字，必须含起势→加速→高潮→收束；冲突一眼可读；情绪/色温至少一次变化；地点一句。禁止空话「氛围拉满」。
plotGridPrompt（方图 1:1，9 宫格，建议 500～1100 字）：
【整体参数】严格 3×3=9 等分宫格剧情板；细线分隔；左→右、上→下阅读；每格单一瞬间；禁止真人
【风格气质】与成片同一画风族·子风格；角色外形对齐 appearance
【主体】九格必须兑现 storyPlot 四拍；景别有特写/中景/全景轮换；可有极小角标 1…9

—— 道具细则（可选，0～2）——
仅输出「需要单独锁形」的标志物件；手持兵器已在定妆中清楚者不要重复。
description（约 80～180 字，≤360）：轮廓、材质、主配色、标志纹样、尺度。

propPrompt（建议 400～800 字，必须 <4000 / ≤${PROMPT_MAX_CHARS}）——同一范式（不要负向段）：
【整体参数】静物锁定图；4K级材质；物件占主体；无清晰人脸
【风格气质】本场子风格硬锁；材质微细节；主光+轮廓高光清楚
【主体】展开 description；可微悬浮禁糊影

—— 场景细则 ——
有人物时场景从简但仍要「短而准、可出图、材质精美」。禁止空房间/空平原一句带过。

description（约 80～180 字，≤280）：地点 + 地面材质触感 + 墙/岩/雾层次 + 天空主光方向 + 远景剪影 + 一处标志物；跟子风格；禁止无种子硬塞熔岩天雷百科。

imagePrompt（建议 450～900 字，必须 <4000 / ≤${PROMPT_MAX_CHARS}）——同一范式（空镜锁定图；不要负向段）：
【整体参数】横版16:9空镜；按本场画风族·子风格写场景（水墨味可淡墨远山；剪纸味可窗花前景；奇幻暗黑用雾林/阈限空间气质）；无清晰人脸、无人形抢戏；禁止真人实拍
【风格气质】本场画风族·子风格硬锁；材质/色板跟风格味；中景留走位；禁止默认赛璐璐；禁止串风，禁止写成画展挂画
【空间】地点特征；地面/墙/天跟画风材质（非写实勿写真实石木雾写真为主）；近中远或风格化纵深；至少一处可辨标志物`;
}

/** 从技能库为镜头挑选可调用技能（优先绑定 id / 兵器匹配） */
function pickSkillsForShot(
  shot: ShotLibraryItem,
  pool: SkillLibraryItem[],
  limit = 8,
): SkillLibraryItem[] {
  if (!pool.length) return [];
  const byId = new Map(pool.map((s) => [s.id, s]));
  const bound = (shot.skillIds || [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean) as SkillLibraryItem[];

  const hay = [
    shot.label,
    shot.blurb,
    shot.moveFocus,
    shot.vfxFocus,
    shot.seed,
    ...(shot.castRoles || []),
    ...(shot.tags || []),
  ]
    .join(' ')
    .toLowerCase();

  const weaponOf = (s: SkillLibraryItem) => String(s.weaponHint || '');
  const score = (s: SkillLibraryItem) => {
    let n = 0;
    if (hay.includes(s.label.toLowerCase())) n += 8;
    if ((s.tags || []).some((t) => hay.includes(String(t).toLowerCase()))) n += 3;
    if (/刀|blade|dao|太刀|唐刀|苗刀|斩马/.test(hay) && /刀/.test(weaponOf(s) + s.category))
      n += 4;
    if (/剑|sword|青锋|汉剑/.test(hay) && /剑/.test(weaponOf(s) + s.category)) n += 4;
    if (/枪|spear|红缨|蛇矛|槊/.test(hay) && /枪/.test(weaponOf(s) + s.category)) n += 4;
    if (/戟|戈|矛|铲|钺|镋|狼牙/.test(hay) && /戟戈|戟|戈/.test(weaponOf(s) + s.category))
      n += 5;
    if (/棍|棒|杖|staff|齐眉/.test(hay) && /棍/.test(weaponOf(s) + s.category)) n += 4;
    if (/暗器|飞针|飞石|袖箭|钉|飞刀|手里剑|金钱镖/.test(hay) && /暗器/.test(s.category))
      n += 5;
    if (/鞭|链|绳镖|软兵|拂尘|流星/.test(hay) && /软兵/.test(s.category)) n += 5;
    if (/扇|笔|钩|镰|奇门|拐|指虎|峨眉/.test(hay) && /奇门|风雅/.test(s.category))
      n += 5;
    if (/盾|藤牌|塔盾/.test(hay) && /盾/.test(weaponOf(s) + s.category)) n += 5;
    if (/巨斧|巨锤|重兵|金刚杵|陌刀/.test(hay) && /重兵器|重兵/.test(s.category + weaponOf(s)))
      n += 5;
    if (/光剑|影刃|符纸|血器|概念|克力士/.test(hay) && /概念/.test(s.category + weaponOf(s)))
      n += 5;
    if (/拳|掌|指|爪|肘|膝/.test(hay) && /拳|掌|腿|指|爪|肘/.test(s.category))
      n += 4;
    if (/步|身法|残影|虚影|轻功|瞬步|缩地/.test(hay) && /位移|闪避|控制步|身法/.test(s.category + s.tier))
      n += 4;
    if (/仙|魔|真气|灵力|雷|毒|修仙|玄幻/.test(hay) && s.energyType) n += 2;
    if (/大招|终局|归宗|开天|焚天|破界|禁招|奥义/.test(hay) && /大招|禁招|组合/.test(s.tier))
      n += 3;
    if (s.tier === '身法' || s.tier === '组合') n += 1;
    if (s.vfxBurst) n += 1;
    return n;
  };

  const ranked = [...pool].sort((a, b) => score(b) - score(a) || a.label.localeCompare(b.label));
  const picked: SkillLibraryItem[] = [...bound];
  const seen = new Set(picked.map((s) => s.id));

  const take = (pred: (s: SkillLibraryItem) => boolean, max: number) => {
    let c = 0;
    for (const s of ranked) {
      if (c >= max) break;
      if (seen.has(s.id) || !pred(s)) continue;
      picked.push(s);
      seen.add(s.id);
      c += 1;
    }
  };

  // 名额紧张时也必须保住「起手→连招→大招」；旧逻辑先塞身法会把大招挤掉
  const want = Math.max(5, limit);
  const preferWeapon = (s: SkillLibraryItem) => {
    const w = weaponOf(s) + s.category;
    // 标题/招式里「一剑」优先于泛「刀/斩」字样，避免弯刀类抢走水墨剑戏
    if (/剑|青锋|汉剑|一剑/.test(`${shot.label}${shot.moveFocus}${shot.blurb}`)) {
      return /剑/.test(w);
    }
    if (/刀|太刀|唐刀|斩马|横刀|藏刀/.test(`${shot.label}${shot.moveFocus}`)) {
      return /刀/.test(w);
    }
    if (/枪|红缨|蛇矛|槊/.test(hay) && /枪/.test(w)) return true;
    if (/拳|掌|指|爪/.test(hay) && /拳|掌|腿|指|爪/.test(w)) return true;
    return false;
  };
  const takePrefer = (
    pred: (s: SkillLibraryItem) => boolean,
    max: number,
  ) => {
    const before = picked.length;
    take((s) => pred(s) && preferWeapon(s), max);
    const need = max - (picked.length - before);
    if (need > 0) take(pred, need);
  };

  takePrefer((s) => s.tier === '起手', 1);
  takePrefer((s) => s.tier === '连招', 2);
  takePrefer((s) => s.tier === '大招' || s.tier === '禁招', 2);
  take((s) => s.tier === '身法' || /位移|闪避|控制步/.test(s.category), 1);
  take((s) => s.tier === '组合' || s.category === '组合奥义', 1);
  take(() => true, want);

  // 兜底：若仍无大招/禁招，强塞评分最高的一条大招
  if (!picked.some((s) => s.tier === '大招' || s.tier === '禁招')) {
    const ult = ranked.find((s) => s.tier === '大招' || s.tier === '禁招');
    if (ult && !seen.has(ult.id)) {
      if (picked.length >= want) picked.pop();
      picked.push(ult);
      seen.add(ult.id);
    }
  }

  return picked.slice(0, want);
}

function formatSkillLibraryBlock(skills: SkillLibraryItem[]): string {
  if (!skills.length) return '';
  const lines = skills.map((s, i) => {
    const bits = [
      `${i + 1}. 【${s.label}】(${s.category}/${s.tier}/${s.weaponHint}`,
      s.energyType ? `·${s.energyType}` : '',
      `) 形状：${s.shape}`,
      s.vfxBurst ? `；爆表特效：${s.vfxBurst}` : '',
      `；生效：${s.hitRule}`,
      s.comboFormula ? `；组合：${s.comboFormula}` : '',
    ];
    return bits.join('');
  });
  return [
    '技能库调用（只挑下列里最贴种子的 3～5 个核心招写进核心半秒格；大招/禁招必须按形状里的规格体量兑现，禁止缩成几道小特效；承接格不要反复贴技能名）：',
    ...lines,
    '连招建议：握柄起手 → 1～2 连招 → 大招命中（规格满屏）；禁招慎用并写出代价；禁止空手结印御剑当默认大招。',
  ].join('\n');
}

export type ShotExpandCharacter = {
  name: string;
  role: string;
  appearance: string;
  /** 竖版 9:16 单人定妆（锁脸） */
  portraitPrompt: string;
  /** 横版 16:9 工业设定板（锁装/三视图） */
  sheetPrompt: string;
};

export type ShotExpandScene = {
  name: string;
  description: string;
  imagePrompt: string;
};

export type ShotExpandProp = {
  name: string;
  role: string;
  description: string;
  propPrompt: string;
};

export type ShotExpandResult = {
  id: string;
  label: string;
  category: string;
  castCount: number;
  castRoles: string[];
  durationSec: number;
  videoPrompt: string;
  /** @deprecated 兼容旧字段 */
  prompt: string;
  /** 四拍故事剧情摘要 */
  storyPlot: string;
  /** 9 宫格剧情板出图提示 */
  plotGridPrompt: string;
  characters: ShotExpandCharacter[];
  scene: ShotExpandScene;
  props: ShotExpandProp[];
  portraitUrls?: Record<string, string>;
  sheetUrls?: Record<string, string>;
  sceneUrl?: string;
  plotGridUrl?: string;
  propUrls?: Record<string, string>;
  saved?: boolean;
  updatedAt?: string;
};

@Injectable()
export class LibrariesService {
  private readonly byKind: Record<
    LibraryKind,
    { items: AnyLibraryItem[]; categories: string[] }
  > = {
    script: { items: SCRIPT_LIBRARY, categories: SCRIPT_CATEGORIES },
    style: { items: STYLE_LIBRARY, categories: STYLE_CATEGORIES },
    character: { items: CHARACTER_LIBRARY, categories: CHARACTER_CATEGORIES },
    trope: { items: TROPE_LIBRARY, categories: TROPE_CATEGORIES },
    dialogue: { items: DIALOGUE_LIBRARY, categories: DIALOGUE_CATEGORIES },
    hook: { items: HOOK_LIBRARY, categories: HOOK_CATEGORIES },
    lore: { items: LORE_LIBRARY, categories: LORE_CATEGORIES },
    pacing: { items: PACING_LIBRARY, categories: PACING_CATEGORIES },
    title: { items: TITLE_LIBRARY, categories: TITLE_CATEGORIES },
    skill: { items: SKILL_LIBRARY, categories: SKILL_CATEGORIES },
    shot: { items: SHOT_LIBRARY, categories: SHOT_CATEGORIES },
  };

  constructor(
    private readonly ai: AiProviderService,
    private readonly assets: AssetsService,
    @InjectRepository(ShotLibraryExpand)
    private readonly expands: Repository<ShotLibraryExpand>,
  ) {}

  listKinds() {
    return LIBRARY_KINDS.map((kind) => ({
      kind,
      ...LIBRARY_KIND_META[kind],
      count: this.byKind[kind].items.length,
    }));
  }

  resolveKind(raw: string): LibraryKind {
    const k = String(raw || '').trim().toLowerCase();
    if ((LIBRARY_KINDS as string[]).includes(k)) return k as LibraryKind;
    if (k in ROUTE_ALIASES) return ROUTE_ALIASES[k];
    throw new NotFoundException(`未知资源库类型：${raw}`);
  }

  getKind(raw: string) {
    const kind = this.resolveKind(raw);
    const pack = this.byKind[kind];
    const meta = LIBRARY_KIND_META[kind];
    return {
      kind,
      ...meta,
      categories: pack.categories,
      items: pack.items,
      count: pack.items.length,
      ...(kind === 'script' ? { categoryMeta: SCRIPT_CATEGORY_META } : {}),
    };
  }

  getItem(rawKind: string, id: string) {
    const kind = this.resolveKind(rawKind);
    const item = this.byKind[kind].items.find((x) => x.id === id);
    if (!item) throw new NotFoundException('条目不存在');
    return { kind, item };
  }

  getShotItem(id: string): ShotLibraryItem {
    const item = SHOT_LIBRARY.find((x) => x.id === id);
    if (!item) throw new NotFoundException('镜头概念不存在');
    return item;
  }

  /** 已生成细案列表（供「已生成」筛选） */
  async listShotExpands() {
    const rows = await this.expands.find({
      order: { updatedAt: 'DESC' },
    });
    return {
      count: rows.length,
      items: rows.map((r) => ({
        shotId: r.shotId,
        label: r.label,
        category: r.category,
        castCount: r.castCount,
        durationSec: r.durationSec,
        hasPortraits: Object.values(r.portraitUrls || {}).some((u) => !!String(u || '').trim()),
        hasScene: !!String(r.sceneUrl || '').trim(),
        updatedAt: r.updatedAt?.toISOString?.() || r.updatedAt,
      })),
    };
  }

  /** 读取已入库细案（不含则 404） */
  async getSavedShotExpand(id: string): Promise<ShotExpandResult> {
    const row = await this.expands.findOne({ where: { shotId: id } });
    if (!row) throw new NotFoundException('尚未生成细案');
    return this.rowToExpandResult(row);
  }

  /** 点击镜头概念：AI 现写成片 + 人物定妆 + 场景提示词，并入库覆盖 */
  async expandShotPrompt(
    id: string,
    opts?: { model?: string; durationSec?: number },
  ): Promise<ShotExpandResult> {
    const shot = this.getShotItem(id);
    const durationSec = clampShotDurationSec(
      opts?.durationSec ?? shot.durationSec,
      shot.durationSec || 10,
    );
    const beatPlan = formatBeatClockPlan(durationSec);
    const castLines = (shot.castRoles || [])
      .map((r, i) => `${i + 1}. ${r}`)
      .join('\n');
    const subStyle =
      (shot.tags || []).find((t) => t && t !== '画风' && t !== '动漫风') || shot.category;
    const styleLockHint = buildFamilyStyleLockHint(shot.category, subStyle);
    const isFight =
      (shot.tags || []).some((t) =>
        /超燃战斗|战力天花板|大招特写|招式打斗|炫技连招/.test(String(t)),
      ) ||
      /对决|对斩|对轰|交锋|大招|归宗|连斩|招式|旋风|拔刀|开天/.test(
        `${shot.label}${shot.blurb}${shot.moveFocus}${shot.seed}`,
      );
    // 打斗镜至少 5 个技能位（起手+连招+大招+身法），避免名额被身法占满导致「没大招」
    const skillLimit = isFight
      ? Math.min(6, Math.max(5, Math.round(durationSec * 0.45)))
      : 0;
    const pickedSkills = isFight ? pickSkillsForShot(shot, SKILL_LIBRARY, skillLimit) : [];
    const skillBlock = formatSkillLibraryBlock(pickedSkills);
    const user = [
      `镜头标题：${shot.label}`,
      `画风族：${shot.category}`,
      `子风格：${subStyle}（只禁真人；呈现跟画风族·子风格走，禁止默认赛璐璐/动画开脸；「${subStyle}」作色板与特效，禁止写成宣纸静物、剪纸手工展或真人写真；演种子里的招式与事件）`,
      `一句话概念：${shot.blurb}`,
      `成片目标时长：${durationSec} 秒（基础设置写「${durationSec} 秒，16:9 横屏」；不要写 4K60帧观感）`,
      `半秒时间轴（必须原样采用下列「0.0s：」刻度，禁止改总时长、禁止合并成1-3s区间、禁止【Xs · 阶段】壳）：\n${beatPlan}`,
      `出场角色数：${shot.castCount}`,
      shot.castCount === 0
        ? '角色职能清单：（无人出镜）characters 必须为 []；禁止硬塞路人。'
        : `角色职能清单：\n${castLines || '（按人数自行设计）'}`,
      shot.castCount === 0
        ? '无人戏：成片主角是空间/画风事件本身的美、炫、帅、奇；基础设置可只写场景参考图；scene 与 videoPrompt 正向段要把奇观写满。'
        : shot.castCount === 1
          ? '单人戏：禁止硬凑对手对砍；成片与定妆以该人造型/表演/招式为第一重点；场景从简。'
          : '人物优先：有出场角色时，成片与定妆以人物造型/表演/招式为第一重点；正向场景段只写锁定战场的短句，禁止风景抢戏。',
      `场景提示：${shot.sceneHint || '按画风自拟可识别地点'}（有人物时场景从简）`,
      `运镜侧重：${shot.cameraFocus}`,
      `招式侧重：${shot.moveFocus}`,
      `特效侧重：${shot.vfxFocus}`,
      `种子：${shot.seed}`,
      `标签：${(shot.tags || []).join('、') || '无'}`,
      skillBlock,
      '成片标杆（必须对齐）：',
      `1) 画风硬锁定「${shot.category} · ${subStyle}」：正向 Prompt 画风段先写画风族·子风格（仅二次元族才写动画开脸）；禁止默认赛璐璐；禁止写「生成xx画/作品」；禁止真人/照片级皮肤。`,
      styleLockHint
        ? `1b) ${styleLockHint}${
            isFlatFolkMedium(subStyle) || isInkPaintMedium(subStyle)
              ? ' 定妆/场景/道具整幅该风格呈现角色与战场，禁止灌电影精模皮肤，也禁止做成画展静物片。'
              : ''
          }`
        : '',
      /^(岩彩|炎彩)$/.test(String(subStyle))
        ? `1b+) 岩彩同族标杆（下列变体都算对，禁止跑成灰剥落壁画）：①侧脸/半侧+金晕烫轮廓+青蓝矿物浪；②莲花/金莲蓬前景虚化+半透明青蓝披帛飞升；③飞天舞姿+体积光柱+金粒子拖尾；④蓝矿物花冠+颊上金粉+熔金丝带。共性硬锁：矿物重彩颗粒、金是箔/熔金材质、暗底高对比、流体披帛有二次运动。诗意锚点可写：染料青蓝、岁月浸软、风沙吹皱、鎏金碎光、翻涌的浪、洞窟月光。`
        : '',
      `1c) videoPrompt 用豆包友好格式：基础设置 → 正向 Prompt（画风→人物→场景）→ 0.0s：/0.5s：… 每0.5秒一行；禁止【成片必达】【整体参数】【运镜：】【画面：】壳；禁止展示「4K60帧观感/IMAX/HDR」；不要写【负向提示词】；全文 <4000 字。`,
      (shot.tags || []).some((t) =>
        /国风美女|战力天花板|超燃战斗|特写|同角换风/.test(String(t)),
      )
        ? isFlatFolkMedium(subStyle) || isInkPaintMedium(subStyle)
          ? '1d) 特写/战力强化：起势优先「握柄特写」（手+剑格+柄入画，水墨飞白可点缀刃身）；禁止只拍悬浮刃尖；运镜特写↔全景；高潮保持该视觉风格。'
          : '1d) 特写/战力强化：起势优先握柄/持武特写（手+柄）；禁止只拍刃尖无手；运镜特写↔全景；高潮夸张但形状可读。'
        : '',
      '1e) 概念兑现：一句话概念 + 运镜/招式/特效侧重必须进半秒时间轴；禁止只有氛围没有事件。',
      `1f) 运镜侧重：「${shot.cameraFocus}」`,
      skillBlock
        ? `1g) 动作侧重：「${shot.moveFocus}」——**必须采用上方技能库里的命名招式**（至少写透：1 起手 + 1～2 连招 + 1 大招/禁招命中，技能名原样出现在核心半秒格）；半秒承接格写握持与惯性，禁止每0.5s换招；禁止用「挥砍两下」代替命名技能；禁止捅来捅去、禁止空手结印御剑、禁止烧录技能大字。`
        : `1g) 动作侧重：「${shot.moveFocus}」——核心招式写透即可；握持正确；禁止捅来捅去。`,
      `1h) 特效侧重：「${shot.vfxFocus}」——核心招形状兑现；终局中心在对手命中点；场景裂若有须同轴余波。`,
      isFight
        ? '1i) 打斗硬锁：握柄全程不断；**高潮格必须出现上方技能库中的大招/禁招名称与形状规格**（万剑/千枪=暴雨成幕，焚天/火龙=罩敌半屏，破界=气浪环过人，刀域=罩战场），禁止缩水摆拍或只写「爆发一下」；本命兵器仍在手里命中；场景形变仅同轴余波。'
        : '',
      `1j) 兵器握持硬锁：五指握柄；剑格可见；严禁抓刃身、剑穿头、空手漂剑、开场只拍刃尖墨滴。`,
      `2) 节奏：按 ${durationSec}s 写满 ${beatTickCount(durationSec)} 行半秒轴，但全片只需 4～6 个核心卖点；核心格写新结果，承接格写短延续；禁止为凑密每格换大招。`,
      '3) 有人物则人物信息量 > 场景；身份与握持稳定；禁止水印字幕与技能大字；禁止越轴瞬移换位。',
      '4) 定妆/设定板/场景/剧情宫格静帧用【整体参数】【风格气质】【主体/空间】；成片只用豆包格式。须输出 storyPlot、plotGridPrompt；有人物须同时有 portraitPrompt 与 sheetPrompt。各 prompt <4000 字。',
      '请只输出符合系统结构的 JSON。',
    ]
      .filter(Boolean)
      .join('\n');

    const raw = await this.ai.chat(
      [
        { role: 'system', content: buildShotExpandSystem(durationSec) },
        { role: 'user', content: user },
      ],
      opts?.model,
      { temperature: 0.35, maxTokens: 16384, timeoutMs: 240000 },
    );

    const parsed = this.parseExpandJson(String(raw || ''), shot);
    const existing = await this.expands.findOne({ where: { shotId: id } });
    const row =
      existing ||
      this.expands.create({
        shotId: id,
        portraitUrls: {},
        sheetUrls: {},
        propUrls: {},
        sceneUrl: '',
        plotGridUrl: '',
        storyPlot: '',
        plotGridPrompt: '',
        props: [],
      });
    row.label = shot.label;
    row.category = shot.category;
    row.durationSec = durationSec;
    row.castCount = shot.castCount;
    row.castRoles = shot.castRoles || [];
    row.videoPrompt = this.enrichLibraryVideoPrompt(
      parsed.videoPrompt,
      shot,
      {
        characters: parsed.characters,
        sceneName: parsed.scene?.name,
        props: parsed.props,
      },
    );
    row.characters = parsed.characters;
    row.scene = parsed.scene;
    row.props = parsed.props;
    row.storyPlot = parsed.storyPlot;
    row.plotGridPrompt = parsed.plotGridPrompt;
    row.chatModel = String(opts?.model || '').trim();
    // 重新生成细案时保留已有出图，避免误清空；用户可再重绘覆盖
    if (!row.portraitUrls) row.portraitUrls = {};
    if (!row.sheetUrls) row.sheetUrls = {};
    if (!row.propUrls) row.propUrls = {};
    if (!row.sceneUrl) row.sceneUrl = '';
    if (!row.plotGridUrl) row.plotGridUrl = '';
    const saved = await this.expands.save(row);
    return this.rowToExpandResult(saved);
  }

  async renderShotPortrait(
    id: string,
    opts: { characterIndex: number; model?: string; portraitPrompt?: string },
  ) {
    const shot = this.getShotItem(id);
    const idx = Math.max(0, Math.floor(Number(opts.characterIndex) || 0));
    let prompt = String(opts.portraitPrompt || '').trim();
    let charName = shot.castRoles[idx] || `角色${idx + 1}`;
    if (!prompt) {
      const saved = await this.expands.findOne({ where: { shotId: id } });
      const ch = saved?.characters?.[idx];
      if (!ch?.portraitPrompt) {
        throw new BadRequestException('缺少人物定妆提示词，请先生成细案');
      }
      prompt = ch.portraitPrompt;
      charName = ch.name || charName;
    }
    const out = await this.renderLibraryImage({
      prompt: this.enrichLibraryStillPrompt('portrait', prompt, shot),
      model: opts.model,
      size: '1024x1536',
      type: 'character_ref',
      name: `镜头库定妆·${shot.label}·${charName}`,
      meta: {
        purpose: 'library_shot_portrait',
        role: 'library',
        workflowId: '',
        productionId: '',
        shotId: id,
        characterIndex: idx,
      },
    });
    await this.patchExpandImages(id, { portraitIndex: idx, portraitUrl: out.url });
    return out;
  }

  async renderShotScene(
    id: string,
    opts: { model?: string; imagePrompt?: string },
  ) {
    const shot = this.getShotItem(id);
    let prompt = String(opts.imagePrompt || '').trim();
    let sceneName = shot.sceneHint || shot.label;
    if (!prompt) {
      const saved = await this.expands.findOne({ where: { shotId: id } });
      if (!saved?.scene?.imagePrompt) {
        throw new BadRequestException('缺少场景提示词，请先生成细案');
      }
      prompt = saved.scene.imagePrompt;
      sceneName = saved.scene.name || sceneName;
    }
    const out = await this.renderLibraryImage({
      prompt: this.enrichLibraryStillPrompt('scene', prompt, shot),
      model: opts.model,
      size: '1280x720',
      type: 'scene',
      name: `镜头库场景·${shot.label}·${sceneName}`,
      meta: {
        purpose: 'library_shot_scene',
        role: 'library',
        workflowId: '',
        productionId: '',
        shotId: id,
      },
    });
    await this.patchExpandImages(id, { sceneUrl: out.url });
    return out;
  }

  async renderShotProp(
    id: string,
    opts: { propIndex: number; model?: string; propPrompt?: string },
  ) {
    const shot = this.getShotItem(id);
    const idx = Math.max(0, Math.floor(Number(opts.propIndex) || 0));
    let prompt = String(opts.propPrompt || '').trim();
    let propName = `道具${idx + 1}`;
    if (!prompt) {
      const saved = await this.expands.findOne({ where: { shotId: id } });
      const prop = saved?.props?.[idx];
      if (!prop?.propPrompt) {
        throw new BadRequestException('缺少道具提示词，请先生成细案（或本镜无关键道具）');
      }
      prompt = prop.propPrompt;
      propName = prop.name || propName;
    }
    const out = await this.renderLibraryImage({
      prompt: this.enrichLibraryStillPrompt('prop', prompt, shot),
      model: opts.model,
      size: '1024x1024',
      type: 'character_ref',
      name: `镜头库道具·${shot.label}·${propName}`,
      meta: {
        purpose: 'library_shot_prop',
        role: 'library',
        workflowId: '',
        productionId: '',
        shotId: id,
        propIndex: idx,
      },
    });
    await this.patchExpandImages(id, { propIndex: idx, propUrl: out.url });
    return out;
  }

  /** 横版工业角色设定板出图 */
  async renderShotCharacterSheet(
    id: string,
    opts: { characterIndex: number; model?: string; sheetPrompt?: string },
  ) {
    const shot = this.getShotItem(id);
    const idx = Math.max(0, Math.floor(Number(opts.characterIndex) || 0));
    let prompt = String(opts.sheetPrompt || '').trim();
    let charName = shot.castRoles[idx] || `角色${idx + 1}`;
    if (!prompt) {
      const saved = await this.expands.findOne({ where: { shotId: id } });
      const ch = saved?.characters?.[idx] as
        | { name?: string; sheetPrompt?: string; appearance?: string; portraitPrompt?: string }
        | undefined;
      prompt = String(ch?.sheetPrompt || '').trim();
      charName = ch?.name || charName;
      if (!prompt) {
        const appearance = String(ch?.appearance || ch?.portraitPrompt || '').trim();
        prompt = [
          buildCharacterSheetLayoutLock({ ageHint: appearance }),
          `【角色外观与气质】${charName}；${appearance || shot.blurb}`,
        ].join('\n');
      }
    }
    if (!/布局硬锁|concept design sheet|Character design sheet/i.test(prompt)) {
      prompt = `${buildCharacterSheetLayoutLock({ ageHint: prompt })}\n【角色外观与气质】${prompt}`;
    }
    const out = await this.renderLibraryImage({
      prompt: this.clampPrompt(prompt),
      model: opts.model,
      size: '1536x1024',
      type: 'character_ref',
      name: `镜头库设定板·${shot.label}·${charName}`,
      meta: {
        purpose: 'library_shot_character_sheet',
        role: 'library',
        workflowId: '',
        productionId: '',
        shotId: id,
        characterIndex: idx,
      },
    });
    await this.patchExpandImages(id, { sheetIndex: idx, sheetUrl: out.url });
    return out;
  }

  /** 9 宫格剧情板出图（审阅用） */
  async renderShotPlotGrid(
    id: string,
    opts: { model?: string; plotGridPrompt?: string },
  ) {
    const shot = this.getShotItem(id);
    let prompt = String(opts.plotGridPrompt || '').trim();
    if (!prompt) {
      const saved = await this.expands.findOne({ where: { shotId: id } });
      prompt = String(saved?.plotGridPrompt || '').trim();
      if (!prompt) {
        const story =
          String(saved?.storyPlot || '').trim() ||
          this.fallbackStoryPlotFromVideo(String(saved?.videoPrompt || ''), shot.label);
        prompt = this.fallbackPlotGridPrompt(story, shot);
      }
    }
    const gridLock = buildImageGridLayoutLock(3, 3);
    if (!/宫格硬锁|equal grid/i.test(prompt)) {
      prompt = `${prompt}\n${gridLock}`;
    }
    const out = await this.renderLibraryImage({
      prompt: this.clampPrompt(prompt),
      model: opts.model,
      size: '1536x1536',
      type: 'storyboard',
      name: `镜头库剧情宫格·${shot.label}`,
      meta: {
        purpose: 'library_shot_plot_grid',
        role: 'library',
        workflowId: '',
        productionId: '',
        shotId: id,
        imageGrid: '9',
      },
    });
    await this.patchExpandImages(id, { plotGridUrl: out.url });
    return out;
  }

  /** 前端上传定妆/设定板/场景/道具/宫格后回写入库 */
  async patchExpandImages(
    id: string,
    opts: {
      portraitIndex?: number;
      portraitUrl?: string;
      sheetIndex?: number;
      sheetUrl?: string;
      sceneUrl?: string;
      plotGridUrl?: string;
      propIndex?: number;
      propUrl?: string;
    },
  ) {
    this.getShotItem(id);
    let row = await this.expands.findOne({ where: { shotId: id } });
    if (!row) {
      const shot = this.getShotItem(id);
      row = this.expands.create({
        shotId: id,
        label: shot.label,
        category: shot.category,
        durationSec: shot.durationSec || 10,
        castCount: shot.castCount,
        castRoles: shot.castRoles || [],
        videoPrompt: '',
        storyPlot: '',
        plotGridPrompt: '',
        characters: [],
        scene: { name: '', description: '', imagePrompt: '' },
        props: [],
        portraitUrls: {},
        sheetUrls: {},
        propUrls: {},
        sceneUrl: '',
        plotGridUrl: '',
      });
    }
    if (typeof opts.portraitIndex === 'number' && opts.portraitUrl) {
      row.portraitUrls = {
        ...(row.portraitUrls || {}),
        [String(opts.portraitIndex)]: opts.portraitUrl,
      };
    }
    if (typeof opts.sheetIndex === 'number' && opts.sheetUrl) {
      row.sheetUrls = {
        ...(row.sheetUrls || {}),
        [String(opts.sheetIndex)]: opts.sheetUrl,
      };
    }
    if (opts.sceneUrl) row.sceneUrl = opts.sceneUrl;
    if (opts.plotGridUrl) row.plotGridUrl = opts.plotGridUrl;
    if (typeof opts.propIndex === 'number' && opts.propUrl) {
      row.propUrls = {
        ...(row.propUrls || {}),
        [String(opts.propIndex)]: opts.propUrl,
      };
    }
    if (!row.props) row.props = [];
    if (!row.propUrls) row.propUrls = {};
    if (!row.sheetUrls) row.sheetUrls = {};
    if (!row.portraitUrls) row.portraitUrls = {};
    await this.expands.save(row);
    return this.rowToExpandResult(row);
  }

  private rowToExpandResult(row: ShotLibraryExpand): ShotExpandResult {
    const shot = (() => {
      try {
        return this.getShotItem(row.shotId);
      } catch {
        return null;
      }
    })();
    const characters = (row.characters || []).map((c) => ({
      name: String(c?.name || '').trim(),
      role: String(c?.role || '').trim() || '角色',
      appearance: this.normalizePromptText(c?.appearance || ''),
      portraitPrompt: this.normalizePromptText(c?.portraitPrompt || ''),
      sheetPrompt: this.normalizePromptText(c?.sheetPrompt || ''),
    }));
    const sc = row.scene || { name: '', description: '', imagePrompt: '' };
    const scene = {
      name: String(sc.name || '').trim(),
      description: this.normalizePromptText(sc.description || ''),
      imagePrompt: this.normalizePromptText(sc.imagePrompt || ''),
    };
    const props = (row.props || [])
      .map((p) => ({
        name: String(p?.name || '').trim(),
        role: String(p?.role || '').trim() || '关键道具',
        description: this.normalizePromptText(p?.description || ''),
        propPrompt: this.normalizePromptText(p?.propPrompt || ''),
      }))
      .filter((p) => p.propPrompt || p.description || p.name)
      .slice(0, 2);
    const videoPrompt = shot
      ? this.enrichLibraryVideoPrompt(row.videoPrompt || '', shot, {
          characters,
          sceneName: scene.name,
          props,
        })
      : this.normalizePromptText(row.videoPrompt || '');
    const storyPlot =
      this.normalizePromptText(row.storyPlot || '') ||
      this.fallbackStoryPlotFromVideo(videoPrompt, shot?.label || row.label);
    const plotGridPrompt =
      this.normalizePromptText(row.plotGridPrompt || '') ||
      this.fallbackPlotGridPrompt(storyPlot, shot);
    return {
      id: row.shotId,
      label: row.label,
      category: row.category,
      castCount: row.castCount,
      castRoles: row.castRoles || [],
      durationSec: row.durationSec || 10,
      videoPrompt,
      prompt: videoPrompt,
      storyPlot,
      plotGridPrompt,
      characters,
      scene,
      props,
      portraitUrls: row.portraitUrls || {},
      sheetUrls: row.sheetUrls || {},
      sceneUrl: row.sceneUrl || '',
      plotGridUrl: row.plotGridUrl || '',
      propUrls: row.propUrls || {},
      saved: true,
      updatedAt: row.updatedAt?.toISOString?.() || undefined,
    };
  }

  private async renderLibraryImage(opts: {
    prompt: string;
    model?: string;
    size: string;
    type: AssetType;
    name: string;
    meta?: Record<string, unknown>;
  }) {
    const data = await this.ai.generateImage(opts.prompt, {
      model: opts.model,
      size: opts.size,
    });
    const first = Array.isArray(data) ? data[0] : null;
    const b64 = String(first?.b64_json || '').trim();
    const remoteUrl = String(first?.url || '').trim();
    if (remoteUrl && /^https?:\/\//i.test(remoteUrl)) {
      const asset = await this.assets.createFromUrl(LIBRARY_SHOTS_PROJECT, {
        type: opts.type,
        name: opts.name,
        url: remoteUrl,
        prompt: opts.prompt,
        meta: opts.meta,
        forceDownload: true,
      });
      return { url: asset.url, assetId: asset.id, prompt: opts.prompt };
    }
    if (b64) {
      const buf = Buffer.from(b64, 'base64');
      const asset = await this.assets.createFromBuffer(LIBRARY_SHOTS_PROJECT, {
        type: opts.type,
        name: opts.name,
        buffer: buf,
        ext: '.png',
        mimeType: 'image/png',
        prompt: opts.prompt,
        meta: opts.meta,
      });
      return { url: asset.url, assetId: asset.id, prompt: opts.prompt };
    }
    if (remoteUrl) {
      const asset = await this.assets.createFromUrl(LIBRARY_SHOTS_PROJECT, {
        type: opts.type,
        name: opts.name,
        url: remoteUrl,
        prompt: opts.prompt,
        meta: opts.meta,
        forceDownload: true,
      });
      return { url: asset.url, assetId: asset.id, prompt: opts.prompt };
    }
    throw new BadRequestException('出图失败：未返回图片数据');
  }

  private extractJson(raw: string) {
    const text = String(raw || '').trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) return fence[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return text.slice(start, end + 1);
    return text;
  }

  private parseExpandJson(
    raw: string,
    shot: ShotLibraryItem,
  ): {
    videoPrompt: string;
    storyPlot: string;
    plotGridPrompt: string;
    characters: ShotExpandCharacter[];
    scene: ShotExpandScene;
    props: ShotExpandProp[];
  } {
    let data: any;
    try {
      data = JSON.parse(this.extractJson(raw));
    } catch {
      // 模型偶发只返回成片正文：降级包一层
      const fallbackVideo = raw.trim();
      if (fallbackVideo.length > 200) {
        const videoPrompt = this.clampPrompt(fallbackVideo);
        const storyPlot = this.fallbackStoryPlotFromVideo(videoPrompt, shot.label);
        return {
          videoPrompt,
          storyPlot,
          plotGridPrompt: this.fallbackPlotGridPrompt(storyPlot, shot),
          characters: this.fallbackCharacters(shot),
          scene: this.fallbackScene(shot),
          props: [],
        };
      }
      throw new BadRequestException('AI 返回无法解析，请重试');
    }

    const videoPrompt = this.normalizePromptText(
      String(data?.videoPrompt || data?.prompt || data?.成片提示词 || ''),
    );
    if (!videoPrompt) throw new BadRequestException('AI 未返回成片提示词');

    const rawChars = Array.isArray(data?.characters)
      ? data.characters
      : Array.isArray(data?.人物)
        ? data.人物
        : [];
    let characters: ShotExpandCharacter[] = rawChars
      .map((c: any, i: number) => ({
        name: String(c?.name || c?.称谓 || shot.castRoles[i] || `角色${i + 1}`).trim(),
        role: String(c?.role || c?.职能 || '').trim() || '角色',
        appearance: this.normalizePromptText(String(c?.appearance || c?.外形 || '')),
        portraitPrompt: this.normalizePromptText(
          String(c?.portraitPrompt || c?.定妆提示词 || c?.imagePrompt || ''),
        ),
        sheetPrompt: this.normalizePromptText(
          String(c?.sheetPrompt || c?.设定板提示词 || c?.characterSheetPrompt || ''),
        ),
      }))
      .filter((c: ShotExpandCharacter) => c.portraitPrompt || c.sheetPrompt || c.appearance);

    const filled = this.fallbackCharacters(shot);
    const need = Math.max(0, Number(shot.castCount) || 0);
    if (need === 0) {
      characters = [];
    } else if (characters.length < need) {
      for (let i = 0; i < need; i++) {
        if (!characters[i]) characters[i] = filled[i];
      }
      characters = characters.slice(0, need);
    } else if (characters.length > need) {
      characters = characters.slice(0, need);
    }
    characters = characters.map((c, i) => {
      const fb = filled[i] || filled[0];
      const appearance = this.clampPrompt(
        c.appearance.length >= 120
          ? c.appearance
          : [c.appearance, fb?.appearance].filter(Boolean).join('；'),
        600,
      );
      const portraitPrompt = String(c.portraitPrompt || '').trim() || fb?.portraitPrompt || '';
      const sheetPrompt = String(c.sheetPrompt || '').trim() || fb?.sheetPrompt || '';
      return {
        ...c,
        appearance: appearance || fb?.appearance || c.appearance,
        portraitPrompt: this.clampPrompt(portraitPrompt),
        sheetPrompt: this.clampPrompt(sheetPrompt),
      };
    });

    const sc = data?.scene || data?.场景 || {};
    const fbScene = this.fallbackScene(shot);
    let scene: ShotExpandScene = {
      name: String(sc?.name || sc?.名称 || shot.sceneHint || `${shot.label}场景`).trim(),
      description: this.normalizePromptText(
        String(sc?.description || sc?.描述 || shot.sceneHint || shot.blurb),
      ),
      imagePrompt: this.normalizePromptText(String(sc?.imagePrompt || sc?.场景提示词 || '')),
    };
    if (scene.description.length < 120) {
      scene.description = [scene.description, fbScene.description].filter(Boolean).join('。');
    }
    scene.description = this.clampPrompt(scene.description, 600);
    if (!String(scene.imagePrompt || '').trim()) {
      scene.imagePrompt = fbScene.imagePrompt;
    }
    scene.imagePrompt = this.clampPrompt(scene.imagePrompt);

    const rawProps = Array.isArray(data?.props)
      ? data.props
      : Array.isArray(data?.道具)
        ? data.道具
        : [];
    const props: ShotExpandProp[] = rawProps
      .map((p: any) => ({
        name: String(p?.name || p?.名称 || p?.称谓 || '').trim(),
        role: String(p?.role || p?.职能 || '').trim() || '关键道具',
        description: this.normalizePromptText(
          String(p?.description || p?.描述 || p?.外形 || ''),
        ),
        propPrompt: this.normalizePromptText(
          String(p?.propPrompt || p?.道具提示词 || p?.imagePrompt || ''),
        ),
      }))
      .filter((p: ShotExpandProp) => p.propPrompt || p.description || p.name)
      .slice(0, 2)
      .map((p: ShotExpandProp) => ({
        ...p,
        name: p.name || '关键道具',
        description: this.clampPrompt(p.description || p.propPrompt.slice(0, 200), 400),
        propPrompt: this.clampPrompt(
          p.propPrompt ||
            [
              `道具单独参考图，无清晰人脸。画风锁定「${shot.category}」。`,
              `物件：${p.name}（${p.role}）。`,
              p.description ? `外形：${p.description}` : '',
              `种子：${shot.seed}`,
              '居中展示轮廓与材质；禁止字幕水印拼贴。',
            ]
              .filter(Boolean)
              .join(''),
        ),
      }));

    let storyPlot = this.normalizePromptText(
      String(data?.storyPlot || data?.剧情 || data?.故事剧情 || ''),
    );
    if (!storyPlot || storyPlot.length < 40) {
      storyPlot = this.fallbackStoryPlotFromVideo(videoPrompt, shot.label);
    }
    storyPlot = this.clampPrompt(storyPlot, 600);

    let plotGridPrompt = this.normalizePromptText(
      String(data?.plotGridPrompt || data?.剧情宫格提示词 || data?.storyboardPrompt || ''),
    );
    if (!plotGridPrompt) {
      plotGridPrompt = this.fallbackPlotGridPrompt(storyPlot, shot);
    }
    plotGridPrompt = this.clampPrompt(plotGridPrompt);

    return {
      videoPrompt: this.clampPrompt(videoPrompt),
      storyPlot,
      plotGridPrompt,
      characters,
      scene,
      props,
    };
  }

  private fallbackStoryPlotFromVideo(videoPrompt: string, label: string): string {
    const beats = String(videoPrompt || '')
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => /^\d+(?:\.\d+)?s\s*[：:]/.test(l))
      .map((l) => l.replace(/^\d+(?:\.\d+)?s\s*[：:]\s*/, '').trim())
      .filter(Boolean);
    if (beats.length >= 3) {
      const open = beats[0].slice(0, 80);
      const mid = beats[Math.floor(beats.length / 2)].slice(0, 80);
      const close = beats[beats.length - 1].slice(0, 80);
      return [
        `【镜头】${label || '本镜'}`,
        `起势：${open}`,
        `加速/交锋：${mid}`,
        `高潮与收束：${close}`,
      ].join('\n');
    }
    return [
      `【镜头】${label || '本镜'}`,
      '起势：主体入画，站位与冲突钩子亮出。',
      '加速：动作推进，景别与色温开始变化。',
      '高潮：本镜卖点命中，物理结果可见。',
      '收束：余韵定格，情绪落地。',
    ].join('\n');
  }

  private fallbackPlotGridPrompt(storyPlot: string, shot: ShotLibraryItem | null): string {
    const sub =
      (shot?.tags || []).find((t) => t && t !== '画风' && t !== '动漫风') ||
      shot?.category ||
      '国漫';
    const style = shot ? `${shot.category}·${sub}` : String(sub);
    return [
      '【整体参数】严格 3×3=9 等分宫格剧情板；方图；细线分隔；左→右、上→下；每格单一瞬间；禁止真人、禁止设定板整板复制',
      `【风格气质】${style}；统一角色身份与服装；景别特写/中景/全景轮换`,
      `【剧情】${String(storyPlot || '').slice(0, 480)}`,
      '【主体】九格兑现起势→加速→高潮→收束；可有极小角标 1…9',
    ].join('\n');
  }

  /**
   * 归一化提示词正文：
   * - 模型偶发把整段 JSON 塞进 videoPrompt → 拆出正文
   * - 字面量 \\n / \\t 还原为真实换行（否则展示/复制全是 \n）
   */
  private normalizePromptText(raw: string): string {
    let t = String(raw || '').trim();
    if (!t) return '';

    // 整段又是一层 {"videoPrompt":"..."} / {"portraitPrompt":"..."}
    if (t.startsWith('{') && /"(?:videoPrompt|prompt|portraitPrompt|imagePrompt|propPrompt|成片提示词)"\s*:/.test(t)) {
      try {
        const obj = JSON.parse(t);
        const inner = String(
          obj?.videoPrompt ||
            obj?.prompt ||
            obj?.portraitPrompt ||
            obj?.imagePrompt ||
            obj?.propPrompt ||
            obj?.成片提示词 ||
            '',
        ).trim();
        if (inner) t = inner;
      } catch {
        /* keep t */
      }
    }

    // 去掉 markdown 围栏
    t = t.replace(/^```(?:json|text|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // 若几乎没有真换行、却大量字面量 \n，则按转义还原
    const realNl = (t.match(/\n/g) || []).length;
    const litNl = (t.match(/\\n/g) || []).length;
    if (litNl > 0 && litNl >= realNl) {
      t = t
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }

    return t.replace(/\r\n/g, '\n').trim();
  }

  /** 去掉成片提示词里的时钟秒数，便于用户自选 10/15/30s */
  private stripClockDuration(text: string): string {
    return String(text || '')
      .replace(/【节拍时间轴】/g, '【节拍推进】')
      .replace(/基础设置[：:]\s*\d+\s*秒\s*[，,、]?\s*/g, '基础设置：')
      .replace(/^\s*\d+(?:\.\d+)?\s*s\s*[：:]\s*/gim, '')
      .replace(
        /【\s*(?:第)?\s*\d+(?:\.\d+)?\s*(?:s|秒)\s*[·・.\s]+([^】]+)】/gi,
        '【$1】',
      )
      .replace(
        /【\s*\d+(?:\.\d+)?\s*[-–~～到至]\s*\d+(?:\.\d+)?\s*(?:s|秒)\s*[·・.\s]+([^】]+)】/gi,
        '【$1】',
      )
      .replace(
        /【\s*\d+(?:\.\d+)?\s*[-–~～到至]\s*\d+(?:\.\d+)?\s*(?:s|秒)\s*】/gi,
        '【节拍】',
      )
      .replace(/\d+(?:\.\d+)?\s*[-–~～到至]\s*\d+(?:\.\d+)?\s*(?:s|秒)/gi, '')
      .replace(/(?:约|大约|共计|总长|时长|持续)?\s*\d+(?:\.\d+)?\s*(?:多)?\s*秒(?:钟)?/g, '')
      .replace(/\b\d{1,2}(?:\.\d+)?\s*s\b/gi, '')
      .replace(/留\s*(?:约\s*)?\d+(?:\.\d+)?\s*s(?:ec)?\s*呼吸感/gi, '留短暂呼吸感')
      .replace(/[，、]\s*[，、]/g, '，')
      .replace(/（\s*）/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  /** 截断提示词到上限；尽量在句号/分号处切断，避免半句 */
  private clampPrompt(text: string, max = PROMPT_MAX_CHARS): string {
    const raw = this.normalizePromptText(text);
    if (!raw) return '';
    // 定妆/场景/成片等主提示词：字数由扩写模型在生成时自控（系统提示要求 ≤4000），此处不硬截断
    if (max >= PROMPT_MAX_CHARS) return raw;
    // 仅短字段（appearance / description 摘要）允许限长
    if (raw.length <= max) return raw;
    const slice = raw.slice(0, max);
    const cutMarks = ['。', '；', '！', '？', '\n', '，', '、'];
    let best = -1;
    for (const m of cutMarks) {
      const idx = slice.lastIndexOf(m);
      if (idx > best && idx >= Math.floor(max * 0.55)) best = idx;
    }
    return (best > 0 ? slice.slice(0, best + 1) : slice).trim();
  }

  /** 去掉【负向提示词】段（本阶段暂不需要） */
  private stripNegativePromptSection(text: string): string {
    return String(text || '')
      .replace(/\n?【负向提示词】[\s\S]*?(?=\n【|$)/g, '')
      .replace(/^负向[：:][^\n]*\n?/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * 成片提示词：整理成豆包友好格式；去掉 4K60/IMAX 等展示参数；总长 <4000。
   */
  private enrichLibraryVideoPrompt(
    prompt: string,
    shot: ShotLibraryItem,
    meta?: {
      characters?: Array<{ name?: string }>;
      sceneName?: string;
      props?: Array<{ name?: string }>;
    },
  ): string {
    let body = this.stripNegativePromptSection(this.normalizePromptText(prompt));
    if (!body) return body;

    const d = clampShotDurationSec(shot.durationSec || 10);
    const sceneName =
      String(meta?.sceneName || shot.sceneHint || '场景').trim() || '场景';
    // 与工作室画布对齐：图1=开场关键帧、图2=收束关键帧；定妆/场景只进关键帧合成，不直接进视频 API
    const refBits = ['图 1 开场关键帧', '图 2 收束关键帧'];
    const setupLine = `基础设置：${d} 秒，16:9 横屏，上传 ${refBits.length} 张参考图（${refBits.join('、')}），开启形象一致性，连贯单一时空，禁止跳切换景；外貌以开场关键帧为准，正文侧重运镜与动作；空间可参考「${sceneName}」`;

    // 去掉旧壳与展示参数
    body = body
      .replace(/外站图生视频友好[^\n。；]*/g, '')
      .replace(/图生视频友好[^\n。；]*/g, '')
      .replace(/图生友好[^\n。；]*/g, '')
      .replace(/图生硬约束\s*[=＝：:][^\n]*/g, '')
      .replace(/图生视频硬约束[：:]\s*[^\n]*/g, '')
      .replace(/成片参数硬锁[：:][^\n]*/g, '')
      .replace(/【成片必达】[^\n]*/g, '')
      .replace(/【整体参数】[^\n]*/g, '')
      .replace(/【风格气质】[^\n]*/g, '')
      .replace(/【人物与参考锁定】[^\n]*/g, '')
      .replace(/【节拍(?:时间轴|推进)】[^\n]*/g, '')
      .replace(/【参考图】[^\n]*/g, '')
      .replace(/本镜重点\s*[=＝：:][^\n]*/g, '')
      .replace(/画风硬锁[：:][^\n]*/g, '')
      .replace(/4K\s*60\s*帧(?:观感)?/gi, '')
      .replace(/\b4K\b/gi, '')
      .replace(/60\s*帧/g, '')
      .replace(/IMAX级?冲击构图/gi, '')
      .replace(/HDR体积光/gi, '')
      .replace(/AI电影级运镜系统驱动/g, '')
      .replace(/电影级跟焦/g, '')
      // 【0.0s · 起势】运镜：A 画面：B → 0.0s：A，B
      .replace(
        /【\s*(\d+(?:\.\d+)?\s*s)\s*[·・.\s]*[^】]*】\s*(?:运镜[：:]\s*)?([^\n]*)(?:\n\s*画面[：:]\s*([^\n]*))?/gi,
        (_m, sec: string, cam: string, shotLine?: string) => {
          const a = String(cam || '').trim();
          const b = String(shotLine || '').trim();
          const merged = [a, b].filter(Boolean).join('，');
          return `${String(sec).replace(/\s+/g, '')}：${merged || '画面推进'}`;
        },
      )
      .replace(/^\s*运镜[：:]\s*/gm, '')
      .replace(/^\s*画面[：:]\s*/gm, '')
      .replace(/[，、；]\s*[，、；]/g, '；')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 统一半秒行：确保「0.0s：」冒号为中文/半角均可，规整为「0.0s：」
    body = body.replace(
      /^【?\s*(\d+(?:\.\d+)?)\s*s\s*(?:·\s*[^】:\n：]+)?】?\s*[：:]/gim,
      (_m, n: string) => `${Number(n).toFixed(1)}s：`,
    );

    if (!/基础设置[：:]/.test(body)) {
      if (/正向\s*Prompt/i.test(body)) {
        body = `${setupLine}\n${body}`;
      } else {
        body = `${setupLine}\n正向 Prompt\n${body}`;
      }
    } else {
      // 刷新基础设置行（时长/参考图以当前为准）
      body = body.replace(/基础设置[：:][^\n]*/u, setupLine);
    }
    if (!/正向\s*Prompt/i.test(body)) {
      body = body.replace(/^(基础设置[：:][^\n]*\n)/u, '$1正向 Prompt\n');
    }

    return this.clampPrompt(body);
  }

  /** 出图前：缺范式头则补全；已有结构则补画风锁 + 按子风格媒介的质量条（暂不加负向段） */
  private enrichLibraryStillPrompt(
    kind: 'portrait' | 'scene' | 'prop',
    prompt: string,
    shot: ShotLibraryItem,
  ): string {
    const base = this.stripNegativePromptSection(this.normalizePromptText(prompt));
    const sub =
      (shot.tags || []).find((t) => t && t !== '画风' && t !== '动漫风') || shot.category;
    const styleHint = buildFamilyStyleLockHint(shot.category, String(sub));
    const craftPack = buildStillCraftForSubStyle(String(sub));
    const yancai =
      /^(岩彩|炎彩)$/.test(String(sub))
        ? yancaiFlameStyleRecipe(String(sub) as '岩彩' | '炎彩')
        : '';
    const styleLock = yancai
      ? `${shot.category}·${sub}；${yancai}`
      : `${shot.category}·${sub}；${styleHint}`;
    const craftPortrait = craftPack.portrait;
    const craftScene = craftPack.scene;
    const craftProp = craftPack.prop;
    const lightBit = yancai
      ? '暗底高对比；金晕背光或侧逆金边或体积光柱；青蓝/孔雀石矿物浪与半透明披帛；鎏金碎光粒子；发衣流体二次运动'
      : craftPack.lightBit;
    const templates: Record<'portrait' | 'scene' | 'prop', string> = {
      portrait: [
        craftPack.overallPortrait,
        `【风格气质】${styleLock}；${lightBit}；严格沿用本角色身份与服饰锚点，禁止换脸换装、禁止串风`,
        craftPortrait,
        isFlatFolkMedium(String(sub))
          ? '【主体】平面/卡通开脸清楚；专武轮廓可读；持兵器则手握柄、剑格入画；禁糊影毁形'
          : '【主体】外形精致可读（跟画风族，禁止默认赛璐璐），五指清晰，专武握柄清楚（手+剑格+柄，严禁抓刃），微动态禁糊影',
      ].join('\n'),
      scene: [
        craftPack.overallScene,
        `【风格气质】${styleLock}；${yancai ? '洞窟月光；矿物岩壁肌理；鎏金碎光大气' : lightBit}；中景留走位；氛围可读`,
        craftScene,
        isFlatFolkMedium(String(sub))
          ? '【空间】层叠/平涂空间可读；标志物跟媒介；禁止写真透视抢戏'
          : '【空间】广角建立方位；近中远三层纵深；光影干净高级',
      ].join('\n'),
      prop: [
        craftPack.overallProp,
        `【风格气质】${styleLock}；${lightBit}${yancai ? '；矿物颗粒+鎏金箔光' : ''}`,
        craftProp,
        '【主体】轮廓一眼可辨；可微悬浮禁糊影',
      ].join('\n'),
    };
    const craft =
      kind === 'portrait' ? craftPortrait : kind === 'scene' ? craftScene : craftProp;
    const mediumNote = `风格硬锁：「${shot.category}·${sub}」= 动漫风底盘 + 子风格色板/特效；禁止曲解成写真/真人棚拍，也禁止理解成「生成一幅${sub}静物作品/手工过程」`;
    // 已有模型细案：原样保留（字数由模型生成时自控），不追加硬锁/质量条
    if (base.trim()) {
      return this.clampPrompt(base);
    }
    return this.clampPrompt(
      [templates[kind], mediumNote, base].filter(Boolean).join('\n'),
    );
  }

  private fallbackCharacters(shot: ShotLibraryItem): ShotExpandCharacter[] {
    const n = Math.max(0, Number(shot.castCount) || 0);
    if (n === 0) return [];
    const sceneBit = shot.sceneHint || shot.blurb;
    const sub =
      (shot.tags || []).find((t) => t && t !== '画风' && t !== '动漫风') || shot.category;
    const styleBit = buildFamilyStyleLockHint(shot.category, String(sub));
    const flat = isFlatFolkMedium(String(sub));
    const craft = buildStillCraftForSubStyle(String(sub));
    return Array.from({ length: n }, (_, i) => {
      const roleLine = shot.castRoles[i] || `角色${i + 1}`;
      const name = roleLine.replace(/（.*?）/g, '').trim() || `角色${i + 1}`;
      const role = i === 0 ? '主角' : i === 1 ? '对手/关键键配角' : '配角';
      const appearance = flat
        ? [
            `风格对齐：${shot.category}·${sub}；${styleBit}`,
            `身份职能：${roleLine}`,
            '开脸：按该媒介纹样/平涂/线描开脸，禁止写实皮肤毛孔与发丝写真',
            '服饰与专武：平面镂空或平涂轮廓一眼可辨；主配色与对手强对比',
            `动作气质：${shot.moveFocus || shot.blurb}`,
          ].join('；')
        : [
            `风格对齐：画风硬锁「${shot.category}·${sub}」；${styleBit}`,
            `身份职能：${roleLine}；气场用可演戏的重心与眼神体现`,
            '面容：脸型眉眼鼻唇微结构清楚（眉形睫影唇峰颧骨受光），非网红棚拍脸；发丝分缕、发际线清楚',
            '饰品与服装分层（外袍/中衣/下装/靴）材质分离可读，褶皱脊有高光；主配色与对手强对比',
            '专武轮廓一眼可辨；至少一处标志锚点位置具体',
            `动作气质：${shot.moveFocus || shot.blurb}`,
            `战场痕迹从简：${sceneBit}的尘/墨渍落在衣角靴底即可`,
          ].join('；');
      const portraitPrompt = [
        craft.overallPortrait,
        `【风格气质】${styleBit}；${craft.lightBit}；严格沿用本角色身份锚点，禁止换脸换装、禁止串风`,
        craft.portrait,
        `【主体锁定】${name}（${role}）；${appearance}`,
      ].join('\n');
      const sheetPrompt = [
        '【整体参数】横版16:9工业角色设定板；五区模块；干净浅灰底；禁止竖版单人生活照、禁止真人',
        `【风格气质】${styleBit}；国漫/日常写实插画；${craft.lightBit}`,
        `【主体】${name}（${role}）；${appearance}`,
        '【布局】左上大头档案 + 右上 THREE VIEW 正侧背 + 右中 EXPRESSION 表情格 + 左下 COSTUME 全身与细节格 + 右下短说明；成年 7.5～8 头身',
      ].join('\n');
      return {
        name,
        role,
        appearance,
        portraitPrompt,
        sheetPrompt,
      };
    });
  }

  private fallbackScene(shot: ShotLibraryItem): ShotExpandScene {
    const name = shot.sceneHint || `${shot.label}场景`;
    const sub =
      (shot.tags || []).find((t) => t && t !== '画风' && t !== '动漫风') || shot.category;
    const styleBit = buildFamilyStyleLockHint(shot.category, String(sub));
    const craft = buildStillCraftForSubStyle(String(sub));
    const description = [
      `地点：${name}`,
      `画风：${shot.category}·${sub}`,
      isFlatFolkMedium(String(sub))
        ? '空间由该媒介层叠/平涂构成，禁止写真石木雾'
        : '地面材质触感一句 + 墙/岩/雾层次一句 + 天空主光方向一句 + 远景剪影一句 + 一处可辨标志物',
      `中景留走位；运镜：${shot.cameraFocus || '低机位可调度'}`,
    ].join('。');
    return {
      name,
      description,
      imagePrompt: [
        craft.overallScene,
        `【风格气质】${styleBit}；${craft.lightBit}`,
        craft.scene,
        `【空间锁定】${name}；${description}`,
      ].join('\n'),
    };
  }

  itemsOf(kind: LibraryKind): AnyLibraryItem[] {
    return this.byKind[kind].items;
  }

  kindFromRoute(param: string): LibraryKind {
    return libraryKindFromRoute(param);
  }

  /** AI 镜头库：导出细案 Word（含场景图、定妆图、道具图与全部提示词） */
  async exportShotExpandDocxStream(id: string) {
    const buf = await this.buildShotExpandDocx(id);
    const pack = await this.getSavedShotExpand(id);
    const safe = String(pack.label || id)
      .replace(/[\\/:*?"<>|]+/g, '_')
      .trim()
      .slice(0, 80);
    const filename = encodeURIComponent(`${safe || '镜头'}-镜头细案.docx`);
    return { file: new StreamableFile(buf), filename };
  }

  async buildShotExpandDocx(id: string): Promise<Buffer> {
    const pack = await this.getSavedShotExpand(id);
    let seed: ShotLibraryItem | null = null;
    try {
      seed = this.getShotItem(id);
    } catch {
      seed = null;
    }
    const subStyle =
      (seed?.tags || []).find((t) => t && t !== '画风' && t !== '动漫风') || pack.category;
    const children: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'AI 镜头库 · 细案导出',
            bold: true,
            size: 36,
          }),
        ],
        spacing: { after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${pack.label || id} · ${pack.category || ''} · ${subStyle || ''} · ${pack.durationSec || 10}s`,
            size: 22,
            color: '666666',
          }),
        ],
        spacing: { after: 280 },
      }),
    ];

    children.push(this.docxHeading2('一、镜头概要'));
    children.push(
      ...this.docxParas(
        [
          `标题：${pack.label || id}`,
          `画风族：${pack.category || '—'}`,
          `子风格：${subStyle || '—'}`,
          `时长：${pack.durationSec || 10} 秒`,
          `出场人数：${pack.castCount ?? 0}`,
          seed?.blurb ? `概念：${seed.blurb}` : '',
          seed?.cameraFocus ? `运镜侧重：${seed.cameraFocus}` : '',
          seed?.moveFocus ? `招式侧重：${seed.moveFocus}` : '',
          seed?.vfxFocus ? `特效侧重：${seed.vfxFocus}` : '',
          seed?.sceneHint ? `场景提示：${seed.sceneHint}` : '',
          seed?.seed ? `种子：${seed.seed}` : '',
          (seed?.tags || []).length ? `标签：${(seed?.tags || []).join(' / ')}` : '',
          (pack.castRoles || []).length
            ? `角色职能：${(pack.castRoles || []).join('、')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    );

    children.push(this.docxHeading2('二、成片提示词'));
    children.push(
      ...this.docxParas(pack.videoPrompt || pack.prompt || '（暂无成片提示词）'),
    );

    children.push(this.docxHeading2('三、场景'));
    const scene = pack.scene || { name: '', description: '', imagePrompt: '' };
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `场景名：${scene.name || '（未命名）'}`,
            bold: true,
            size: 24,
          }),
        ],
        spacing: { before: 80, after: 60 },
      }),
    );
    children.push(
      ...this.docxParas(`场景描述：\n${scene.description || '（暂无）'}`),
    );
    children.push(
      ...this.docxParas(`场景出图提示词：\n${scene.imagePrompt || '（暂无）'}`),
    );
    {
      const img = await this.loadLibraryImageForDocx(pack.sceneUrl, 'landscape');
      if (img) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: '场景参考图：', size: 20, italics: true }),
            ],
            spacing: { before: 80 },
          }),
        );
        children.push(this.docxImagePara(img, `场景·${scene.name || '环境'}`));
      } else {
        children.push(...this.docxParas('（缺场景参考图，可先在镜头库出图后再导出）'));
      }
    }

    if (pack.storyPlot) {
      children.push(this.docxHeading2('三′、故事剧情'));
      children.push(...this.docxParas(pack.storyPlot));
    }
    if (pack.plotGridPrompt) {
      children.push(this.docxHeading2('三″、剧情宫格提示词'));
      children.push(...this.docxParas(pack.plotGridPrompt));
    }

    children.push(this.docxHeading2('四、角色定妆与设定板'));
    const chars = pack.characters || [];
    if (!chars.length) {
      children.push(...this.docxParas('（本镜无人出镜 / 无定妆）'));
    } else {
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const name = ch.name || `角色${i + 1}`;
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `角色 ${i + 1}：${name}${ch.role ? `（${ch.role}）` : ''}`,
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 160, after: 60 },
          }),
        );
        children.push(
          ...this.docxParas(`外形设定：\n${ch.appearance || '（暂无）'}`),
        );
        children.push(
          ...this.docxParas(`竖版定妆提示词：\n${ch.portraitPrompt || '（暂无）'}`),
        );
        children.push(
          ...this.docxParas(`工业设定板提示词：\n${ch.sheetPrompt || '（暂无）'}`),
        );
        const url = (pack.portraitUrls || {})[String(i)] || '';
        const img = await this.loadLibraryImageForDocx(url, 'portrait');
        if (img) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: '定妆参考图：', size: 20, italics: true }),
              ],
              spacing: { before: 80 },
            }),
          );
          children.push(this.docxImagePara(img, `定妆·${name}`));
        } else {
          children.push(...this.docxParas('（缺定妆图，可先出图后再导出）'));
        }
      }
    }

    children.push(this.docxHeading2('五、关键道具'));
    const props = pack.props || [];
    if (!props.length) {
      children.push(...this.docxParas('（无关键道具）'));
    } else {
      for (let i = 0; i < props.length; i++) {
        const pr = props[i];
        const name = pr.name || `道具${i + 1}`;
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `道具 ${i + 1}：${name}${pr.role ? `（${pr.role}）` : ''}`,
                bold: true,
                size: 24,
              }),
            ],
            spacing: { before: 160, after: 60 },
          }),
        );
        children.push(
          ...this.docxParas(`描述：\n${pr.description || '（暂无）'}`),
        );
        children.push(
          ...this.docxParas(`道具出图提示词：\n${pr.propPrompt || '（暂无）'}`),
        );
        const url = (pack.propUrls || {})[String(i)] || '';
        const img = await this.loadLibraryImageForDocx(url, 'square');
        if (img) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: '道具参考图：', size: 20, italics: true }),
              ],
              spacing: { before: 80 },
            }),
          );
          children.push(this.docxImagePara(img, `道具·${name}`));
        } else {
          children.push(...this.docxParas('（缺道具图，可先出图后再导出）'));
        }
      }
    }

    children.push(this.docxHeading2('六、导出说明'));
    children.push(
      ...this.docxParas(
        [
          '本 Word 由 AI 镜头库细案一键导出，便于归档与给即梦/豆包等工具对照使用。',
          '图片优先嵌入已落盘的本地上传文件；若某张图仍为外链或未出图，正文会标注缺失。',
          pack.updatedAt ? `细案更新时间：${pack.updatedAt}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    );

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });
    return Packer.toBuffer(doc);
  }

  private uploadRootDir() {
    return process.env.UPLOAD_DIR || join(process.cwd(), 'data', 'uploads');
  }

  private docxHeading2(text: string) {
    return new Paragraph({
      text,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 120 },
    });
  }

  private docxParas(text: string): Paragraph[] {
    const out: Paragraph[] = [];
    const lines = String(text || '')
      .replace(/\r\n/g, '\n')
      .split('\n');
    for (const line of lines) {
      const t = line.trimEnd();
      out.push(
        new Paragraph({
          children: [new TextRun({ text: t || ' ', size: 21 })],
          spacing: { after: 60 },
        }),
      );
    }
    if (!out.length) {
      out.push(
        new Paragraph({
          children: [new TextRun({ text: '（空）', size: 21, color: '999999' })],
        }),
      );
    }
    return out;
  }

  private docxImagePara(
    img: {
      data: Buffer;
      type: 'jpg' | 'png' | 'gif' | 'bmp';
      width: number;
      height: number;
    },
    alt: string,
  ) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: img.type,
          data: img.data,
          transformation: { width: img.width, height: img.height },
          altText: { name: alt, title: alt, description: alt },
        }),
      ],
      spacing: { before: 80, after: 160 },
    });
  }

  /** 把镜头库图片 URL（/api/uploads/...）解析为可嵌入 Word 的本地图 */
  private async loadLibraryImageForDocx(
    url?: string,
    aspect: 'landscape' | 'portrait' | 'square' = 'landscape',
  ): Promise<{
    data: Buffer;
    type: 'jpg' | 'png' | 'gif' | 'bmp';
    width: number;
    height: number;
  } | null> {
    const raw = String(url || '').trim();
    if (!raw) return null;
    let rel = '';
    if (raw.startsWith('/api/uploads/')) {
      rel = raw.slice('/api/uploads/'.length);
    } else {
      try {
        const u = new URL(raw);
        const idx = u.pathname.indexOf('/api/uploads/');
        if (idx >= 0) rel = u.pathname.slice(idx + '/api/uploads/'.length);
      } catch {
        /* ignore */
      }
    }
    if (!rel) return null;
    const abs = join(this.uploadRootDir(), ...rel.split('/').filter(Boolean));
    if (!existsSync(abs)) return null;
    try {
      const data = readFileSync(abs);
      if (!data?.length) return null;
      const ext = extname(abs).toLowerCase();
      let type: 'jpg' | 'png' | 'gif' | 'bmp' | null = null;
      if (ext === '.jpg' || ext === '.jpeg') type = 'jpg';
      else if (ext === '.png') type = 'png';
      else if (ext === '.gif') type = 'gif';
      else if (ext === '.bmp') type = 'bmp';
      else if (ext === '.webp') return null;
      else type = 'png';
      const maxW = aspect === 'portrait' ? 320 : aspect === 'square' ? 360 : 480;
      const height =
        aspect === 'portrait'
          ? Math.round((maxW * 16) / 9)
          : aspect === 'square'
            ? maxW
            : Math.round((maxW * 9) / 16);
      return { data, type, width: maxW, height };
    } catch {
      return null;
    }
  }
}

