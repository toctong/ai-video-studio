import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { chatCompletion, chatCompletionStream } from '@/api/ai-chat';
import { ensureAiSettings, useAiSettings } from '@/composables/useAiSettings';
import {
  buildCapabilityPrompt,
  buildCanvasContextPrompt,
  stripActionFences,
} from '@/utils/studio-chat-actions';
import { findChatSkill, type ChatSkill } from '@/utils/studio-chat-skills';

export type CanvasChatSnapshot = {
  workflowId?: string;
  workflowName?: string;
  selectedIds?: string[];
  nodes?: Array<{ id: string; type: string; label: string; prompt?: string; status?: string }>;
  edges?: Array<{ source: string; target: string }>;
};


const STORAGE_KEY = 'lumina-studio-chat-v1';

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  skillId?: string;
  error?: boolean;
  streaming?: boolean;
  /** 开始思考的时间戳（流式中） */
  thinkStartedAt?: number;
  /** 思考耗时毫秒（结束后保留，用于「已思考 Xs」） */
  thinkMs?: number;
};

export type PlotBible = {
  title: string;
  genre: string;
  tone: string;
  style: string;
  durationSec: 10 | 15 | 30 | 60;
  episodeHint: string;
  logline: string;
  /** 整体剧情与分场/分镜骨架（应足够支撑多场戏，而非一句钩子） */
  outline: string;
  characters: string;
  world: string;
  constraints: string;
};

/** 旧会话兼容字段（小说转漫剧流程已移除，仅读取不再写入） */
export type NovelChatContext = {
  projectId: string;
  projectTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  skillId: string;
  plot: PlotBible;
  pinned?: boolean;
  model?: string;
  /** @deprecated 旧 localStorage 兼容，新会话不再写入 */
  novel?: NovelChatContext | null;
  /** 本会话最近落画布的项目 */
  productionId?: string;
  workflowId?: string;
};

function nid(prefix = 'c') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyPlot(): PlotBible {
  return {
    title: '',
    genre: '',
    tone: '',
    style: '',
    durationSec: 60,
    episodeHint: '多场次漫剧，可拆分镜',
    logline: '',
    outline: '',
    characters: '',
    world: '',
    constraints: '',
  };
}

export function plotCompleteness(plot: PlotBible): { score: number; missing: string[] } {
  const outlineOk = !!(
    String(plot.outline || '').trim() ||
    (String(plot.logline || '').trim() && String(plot.world || '').trim())
  );
  const checks: Array<[boolean, string]> = [
    [!!String(plot.title || '').trim(), '片名题材'],
    [outlineOk, '整体剧情/分镜骨架'],
    [!!String(plot.characters || '').trim(), '角色关系'],
    [!!String(plot.style || plot.constraints || '').trim(), '画风约束'],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, l]) => l);
  const score = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return { score, missing };
}

