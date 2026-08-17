/** 章节视觉：定妆 / 分镜 / 图生视频 提示词组装（中文） */

export type VisualCharacterInput = {
  id: string;
  name: string;
  description?: string;
  consistencyPrompt?: string;
  meta?: Record<string, unknown>;
  hasRefImage?: boolean;
};

export type FrameRole = 'start' | 'end';

const NEGATIVE_ZH =
  '禁止水印、UI、字幕条、Logo、边框、拼贴、分屏、漫画分格、四格/多格连页、画中画、九宫格、拼图、联系表 contact sheet、角色设定展示板、三视图拼贴、故事板网格、缩略图拼版、乱码文字';

/** 角色设定板专用负向：允许概念设定拼版；默认日常写实/国漫，禁止网红写真与欧美次世代堆料 */
const PORTRAIT_SHEET_NEGATIVE_ZH =
  '禁止水印、浏览器 UI、字幕条、乱码文字、漫画叙事分格连页、四格故事板、剧情九宫格分镜页、单人生活照占满整图、真人网红棚拍、live-action 照片、毛孔级精模皮肤、Unreal Engine 次世代写实堆料、欧美暗黑奇幻默认皮肤、Q版大头、chibi、身体重复、缺肢多指';

/**
 * 全身比例硬锁。模型在「背带裤/清纯/大眼」等词下极易画成幼童头身比，默认按成年纠正；
 * 仅当文案明确儿童/少年时放宽。
 */
export function buildCharacterProportionLock(opts?: { ageHint?: string }): string {
  const hint = String(opts?.ageHint || '');
  const isChild =
    /幼童|小孩|儿童|孩童|小学生|幼儿|婴儿|toddler|\bchild\b|\bkid\b|萝莉体型|正太体型|孩形/.test(
      hint,
    );
  const isTeen =
    !isChild &&
    /少年|少女|中学生|高中生|teenager|\bteen\b|青涩少年|青涩少女/.test(hint);
  if (isChild) {
    return [
      '【体型硬锁】按儿童年龄塑造：约 5～6 头身，四肢偏短、头略大，符合孩童比例；禁止画成成年模特。',
    ].join('');
  }
  if (isTeen) {
    return [
      '【体型硬锁】青少年体型：约 6.5～7.5 头身，修长自然；禁止 Q 版大头、禁止小学生幼童比例、禁止五头身以下。',
      '主立绘与转面视图：脚踩底边、头顶留小边，全身高度占满立绘区，勿缩成小矮人。',
    ].join('');
  }
  return [
    '【体型硬锁】默认成年角色（adult）：全身约 7.5～8 头身，肩胯腿长比例正常，头相对身体不可过大。',
    '禁止幼童比例、禁止 Q 版/SD 大头、禁止五～六头身、禁止短腿小矮人、禁止把青年画成小学生体型。',
    '主立绘与转面视图：脚踩底边、头顶留小边，立绘高度占满模块，各角度同身高比例。',
  ].join('');
}

/** 画布 / 定妆：对标工业国漫角色设定集（大头档案+三视图+表情+服装细节+说明） */
export function buildCharacterSheetLayoutLock(opts?: { ageHint?: string }): string {
  return [
    'Chinese manhua character design document sheet, landscape 16:9, clean light-gray modular UI layout with thin section dividers, bilingual CN/EN micro labels, industrial character bible (like pro 国漫定妆集), illustration not photoreal photo.',
    '【画风硬锁】日常写实或国漫半写实插画：清晰五官与服装层次、柔和影棚光、布料纹理可读；禁止真人照片、禁止网红棚拍、禁止欧美 UE5/PBR 次世代堆料皮肤。',
    '【布局硬锁】必须严格按以下五区排版（同一角色、同一套服装配色贯穿全板），禁止整张只有一个姿势的生活照，禁止剧情分镜页：',
    '① 左上【角色档案】大头肩肖像（hero bust，五官发丝清晰）+ 旁侧短档案：姓名 / 年龄或年龄感 / 身高气质 / 身份 / 性格关键词（字少清晰，可中英对照，禁止大段乱码）。',
    '② 右上【三视图 THREE VIEW】全身 Front、Side、Back 一排，站姿中性、orthographic 感、光照一致，脚踩底边，可有 Front/Side/Back 小标签。',
    '③ 右中【表情设定 EXPRESSION SHEET】同一张脸 6～8 个小格：多角度（正/3/4/侧）与微表情变化，格线整齐。',
    '④ 左下【服装设定 COSTUME DESIGN】一张完整全身立绘 + 旁侧 4～6 个方形细节格（面料毛边、腰带挂件、靴履绑腿、饰品等局部特写）。',
    '⑤ 右下【角色设定】短气质文案区（一两句即可）+ 极淡氛围底纹（水墨/场景剪影可有，勿抢主体）。',
    '整体：专业模块化 UI、信息密集但不糊成一团；英文分区标题如 THREE VIEW / EXPRESSION SHEET / COSTUME DESIGN 可保留。',
    buildCharacterProportionLock(opts),
    PORTRAIT_SHEET_NEGATIVE_ZH,
  ].join(' ');
}

