import type { WorkflowDocument, WorkflowEdge, WorkflowGroup, WorkflowNode } from '@ai-video-studio/shared';
import { migrateGraphV1ToDocument } from '@ai-video-studio/shared';
import { GROUP_COLORS } from '@/utils/workflow-flow';
import { prependStyleLock } from '@/utils/style-lock';
import { buildCharacterModule, buildSceneModule } from '@/utils/workflow-subgraphs';

export type ParsedShot = { line: string; durationSec: number; prompt: string };

export type ParsedCharacter = { name: string; appearance: string };

export type ShotImagePrompt = {
  index: number;
  label: string;
  /** 专供该镜关键帧出图 */
  imagePrompt: string;
  durationSec: number;
};

export type PortraitPrompt = {
  name: string;
  appearance: string;
  prompt: string;
};

/** 画风族硬锁：跟镜头库八大类对齐；只禁真人，不默认动画开脸 */
const FAMILY_STYLE: Record<string, string> = {
  国风东方:
    '国风东方：绘卷/国风概念美术气质；子风格只作色板与特效材质（水墨飞白、青绿、岩彩金箔等），禁止宣纸静物展、禁止真人棚拍、禁止默认赛璐璐。',
  二次元动漫: '二次元动漫风：动画/漫画线条与赛璐璐色面；禁止真人实拍。',
  传统美术绘画:
    '传统美术绘画：画种味作色板与笔触气质，人物可演戏；禁止画展临摹静物、禁止真人写真、禁止默认赛璐璐。',
  科幻未来: '科幻未来：科幻材质光色的概念美术/CG气质；禁止古风水墨主调、禁止真人写真。',
  复古怀旧: '复古怀旧：年代介质色偏；禁止现代真人写真、禁止默认赛璐璐。',
  奇幻暗黑怪异: '奇幻暗黑怪异：暗黑奇幻/怪诞概念美术或厚涂插画优先；禁止廉价都市公寓跳吓写真、禁止默认赛璐璐。',
  简约商业: '简约商业：干净商业/平面设计语法；禁止脏废土写真堆砌、禁止真人棚拍。',
};

const SUB_STYLE: Record<string, string> = {
  水墨: '水墨味：墨分五色、焦墨淡墨飞白枯笔作特效与色板；禁止泼墨静物画、禁止默认赛璐璐。',
  青绿山水: '青绿山水：石青石绿色板；禁止挂画静物。',
  工笔: '工笔：细腻线描晕染；禁止临摹静物展。',
  国潮: '国潮：高饱和传统纹样；禁止棚拍脸。',
  敦煌: '敦煌味：矿物色金箔作服饰与特效；禁止壁画临摹静物。',
  岩彩: '岩彩：矿物青蓝青绿颗粒重彩+金箔/鎏金材质；暗底高对比。',
  炎彩: '炎彩：鎏金光焰向岩彩同族；冷矿物青蓝 vs 赤金高光。',
  青花瓷: '青花瓷味：钴蓝白地纹样点缀。',
  年画: '年画：高饱和民俗色平涂。',
  皮影: '皮影：暖幕透光与剪影光影。',
  剪纸: '剪纸味：红纸镂空可作前景/纹样；人物可演戏；禁止整幅剪纸展。',
  日系动画: '日系动画电影感柔和阴影赛璐璐。',
  二次元插画: '二次元插画海报感高光装饰线。',
  厚涂: '厚涂：可见笔触的数字绘画/概念美术。',
  赛璐璐: '赛璐璐：清晰描边平涂（仅二次元适用）。',
  赛博朋克: '赛博朋克：冷青品红霓虹湿反射；概念美术/CG。',
  暗黑奇幻: '暗黑奇幻：厚涂边缘光、诡异气场。',
  怪诞: '怪诞：扭曲荒诞比例；暗黑概念美术；禁止默认赛璐璐。',
};

/** @deprecated 兼容旧引用；实际只禁真人，不强制动画开脸 */
export const SHOT_LIBRARY_ANIME_LOCK =
  '只禁真人：禁止真实人脸、真人演员、live-action、照片级皮肤毛孔、网红棚拍；画风跟镜头库族/子风格走，禁止无依据默认动画开脸。';

/** 关键帧出图：只要单帧电影画面，禁止漫画页/分镜板展示图 */
export const KEYFRAME_SINGLE_FRAME_LOCK = [
  '【关键帧构图硬锁】输出必须是一张完整的 16:9 电影静帧：单一连续空间、单一时间瞬间、一个主画面。',
  '严禁：漫画分格、四格/多格连页、故事板网格、缩略图拼版、分镜展示图、角色设定展示板、三视图拼贴、上下/左右分屏、画中画、九宫格、联系表 contact sheet、把多角度或多镜头并排进同一张图。',
  '不要做成「一张图里排多个小格的漫画风格展示图」；只要本镜这一刻的完整单帧。',
].join('');