function buildSystemPrompt(
  plot: PlotBible,
  skill?: ChatSkill | null,
  canvas?: CanvasChatSnapshot | null,
) {
  const lines = [
    '你是 AIGC 视频工厂 创作平台的画布对话助手：能理解用户意图，并调用系统技能/动作帮用户落地（不只闲聊）。',
    '当前场景：工作流画布旁白对话。你与「当前工作流」绑定，拥有画布创作权限（通过 action 声明，由前端执行）。',
    '目标：结合画布现状高效创作——写提示词、落节点、跑生成；先问清再写，结构清晰、可执行。',
    '当用户要出图：用 ```image 包住提示词，并可用 to_canvas。',
    '设定板硬规则：每个角色单独一条 ```image（### 角色名，写外形服饰气质）；每个场景单独一条 ```image（### 场景名，只写环境建筑光影，禁止写成角色设定板）。',
    '不要输出剧情设定 JSON / ```plot；不要声称已真实生成图片/视频/画布节点。',
    buildCapabilityPrompt(),
  ];
  const canvasBlock = buildCanvasContextPrompt(canvas);
  if (canvasBlock) lines.push(canvasBlock);
  if (skill) {
    lines.push(`当前技能「${skill.name}」：${skill.desc}`);
    const skillPrompt = String(skill.prompt || '').trim();
    if (skillPrompt) {
      lines.push('—— 技能系统指令 ——', skillPrompt);
    }
  }
  const bible: string[] = [];
  if (plot.title) bible.push(`片名/项目：${plot.title}`);
  if (plot.genre) bible.push(`类型：${plot.genre}`);
  if (plot.tone) bible.push(`基调：${plot.tone}`);
  if (plot.style) bible.push(`画风：${plot.style}`);
  if (plot.episodeHint) bible.push(`形态：${plot.episodeHint}`);
  if (plot.logline) bible.push(`一句话卖点：${plot.logline}`);
  if (plot.outline) bible.push(`整体剧情/分镜骨架：${plot.outline}`);
  if (plot.characters) bible.push(`角色：${plot.characters}`);
  if (plot.world) bible.push(`世界观/场景：${plot.world}`);
  if (plot.constraints) bible.push(`硬约束：${plot.constraints}`);
  if (bible.length) {
    lines.push('—— 剧情备忘（由对话沉淀，可随时改；按可拆分镜的完整故事理解）——');
    lines.push(...bible);
  }
  return lines.join('\n');
}

function extractTitle(text: string) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28);
  return t || '新对话';
}

/** 从助手回复里抽出 ```image / ```video / ```plot 块 */
export function extractFencedBlocks(text: string, lang: string): string[] {
  const out: string[] = [];
  const langPart = lang ? `(?:${lang})` : '';
  const re = new RegExp(`\`\`\`${langPart}\\s*\\n([\\s\\S]*?)\`\`\``, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = String(m[1] || '').trim();
    if (body) out.push(body);
  }
  return out;
}

export function extractImagePrompts(text: string): string[] {
  const named = extractFencedBlocks(text, 'image|img|prompt');
  if (named.length) return named;
  // 无语言标记的代码块也尝试（短于 2k）
  const generic = extractFencedBlocks(text, '');
  return generic.filter((b) => b.length > 40 && b.length < 2000 && !b.trim().startsWith('{'));
}

export type CanvasImageItem = {
  title: string;
  prompt: string;
  group: string;
};