export function buildCharacterSheetNegative(): string {
  // 仅中文「禁止…」表述；勿用 loli/kid/toddler 等英文词（并入 prompt 时会被方舟文本审核拦截）
  return [
    '禁止水印、浏览器 UI、字幕条、乱码文字',
    '禁止漫画叙事分格连页、四格故事板、剧情九宫格分镜页',
    '禁止单人生活照占满整图、禁止真人照片与网红棚拍',
    '禁止毛孔级精模皮肤、禁止 Unreal Engine 次世代写实堆料',
    '禁止 Q 版大头、禁止短腿小矮人比例、禁止五官畸形与多指',
  ].join('；');
}

/** 分镜首尾帧：必须单帧成片，禁止漫画页拼贴 */
const STORYBOARD_SINGLE_FRAME_ZH = [
  '硬约束·构图：输出必须是一张完整的 16:9 电影静帧，单一连续空间与时间瞬间。',
  '严禁漫画分格、多格拼贴、上下/左右分屏、画中画、连环画页、故事板网格、缩略图拼版、多角度拼在同一张图、角色设定展示板、三视图拼贴。',
  '不要做成「一张图里排多个小格的漫画风格展示图」。',
  '参考图只用于锁定角色身份与场景环境，禁止把多张参考图并排或叠放进成图。',
].join('');

/** 定妆参考为设定板时：锁脸锁装，禁止把整板复制进关键帧 */
const CHARACTER_SHEET_REF_LOCK_ZH = [
  '硬约束·定妆参考：参考图为国漫工业角色设定板（含大头档案、三视图、表情格、服装细节）。',
  '以左上大头肖像与表情设定锁定五官、发色与妆面；以三视图与服装细节格锁定服装、配色、体型、靴履与挂件。',
  '禁止把设定板整板、多模块拼贴或角标文字复制进成图；输出仍是单一电影静帧里的演戏角色。',
].join('');

/** 宫格出图硬锁（显式选择 N 宫格时使用） */
export function buildImageGridLayoutLock(rows: number, cols: number): string {
  const r = Math.max(1, Math.floor(rows) || 1);
  const c = Math.max(1, Math.floor(cols) || 1);
  const cells = r * c;
  if (cells <= 1) return '';
  return [
    `【宫格硬锁】输出必须是严格 ${r}×${c}=${cells} 等分宫格的一张完整方图（equal grid storyboard），格子大小一致、细线分隔。`,
    '阅读顺序：左→右、上→下；每格左上角可有极小角标编号 1…N（可读即可，勿大字幕）。',
    '每格必须是单一时空瞬间；相邻格须有景别或机位或动作差异（特写/中景/全景轮换），禁止九格同构图。',
    '全图统一画风、同一批角色身份与服装锚点；禁止额外边框 UI、禁止把多张独立照片乱拼。',
  ].join('');
}

export function buildImageGridNegative(rows: number, cols: number): string {
  const cells = Math.max(1, Math.floor(rows) || 1) * Math.max(1, Math.floor(cols) || 1);
  if (cells <= 1) {
    return '禁止漫画分格、多格拼贴、故事板网格、画中画、角色设定展示板、三视图拼贴';
  }
  return '禁止水印、UI、字幕条、Logo、不规则拼贴、重叠格线、真人照片与毛孔级精模皮肤';
}

/** 图生视频：防止把画面描写念成台词 */
const VIDEO_SILENCE_RULES_ZH = [
  '硬约束·声音与口型：默认无对白、无旁白念白、无内心独白出声；角色闭嘴或自然呼吸，禁止对口型念出节拍/画面描述。',
  '节拍与画面描述仅为视觉动作、特效与运镜指引（如「灵力如火花流遍四肢」= 看见光点沿四肢游走的特效），绝不是台词，禁止朗读、嘴型同步或字幕烧录。',
  '仅当下方明确给出「可说出口的短对白」时，才允许极短开口；否则全程静默表演。',
].join('');

const ASPECT_16_9 = '画面比例 16:9 横版电影构图';

/** 过滤成「可说出口」的短对白；文学描写/特效句一律丢弃 */
function spokenDialogueOnly(...chunks: Array<string | undefined>) {
  const text = chunks
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' / ');
  if (!text) return '';
  // 典型「展示/特效描写」：含比喻、流遍、弥漫、如…等，不当台词
  if (
    /如|仿佛|好似|流遍|弥漫|绽放|涌动|闪烁|光晕|特效|画面|镜头|运镜|特写|全景/.test(text) &&
    text.length > 16
  ) {
    return '';
  }
  // 过长叙述不当口播
  if (text.length > 36) return '';
  return text;
}