export function parseScriptMeta(scriptText: string) {
  const lines = String(scriptText || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let characters = '';
  let plot = '';
  let totalSec = 0;
  let styleLine = '';
  for (const line of lines) {
    const mChar = line.match(/^【角色】\s*(.+)$/);
    if (mChar) characters = mChar[1].trim();
    const mPlot = line.match(/^【剧情】\s*(.+)$/);
    if (mPlot) plot = mPlot[1].trim();
    const mDur = line.match(/^【总时长】[^0-9]*(\d+)\s*秒?/);
    if (mDur) totalSec = Number(mDur[1]) || 0;
    const mStyle = line.match(/^画风[：:]\s*(.+)$/);
    if (mStyle) styleLine = mStyle[1].trim();
  }
  return { characters, plot, totalSec, styleLine };
}

/** 从【角色】行拆出可定妆的角色列表（最多 3 个） */
export function parseScriptCharacters(charactersLine: string): ParsedCharacter[] {
  const raw = String(charactersLine || '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/[；;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: ParsedCharacter[] = [];
  for (const part of parts) {
    const m = part.match(/^([^：:]{1,24})[：:]\s*(.+)$/);
    if (m) {
      out.push({ name: m[1].trim(), appearance: m[2].trim() });
    } else if (part.length >= 2) {
      out.push({ name: part.slice(0, 12), appearance: part });
    }
    if (out.length >= 3) break;
  }
  return out;
}

export function parseScriptShots(scriptText: string): ParsedShot[] {
  const lines = String(scriptText || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const shotLines = lines.filter(
    (s) =>
      !s.startsWith('【') &&
      !/^画风[：:]/.test(s) &&
      (/^(镜号|第?\d+\s*镜|镜头\s*\d+)/.test(s) || s.includes('｜')),
  );
  const pick = shotLines.length
    ? shotLines.slice(0, 8)
    : (() => {
        const paras = String(scriptText || '')
          .split(/\n{2,}/)
          .map((s) => s.trim())
          .filter((s) => s.length > 12 && !s.startsWith('【'));
        if (paras.length >= 2) return paras.slice(0, 6);
        const t = scriptText.trim();
        return t ? [t.slice(0, 800)] : [];
      })();

  return pick.map((line) => {
    const durMatch = line.match(/时长\s*(\d+)\s*s?/i) || line.match(/｜\s*(\d+)\s*秒?\s*$/);
    let durationSec = durMatch ? Number(durMatch[1]) : 5;
    if (!Number.isFinite(durationSec) || durationSec < 2) durationSec = 5;
    if (durationSec > 15) durationSec = 15;
    const prompt = line
      .replace(/｜?\s*时长\s*\d+\s*s?\s*$/i, '')
      .replace(/｜\s*\d+\s*秒?\s*$/, '')
      .trim();
    return { line, durationSec, prompt: prompt || line };
  });
}

export function buildStyleHead(opts: {
  category?: string;
  subStyle?: string;
  styleBrief?: string;
  styleLine?: string;
}): string {
  const category = String(opts.category || '').trim();
  const subStyle = String(opts.subStyle || '').trim();
  const styleBrief = String(opts.styleBrief || '').trim();
  const styleLine = String(opts.styleLine || '').trim();
  const fam = category ? FAMILY_STYLE[category] || `画风族「${category}」：按本族气质呈现，禁止真人，禁止默认赛璐璐。` : '';
  const sub = subStyle ? SUB_STYLE[subStyle] || `子风格「${subStyle}」作色板/特效点缀。` : '';
  const named =
    category || subStyle
      ? `画风硬锁：${[category, subStyle].filter(Boolean).join('·')}`
      : '';
  return [
    SHOT_LIBRARY_ANIME_LOCK,
    named,
    fam,
    sub,
    styleLine ? `脚本画风：${styleLine}` : '',
    styleBrief ? `补充画风：${styleBrief}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPortraitPrompts(
  chars: ParsedCharacter[],
  styleHead: string,
  category: string,
  subStyle: string,
): PortraitPrompt[] {
  const styleTag = [category, subStyle].filter(Boolean).join('·') || '动漫/国漫';
  return chars.map((c) => ({
    name: c.name,
    appearance: c.appearance,
    prompt: [
      styleHead,
      'Chinese manhua industrial character design document, landscape 16:9, clean light-gray modular UI with CN/EN section labels.',
      '【画风硬锁】日常写实或国漫半写实插画；禁止真人照片、禁止 UE5/PBR 次世代堆料。',
      '【布局硬锁】五区设定板：左上大头档案（姓名/身高气质/身份）+ 右上 THREE VIEW 正侧背 + 右中 EXPRESSION SHEET 6～8 表情格 + 左下 COSTUME 全身立绘与 4～6 细节格 + 右下短角色说明。禁止单人生活照占满整图；禁止剧情分镜页。',
      '【体型硬锁】默认成年：约 7.5～8 头身，肩胯腿长正常；禁止幼童/Q版大头、禁止五～六头身短腿；三视图脚踩底边、全身占满模块高度。若文案明确儿童则按儿童比例。',
      `【整体参数】按本场画风族·子风格；国漫/日常写实概念美术；禁止真人写真、禁止叙事九宫格分镜页`,
      `【风格气质】${styleTag}；锁定本角色身份与服饰锚点；禁止真人写真、禁止网红棚拍`,
      `【主体】${c.name}；${c.appearance}；发丝衣纹可读；三视图服装发型配色饰品必须完全一致，后续关键帧必须认得出是同一人`,
    ].join('\n'),
  }));
}

/** 豆包友好半秒时间轴：把各镜描述铺到 0.0 / 0.5 / … */
function buildHalfSecondBeats(
  shots: ParsedShot[],
  spans: number[],
  durationSec: number,
): string {
  const lines: string[] = [];
  let t = 0;
  for (let i = 0; i < shots.length; i++) {
    const span = Math.max(1, spans[i] || 1);
    const end = i === shots.length - 1 ? durationSec : Math.min(durationSec, t + span);
    const body = shots[i].prompt.replace(/\s+/g, ' ').trim();
    const ticks: number[] = [];
    for (let x = t; x < end - 0.01; x += 0.5) ticks.push(Number(x.toFixed(1)));
    if (!ticks.length) ticks.push(Number(t.toFixed(1)));
    ticks.forEach((tick, ti) => {
      const piece =
        ti === 0
          ? body
          : `承接上镜动作：${body.slice(0, 120)}${body.length > 120 ? '…' : ''}`;
      lines.push(`${tick.toFixed(1)}s：${piece}`);
    });
    t = end;
  }
  // 补齐到 durationSec-0.5
  const lastTick = durationSec - 0.5;
  const have = new Set(lines.map((l) => l.split('s：')[0]));
  for (let x = 0; x <= lastTick + 0.01; x += 0.5) {
    const key = x.toFixed(1);
    if (!have.has(key)) {
      const fallback = shots[shots.length - 1]?.prompt || '保持同一角色与场景，运镜连贯收束';
      lines.push(`${key}s：${fallback.slice(0, 160)}`);
      have.add(key);
    }
  }
  return lines
    .sort((a, b) => Number(a.split('s：')[0]) - Number(b.split('s：')[0]))
    .filter((line, idx, arr) => arr.findIndex((x) => x.split('s：')[0] === line.split('s：')[0]) === idx)
    .join('\n');
}

/** 每镜生图提示词 + 成片专用运动提示词（视频单独用，不与生图共用） */
export function buildMergedShotPrompt(opts: {
  scriptText: string;
  styleBrief?: string;
  shotLabel?: string;
  category?: string;
  subStyle?: string;
  targetDurationSec?: number;
}): {
  durationSec: number;
  shotCount: number;
  imageShots: ShotImagePrompt[];
  portraits: PortraitPrompt[];
  videoPrompt: string;
  styleHead: string;
  characters: ParsedCharacter[];
} {
  const text = String(opts.scriptText || '').trim();
  const meta = parseScriptMeta(text);
  const shots = parseScriptShots(text);
  const durationSec = Number(opts.targetDurationSec) === 15 ? 15 : 10;
  const category = String(opts.category || '').trim();
  const subStyle = String(opts.subStyle || '').trim();

  const styleHead = buildStyleHead({
    category,
    subStyle,
    styleBrief: opts.styleBrief,
    styleLine: meta.styleLine,
  });

  const characters = parseScriptCharacters(meta.characters);
  const portraits = buildPortraitPrompts(characters, styleHead, category, subStyle);

  const list =
    shots.length > 0
      ? shots
      : [{ line: text, durationSec: durationSec, prompt: text.slice(0, 800) }];

  const weightSum = list.reduce((a, s) => a + (s.durationSec || 1), 0) || list.length;
  let allocated = 0;
  const spans = list.map((s, i) => {
    const raw = Math.max(1, Math.round(((s.durationSec || 1) / weightSum) * durationSec));
    if (i === list.length - 1) return Math.max(1, durationSec - allocated);
    allocated += raw;
    return raw;
  });

  const castLock = characters.length
    ? characters.map((c) => `${c.name}（${c.appearance}）`).join('；')
    : meta.characters;

  const imageShots: ShotImagePrompt[] = list.map((s, i) => {
    const imagePrompt = [
      styleHead,
      KEYFRAME_SINGLE_FRAME_LOCK,
      opts.shotLabel ? `镜头概念：${opts.shotLabel}` : '',
      castLock ? `出场角色（必须与定妆图一致）：${castLock}` : '',
      portraits.length
        ? '参考图为角色定妆：严格锁定同一张脸、发型、服装主色与标志锚点；禁止换脸、禁止串成另一个人。'
        : '',
      `【镜 ${i + 1} 关键帧 · 单帧静帧】`,
      '只画本镜这一瞬间；单主体场景连贯，禁止任何分格或展示板排版。',
      s.prompt,
    ]
      .filter(Boolean)
      .join('\n');
    return {
      index: i + 1,
      label: `镜${i + 1}`,
      imagePrompt,
      durationSec: spans[i] || 1,
    };
  });

  const styleForward = [
    category || subStyle
      ? `${[category, subStyle].filter(Boolean).join('·')}`
      : '概念美术/绘卷气质',
    '跟画风族呈现，禁止真人，禁止默认赛璐璐',
    subStyle === '水墨' || /水墨/.test(opts.styleBrief || '') || /水墨/.test(meta.styleLine || '')
      ? '墨分五色，焦墨淡墨飞白作特效，发丝飘带二次运动'
      : '',
    '禁止真人写真',
  ]
    .filter(Boolean)
    .join('，');

  const charForward = characters.length
    ? characters.map((c) => `${c.name}，${c.appearance}`).join('。') + '。'
    : meta.characters
      ? `${meta.characters}。`
      : '';

  const sceneForward = meta.plot ? `剧情场景：${meta.plot}` : '';

  const refBits = [
    ...portraits.map((p, i) => `图 ${i + 1} ${p.name}定妆`),
    `图 ${portraits.length + 1} 首帧关键帧`,
    portraits.length + imageShots.length > 1 ? `图 ${portraits.length + 2} 尾帧关键帧` : '',
  ].filter(Boolean);

  const beats = buildHalfSecondBeats(list, spans, durationSec);

  const videoPrompt = [
    `基础设置：${durationSec} 秒，16:9 横屏，上传 ${Math.max(2, refBits.length)} 张参考图（${refBits.join('、')}），开启形象一致性，连贯单一时空，禁止跳切换景`,
    '正向 Prompt',
    [styleForward, charForward, sceneForward, opts.shotLabel ? `镜头概念 ${opts.shotLabel}` : '']
      .filter(Boolean)
      .join(''),
    beats,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    durationSec,
    shotCount: imageShots.length,
    imageShots,
    portraits,
    videoPrompt,
    styleHead,
    characters,
  };
}

function isScriptLayoutNode(n: WorkflowNode) {
  const label = String(n.label || '');
  const name = String((n.params as any)?.name || '');
  if (label === '分镜脚本' || label === '角色与剧情' || label === '细案设定') return true;
  if (label === '成片提示词' || label === '成片运动提示词' || label === '成片关键帧' || label === '成片')
    return true;
  if (label === '场景提示词' || label === '场景') return true;
  if (/^关键帧[·・]/.test(label) || /关键帧提示词/.test(label)) return true;
  if (/^镜\d+(生图提示词|关键帧)?$/.test(label)) return true;
  if (/定妆/.test(label)) return true;
  if (/^镜头\s*\d+/.test(label) || /^镜头\s*\d+/.test(name)) return true;
  if (/^成片[·・]?\d*s?$/.test(label)) return true;
  if (n.type === 'input.note' && /镜头库引导|脚本生成|用法|细案|精选说明/.test(label)) return true;
  return false;
}

function isScriptLayoutGroup(g: WorkflowGroup) {
  return /^① 设定|^①′ 角色定妆|^② 故事|^② 定妆|^② 角色定妆|^② 分镜关键帧|^② 成片|^② 镜|^③a |^③b |^③ 场景|^③ 镜|^③ 成片|^③′ 关键帧|^④ 场景|^④ 关键帧|^④ 成片|^⑤ 剧情|^⑤ 成片|^⑥ |^⑦ 成片|^废案|^镜头脚本/.test(
    String(g.title || ''),
  );
}

/** 去掉上一次脚本生成留下的分镜/设定/分组，保留用户其它节点 */
export function stripPreviousScriptLayout(graph: WorkflowDocument): WorkflowDocument {
  const doc = migrateGraphV1ToDocument(graph);
  const kill = new Set<string>();
  for (const n of doc.nodes || []) {
    if (isScriptLayoutNode(n)) kill.add(n.id);
  }
  const groups = (doc.groups || []).filter((g) => {
    if (isScriptLayoutGroup(g)) {
      kill.add(g.id);
      return false;
    }
    return true;
  });
  return {
    ...doc,
    nodes: (doc.nodes || []).filter((n) => !kill.has(n.id)),
    edges: (doc.edges || []).filter((e) => !kill.has(e.source) && !kill.has(e.target)),
    groups,
  };
}

let idSeq = 0;
function nid(prefix: string) {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}`;
}

/**
 * 设定 → 角色定妆 → 每镜「生图提示词→关键帧（吃定妆参考）」→ 成片运动提示词 → 一条成片。
 * 首镜关键帧→视频首帧，末镜关键帧→视频尾帧；定妆图也接到视频参考口。
 */
export function buildScriptLayoutFragment(opts: {
  scriptText: string;
  styleBrief?: string;
  shotLabel?: string;
  category?: string;
  subStyle?: string;
  targetDurationSec?: number;
}): { nodes: WorkflowNode[]; edges: WorkflowEdge[]; groups: WorkflowGroup[] } {
  const text = String(opts.scriptText || '').trim();
  const meta = parseScriptMeta(text);
  const packed = buildMergedShotPrompt(opts);

  const originX = 48;
  const originY = 48;
  const setupH = 280;
  const gapY = 48;
  const padX = 52;
  const padTop = 56;
  const colGap = 360;
  const rowH = 300;
  const portraitRowH = 360;

  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const groups: WorkflowGroup[] = [];

  const scriptId = nid('n');
  nodes.push({
    id: scriptId,
    type: 'input.text',
    label: '分镜脚本',
    position: { x: originX + padX, y: originY + padTop },
    params: { value: text },
    mode: 'active',
  });

  const styleTag = [opts.category, opts.subStyle].filter(Boolean).join('·');
  const bibleLines = [
    meta.characters ? `【角色】${meta.characters}` : '',
    meta.plot ? `【剧情】${meta.plot}` : '',
    `【成片时长】${packed.durationSec} 秒（单条视频）`,
    styleTag ? `【画风族】${styleTag}` : '',
    opts.shotLabel ? `【镜头库】${opts.shotLabel}` : '',
    `【结构】${packed.portraits.length} 张定妆 + ${packed.shotCount} 镜关键帧 + 1 条成片`,
  ].filter(Boolean);

  let castId = '';
  if (bibleLines.length) {
    castId = nid('n');
    nodes.push({
      id: castId,
      type: 'input.text',
      label: '角色与剧情',
      position: { x: originX + padX + colGap, y: originY + padTop },
      params: { value: bibleLines.join('\n') },
      mode: 'active',
    });
  }

  groups.push({
    id: nid('g'),
    title: `① 设定 · 成片 ${packed.durationSec}s`,
    x: originX,
    y: originY,
    width: castId ? 820 : 420,
    height: setupH,
    color: '#64748b',
  });

  const portraitIds: string[] = [];
  let cursorY = originY + setupH + gapY;

  if (packed.portraits.length) {
    packed.portraits.forEach((p, i) => {
      const gy = cursorY + i * portraitRowH;
      const iy = gy + padTop;
      const txtId = nid('n');
      const imgId = nid('n');
      portraitIds.push(imgId);
      nodes.push({
        id: txtId,
        type: 'input.text',
        label: `${p.name}定妆提示词`,
        position: { x: originX + padX, y: iy + 12 },
        params: { value: p.prompt },
        mode: 'active',
      });
      nodes.push({
        id: imgId,
        type: 'ai.image',
        label: `${p.name}定妆`,
        position: { x: originX + padX + colGap, y: iy },
        params: {
          name: `${p.name}定妆`,
          assetType: 'character_ref',
          aspect: '16:9',
          size: '1536x1024',
          imageGrid: '1',
        },
        mode: 'active',
      });
      edges.push({
        id: nid('e'),
        source: txtId,
        sourceHandle: 'text',
        target: imgId,
        targetHandle: 'prompt',
      });
      groups.push({
        id: nid('g'),
        title: `② 定妆 · ${p.name}`,
        x: originX,
        y: gy,
        width: 820,
        height: 340,
        color: '#0d9488',
      });
    });
    cursorY += packed.portraits.length * portraitRowH + gapY;
  }

  const framesY = cursorY;
  const imageIds: string[] = [];

  packed.imageShots.forEach((shot, i) => {
    const gy = framesY + i * rowH;
    const iy = gy + padTop;
    const tx = originX + padX;
    const ix = tx + colGap;
    const txtId = nid('n');
    const imgId = nid('n');
    imageIds.push(imgId);

    nodes.push({
      id: txtId,
      type: 'input.text',
      label: `镜${shot.index}生图提示词`,
      position: { x: tx, y: iy + 12 },
      params: { value: shot.imagePrompt },
      mode: 'active',
    });
    nodes.push({
      id: imgId,
      type: 'ai.image',
      label: `镜${shot.index}关键帧`,
      position: { x: ix, y: iy },
      params: {
        name: `镜${shot.index}关键帧`,
        assetType: 'keyframe',
        aspect: '16:9',
        size: '2560x1440',
      },
      mode: 'active',
    });
    edges.push({
      id: nid('e'),
      source: txtId,
      sourceHandle: 'text',
      target: imgId,
      targetHandle: 'prompt',
    });
    // 定妆图全部接到关键帧参考口，锁脸
    for (const pid of portraitIds) {
      edges.push({
        id: nid('e'),
        source: pid,
        sourceHandle: 'image',
        target: imgId,
        targetHandle: 'image',
      });
    }
    // 后镜吃前镜关键帧，进一步稳住场景/角色
    if (i > 0 && imageIds[i - 1]) {
      edges.push({
        id: nid('e'),
        source: imageIds[i - 1],
        sourceHandle: 'image',
        target: imgId,
        targetHandle: 'image',
      });
    }

    groups.push({
      id: nid('g'),
      title: `③ 镜${shot.index}关键帧`,
      x: originX,
      y: gy,
      width: 820,
      height: 280,
      color: GROUP_COLORS[(i + 1) % GROUP_COLORS.length],
    });
  });

  const videoY = framesY + packed.imageShots.length * rowH + gapY;
  const vy = videoY + padTop;
  const vTxtId = nid('n');
  const vidId = nid('n');
  const firstImg = imageIds[0];
  const lastImg = imageIds[imageIds.length - 1] || firstImg;

  nodes.push({
    id: vTxtId,
    type: 'input.text',
    label: '成片运动提示词',
    position: { x: originX + padX, y: vy + 12 },
    params: { value: packed.videoPrompt },
    mode: 'active',
  });
  nodes.push({
    id: vidId,
    type: 'ai.video',
    label: `成片·${packed.durationSec}s`,
    position: { x: originX + padX + colGap, y: vy },
    params: {
      name: '成片',
      durationSec: packed.durationSec,
      aspect: '16:9',
      resolution: '480p',
      imageSize: '854x480',
    },
    mode: 'active',
  });

  edges.push({
    id: nid('e'),
    source: vTxtId,
    sourceHandle: 'text',
    target: vidId,
    targetHandle: 'prompt',
  });
  // 视频参考：定妆 + 首帧（多图进 image 口）
  for (const pid of portraitIds) {
    edges.push({
      id: nid('e'),
      source: pid,
      sourceHandle: 'image',
      target: vidId,
      targetHandle: 'image',
    });
  }
  if (firstImg) {
    edges.push({
      id: nid('e'),
      source: firstImg,
      sourceHandle: 'image',
      target: vidId,
      targetHandle: 'image',
    });
  }
  if (lastImg && lastImg !== firstImg) {
    edges.push({
      id: nid('e'),
      source: lastImg,
      sourceHandle: 'image',
      target: vidId,
      targetHandle: 'endImage',
    });
  }

  groups.push({
    id: nid('g'),
    title: `④ 成片 · ${packed.portraits.length ? `${packed.portraits.length}定妆→` : ''}${packed.shotCount}关键帧→1条${packed.durationSec}s`,
    x: originX,
    y: videoY,
    width: 820,
    height: 300,
    color: '#3b82f6',
  });

  return { nodes, edges, groups };
}

export type ShotExpandLayoutInput = {
  label: string;
  category?: string;
  /** 子风格，通常来自 tags[0] */
  subStyle?: string;
  /** 补充画风 / 制作单 brief（编译期注入） */
  styleBrief?: string;
  /** 完整硬锁句；有则优先于 category/sub 拼装 */
  styleLock?: string;
  tags?: string[];
  durationSec?: number;
  videoPrompt: string;
  storyPlot?: string;
  plotGridPrompt?: string;
  /** 宫格分镜格数：默认 9（主流 Seedance DNA）；可 4 */
  plotGridCells?: 4 | 9;
  /**
   * 成片参考模式：
   * - omni：全能参考（默认；设定板+场景+分镜宫格进视频口，无关键帧）
   * - keyframe：三关键帧首尾帧（高级模板）
   */
  videoRefMode?: 'keyframe' | 'omni';
  characters?: Array<{
    name?: string;
    role?: string;
    appearance?: string;
    portraitPrompt?: string;
    sheetPrompt?: string;
  }>;
  scene?: {
    name?: string;
    description?: string;
    imagePrompt?: string;
  };
};

/** 旧细案无 storyPlot 时，从半秒轴拼四拍摘要 */
export function fallbackStoryPlotFromVideo(videoPrompt: string, label: string): string {
  const beats = String(videoPrompt || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => /^\d+(?:\.\d+)?s\s*[：:]/.test(l))
    .map((l) => l.replace(/^\d+(?:\.\d+)?s\s*[：:]\s*/, '').trim())
    .filter(Boolean);
  if (beats.length >= 3) {
    return [
      `【镜头】${label || '本镜'}`,
      `起势：${beats[0].slice(0, 80)}`,
      `加速/交锋：${beats[Math.floor(beats.length / 2)].slice(0, 80)}`,
      `高潮与收束：${beats[beats.length - 1].slice(0, 80)}`,
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

export function fallbackPlotGridPrompt(
  storyPlot: string,
  styleTag: string,
  cells: 4 | 9 = 9,
): string {
  const n = cells === 4 ? 4 : 9;
  const grid = n === 4 ? '2×2=4' : '3×3=9';
  return [
    `【整体参数】严格 ${grid} 等分宫格分镜剧情板；方图；细线分隔；左→右、上→下；每格单一叙事瞬间；禁止真人、禁止角色设定板整板复制`,
    `【风格气质】${styleTag || '国漫'}；统一角色身份与服装；景别特写/中景/全景轮换`,
    `【剧情】${String(storyPlot || '').slice(0, 480)}`,
    n === 4
      ? '【主体】四格兑现起势→冲突→反应→落点；可有极小角标 1…4'
      : '【主体】九格兑现起势→加速→高潮→收束；可有极小角标 1…9',
  ].join('\n');
}

/** Seedance 全能参考：多图作 reference_image，不走首尾帧 */
export function buildSeedanceOmniMotionPrompt(opts: {
  videoPrompt: string;
  durationSec: 10 | 15;
  styleTag?: string;
  characterNames?: string[];
  sceneName?: string;
  hasSheetRef?: boolean;
  hasSceneRef?: boolean;
  hasPlotGridRef?: boolean;
}): string {
  const d = Number(opts.durationSec) === 15 ? 15 : 10;
  const slots: string[] = [];
  if (opts.hasSheetRef) slots.push('角色设定板锁脸锁装');
  if (opts.hasSceneRef) slots.push('场景底图锁空间');
  if (opts.hasPlotGridRef) slots.push('分镜宫格锁叙事节拍');
  const refs =
    slots.length > 0
      ? `上传参考图（全能参考）：${slots.join('、')}，开启形象一致性`
      : '上传参考图（全能参考），开启形象一致性';
  const setup = `基础设置：${d} 秒，16:9 横屏，${refs}；参考图只锁身份/空间/节拍，成片是连续电影画面而非扫漫画页`;
  const styleLock = opts.styleTag
    ? `画风硬锁「${opts.styleTag}」；禁止真人；服装脸型对齐设定板参考（禁止整板复制进画面）。`
    : '禁止真人；服装脸型对齐设定板参考（禁止整板复制进画面）。';
  const cast = (opts.characterNames || []).map((n) => String(n || '').trim()).filter(Boolean);
  const castLine = cast.length
    ? `主体：${cast.join('、')}（与设定板一致，禁止换脸）。`
    : '';
  const sceneLine = opts.sceneName ? `空间：${opts.sceneName}（与场景参考一致，禁止跳切换景）。` : '';
  const craft =
    '写法：Style&Mood → Dynamic（半秒轴：主体接触点→单一动作→单一运镜→物理可见结果）→ Static；运动描述场内真实动作，禁止「镜头扫过宫格/漫画页」。';
  const raw = String(opts.videoPrompt || '').trim().slice(0, 900);
  return [setup, styleLock, castLine, sceneLine, craft, raw ? `节拍素材：\n${raw}` : '']
    .filter(Boolean)
    .join('\n');
}

/**
 * 从细案成片提示词压缩为 Seedance 友好的短运动提示（有首尾关键帧时少写长相）
 */
export function buildSeedanceMotionPrompt(opts: {
  videoPrompt: string;
  durationSec: 10 | 15;
  styleTag?: string;
  characterNames?: string[];
  sceneName?: string;
  hasEndFrame?: boolean;
  /** 中景关键帧也接到成片参考口（旧三关键帧链路） */
  hasMidFrame?: boolean;
  /** 设定板接到参考口第二张（LibTV 链路） */
  hasSheetRef?: boolean;
  hasSceneRef?: boolean;
}): string {
  const d = Number(opts.durationSec) === 15 ? 15 : 10;
  let refs: string;
  if (opts.hasMidFrame && opts.hasSheetRef && opts.hasEndFrame) {
    refs =
      '上传 4 张参考图（图1=开场首帧、图2=高潮动作关键帧、图3=角色设定板、图4=收束尾帧），开启形象一致性';
  } else if (opts.hasMidFrame) {
    refs =
      '上传 3 张参考图（图1=开场首帧、图2=高潮动作关键帧、图3=收束尾帧），开启形象一致性';
  } else if (opts.hasSheetRef && opts.hasEndFrame) {
    refs = opts.hasSceneRef
      ? '上传 4 张参考图（图1=开场首帧、图2=角色设定板、图3=场景、图4=收束尾帧），开启形象一致性'
      : '上传 3 张参考图（图1=开场首帧、图2=角色设定板、图3=收束尾帧），开启形象一致性';
  } else if (opts.hasEndFrame) {
    refs = '上传 2 张参考图（图1=开场关键帧、图2=收束关键帧），开启形象一致性';
  } else {
    refs = '上传 1 张参考图（图1=开场关键帧），开启形象一致性';
  }
  const setup = `基础设置：${d} 秒，16:9 横屏，${refs}，连贯单一时空，禁止跳切换景`;

  const raw = String(opts.videoPrompt || '').trim();
  const lines = raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let beats = lines.filter((l) => /^\d+(?:\.\d+)?s\s*[：:]/.test(l));
  if (beats.length > 14) {
    const mid = Math.floor(beats.length / 2);
    beats = [...beats.slice(0, 3), ...beats.slice(mid - 1, mid + 2), ...beats.slice(-3)];
  }

  const styleLock = opts.styleTag
    ? `画风硬锁「${opts.styleTag}」；禁止真人、禁止照片级皮肤；外貌以图1开场为准${
        opts.hasMidFrame ? '；动作高潮对齐图2关键帧' : ''
      }${
        opts.hasSheetRef
          ? opts.hasMidFrame
            ? '；服装体型对齐图3设定板（禁止整板复制进画面）'
            : '；服装体型对齐设定板（禁止整板复制进画面）'
          : ''
      }${opts.hasEndFrame ? '；收束对齐尾帧' : ''}。`
    : `禁止真人、禁止照片级皮肤；外貌以图1开场为准${
        opts.hasSheetRef ? '；服装体型对齐设定板' : ''
      }。`;
  const cast = (opts.characterNames || []).map((n) => String(n || '').trim()).filter(Boolean);
  const castLine = cast.length
    ? `主体：${cast.join('、')}（脸/发型/服装/专武握持与参考图一致，禁止换脸；下文按主体→动作→运镜写）。`
    : '';
  const sceneLine = opts.sceneName
    ? `空间：${opts.sceneName}${opts.hasEndFrame ? '（由图1→尾帧推进，禁止跳切换景）' : ''}。`
    : '';
  const midLine =
    opts.hasMidFrame && opts.hasSheetRef
      ? '参考图硬锁：图1=开场首帧、图2=高潮动作关键帧、图3=角色设定板、图4=收束尾帧；成片从图1起势→中段兑现图2姿态/招式→服装对齐图3→落到图4定格；禁止首尾空转、禁止跳过高潮卖点。'
      : opts.hasMidFrame
        ? '参考图硬锁：图1=开场首帧、图2=高潮动作关键帧、图3=收束尾帧；成片必须从图1起势→中段兑现图2姿态/招式/构图→落到图3定格；禁止首尾空转、禁止跳过高潮卖点。'
        : opts.hasSheetRef
          ? '参考图：图1=开场首帧、图2=角色设定板锁装；禁止把设定板整板复制进成片画面。'
          : '';
  const craftLine = opts.hasMidFrame
    ? '写法：半秒轴服务三关键帧节拍（起势对齐图1、高潮对齐图2、收束对齐尾帧）；每格「主体接触点→单一动作→单一运镜→物理可见结果」；禁止空话堆砌。'
    : '写法：每半秒格「主体接触点→单一动作→单一运镜→至少一个物理可见结果」；禁止空话堆砌。';

  const vibe = lines
    .filter(
      (l) =>
        !/^基础设置/.test(l) &&
        !/^正向\s*Prompt/i.test(l) &&
        !/^\d+(?:\.\d+)?s\s*[：:]/.test(l),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);

  const body = [styleLock, castLine, sceneLine, midLine, craftLine, vibe].filter(Boolean).join('');
  let out = [setup, '正向 Prompt', body, beats.join('\n')].filter(Boolean).join('\n');
  if (out.length > 1800) {
    out = [
      setup,
      '正向 Prompt',
      [styleLock, castLine, sceneLine, midLine, craftLine].filter(Boolean).join(''),
      beats.join('\n'),
    ]
      .filter(Boolean)
      .join('\n');
  }
  return out.length > 1800 ? out.slice(0, 1800) : out;
}

export type ExpandKeyframeRole = 'open' | 'peak' | 'close';

export type ExpandKeyframeSpec = {
  role: ExpandKeyframeRole;
  /** 节点短名 */
  title: string;
  /** 景别 */
  shotSize: string;
  /** 从时间轴抽的动作提示 */
  beatHint: string;
};

/** 从 videoPrompt 半秒格抽出开场 / 高潮 / 收束（Seedance 首帧+动作参考+尾帧） */
function pickExpandBeatHints(videoPrompt: string): Record<ExpandKeyframeRole, string> {
  const beats = String(videoPrompt || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => /^\d+(?:\.\d+)?s\s*[：:]/.test(l))
    .map((l) => l.replace(/^\d+(?:\.\d+)?s\s*[：:]\s*/, '').trim())
    .filter(Boolean);
  if (beats.length >= 3) {
    return {
      open: beats[0].slice(0, 220),
      peak: beats[Math.floor(beats.length / 2)].slice(0, 220),
      close: beats[beats.length - 1].slice(0, 220),
    };
  }
  if (beats.length === 2) {
    return {
      open: beats[0].slice(0, 220),
      peak: beats[0].slice(0, 220),
      close: beats[1].slice(0, 220),
    };
  }
  return {
    open: '开场起势：主体入画、站位与握持可读；主光方向明确；衣发微动刚起',
    peak: '动作高潮：本镜卖点顶点、接触点与专武轨迹清晰；单一主导运镜；尘雾/拖尾等物理结果可见',
    close: '收束落点：余韵定格，表情与站位收住；衣发惯性未停；可作尾帧',
  };
}

/**
 * 三关键帧锚定成片（主流 I2V）：
 * 开场→视频首帧，高潮→中段动作参考，收束→尾帧；设定板/宫格先锁人设与叙事。
 */
function buildExpandKeyframePack(opts: {
  styleTag: string;
  label: string;
  characters: Array<{ name: string; appearance: string; role: string }>;
  sceneName: string;
  videoPrompt: string;
  storyPlot?: string;
}): Array<ExpandKeyframeSpec & { prompt: string }> {
  const cast = opts.characters
    .map((c) => {
      const look = c.appearance || c.role || '';
      return look ? `${c.name}（${look.slice(0, 80)}）` : c.name;
    })
    .join('；');
  const sceneBit = opts.sceneName || '场景';
  const hints = pickExpandBeatHints(opts.videoPrompt);
  const storyAnchor = String(opts.storyPlot || '').trim().slice(0, 360);
  const specs: ExpandKeyframeSpec[] = [
    { role: 'open', title: '近景开场', shotSize: '近景/中近景', beatHint: hints.open },
    { role: 'peak', title: '中景高潮', shotSize: '中景', beatHint: hints.peak },
    { role: 'close', title: '收束尾帧', shotSize: '中全景/近景', beatHint: hints.close },
  ];
  const beatRole = (role: ExpandKeyframeRole) => {
    if (role === 'open') return '【节拍】对应故事起势；成片从此帧出发';
    if (role === 'peak') return '【节拍】对应故事高潮/卖点；成片中段必须吃到本帧姿态与招式';
    return '【节拍】对应故事收束；成片必须落到本帧定格';
  };
  const seven = (role: ExpandKeyframeRole) => {
    if (role === 'open') {
      return '【七要素】景别=近景/中近景；角度=平视或微仰；构图=主体偏中心略留视线空间；光影=主光方向写清；色调=开场主色锚点；动势=微动起势；转场=为高潮动作留出方向惯性';
    }
    if (role === 'peak') {
      return '【七要素】景别=中景；角度=略侧或跟刃视线；构图=动作张力占画面重心（刃/手/接触点优先）；光影=高潮高光打在招式接触点；色调=可比开场更饱和；动势=招式顶点+物理结果；转场=承接开场朝向，禁止越轴换边';
    }
    return '【七要素】景别=中全景或近景收脸；角度=与开场同轴线；构图=胜负/余韵落点可读；光影=余晖或尘雾散射；动势=衣发惯性未停的定格；转场=可接视频尾帧';
  };
  return specs.map((spec) => {
    const refHint =
      spec.role === 'open'
        ? '【参考】参考图=竖版定妆锁脸 + 工业设定板锁装 + 场景锁空间；本帧=视频首帧锚点；禁止宫格/设定板整板复制进成图'
        : spec.role === 'peak'
          ? '【参考】参考图=定妆/设定板 + 场景 + 开场关键帧；必须以开场为形象基准，只改景别与高潮动作瞬间；禁止换脸换装换景'
          : '【参考】参考图=定妆/设定板 + 场景 + 开场 + 高潮关键帧；收束须与开场同一角色同一地点，动作从高潮落到余韵；禁止换脸换景';
    const castDetail = opts.characters
      .map((c) => {
        const look = String(c.appearance || c.role || '').trim();
        return look ? `${c.name}：${look.slice(0, 160)}` : c.name;
      })
      .filter(Boolean)
      .join('；');
    return {
      ...spec,
      prompt: [
        storyAnchor ? `【剧情锚点】${storyAnchor}` : '',
        beatRole(spec.role),
        `【整体参数】横版16:9电影静帧；${spec.shotSize}；单一连续瞬间；人物与场景同框可读；禁止漫画分格/拼贴/设定板/多格展示`,
        opts.styleTag
          ? `【风格气质】${opts.styleTag}；厚涂/概念美术精美质感；禁止真人、禁止照片级皮肤；非二次元族禁止默认赛璐璐`
          : '【风格气质】精美概念美术；禁止真人、禁止照片级皮肤；禁止默认赛璐璐',
        `【主体】${castDetail || cast || '主体入画'}；脸/发/装/专武握持细节必须落地`,
        `【环境】锁定「${sceneBit}」；地面/远景/主材质一句写清`,
        `【瞬间】${spec.beatHint}`,
        seven(spec.role),
        '【画面一句】用一句可拍摄的话写清景别+动作接触点+光色结果，禁止空氛围词',
        refHint,
        KEYFRAME_SINGLE_FRAME_LOCK,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  });
}

/**
 * 镜头库细案布局（LibTV 资产+故事板 + Seedance 三关键帧锚定）：
 * ①设定 → ②故事剧情 → ③a竖版定妆 + ③b工业设定板 → ④场景 → ⑤剧情宫格
 * → ⑥开场/高潮/收束三关键帧 → ⑦成片（开场首帧·高潮动作参考·收束尾帧）。
 * 宫格只审叙事不进视频口；设定板灌进关键帧，成片口以三关键帧为主。
 */
export function buildShotExpandLayoutFragment(expand: ShotExpandLayoutInput): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  groups: WorkflowGroup[];
} {
  const durationSec = Number(expand.durationSec) === 15 ? 15 : 10;
  const category = String(expand.category || '').trim();
  const tags = (expand.tags || []).map((t) => String(t || '').trim()).filter(Boolean);
  const subStyle =
    String(expand.subStyle || '').trim() ||
    tags.find((t) => t && t !== '画风' && t !== '动漫风') ||
    '';
  const styleTag = [category, subStyle].filter(Boolean).join(' · ');
  const styleHead =
    String(expand.styleLock || '').trim() ||
    buildStyleHead({
      category,
      subStyle,
      styleBrief: expand.styleBrief,
    });
  const withStyle = (prompt: string) => prependStyleLock(prompt, styleHead);
  const label = String(expand.label || '镜头细案').trim() || '镜头细案';
  const characters = (expand.characters || [])
    .map((c, i) => ({
      name: String(c?.name || c?.role || `角色${i + 1}`).trim() || `角色${i + 1}`,
      portraitPrompt: withStyle(String(c?.portraitPrompt || '').trim()),
      sheetPrompt: withStyle(String(c?.sheetPrompt || '').trim()),
      appearance: String(c?.appearance || '').trim(),
      role: String(c?.role || '').trim(),
    }))
    .filter((c) => c.portraitPrompt || c.sheetPrompt);
  const sceneName = String(expand.scene?.name || '场景').trim() || '场景';
  const scenePrompt = withStyle(
    String(expand.scene?.imagePrompt || expand.scene?.description || '').trim(),
  );
  const videoPromptRaw = String(expand.videoPrompt || '').trim();
  const storyPlot =
    String(expand.storyPlot || '').trim() ||
    fallbackStoryPlotFromVideo(videoPromptRaw, label);
  const plotGridCells: 4 | 9 = Number(expand.plotGridCells) === 4 ? 4 : 9;
  const plotGridPrompt = withStyle(
    String(expand.plotGridPrompt || '').trim() ||
      fallbackPlotGridPrompt(storyPlot, styleTag, plotGridCells),
  );
  const hasScene = !!scenePrompt;
  const videoRefMode: 'keyframe' | 'omni' =
    expand.videoRefMode === 'keyframe' ? 'keyframe' : 'omni';
  const keyframes =
    videoRefMode === 'omni'
      ? []
      : buildExpandKeyframePack({
          styleTag,
          label,
          characters,
          sceneName: hasScene ? sceneName : '',
          videoPrompt: videoPromptRaw,
          storyPlot,
        });
  const hasSheetRef = characters.some((c) => !!(c.sheetPrompt || c.portraitPrompt));
  // 成片提示：全能参考 vs 三关键帧（再叠制作单硬锁）
  const motionPrompt = withStyle(
    videoRefMode === 'omni'
      ? buildSeedanceOmniMotionPrompt({
          videoPrompt: videoPromptRaw,
          durationSec,
          styleTag,
          characterNames: characters.map((c) => c.name),
          sceneName: hasScene ? sceneName : '',
          hasSheetRef,
          hasSceneRef: hasScene,
          hasPlotGridRef: true,
        })
      : buildSeedanceMotionPrompt({
          videoPrompt: videoPromptRaw,
          durationSec,
          styleTag,
          characterNames: characters.map((c) => c.name),
          sceneName: hasScene ? sceneName : '',
          hasEndFrame: true,
          hasMidFrame: true,
          hasSheetRef,
          hasSceneRef: false,
        }),
  );

  const originX = 48;
  const originY = 48;
  const setupH = 280;
  const storyH = 260;
  const gapY = 48;
  const padX = 52;
  const padTop = 56;
  const colGap = 360;
  const portraitRowH = 360;
  const sheetRowH = 340;
  const sceneRowH = 300;
  const gridRowH = 320;
  const keyframeRowH = 300;

  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const groups: WorkflowGroup[] = [];

  const setupLines = [
    `【标题】${label}`,
    styleTag ? `【画风】${styleTag}` : category ? `【画风族】${category}` : '',
    `【成片时长】${durationSec} 秒`,
    videoRefMode === 'omni'
      ? `【结构】故事剧情 → 竖版定妆+工业设定板${hasScene ? ' → 场景' : ''} → ${plotGridCells}宫格分镜 → 成片（全能参考）`
      : `【结构】故事剧情 → 竖版定妆+工业设定板${hasScene ? ' → 场景' : ''} → ${plotGridCells}宫格分镜 → 三关键帧（开场/高潮/收束）→ 成片`,
    videoRefMode === 'omni'
      ? '【说明】设定板锁人设、宫格分镜锁叙事；成片用全能参考（设定板+场景+宫格进视频口），无关键帧。禁止真人。'
      : '【说明】设定板锁人设、宫格分镜锁叙事；成片按三关键帧执行：开场→首帧、高潮→中段动作参考、收束→尾帧。差图拖进废案区。禁止真人。',
  ].filter(Boolean);

  nodes.push({
    id: nid('n'),
    type: 'input.text',
    label: '细案设定',
    position: { x: originX + padX, y: originY + padTop },
    params: { value: setupLines.join('\n') },
    mode: 'active',
  });
  groups.push({
    id: nid('g'),
    title: `① 设定 · ${styleTag || label} · ${durationSec}s`,
    x: originX,
    y: originY,
    width: 420,
    height: setupH,
    color: '#64748b',
  });

  groups.push({
    id: nid('g'),
    title: '废案 · 拖入不用的图',
    x: originX + 900,
    y: originY,
    width: 320,
    height: setupH,
    color: '#475569',
  });
  nodes.push({
    id: nid('n'),
    type: 'input.note',
    label: '精选说明',
    position: { x: originX + 900 + 36, y: originY + padTop },
    params: {
      value:
        '完整链路：\n1) 先出竖版定妆+设定板+场景+剧情宫格\n2) 宫格只审叙事，不连成片\n3) 开场→视频首帧、高潮→动作参考、收束→尾帧\n4) 差图拖进本废案区',
    },
    mode: 'active',
  });

  let cursorY = originY + setupH + gapY;

  // ② 故事剧情
  {
    const gy = cursorY;
    nodes.push({
      id: nid('n'),
      type: 'input.text',
      label: '故事剧情',
      position: { x: originX + padX, y: gy + padTop },
      params: { value: storyPlot },
      mode: 'active',
    });
    groups.push({
      id: nid('g'),
      title: '② 故事剧情',
      x: originX,
      y: gy,
      width: 820,
      height: storyH,
      color: '#f97316',
    });
    cursorY += storyH + gapY;
  }

  const bustIds: string[] = [];
  const sheetIds: string[] = [];

  // 角色子图模块（定妆 + 设定板）
  characters.forEach((c) => {
    if (!c.portraitPrompt && !c.sheetPrompt) return;
    const mod = buildCharacterModule({
      name: c.name,
      portraitPrompt: c.portraitPrompt || c.sheetPrompt,
      sheetPrompt: c.sheetPrompt,
      appearance: c.appearance,
      role: c.role,
      styleLock: '',
      styleTag,
      originX,
      originY: cursorY,
      gapY,
    });
    nodes.push(...mod.nodes);
    edges.push(...mod.edges);
    groups.push(...mod.groups);
    if (mod.portraitImageId) bustIds.push(mod.portraitImageId);
    if (mod.sheetImageId) sheetIds.push(mod.sheetImageId);
    cursorY = mod.nextY;
  });

  let sceneImgId = '';
  if (hasScene) {
    const sceneMod = buildSceneModule({
      name: sceneName,
      imagePrompt: scenePrompt,
      styleLock: '',
      originX,
      originY: cursorY,
      gapY,
    });
    nodes.push(...sceneMod.nodes);
    edges.push(...sceneMod.edges);
    groups.push(...sceneMod.groups);
    sceneImgId = sceneMod.sceneImageId;
    cursorY = sceneMod.nextY;
  }

  // ⑤ 剧情宫格（不连视频）
  let plotGridImgId = '';
  {
    const gy = cursorY;
    const iy = gy + padTop;
    const txtId = nid('n');
    const imgId = nid('n');
    plotGridImgId = imgId;
    nodes.push({
      id: txtId,
      type: 'input.text',
      label: '分镜宫格提示词',
      position: { x: originX + padX, y: iy + 12 },
      params: { value: plotGridPrompt },
      mode: 'active',
    });
    nodes.push({
      id: imgId,
      type: 'ai.image',
      label: `分镜宫格·${plotGridCells}`,
      position: { x: originX + padX + colGap, y: iy },
      params: {
        name: `分镜宫格·${plotGridCells}宫格`,
        assetType: 'storyboard',
        imageGrid: String(plotGridCells),
        aspect: '1:1',
        size: '1536x1536',
      },
      mode: 'active',
    });
    edges.push({
      id: nid('e'),
      source: txtId,
      sourceHandle: 'text',
      target: imgId,
      targetHandle: 'prompt',
    });
    for (const id of [...sheetIds.slice(0, 1), ...bustIds.slice(0, 1)]) {
      edges.push({
        id: nid('e'),
        source: id,
        sourceHandle: 'image',
        target: imgId,
        targetHandle: 'image',
      });
    }
    if (sceneImgId) {
      edges.push({
        id: nid('e'),
        source: sceneImgId,
        sourceHandle: 'image',
        target: imgId,
        targetHandle: 'image',
      });
    }
    groups.push({
      id: nid('g'),
      title:
        videoRefMode === 'omni'
          ? `⑤ 分镜宫格 · ${plotGridCells}格（叙事板 → 全能参考）`
          : `⑤ 分镜宫格 · ${plotGridCells}格（叙事板，审阅用）`,
      x: originX,
      y: gy,
      width: 820,
      height: 300,
      color: '#eab308',
    });
    cursorY += gridRowH + gapY;
  }

  const kfImgByRole: Partial<Record<ExpandKeyframeRole, string>> = {};
  const roleColors: Record<ExpandKeyframeRole, string> = {
    open: '#14b8a6',
    peak: '#f59e0b',
    close: '#0891b2',
  };
  const roleIndex: Record<ExpandKeyframeRole, string> = {
    open: '⑥a',
    peak: '⑥b',
    close: '⑥c',
  };

  keyframes.forEach((kf, i) => {
    const gy = cursorY + i * keyframeRowH;
    const iy = gy + padTop;
    const txtId = nid('n');
    const imgId = nid('n');
    kfImgByRole[kf.role] = imgId;
    const wireHint =
      kf.role === 'open'
        ? '（→视频首帧）'
        : kf.role === 'peak'
          ? '（→中段动作参考）'
          : '（→视频尾帧）';
    nodes.push({
      id: txtId,
      type: 'input.text',
      label: `关键帧提示词·${kf.title}`,
      position: { x: originX + padX, y: iy + 12 },
      params: { value: kf.prompt },
      mode: 'active',
    });
    nodes.push({
      id: imgId,
      type: 'ai.image',
      label: `关键帧·${kf.title}`,
      position: { x: originX + padX + colGap, y: iy },
      params: {
        name: `关键帧·${kf.title}`,
        assetType: 'keyframe',
        aspect: '16:9',
        size: '2560x1440',
      },
      mode: 'active',
    });
    edges.push({
      id: nid('e'),
      source: txtId,
      sourceHandle: 'text',
      target: imgId,
      targetHandle: 'prompt',
    });
    // 关键帧参考硬裁：设定板1 + 竖版定妆1 + 场景；后续帧吃开场/高潮
    const kfRefs = [...sheetIds.slice(0, 1), ...bustIds.slice(0, 1)];
    if (sceneImgId) kfRefs.push(sceneImgId);
    for (const rid of kfRefs) {
      edges.push({
        id: nid('e'),
        source: rid,
        sourceHandle: 'image',
        target: imgId,
        targetHandle: 'image',
      });
    }
    if (kf.role !== 'open' && kfImgByRole.open) {
      edges.push({
        id: nid('e'),
        source: kfImgByRole.open,
        sourceHandle: 'image',
        target: imgId,
        targetHandle: 'image',
      });
    }
    if (kf.role === 'close' && kfImgByRole.peak) {
      edges.push({
        id: nid('e'),
        source: kfImgByRole.peak,
        sourceHandle: 'image',
        target: imgId,
        targetHandle: 'image',
      });
    }
    groups.push({
      id: nid('g'),
      title: `${roleIndex[kf.role]} 关键帧 · ${kf.title}${wireHint}`,
      x: originX,
      y: gy,
      width: 820,
      height: 280,
      color: roleColors[kf.role],
    });
  });
  cursorY += keyframes.length * keyframeRowH + gapY;

  const startKfId = kfImgByRole.open || '';
  const peakKfId = kfImgByRole.peak || '';
  const endKfId = kfImgByRole.close || startKfId;

  const videoY = cursorY;
  const vy = videoY + padTop;
  const vTxtId = nid('n');
  const vidId = nid('n');

  nodes.push({
    id: vTxtId,
    type: 'input.text',
    label: '成片运动提示词',
    position: { x: originX + padX, y: vy + 12 },
    params: { value: motionPrompt },
    mode: 'active',
  });
  nodes.push({
    id: vidId,
    type: 'ai.video',
    label: videoRefMode === 'omni' ? `成片·全能参考·${durationSec}s` : `成片·${durationSec}s`,
    position: { x: originX + padX + colGap, y: vy },
    params: {
      name: videoRefMode === 'omni' ? '成片·全能参考' : '成片',
      durationSec,
      aspect: '16:9',
      resolution: '480p',
      imageSize: '854x480',
      /** omni = 全部 image 口作 reference_image，不走首尾帧 */
      refMode: videoRefMode === 'omni' ? 'omni' : 'frames',
    },
    mode: 'active',
  });
  edges.push({
    id: nid('e'),
    source: vTxtId,
    sourceHandle: 'text',
    target: vidId,
    targetHandle: 'prompt',
  });

  if (videoRefMode === 'omni') {
    // 全能参考：设定板 + 定妆 + 场景 + 分镜宫格 → 视频参考口（精选，上限约 7）
    const omniRefs = [
      ...sheetIds.slice(0, 2),
      ...bustIds.slice(0, 1),
      ...(sceneImgId ? [sceneImgId] : []),
      ...(plotGridImgId ? [plotGridImgId] : []),
    ].slice(0, 7);
    for (const rid of omniRefs) {
      edges.push({
        id: nid('e'),
        source: rid,
        sourceHandle: 'image',
        target: vidId,
        targetHandle: 'image',
      });
    }
  } else {
    // Seedance：首帧 + 中段参考(高潮+设定板) + 尾帧
    if (startKfId) {
      edges.push({
        id: nid('e'),
        source: startKfId,
        sourceHandle: 'image',
        target: vidId,
        targetHandle: 'image',
      });
    }
    if (peakKfId && peakKfId !== startKfId) {
      edges.push({
        id: nid('e'),
        source: peakKfId,
        sourceHandle: 'image',
        target: vidId,
        targetHandle: 'image',
      });
    }
    if (sheetIds[0]) {
      edges.push({
        id: nid('e'),
        source: sheetIds[0],
        sourceHandle: 'image',
        target: vidId,
        targetHandle: 'image',
      });
    } else if (bustIds[0]) {
      edges.push({
        id: nid('e'),
        source: bustIds[0],
        sourceHandle: 'image',
        target: vidId,
        targetHandle: 'image',
      });
    }
    if (endKfId && endKfId !== startKfId) {
      edges.push({
        id: nid('e'),
        source: endKfId,
        sourceHandle: 'image',
        target: vidId,
        targetHandle: 'endImage',
      });
    }
  }

  const structBits =
    videoRefMode === 'omni'
      ? [
          characters.length ? `${characters.length}定妆+设定板` : '',
          '故事+宫格',
          hasScene ? '场景' : '',
          '全能参考进成片',
          `1条${durationSec}s`,
        ].filter(Boolean)
      : [
          characters.length ? `${characters.length}定妆+设定板` : '',
          '故事+宫格',
          hasScene ? '场景' : '',
          '三关键帧+设定板进成片',
          `1条${durationSec}s`,
        ].filter(Boolean);
  groups.push({
    id: nid('g'),
    title:
      videoRefMode === 'omni'
        ? `⑥ 成片 · ${structBits.join('→')}（全能参考）`
        : `⑦ 成片 · ${structBits.join('→')}（开场·高潮·设定板·收束）`,
    x: originX,
    y: videoY,
    width: 820,
    height: 300,
    color: '#3b82f6',
  });

  return { nodes, edges, groups };
}


export function mergeScriptLayoutIntoGraph(
  base: WorkflowDocument | null | undefined,
  fragment: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; groups: WorkflowGroup[] },
): WorkflowDocument {
  const doc = migrateGraphV1ToDocument(base);
  const kind = String(doc.meta?.kind || '');
  const replaceAll =
    kind === 'shot_library_entry' ||
    kind === 'shot_script' ||
    kind === 'script_gen' ||
    (doc.groups || []).some((g) =>
      /^② 故事|^② 镜头|^② 镜|^② 定妆|^③a |^③b |^③ 场景|^③ 镜|^③ 成片|^③′ 关键帧|^④ 场景|^④ 关键帧|^⑤ 剧情|^⑤ 成片|^⑥ |^⑦ 成片|^废案|^② 成片/.test(
        String(g.title || ''),
      ),
    ) ||
    (doc.nodes || []).some((n) =>
      /^镜头\s*\d+|^镜\d+|定妆|设定板|故事剧情|剧情宫格|场景提示词|关键帧[·・]/.test(
        String(n.label || ''),
      ),
    );

  if (replaceAll) {
    return {
      schemaVersion: 2,
      nodes: [...fragment.nodes],
      edges: [...fragment.edges],
      groups: [...fragment.groups],
      viewport: doc.viewport,
      meta: {
        ...(doc.meta || {}),
        kind: kind || 'shot_library_entry',
        scriptLayout: 'libtv_sheet_plot_triple_keyframe_video',
      },
    };
  }

  const cleaned = stripPreviousScriptLayout(doc);
  return {
    schemaVersion: 2,
    nodes: [...(cleaned.nodes || []), ...fragment.nodes],
    edges: [...(cleaned.edges || []), ...fragment.edges],
    groups: [...(cleaned.groups || []), ...fragment.groups],
    viewport: cleaned.viewport,
    meta: {
      ...(cleaned.meta || {}),
      scriptLayout: 'libtv_sheet_plot_triple_keyframe_video',
    },
  };
}

export const SCRIPT_GEN_SYSTEM = `你是漫剧分镜编剧。请根据用户给出的剧情/镜头概念/角色/画风族，输出可直接用于漫剧制作的分镜脚本。
要求：
1. 用中文；
2. 画风按用户指定的镜头库画风族落地（如国风东方、奇幻暗黑怪异、二次元动漫等），子风格（水墨/岩彩等）只作色板与特效；仅二次元族才写动画开脸；禁止真人、禁止照片级皮肤、禁止 live-action、禁止无依据默认赛璐璐；
3. 先输出「设定头」（必须有，且独占行）：
【角色】角色名A：密集外形锚点（身份+脸/发/装/标志色/专武，约 40～80 字，动漫语汇，要对齐后续定妆）；角色名B：…（用中文分号分隔）
【剧情】用 1～2 句概括整段故事起承转合
【总时长】约 N 秒（N 为用户指定的成片时长，通常是 10 或 15）
画风：{画风族}·{子风格} + 一句材质/光色/氛围（例：国风东方·水墨，墨分五色飞白作剑气）
4. 再拆成 3～6 个镜头（每个镜头会各自生成一张关键帧图；整段只合成一条视频）：
镜号N｜景别｜画面描述｜运镜｜对白/旁白｜时长Xs
画面描述必须具体到可单独出一张完整电影静帧（景别+主体动作+可见结果+光色）；禁止写成漫画分格/多格展示板；各镜时长之和接近总时长
5. 角色外形在【角色】里写透，各镜不要改脸换装；前后镜构图/动作要能衔接；
6. 若来自镜头库概念，保留其运镜/特效重点并扩写成完整分镜；
7. 不要输出 Markdown 代码块；不要写「4K60帧观感」「IMAX」等展示参数词。`;