/** 把「多人挤在一段」的设定板文案拆成：每角色一图 + 每场景一图 */
function splitSettingBoardBlob(body: string): CanvasImageItem[] {
  let text = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  // 同一行挤多人：在「姓名：」前拆行（保留行首那一项）
  text = text.replace(
    /([。；;！!？?\s])([\u4e00-\u9fffA-Za-z·]{2,12})\s*[:：]\s*/g,
    '$1\n$2：',
  );
  text = text.replace(
    /([^\n])((?:场景|地点|环境)\s*[:：]\s*)/g,
    '$1\n$2',
  );

  const lines = text.split('\n');
  let stylePrefix = '';
  let negLine = '';
  type Chunk = { title: string; group: string; lines: string[] };
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;

  const flush = () => {
    if (cur && cur.lines.join('\n').trim()) chunks.push(cur);
    cur = null;
  };

  const skipTitle = /^(布局|画风|尺寸|负面|整体|设定板|分组|风格|色调|参考|提示词)/;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;

    if (/^负面词\s*[:：]?/i.test(t)) {
      negLine = t.replace(/^负面词\s*[:：]?\s*/i, '').trim() || t;
      continue;
    }

    const sceneM = t.match(
      /^(?:#{1,4}\s*)?(?:【)?(?:场景|地点|环境)(?:】)?\s*[:：]\s*(.+)$/,
    );
    if (sceneM) {
      flush();
      const title = (sceneM[1] || '场景').split(/[，,。；;]/)[0].trim().slice(0, 20) || '场景';
      cur = { title, group: '场景', lines: [t] };
      continue;
    }

    const headM = t.match(/^(?:#{1,4}\s*)(.+)$/) || t.match(/^【([^】]+)】\s*(.*)$/);
    if (headM && !skipTitle.test(headM[1])) {
      const title = headM[1].replace(/[：:].*$/, '').trim().slice(0, 20);
      if (title.length >= 2 && title.length <= 12) {
        flush();
        const group = /场景|地点|环境/.test(title) ? '场景' : '角色';
        cur = { title, group, lines: [t] };
        continue;
      }
    }

    // 林小山：…… / 赵虎：……
    const nameM = t.match(/^([\u4e00-\u9fffA-Za-z·]{2,12})\s*[:：]\s*(.+)$/);
    if (nameM && !skipTitle.test(nameM[1])) {
      flush();
      const title = nameM[1].trim();
      const group = /场景|地点|食堂|山路|阁楼|大殿|房间|院/.test(title + nameM[2].slice(0, 12))
        ? '场景'
        : '角色';
      cur = { title: title.slice(0, 20), group, lines: [t] };
      continue;
    }

    if (
      !cur &&
      /画风|风格|色调|16\s*[:：]?\s*9|横屏|竖屏|油彩|水墨|国风|半写实|赛璐/.test(t)
    ) {
      stylePrefix += (stylePrefix ? '\n' : '') + t;
      continue;
    }

    if (cur) cur.lines.push(t);
    else stylePrefix += (stylePrefix ? '\n' : '') + t;
  }
  flush();

  if (chunks.length < 2) return [];

  return chunks.map((c) => {
    const core = c.lines.join('\n').trim();
    const prompt = [
      stylePrefix,
      core,
      c.group === '角色'
        ? '用途：国漫工业角色设定板（大头+三视图+表情+服装细节）；干净浅灰底'
        : '用途：横版场景环境参考图；空镜或远处极小剪影；禁止角色设定板/三视图/表情格',
      negLine ? `负面词：${negLine}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return { title: c.title, prompt, group: c.group };
  });
}

/** 从回复里拆多条生图项：每角色一图、每场景一图（设定板） */
export function extractCanvasImageItems(text: string): CanvasImageItem[] {
  const src = String(text || '');
  const fenced: CanvasImageItem[] = [];
  const re = /```(?:image|img|prompt)([^\n`]*)\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const meta = String(m[1] || '').trim();
    const prompt = String(m[2] || '').trim();
    if (!prompt || prompt.length < 8) continue;
    const before = src.slice(Math.max(0, m.index - 160), m.index);
    const heading =
      before.match(/(?:^|\n)#{1,4}\s*([^\n#]+)\s*$/) ||
      before.match(/(?:^|\n)\*\*([^*]+)\*\*\s*$/) ||
      before.match(/(?:^|\n)【([^】]+)】\s*$/);
    let title = meta.replace(/^[:：]\s*/, '') || heading?.[1]?.trim() || '';
    title = title.replace(/^(image|img|prompt)\s*/i, '').trim();

    // 单块里塞了多人：强制拆开
    const split = splitSettingBoardBlob(prompt);
    if (split.length >= 2) {
      fenced.push(...split);
      continue;
    }

    if (!title) title = `图${fenced.length + 1}`;
    const hint = `${title}\n${before}\n${prompt.slice(0, 40)}`;
    let group = '设定';
    if (/角色|定妆|人物|cast|人设/i.test(hint)) group = '角色';
    else if (/场景|环境|地点|scene|背景/i.test(hint)) group = '场景';
    fenced.push({ title: title.slice(0, 28), prompt, group });
  }
  if (fenced.length >= 2) return fenced;
  if (fenced.length === 1) {
    const again = splitSettingBoardBlob(fenced[0].prompt);
    if (again.length >= 2) return again;
  }

  // 无 fence：整段回复里按人名/场景拆
  const plainSplit = splitSettingBoardBlob(stripActionFences(stripPlotFences(src)));
  if (plainSplit.length >= 2) return plainSplit;

  const singles = extractImagePrompts(src);
  if (singles.length === 1) {
    const again = splitSettingBoardBlob(singles[0]);
    if (again.length >= 2) return again;
  }
  if (singles.length > 1) {
    return singles.map((p, i) => ({
      title: `图${i + 1}`,
      prompt: p,
      group: '设定',
    }));
  }
  if (fenced.length === 1) return fenced;
  return singles.map((p) => ({ title: '设定板', prompt: p, group: '设定' }));
}

export function extractVideoPrompts(text: string): string[] {
  return extractFencedBlocks(text, 'video|motion|seedance');
}

/** 隐藏剧情设定 JSON（完整块 + 流式未闭合块） */
export function stripPlotFences(text: string): string {
  let s = String(text || '');
  s = s.replace(/```plot\s*\n[\s\S]*?```/gi, '');
  s = s.replace(/```plot\s*\n[\s\S]*$/i, '');
  return s.replace(/\n{3,}/g, '\n\n').trimEnd();
}

export { extractChatActions } from '@/utils/studio-chat-actions';
export { stripActionFences };

export function extractPlotPatch(text: string): Partial<PlotBible> | null {
  const blocks = extractFencedBlocks(text, 'plot');
  for (const b of blocks) {
    try {
      const j = JSON.parse(b);
      if (!j || typeof j !== 'object') continue;
      const patch: Partial<PlotBible> = {};
      for (const k of [
        'title',
        'genre',
        'tone',
        'style',
        'logline',
        'outline',
        'characters',
        'world',
        'episodeHint',
        'constraints',
      ] as const) {
        if (typeof j[k] === 'string' && j[k].trim()) patch[k] = j[k].trim();
      }
      if (j.durationSec === 10 || j.durationSec === 15 || j.durationSec === 30 || j.durationSec === 60) {
        patch.durationSec = j.durationSec;
      }
      if (Object.keys(patch).length) return patch;
    } catch {
      /* try next */
    }
  }
  return null;
}

type PersistShape = {
  sessions: ChatSession[];
  activeId: string;
};

export const useStudioChatStore = defineStore('studio-chat', () => {
  const sessions = ref<ChatSession[]>([]);
  const activeId = ref('');
  const sending = ref(false);
  const streaming = ref(false);
  const hydrated = ref(false);
  const error = ref('');
  const histQuery = ref('');
  let abortCtrl: AbortController | null = null;
  /** 最近一次画布快照，供 regenerate / runSkill 复用 */
  const lastCanvas = ref<CanvasChatSnapshot | null>(null);

  const active = computed(() => sessions.value.find((s) => s.id === activeId.value) || null);

  const sortedSessions = computed(() => {
    const q = histQuery.value.trim().toLowerCase();
    const list = [...sessions.value].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
    if (!q) return list;
    return list.filter((s) => {
      if (s.title.toLowerCase().includes(q)) return true;
      return s.messages.some((m) => m.content.toLowerCase().includes(q));
    });
  });

  function persist() {
    try {
      const payload: PersistShape = {
        sessions: sessions.value.map((s) => ({
          ...s,
          messages: s.messages.map((m) => ({
            ...m,
            streaming: undefined,
            thinkStartedAt: undefined,
          })),
        })),
        activeId: activeId.value,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }

  function hydrate() {
    if (hydrated.value) return;
    hydrated.value = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        newSession();
        return;
      }
      const data = JSON.parse(raw) as PersistShape;
      sessions.value = (Array.isArray(data.sessions) ? data.sessions : []).map((s) => ({
        ...s,
        plot: { ...emptyPlot(), ...(s.plot || {}) },
      }));
      activeId.value = String(data.activeId || '');
      if (!sessions.value.length) newSession();
      else if (!sessions.value.some((s) => s.id === activeId.value)) {
        activeId.value = sessions.value[0].id;
      }
    } catch {
      sessions.value = [];
      newSession();
    }
  }

  function newSession(
    partial?: Partial<Pick<ChatSession, 'skillId' | 'plot' | 'title' | 'model'>>,
  ) {
    const s: ChatSession = {
      id: nid('sess'),
      title: partial?.title || '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      skillId: partial?.skillId || '',
      plot: { ...emptyPlot(), ...(partial?.plot || {}) },
      pinned: false,
      model: partial?.model || '',
    };
    sessions.value = [s, ...sessions.value];
    activeId.value = s.id;
    persist();
    return s;
  }

  function selectSession(id: string) {
    if (!sessions.value.some((s) => s.id === id)) return;
    activeId.value = id;
    persist();
  }

  function removeSession(id: string) {
    sessions.value = sessions.value.filter((s) => s.id !== id);
    if (activeId.value === id) {
      activeId.value = sessions.value[0]?.id || '';
      if (!activeId.value) newSession();
    }
    persist();
  }

  function renameSession(id: string, title: string) {
    const s = sessions.value.find((x) => x.id === id);
    if (!s) return;
    s.title = title.trim() || s.title;
    s.updatedAt = Date.now();
    persist();
  }

  function togglePin(id: string) {
    const s = sessions.value.find((x) => x.id === id);
    if (!s) return;
    s.pinned = !s.pinned;
    s.updatedAt = Date.now();
    persist();
  }

  function updatePlot(patch: Partial<PlotBible>) {
    const s = active.value;
    if (!s) return;
    s.plot = { ...s.plot, ...patch };
    s.updatedAt = Date.now();
    persist();
  }

  function setSkill(skillId: string) {
    const s = active.value;
    if (!s) return;
    s.skillId = skillId;
    s.updatedAt = Date.now();
    persist();
  }

  function bindProduction(opts: { productionId: string; workflowId: string }) {
    const s = active.value;
    if (!s) return;
    s.productionId = String(opts.productionId || '').trim() || undefined;
    s.workflowId = String(opts.workflowId || '').trim() || undefined;
    s.updatedAt = Date.now();
    persist();
  }

  /**
   * 画布「AI 助手对话」：按工作流隔离会话。
   * 同一 workflowId 复用历史；切换工作流自动切到对应会话。
   */
  function ensureWorkflowSession(opts: {
    workflowId: string;
    productionId?: string;
    title?: string;
  }) {
    const wid = String(opts.workflowId || '').trim();
    const pid = String(opts.productionId || '').trim() || undefined;
    const titleHint = String(opts.title || '').trim();

    if (!wid) {
      if (!active.value) newSession({ title: titleHint || '新对话' });
      return active.value;
    }

    let s =
      sessions.value.find((x) => String(x.workflowId || '') === wid) ||
      (pid
        ? sessions.value.find(
            (x) => !x.workflowId && String(x.productionId || '') === pid,
          )
        : undefined);

    if (!s) {
      s = newSession({
        title: titleHint ? `${titleHint} · 对话` : '工作流对话',
      });
      s.workflowId = wid;
      s.productionId = pid;
      persist();
      return s;
    }

    // 旧会话只有 productionId：补上 workflowId
    if (!s.workflowId) s.workflowId = wid;
    if (pid) s.productionId = pid;
    if (
      titleHint &&
      (!s.title || s.title === '新对话' || s.title === '工作流对话')
    ) {
      s.title = `${titleHint} · 对话`;
    }
    s.updatedAt = Date.now();
    if (activeId.value !== s.id) activeId.value = s.id;
    persist();
    return s;
  }

  function clearProductionLink() {
    const s = active.value;
    if (!s) return;
    s.productionId = undefined;
    s.workflowId = undefined;
    s.updatedAt = Date.now();
    persist();
  }

  function clearSkill() {
    setSkill('');
  }

  function setModel(model: string) {
    const s = active.value;
    if (!s) return;
    s.model = model;
    s.updatedAt = Date.now();
    persist();
  }

  function stop() {
    abortCtrl?.abort();
    abortCtrl = null;
  }

  function resolveModel(sessionModel?: string) {
    const ai = useAiSettings();
    return String(sessionModel || ai.defaultOf('chat') || '').trim() || undefined;
  }

  /** 替换消息对象，保证流式增量能触发视图更新 */
  function patchAssistant(
    s: ChatSession,
    assistantId: string,
    mut: (m: ChatMessage) => void,
  ) {
    const idx = s.messages.findIndex((m) => m.id === assistantId);
    if (idx < 0) return;
    const next = { ...s.messages[idx] };
    mut(next);
    s.messages.splice(idx, 1, next);
  }

  async function completeAssistant(
    s: ChatSession,
    skill: ChatSkill | null,
    assistantId: string,
    canvas?: CanvasChatSnapshot | null,
  ) {
    const system = buildSystemPrompt(s.plot, skill, canvas);
    const history = s.messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.id !== assistantId)
      .filter((m) => !m.error)
      .slice(-24)
      .map((m) => ({ role: m.role, content: m.content }));

    const payload = [{ role: 'system', content: system }, ...history];
    const model = resolveModel(s.model);
    if (!s.messages.some((m) => m.id === assistantId)) return;

    abortCtrl = new AbortController();
    streaming.value = true;

    try {
      await ensureAiSettings();
      let text = '';
      try {
        text = await chatCompletionStream(payload, {
          model,
          signal: abortCtrl.signal,
          onEvent: (ev) => {
            if (ev.type === 'delta' && ev.text) {
              patchAssistant(s, assistantId, (m) => {
                // 思考计时贯穿整段流式，结束后再封口为「已思考 Xs」
                if (!m.thinkStartedAt) m.thinkStartedAt = Date.now();
                m.content += ev.text;
                m.streaming = true;
              });
            }
          },
        });
      } catch (streamErr: any) {
        if (streamErr?.name === 'AbortError') {
          patchAssistant(s, assistantId, (m) => {
            if (!m.content.trim()) {
              m.content = '生成已中断，你可以继续补充，或点重新生成。';
            }
            sealThink(m);
          });
          return;
        }
        // 流式失败时回退非流式（界面会一次性出现，但至少能出结果）
        text = await chatCompletion(payload, model);
      }
      patchAssistant(s, assistantId, (m) => {
        const raw =
          String(text || m.content || '').trim() || '（模型未返回内容，请重试或换模型）';
        const patch = extractPlotPatch(raw);
        if (patch) Object.assign(s.plot, patch);
        m.content = stripPlotFences(raw) || raw;
        sealThink(m);
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        patchAssistant(s, assistantId, (m) => {
          if (!m.content.trim()) {
            m.content = '生成已中断，你可以继续补充，或点重新生成。';
          } else {
            const patch = extractPlotPatch(m.content);
            if (patch) Object.assign(s.plot, patch);
            m.content = stripPlotFences(m.content) || m.content;
          }
          sealThink(m);
        });
        return;
      }
      const msg = e?.response?.data?.message || e?.message || '对话失败';
      error.value = msg;
      patchAssistant(s, assistantId, (m) => {
        m.content = `抱歉，这次没聊成：${msg}`;
        m.error = true;
        sealThink(m);
      });
    } finally {
      patchAssistant(s, assistantId, (m) => {
        m.streaming = false;
        sealThink(m);
      });
      streaming.value = false;
      abortCtrl = null;
      s.updatedAt = Date.now();
      persist();
    }
  }

  function sealThink(m: ChatMessage) {
    if (m.thinkMs == null && m.thinkStartedAt) {
      m.thinkMs = Math.max(200, Date.now() - m.thinkStartedAt);
    }
    m.thinkStartedAt = undefined;
  }

  async function send(
    userText: string,
    opts?: { skillId?: string; canvas?: CanvasChatSnapshot | null },
  ) {
    hydrate();
    const s = active.value;
    if (!s || sending.value) return;
    const text = String(userText || '').trim();
    if (!text) return;

    const skillId = opts?.skillId || s.skillId || '';
    const skill = skillId ? findChatSkill(skillId) : null;

    const userMsg: ChatMessage = {
      id: nid('m'),
      role: 'user',
      content: text,
      createdAt: Date.now(),
      skillId: skill?.id,
    };
    s.messages.push(userMsg);
    if (s.messages.filter((m) => m.role === 'user').length === 1) {
      if (!s.title || s.title === '新对话') {
        s.title = extractTitle(text);
      }
    }
    const assistantId = nid('m');
    s.messages.push({
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      skillId: skill?.id,
      streaming: true,
      thinkStartedAt: Date.now(),
    });
    s.updatedAt = Date.now();
    sending.value = true;
    error.value = '';
    persist();

    if (opts?.canvas) lastCanvas.value = opts.canvas;

    try {
      await completeAssistant(s, skill, assistantId, opts?.canvas ?? lastCanvas.value);
    } finally {
      sending.value = false;
    }
  }

  /** 重新生成最后一条助手回复 */
  async function regenerate() {
    const s = active.value;
    if (!s || sending.value) return;
    // 去掉尾部错误/助手消息，保留最后用户提问
    while (s.messages.length) {
      const last = s.messages[s.messages.length - 1];
      if (last.role === 'assistant') {
        s.messages.pop();
        continue;
      }
      break;
    }
    const lastUser = [...s.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const skill = lastUser.skillId
      ? findChatSkill(lastUser.skillId)
      : s.skillId
        ? findChatSkill(s.skillId)
        : null;
    const assistantId = nid('m');
    s.messages.push({
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      skillId: skill?.id,
      streaming: true,
      thinkStartedAt: Date.now(),
    });
    sending.value = true;
    error.value = '';
    persist();
    try {
      await completeAssistant(s, skill, assistantId, lastCanvas.value);
    } finally {
      sending.value = false;
    }
  }

  /** 编辑最后一条用户消息并重发 */
  async function editLastUserAndResend(content: string) {
    const s = active.value;
    if (!s || sending.value) return;
    const text = String(content || '').trim();
    if (!text) return;
    while (s.messages.length) {
      const last = s.messages[s.messages.length - 1];
      if (last.role === 'assistant' || last.role === 'user') {
        if (last.role === 'user') {
          s.messages.pop();
          break;
        }
        s.messages.pop();
        continue;
      }
      break;
    }
    await send(text);
  }

  async function runSkill(
    skillId: string,
    extra = '',
    opts?: { canvas?: CanvasChatSnapshot | null },
  ) {
    const skill = findChatSkill(skillId);
    if (!skill) return;
    setSkill(skillId);
    const base = (skill.starter || skill.prompt || '').trim();
    const body = [base, extra.trim()].filter(Boolean).join(extra.trim() ? '\n' : '');
    if (!body) return;
    await send(body, { skillId, canvas: opts?.canvas });
  }

  function exportActiveMarkdown(): string {
    const s = active.value;
    if (!s) return '';
    const lines = [`# ${s.title}`, '', `> 更新于 ${new Date(s.updatedAt).toLocaleString('zh-CN')}`, ''];
    if (s.plot.title || s.plot.logline) {
      lines.push('## 剧情设定', '');
      for (const [k, v] of Object.entries(s.plot)) {
        if (v) lines.push(`- **${k}**: ${v}`);
      }
      lines.push('');
    }
    lines.push('## 对话', '');
    for (const m of s.messages) {
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      lines.push(`### ${m.role === 'user' ? '用户' : 'AIGC 视频工厂'}`, '', m.content, '');
    }
    return lines.join('\n');
  }

  return {
    sessions,
    activeId,
    active,
    sortedSessions,
    sending,
    streaming,
    error,
    hydrated,
    histQuery,
    hydrate,
    newSession,
    selectSession,
    removeSession,
    renameSession,
    togglePin,
    updatePlot,
    setSkill,
    clearSkill,
    bindProduction,
    ensureWorkflowSession,
    clearProductionLink,
    setModel,
    stop,
    send,
    regenerate,
    editLastUserAndResend,
    runSkill,
    exportActiveMarkdown,
    persist,
  };
});