export type VisualSceneInput = {
  id?: string;
  name?: string;
  description?: string;
  consistencyPrompt?: string;
  hasRefImage?: boolean;
};

function metaStr(meta: Record<string, unknown> | undefined, key: string) {
  const v = meta?.[key];
  return typeof v === 'string' ? v.trim() : '';
}

function appearanceBits(meta?: Record<string, unknown>) {
  const appearance = (meta?.appearance || {}) as Record<string, unknown>;
  return ['morphology', 'face', 'body', 'costume', 'colors', 'marks']
    .map((k) => String(appearance[k] || '').trim())
    .filter(Boolean)
    .join('；');
}

function imagePromptOf(meta?: Record<string, unknown>) {
  return metaStr(meta, 'imagePromptZh') || metaStr(meta, 'imagePromptEn');
}

export function buildPortraitPrompt(opts: {
  styleBrief?: string;
  projectTitle?: string;
  projectDescription?: string;
  character: VisualCharacterInput;
}): string {
  const c = opts.character;
  const meta = c.meta || {};
  const consistency = String(c.consistencyPrompt || '').trim();
  const look = appearanceBits(meta);
  const role = metaStr(meta, 'role');
  const camp = metaStr(meta, 'camp');
  const occupation = metaStr(meta, 'occupation');
  const story = String(opts.projectDescription || '').trim().slice(0, 480);
  const title = String(opts.projectTitle || '').trim();
  const identityBits = [
    role ? `剧情身份=${role}` : '',
    camp ? `阵营=${camp}` : '',
    occupation ? `职务/社会身份=${occupation}` : '',
  ].filter(Boolean);
  const identityLine = identityBits.length
    ? `必须在造型气质上体现：${identityBits.join('；')}（例如主角偏坚定正派气场，对手/反派偏压迫感或阴鸷，配角按身份区分层次）。`
    : '';
  const ageHint = [
    c.name,
    c.description,
    consistency,
    look,
    imagePromptOf(meta),
    role,
    occupation,
    metaStr(meta, 'age'),
    metaStr(meta, 'ageRange'),
  ]
    .filter(Boolean)
    .join(' ');
  const parts = [
    buildCharacterSheetLayoutLock({ ageHint }),
    title ? `作品出自网文小说《${title}》。` : '',
    story ? `故事背景（服装、时代、气质需与小说一致）：${story}` : '',
    opts.styleBrief ? `画风锁定：${opts.styleBrief}。` : '',
    `角色：${c.name}。`,
    identityLine,
    imagePromptOf(meta) || '',
    consistency ? `身份锁定：${consistency}。` : '',
    look ? `外形：${look}。` : '',
    c.description ? `人物简介：${c.description}` : '',
  ];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** 章级剧情宫格板（9/16/25…）：锁叙事节奏，不用于图生视频首帧 */
export function buildChapterPlotGridPrompt(opts: {
  styleBrief?: string;
  projectTitle?: string;
  chapterTitle?: string;
  rows: number;
  cols: number;
  cellTexts: string[];
  continuityHint?: string;
  characterNames?: string[];
}): string {
  const rows = Math.max(1, Math.floor(opts.rows) || 1);
  const cols = Math.max(1, Math.floor(opts.cols) || 1);
  const lock = buildImageGridLayoutLock(rows, cols);
  const cells = opts.cellTexts
    .map((t, i) => `格${i + 1}：${String(t || '').trim()}`)
    .filter((line) => /：.+/.test(line));
  const parts = [
    lock,
    '本章剧情分镜总览板（plot storyboard poster），供导演审阅叙事节奏；统一画风与角色身份。',
    opts.projectTitle ? `小说《${opts.projectTitle}》。` : '',
    opts.chapterTitle ? `章节《${opts.chapterTitle}》。` : '',
    opts.styleBrief ? `画风锁定：${opts.styleBrief}。` : '',
    opts.characterNames?.length
      ? `出场角色须可识别：${opts.characterNames.join('、')}（对齐定妆设定板脸与服装）。`
      : '',
    opts.continuityHint
      ? `第 1 格必须承接：${opts.continuityHint}`
      : '',
    '各格内容（严格按编号填入对应格子）：',
    cells.join('\n'),
    '禁止长字幕剧本、禁止真人写真皮肤；允许等分宫格与小角标。',
  ];
  return parts.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 章节场景环境参考图（16:9，少角色） */
export function buildScenePrompt(opts: {
  styleBrief?: string;
  projectTitle?: string;
  chapterTitle?: string;
  scene: {
    name?: string;
    description?: string;
    consistencyPrompt?: string;
    meta?: Record<string, unknown>;
  };
}): string {
  const s = opts.scene;
  const meta = s.meta || {};
  const placeType = metaStr(meta, 'placeType') || metaStr(meta, 'type') || metaStr(meta, 'category');
  const mood = metaStr(meta, 'mood') || metaStr(meta, 'atmosphere');
  const timeOfDay = metaStr(meta, 'timeOfDay') || metaStr(meta, 'time');
  const sceneTagBits = [
    placeType ? `场所类型=${placeType}` : '',
    timeOfDay ? `时段=${timeOfDay}` : '',
    mood ? `氛围=${mood}` : '',
  ].filter(Boolean);
  const parts = [
    '横版 16:9 场景环境参考图，空镜或极少量远处人影，突出地点、建筑、陈设、光影与氛围，供后续分镜锁定场景一致性。',
    ASPECT_16_9 + '。',
    opts.projectTitle ? `小说《${opts.projectTitle}》。` : '',
    opts.chapterTitle ? `章节《${opts.chapterTitle}》。` : '',
    opts.styleBrief ? `画风锁定：${opts.styleBrief}。` : '',
    s.name ? `场景定位：${s.name}（须一眼可识别为该地点，后续分镜复用同一环境）。` : '',
    sceneTagBits.length ? `场景属性：${sceneTagBits.join('；')}。` : '',
    s.description ? `场景描述：${s.description}。` : '',
    s.consistencyPrompt ? `场景一致性锁定：${s.consistencyPrompt}。` : '',
    '不要大特写人物脸；不要字幕水印。',
    NEGATIVE_ZH,
  ];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function buildStoryboardPrompt(opts: {
  styleBrief?: string;
  projectTitle?: string;
  /** 本镜首帧 / 尾帧（时长由用户成片时自选） */
  frameRole?: FrameRole;
  shot: {
    title?: string;
    description?: string;
    camera?: string;
    dialogue?: string;
    narration?: string;
  };
  characters: VisualCharacterInput[];
  scene?: VisualSceneInput;
  /** 本镜全部场景（多场景时逐条锁定） */
  scenes?: VisualSceneInput[];
  continuityHint?: string;
}): string {
  const cast = opts.characters
    .map((c) => {
      const look = appearanceBits(c.meta);
      const role = metaStr(c.meta, 'role');
      const camp = metaStr(c.meta, 'camp');
      const occupation = metaStr(c.meta, 'occupation');
      const identity = [role, camp, occupation].filter(Boolean).join(' / ');
      const bits = [
        `「${c.name}」`,
        identity ? `剧情身份：${identity}` : '',
        c.hasRefImage
          ? '必须与已定妆设定板身份完全一致（脸、发型、服装、体型、配色；设定板含主立绘+三视图+细节）'
          : '暂无定妆图——仍须保持造型自洽、前后一致',
        String(c.consistencyPrompt || '').trim(),
        imagePromptOf(c.meta),
        look ? `外形：${look}` : '',
        String(c.description || '').trim().slice(0, 160),
      ].filter(Boolean);
      return bits.join(' · ');
    })
    .filter(Boolean)
    .join('\n');

  const role = opts.frameRole;
  const roleHint =
    role === 'start'
      ? '本镜开场关键帧：一张完整电影静帧，确立场景、角色姿态、光影与构图，作为镜内动作起点。'
      : role === 'end'
        ? '本镜收束关键帧：一张完整电影静帧落点姿态，须与同一镜首帧身份完全一致。'
        : '叙事镜头的一张完整电影静帧。';

  const sceneList = [
    ...(Array.isArray(opts.scenes) ? opts.scenes : []),
    ...(opts.scene ? [opts.scene] : []),
  ].filter((s, i, arr) => {
    const key = String(s.id || s.name || i);
    return arr.findIndex((x) => String(x.id || x.name || '') === key) === i;
  });

  const sceneLock = sceneList.length
    ? sceneList
        .map((scene, i) => {
          const bits = [
            scene.name ? `「${scene.name}」` : `场景${i + 1}`,
            scene.hasRefImage
              ? '必须严格匹配已提供的场景参考图：同一地点、建筑结构、陈设布局、主色与光影氛围，禁止换景重画'
              : '',
            String(scene.consistencyPrompt || '').trim(),
            String(scene.description || '').trim(),
          ].filter(Boolean);
          return bits.join(' · ');
        })
        .join('\n')
    : '';

  const hasSheetRef = opts.characters.some((c) => c.hasRefImage);
  const parts = [
    '中国网文漫剧电影感分镜静帧，单镜连贯画面；画风跟项目锁定（国漫/少年漫/插画等，勿无依据改成真人网红脸）。',
    ASPECT_16_9 + '。',
    STORYBOARD_SINGLE_FRAME_ZH,
    hasSheetRef ? CHARACTER_SHEET_REF_LOCK_ZH : '',
    roleHint,
    '硬约束：画面中每个角色必须严格遵循已锁定的定妆身份——同一张脸、发型、服装、配饰、体型与配色，禁止重新设计角色。',
    sceneLock
      ? `硬约束·场景：环境必须与下列场景锁定一致（有场景参考图时以图为准，不得另起炉灶）。\n${sceneLock}`
      : '',
    opts.continuityHint ? `镜间连续：${opts.continuityHint}` : '',
    opts.projectTitle ? `小说《${opts.projectTitle}》。` : '',
    opts.styleBrief ? `画风锁定：${opts.styleBrief}。` : '',
    opts.shot.title ? `镜头：${opts.shot.title}。` : '',
    opts.shot.description
      ? `本镜完整动作（提取${role === 'end' ? '收束' : '开场'}瞬间，只画这一瞬间，不要把整段节拍画成多格）：${opts.shot.description}。`
      : '',
    opts.shot.camera ? `机位：${opts.shot.camera}。` : '',
    (() => {
      const spoken = spokenDialogueOnly(opts.shot.dialogue);
      return spoken
        ? `可说出口的短对白（可选）：${spoken}。其余描写勿写成说话。`
        : '本帧无对白：角色闭嘴，勿张嘴念白。';
    })(),
    opts.shot.narration
      ? `旁白仅作氛围（禁止烧录字幕、禁止角色念出）：${String(opts.shot.narration).trim().slice(0, 80)}。`
      : '',
    cast ? `角色锁定：\n${cast}` : '',
    NEGATIVE_ZH,
  ];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** 单镜成片：首帧→尾帧（时长由用户成片时自选，提示词不写死秒数） */
export function buildChapterVideoPrompt(opts: {
  styleBrief?: string;
  projectTitle?: string;
  chapterTitle?: string;
  durationSec?: number;
  start: {
    title?: string;
    description?: string;
    camera?: string;
    dialogue?: string;
    narration?: string;
  };
  end: {
    title?: string;
    description?: string;
    camera?: string;
    dialogue?: string;
    narration?: string;
  };
  /** 镜内节拍（阶段名优先，勿依赖秒数） */
  beats?: Array<{
    title?: string;
    description?: string;
    camera?: string;
    dialogue?: string;
    narration?: string;
    durationSec?: number;
  }>;
  characters?: VisualCharacterInput[];
}): string {
  const cast = (opts.characters || [])
    .map((c) => {
      const look = appearanceBits(c.meta);
      const bits = [
        `「${c.name}」`,
        '必须与首尾帧及已定妆参考保持同一张脸、发型、服装、体型与配色',
        String(c.consistencyPrompt || '').trim(),
        imagePromptOf(c.meta),
        look ? `外形：${look}` : '',
        String(c.description || '').trim().slice(0, 120),
      ].filter(Boolean);
      return bits.join(' · ');
    })
    .filter(Boolean)
    .join('\n');

  const beatLines = (opts.beats || [])
    .map((b, i) => {
      const phase = String(b.title || '').trim() || `节拍 ${i + 1}`;
      return [
        `${i + 1}. ${phase}：`,
        b.description || '',
        b.camera ? `机位：${b.camera}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    })
    .filter(Boolean)
    .join('\n');

  const spoken = spokenDialogueOnly(
    opts.start.dialogue,
    opts.end.dialogue,
    ...(opts.beats || []).map((b) => b.dialogue),
  );
  const moodOnly = [opts.start.narration, opts.end.narration]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' / ')
    .slice(0, 100);

  const portraits = (opts.characters || []).filter((c) => c.hasRefImage);
  const portraitHint = portraits.length
    ? portraits
        .map((c, i) => `${refImageLabel(3 + i)}=定妆·${c.name}`)
        .join('；')
    : '';
  const refLine = [
    '【参考图】图一=本镜首帧；图二=本镜尾帧；图三=场景参考图',
    portraitHint ? `；${portraitHint}` : '',
    '。',
  ].join('');

  const parts = [
    refLine,
    `一段连续电影感镜头：从【图一·首帧】画面自然过渡到【图二·尾帧】画面；环境、地点、陈设与光影须对齐【图三·场景图】（有场景图时禁止换景）${
      portraits.length
        ? `；出场角色脸/发型/服装须分别对齐【${portraits
            .map((c, i) => `${refImageLabel(3 + i)}·${c.name}`)
            .join('、')}】定妆图`
        : ''
    }。成片时长由工具另选，此处禁止写死秒数。`,
    ASPECT_16_9 + '。',
    VIDEO_SILENCE_RULES_ZH,
    '动作与运镜平滑连贯；禁止跳切；禁止改脸、换装或重塑角色。',
    opts.projectTitle ? `小说《${opts.projectTitle}》。` : '',
    opts.chapterTitle ? `章节《${opts.chapterTitle}》。` : '',
    opts.styleBrief ? `画风锁定：${opts.styleBrief}。` : '',
    beatLines
      ? `镜内【纯视觉】动作（按【起势→加速→交锋/推进→高潮→收束】推进，下列文字禁止念出）：\n${beatLines}`
      : '',
    opts.start.description ? `开场瞬间（只演不说·对齐图一）：${opts.start.description}。` : '',
    opts.end.description ? `收束瞬间（只演不说·对齐图二）：${opts.end.description}。` : '',
    [opts.start.camera, opts.end.camera].filter(Boolean).length
      ? `机位：由「${opts.start.camera || '开场构图'}」过渡到「${opts.end.camera || '收束构图'}」。`
      : '',
    spoken
      ? `可说出口的短对白（仅此一句可开口，勿加戏）：${spoken}。`
      : '本镜无可说对白：全程静默，禁止任何念白与夸张口型。',
    moodOnly ? `氛围参考（禁止念白/字幕）：${moodOnly}。` : '',
    cast ? `角色锁定：\n${cast}` : '',
    `${NEGATIVE_ZH}；禁止角色朗读提示词、禁止烧录字幕、禁止旁白口播画面描写。`,
  ];
  return parts.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 成片/复制提示词硬上限：必须严格小于 4000 字（由 AI 生成时遵守，禁止事后硬截断半句） */
export const VIDEO_PROMPT_MAX_CHARS = 3999;

/** 各视频模型提示词实际上限（按厂商硬截断前尽量智能压缩） */
export function videoPromptMaxCharsForModel(model?: string): number {
  const m = String(model || '').trim();
  if (/^kling/i.test(m)) return 480;
  if (/^veo/i.test(m)) return 3800;
  if (/volc|doubao|seedance/i.test(m)) return 1900;
  if (/bailian|dashscope|wanx/i.test(m)) return 1900;
  if (/^sora|^luma|^minimax|^pixverse|^runway|^pika|^higgsfield|Wan-AI|I2V|T2V/i.test(m))
    return 1900;
  return VIDEO_PROMPT_MAX_CHARS;
}

/**
 * 按上限智能压缩图生视频提示词：优先保留基础设置 / 正向画风人物场景 / 半秒动作行，
 * 避免厂商 .slice 砍掉高潮与画风。（暂不保留负向段；去掉 4K60/IMAX 展示词）
 */
export function compressVideoPromptForLimit(text: string, maxChars: number): string {
  const max = Math.max(200, Math.floor(Number(maxChars) || VIDEO_PROMPT_MAX_CHARS));
  let t = normalizePromptText(text);
  if (!t) return '';
  t = t
    .replace(/\n?【负向提示词】[\s\S]*?(?=\n【|$)/g, '')
    .replace(/^负向[：:][^\n]*\n?/gm, '')
    .replace(/4K\s*60\s*帧(?:观感)?/gi, '')
    .replace(/IMAX级?冲击构图/gi, '')
    .replace(/HDR体积光/gi, '')
    .replace(/AI电影级运镜系统驱动/g, '')
    .replace(/成片参数硬锁[：:][^\n]*/g, '')
    .trim();
  if (t.length <= max) return t;

  const take = (re: RegExp) => {
    const m = t.match(re);
    return m ? String(m[0]).trim() : '';
  };
  const setup = take(/基础设置[：:][^\n]*/);
  // 正向段：从「正向 Prompt」到第一个半秒行之前
  const positive = take(
    /正向\s*Prompt[\s\S]*?(?=\n\s*\d+(?:\.\d+)?\s*s\s*[：:]|$)/i,
  );
  // 半秒行
  const tickLines = t
    .split(/\n+/)
    .map((x) => x.trim())
    .filter((ln) => /^\d+(?:\.\d+)?\s*s\s*[：:]/.test(ln));
  let ticks = tickLines.join('\n');
  if (ticks.length > Math.floor(max * 0.7)) {
    ticks = tickLines
      .map((ln) => (ln.length > 120 ? `${ln.slice(0, 117)}…` : ln))
      .join('\n');
  }

  // 兼容旧壳
  const must = take(/【成片必达[\s\S]*?(?=\n【(?:整体参数|风格气质|人物|参考图|节拍|负向)|$)/);
  const style = take(/【风格气质】[\s\S]*?(?=\n【(?:人物|参考图|节拍|负向)|$)/);
  const beatsOld = take(/【节拍(?:时间轴|推进)】[\s\S]*?(?=\n【负向|$)/);

  const pack = (...parts: string[]) =>
    parts.filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();

  const candidates = [
    pack(setup, positive, ticks),
    pack(setup, ticks),
    pack(positive, ticks),
    pack(must, style, ticks || beatsOld),
    pack(setup, ticks.slice(0, Math.floor(max * 0.85))),
    must || t.slice(0, max),
  ];
  for (const c of candidates) {
    if (c && c.length <= max) return c;
  }
  const head = pack(setup, positive, ticks) || t;
  if (head.length <= max) return head;
  const slice = head.slice(0, max);
  const cutMarks = ['。', '；', '！', '\n', '，'];
  let best = -1;
  for (const m of cutMarks) {
    const i = slice.lastIndexOf(m);
    if (i > max * 0.7 && i > best) best = i;
  }
  return (best > 0 ? slice.slice(0, best + 1) : slice).trim();
}

/** 归一化提示词：拆 JSON 壳、还原字面量 \\n，避免展示/复制异常 */
export function normalizePromptText(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';
  if (t.startsWith('{') && /"(?:videoPrompt|prompt|portraitPrompt|imagePrompt|成片提示词)"\s*:/.test(t)) {
    try {
      const obj = JSON.parse(t);
      const inner = String(
        obj?.videoPrompt ||
          obj?.prompt ||
          obj?.portraitPrompt ||
          obj?.imagePrompt ||
          obj?.成片提示词 ||
          '',
      ).trim();
      if (inner) t = inner;
    } catch {
      /* keep */
    }
  }
  t = t.replace(/^```(?:json|text|markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
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

/** 去掉提示词正文里的时钟秒数（时长由成片工具自选）；保留动作句；兼容豆包「0.0s：」行 */
export function stripClockDurationFromPrompt(text: string): string {
  return String(text || '')
    .replace(/【节拍时间轴】/g, '【节拍推进】')
    // 基础设置里的「10 秒，」→ 去掉秒数，保留其余
    .replace(/基础设置[：:]\s*\d+\s*秒\s*[，,、]?\s*/g, '基础设置：')
    // 0.0s：动作… → 动作…（保留半秒行内容）
    .replace(/^\s*\d+(?:\.\d+)?\s*s\s*[：:]\s*/gim, '')
    // 【第0秒 · 起势】/【0.5s · 起势】/【0s · 起势】→【起势】
    .replace(
      /【\s*(?:第)?\s*\d+(?:\.\d+)?\s*(?:s|秒)\s*[·・.\s]+([^】]+)】/gi,
      '【$1】',
    )
    // 【0-2s · 起势】→【起势】；【0-2s】→【节拍】
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
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const REF_ORDINALS = [
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
] as const;

/** 图一、图二…（0-based） */
export function refImageLabel(index0: number): string {
  const n = REF_ORDINALS[index0];
  return n ? `图${n}` : `图${index0 + 1}`;
}

/** 上传顺序说明：图一首帧、图二尾帧、图三场景、图四起定妆 */
export function buildShotRefImageLegend(opts: {
  sceneNames?: string[];
  /** 有定妆图的出场角色，按顺序对应图四、图五… */
  portraitCharacters?: Array<{ name: string }>;
}): string {
  const sceneBit = (opts.sceneNames || []).filter(Boolean).join('、');
  const lines = [
    `${refImageLabel(0)}=本镜首帧`,
    `${refImageLabel(1)}=本镜尾帧`,
    `${refImageLabel(2)}=场景参考图${sceneBit ? `（${sceneBit}）` : ''}`,
  ];
  (opts.portraitCharacters || []).forEach((c, i) => {
    const name = String(c.name || '').trim() || `角色${i + 1}`;
    lines.push(`${refImageLabel(3 + i)}=定妆·${name}`);
  });
  return `${lines.join('；')}。`;
}

/** @deprecated 单镜短视频提示；请用 buildChapterVideoPrompt */
export function buildVideoMotionPrompt(opts: {
  styleBrief?: string;
  projectTitle?: string;
  shot: {
    title?: string;
    description?: string;
    camera?: string;
    dialogue?: string;
    narration?: string;
  };
  characters?: VisualCharacterInput[];
}): string {
  return buildChapterVideoPrompt({
    styleBrief: opts.styleBrief,
    projectTitle: opts.projectTitle,
    durationSec: 15,
    start: opts.shot,
    end: opts.shot,
    beats: [opts.shot],
    characters: opts.characters,
  });
}

/** 默认交给 AI 按章自拆叙事镜；override 时固定 2～12 */
export function estimateShotCount(_wordCount: number, override?: number) {
  if (typeof override === 'number' && override >= 2 && override <= 12) return Math.round(override);
  return 0;
}

function charBlockZh(c: VisualCharacterInput) {
  const meta = c.meta || {};
  const look = appearanceBits(meta);
  const lines = [
    `- ${c.name}`,
    metaStr(meta, 'role') ? `  身份/角色：${metaStr(meta, 'role')}` : '',
    metaStr(meta, 'camp') ? `  阵营：${metaStr(meta, 'camp')}` : '',
    metaStr(meta, 'occupation') ? `  职业：${metaStr(meta, 'occupation')}` : '',
    String(c.description || '').trim() ? `  简介：${String(c.description).trim()}` : '',
    String(c.consistencyPrompt || '').trim()
      ? `  一致性锁定：${String(c.consistencyPrompt).trim()}`
      : '',
    look ? `  外形：${look}` : '',
    imagePromptOf(meta) ? `  定妆提示：${imagePromptOf(meta)}` : '',
    `  定妆参考图：${c.hasRefImage ? '已有，出图必须严格一致' : '暂无'}`,
  ];
  return lines.filter(Boolean).join('\n');
}

function frameBlockZh(
  label: string,
  shot?: {
    title?: string;
    description?: string;
    camera?: string;
    dialogue?: string;
    narration?: string;
  },
) {
  if (!shot) return `【${label}】（尚未生成分镜，请根据正文自行设计强可视关键帧）`;
  return [
    `【${label}】${shot.title ? ` ${shot.title}` : ''}`,
    shot.description ? `画面：${shot.description}` : '',
    shot.camera ? `镜头：${shot.camera}` : '',
    shot.dialogue ? `对白：${shot.dialogue}` : '',
    shot.narration ? `旁白：${shot.narration}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 供外部模型复用的章节视觉提示词（中文）。
 * 每镜：完整叙事 + 首/尾帧说明；成片时长由用户自选，正文不写死秒数。
 */
export function buildChapterVisualPromptCopy(opts: {
  projectTitle?: string;
  projectDescription?: string;
  styleBrief?: string;
  chapterTitle?: string;
  chapterCard?: Record<string, unknown>;
  synopsis?: string;
  novelBody?: string;
  characters: VisualCharacterInput[];
  shots?: Array<{
    title?: string;
    description?: string;
    camera?: string;
    dialogue?: string;
    narration?: string;
    durationSec?: number;
    orderIndex?: number;
    beats?: Array<{
      title?: string;
      description?: string;
      camera?: string;
      durationSec?: number;
    }>;
  }>;
}): string {
  const title = String(opts.projectTitle || '').trim() || '未命名作品';
  const chapterTitle = String(opts.chapterTitle || '').trim() || '未命名章节';
  const body = String(opts.novelBody || '').trim();
  const bodySlice = body.length > 8000 ? `${body.slice(0, 8000)}\n…（正文已截断）` : body;
  const card = opts.chapterCard || {};
  const cardLines = Object.entries(card)
    .map(([k, v]) => {
      const s = typeof v === 'string' ? v.trim() : v == null ? '' : JSON.stringify(v);
      return s ? `  ${k}：${s}` : '';
    })
    .filter(Boolean);

  const shots = opts.shots || [];

  const shotBlocks = shots.length
    ? shots
        .map((s, i) => {
          const beats = Array.isArray(s.beats) ? s.beats : [];
          const beatLines = beats.length
            ? beats
                .map((b, j) => {
                  const phase = String(b.title || '').trim() || `节拍 ${j + 1}`;
                  return [
                    `  - ${phase}`,
                    b.description ? `    画面：${b.description}` : '',
                    b.camera ? `    镜头：${b.camera}` : '',
                  ]
                    .filter(Boolean)
                    .join('\n');
                })
                .join('\n')
            : '';
          return [
            frameBlockZh(`镜头 ${i + 1}`, s),
            beatLines ? `  【镜内节拍】\n${beatLines}` : '',
            '  （出图：本镜首帧=开场瞬间；尾帧=收束瞬间；成片：本镜首→尾连续推进，时长自选）',
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n')
    : '【分镜】（尚未生成，请按正文拆成多个叙事镜头，每镜再拆镜内节拍；成片时长自选）';

  return [
    '======== 章节视觉提示词（可直接用于出图/图生视频）========',
    `作品：${title}`,
    opts.projectDescription ? `作品简介：${String(opts.projectDescription).trim().slice(0, 800)}` : '',
    opts.styleBrief ? `画风锁定：${String(opts.styleBrief).trim()}` : '',
    `画面比例：16:9 横版`,
    `章节：${chapterTitle}`,
    opts.synopsis ? `本章梗概：${String(opts.synopsis).trim()}` : '',
    cardLines.length ? `章卡：\n${cardLines.join('\n')}` : '',
    '',
    '【成片目标】',
    `本章拆成 ${shots.length || 'N'} 个叙事镜头；每一镜内部再拆节拍段（起势→加速→交锋/推进→高潮→收束）；各自生成首帧+尾帧，再图生视频成片（时长由工具自选，提示词勿写死秒数）。`,
    '硬约束：角色脸、发型、服装、体型、配色必须与已定妆参考完全一致；禁止换脸换装、禁止水印 UI、禁止拼贴分屏。',
    '',
    '【已定妆出场角色】',
    opts.characters.map(charBlockZh).join('\n') || '（暂无角色）',
    '',
    '【全部镜头（含镜内节拍）】',
    shotBlocks,
    '',
    '【单镜运动说明】',
    '对每一镜：按镜内节拍顺序从首帧推进到尾帧；机位、景别、角色走位/表情要自然过渡。',
    '节拍与画面描写是【纯视觉】指引（特效/动作），禁止念白、禁止对口型朗读描写句；旁白只作氛围，不要烧录字幕；仅明确短对白才可开口。',
    '',
    bodySlice ? `【本章正文（供理解情节，勿把全文画进画面）】\n${bodySlice}` : '【本章正文】（空）',
    '',
    `负面约束：${NEGATIVE_ZH}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .trim();
}
