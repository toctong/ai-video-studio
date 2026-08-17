/** 画布文本条：只产出结构化出图提示词 */

export type StudioTextPromptMode = 'character' | 'scene' | 'keyframe' | 'general';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export const STUDIO_TEXT_PROMPT_MODES: Array<{
  id: StudioTextPromptMode;
  label: string;
  placeholder: string;
  defaultLabel: string;
}> = [
  {
    id: 'general',
    label: '通用',
    placeholder: '描述想要的画面（主体、环境、光影、构图）…',
    defaultLabel: '出图提示词',
  },
  {
    id: 'character',
    label: '人物',
    placeholder: '描述角色外貌、服饰、表情与气质…',
    defaultLabel: '人物提示词',
  },
  {
    id: 'scene',
    label: '场景',
    placeholder: '描述空间、建筑、光影与氛围（空镜，不要人物特写）…',
    defaultLabel: '场景提示词',
  },
  {
    id: 'keyframe',
    label: '关键帧',
    placeholder: '描述这一瞬间的主体动作、环境与镜头感…',
    defaultLabel: '关键帧提示词',
  },
];

const COMMON_RULES = `
你是短剧/漫剧「出图提示词」助手。只输出可直接喂给文生图模型的中文提示词正文。

硬性禁止：
- 小说段落、故事梗概、分镜表、对白/旁白脚本
- 解释性前后缀（如「以下是提示词」「当然可以」）
- Markdown 代码块、标题井号、列表符号堆砌
- 负向提示词专节、英文标签墙、参数口号令（--ar 等）
- 画幅/比例相关字样（画布生图节点已单独设置）：勿写 9:16、16:9、1:1、竖版、横版、宽银幕、画幅比例、aspect 等

只输出提示词正文，不要其它废话。`.trim();

const MODE_SYSTEM: Record<StudioTextPromptMode, string> = {
  character: `${COMMON_RULES}

模式：人物定妆提示词。
必须按下面三段输出（段标题保留）：
【整体参数】半身定妆立绘；正面或 3/4 侧；干净背景；角色一致性优先；精细衣纹与五官。
【风格气质】画风/气质一句话（可跟用户意图）。
【主体】外貌、发型、服饰、配饰、表情、体态；勿写长篇剧情。
篇幅约 200–600 字。`,

  scene: `${COMMON_RULES}

模式：场景空镜提示词。
必须按下面三段输出（段标题保留）：
【整体参数】空镜场景；无主角特写；空间可读；光影明确。
【风格气质】画风/氛围一句话。
【空间】地点、建筑/自然结构、道具陈设、时段与光线、纵深层次。
篇幅约 200–600 字。`,

  keyframe: `${COMMON_RULES}

模式：关键帧单帧提示词。
必须包含（段标题保留）：
【整体参数】电影感单帧；单一连续空间与时间瞬间；严禁分格/拼贴/故事板网格。
【主体】人物外观与此刻动作/表情（可简短）。
【环境】场景与光影。
【瞬间】这一拍发生什么、镜头景别与气氛。
篇幅约 250–700 字。`,

  general: `${COMMON_RULES}

模式：通用单帧出图提示词。
用连贯中文描述：主体、环境、光影、构图、画风气质。
必须是一张完整单帧画面；严禁漫画分格、九宫格、拼贴、设定板多视图。
篇幅约 150–500 字。可按需使用【整体参数】【主体】【环境】小标题，但不强制。`,
};

export function studioTextPromptModeMeta(mode: StudioTextPromptMode) {
  return STUDIO_TEXT_PROMPT_MODES.find((m) => m.id === mode) || STUDIO_TEXT_PROMPT_MODES[0];
}

export function buildStudioTextGenMessages(
  mode: StudioTextPromptMode,
  userInput: string,
  refTexts: string[] = [],
  refImages: string[] = [],
): ChatMessage[] {
  const input = String(userInput || '').trim();
  const refs = (refTexts || []).map((t) => String(t || '').trim()).filter(Boolean);
  const imgs = (refImages || []).map((u) => String(u || '').trim()).filter(Boolean);
  const parts: string[] = [];
  if (refs.length) {
    parts.push('【参考文案】（仅作视觉意图参考，不要扩写成小说）');
    refs.forEach((t, i) => {
      parts.push(`参考${i + 1}：\n${t.slice(0, 1200)}`);
    });
  }
  if (imgs.length) {
    parts.push(
      '【参考图】（已连线到文本节点；请按画面主体、服饰、构图与风格来写提示词，勿编造与图无关的设定）',
    );
    imgs.forEach((u, i) => {
      parts.push(`参考图${i + 1}：${u.slice(0, 500)}`);
    });
  }
  parts.push(`【用户意图】\n${input}`);
  parts.push('请只输出符合模式的出图提示词正文；不要写任何画幅/比例（如 9:16、竖版、横版）。');
  return [
    { role: 'system', content: MODE_SYSTEM[mode] || MODE_SYSTEM.general },
    { role: 'user', content: parts.join('\n\n') },
  ];
}

/** 去掉围栏、废话前缀，以及画布已单独设置的比例用语 */
export function sanitizeStudioTextPrompt(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';
  t = t.replace(/^```(?:text|markdown|md|prompt)?\s*/i, '').replace(/\s*```$/i, '');
  t = t.replace(/^(?:好的[，,。]?|当然[，,。]?|以下是(?:生成的)?(?:出图)?提示词[：:：]?\s*)+/i, '');
  t = t.replace(/^(?:提示词[：:：]\s*)+/i, '');
  // 比例由生图节点设置；只用冒号匹配画幅，避免误伤「3/4 侧」
  t = t.replace(/(?:竖版|横版|宽银幕)(?:\s*\d+\s*[:：]\s*\d+)?/g, '');
  t = t.replace(
    /(?<![\d.])(?:9\s*[:：]\s*16|16\s*[:：]\s*9|1\s*[:：]\s*1|4\s*[:：]\s*3|3\s*[:：]\s*4|3\s*[:：]\s*2|2\s*[:：]\s*3|21\s*[:：]\s*9)(?![\d.])/g,
    '',
  );
  t = t.replace(/画幅比例|aspect(?:\s*ratio)?/gi, '');
  t = t.replace(/【整体参数】\s*[；;、，,\s]*/g, '【整体参数】');
  t = t.replace(/[；;]\s*[；;]+/g, '；').replace(/[，,]\s*[，,]+/g, '，');
  t = t.replace(/[ \t]{2,}/g, ' ');
  return t.trim();
}

/** 默认「文本N」类标签才允许按模式改名 */
export function isDefaultTextNodeLabel(label: string): boolean {
  const s = String(label || '').trim();
  return !s || /^文本\d*$/.test(s) || s === '文本输入' || s === '文本';
}
