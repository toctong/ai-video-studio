import api from '@/api';
import { chatCompletion } from '@/api/ai-chat';
import type { FilmSceneItem, FilmStoryboardShot } from '@/api/film-projects';
import { SCRIPT_GEN_SYSTEM } from '@/utils/script-gen-layout';
import { scrubOutlineLengthConfusion } from '@/utils/outline-text';

export type NovelBookRow = {
  id: string;
  title: string;
  coverUrl?: string;
  chapterCount?: number;
  wordCount?: number;
};

export type NovelChapterRow = {
  id: string;
  title: string;
  orderIndex: number;
  synopsis?: string;
  novelBody?: string;
  continuitySummary?: string;
  status?: string;
  wordCount?: number;
};

export type NovelCharacterRow = {
  id: string;
  name: string;
  description?: string;
  meta?: Record<string, unknown>;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickOutlineAsset(assets: any[]) {
  if (!assets?.length) return null;
  return (
    assets.find((a) => String(a.name || '') === '小说大纲') ||
    assets.find((a) => String(a.name || '').includes('小说大纲')) ||
    assets.find((a) => String(a.name || '').includes('大纲')) ||
    null
  );
}

export async function listNovelBooks(): Promise<NovelBookRow[]> {
  const { data } = await api.get('/projects');
  const rows = Array.isArray(data) ? data : [];
  return rows.map((p: any) => ({
    id: String(p.id || ''),
    title: String(p.title || p.name || '未命名小说'),
    coverUrl: String(p.coverUrl || '').trim() || undefined,
    chapterCount: Number(p.chapterCount) || undefined,
    wordCount: Number(p.wordCount) || undefined,
  }));
}

export async function fetchNovelOutline(bookId: string): Promise<string> {
  const { data } = await api.get(`/projects/${bookId}/assets`, {
    params: { type: 'script' },
  });
  const hit = pickOutlineAsset(data || []);
  return scrubOutlineLengthConfusion(String(hit?.meta?.content || ''));
}

export async function fetchNovelChapters(bookId: string): Promise<NovelChapterRow[]> {
  const { data } = await api.get(`/projects/${bookId}/chapters`);
  return Array.isArray(data) ? data : [];
}

export async function fetchNovelCharacters(bookId: string): Promise<NovelCharacterRow[]> {
  try {
    const { data } = await api.get(`/projects/${bookId}/characters`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function characterLine(characters: NovelCharacterRow[]) {
  return characters
    .filter((c) => String(c.name || '').trim())
    .slice(0, 8)
    .map((c) => {
      const desc = String(c.description || '')
        .replace(/\s+/g, ' ')
        .trim();
      const role =
        c.meta && typeof c.meta === 'object'
          ? String((c.meta as any).role || '').trim()
          : '';
      return `${c.name}${role ? `（${role}）` : ''}${desc ? `：${desc}` : ''}`;
    })
    .join('；');
}

export function buildChapterRawScript(
  ch: NovelChapterRow,
  characters: NovelCharacterRow[] = [],
  outline = '',
) {
  const body = String(ch.novelBody || '').trim().slice(0, 10000);
  const synopsis = String(ch.synopsis || ch.continuitySummary || '').trim();
  const chars = characterLine(characters);
  return [
    outline.trim() ? `【大纲节选】\n${outline.trim().slice(0, 3000)}` : '',
    `【剧情】${synopsis || ch.title || `第${ch.orderIndex + 1}章`}`,
    chars ? `【角色】${chars}` : '',
    body ? '【正文】' : '',
    body,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildMultiChapterRawScript(
  chapters: NovelChapterRow[],
  characters: NovelCharacterRow[] = [],
  outline = '',
) {
  const parts = chapters.map((ch) => buildChapterRawScript(ch, characters, ''));
  return [
    outline.trim() ? `【小说大纲】\n${outline.trim().slice(0, 4000)}` : '',
    ...parts,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

/** 从 AI 完整稿里抽出「剧本大纲」段落 */
export function extractOutlineFromScript(script: string) {
  const text = String(script || '');
  const m =
    text.match(/###\s*剧本大纲\s*\n([\s\S]*?)(?=\n###\s|$)/i) ||
    text.match(/剧本大纲[：:]\s*\n?([\s\S]*?)(?=\n#{1,3}\s*人物设定|\n#{1,3}\s*完整脚本|$)/i);
  return String(m?.[1] || '').trim();
}

/** 合集大纲：多集世界观/主线 */
export async function generateSeriesOutlineFromIdea(opts: {
  idea: string;
  model?: string;
}) {
  const idea = String(opts.idea || '').trim();
  if (!idea) throw new Error('请先描述整部剧的想法');
  const prompt = [
    '请根据用户想法，写一份中文「合集/系列大纲」，供后续多集漫剧创作使用。',
    '要求：包含世界观、主线冲突、主要人物、分集走向建议（至少规划到第 1 集要点）；不要输出分场对白；不要解释过程。',
    `用户想法：\n${idea.slice(0, 8000)}`,
  ].join('\n\n');
  const text = await chatCompletion(
    [
      { role: 'system', content: SCRIPT_GEN_SYSTEM },
      { role: 'user', content: prompt },
    ],
    opts.model || undefined,
  );
  const out = String(text || '').trim();
  if (!out) throw new Error('AI 未返回大纲');
  return out;
}

/** 一句话 / 想法 → 完整漫剧剧本（AI 帮写） */
export async function generateComicScriptFromIdea(opts: {
  idea: string;
  genre?: string;
  model?: string;
  durationSec?: number;
  /** standalone：正文须含大纲+人物+完整脚本；series：按合集大纲写本集 */
  entryMode?: 'standalone' | 'series';
  seriesOutline?: string;
  episodeIndex?: number;
  episodeName?: string;
}) {
  const idea = String(opts.idea || '').trim();
  if (!idea) throw new Error('请先描述你想做的片子');
  const genre = String(opts.genre || '').trim() || '漫剧短剧';
  const entryMode = opts.entryMode === 'series' ? 'series' : 'standalone';
  const episodeIndex = Math.max(1, Number(opts.episodeIndex) || 1);
  const episodeName = String(opts.episodeName || `第${episodeIndex}集`).trim();

  const promptParts: string[] = [];
  if (entryMode === 'standalone') {
    promptParts.push(
      '请根据用户想法，写一份完整的中文漫剧稿，必须按以下三级标题顺序输出（不要省略）：',
      '### 剧本大纲',
      '### 人物设定',
      '### 完整脚本',
      '其中「完整脚本」需含场景、动作、对白，分场清晰（如「第一幕」「第二幕」）。',
    );
  } else {
    promptParts.push(
      `请根据「合集大纲」撰写「${episodeName}」（第 ${episodeIndex} 集）的中文漫剧分场剧本。`,
      '输出结构：',
      '### 本集概要',
      '### 人物设定',
      '### 完整脚本',
      '要求：严格承接合集大纲主线；本集可独立观看又留续集钩子；分场清晰。',
    );
    if (String(opts.seriesOutline || '').trim()) {
      promptParts.push(`合集大纲：\n${String(opts.seriesOutline).trim().slice(0, 8000)}`);
    }
  }
  promptParts.push(
    `类型偏好：${genre}`,
    opts.durationSec ? `成片体量参考：约 ${opts.durationSec} 秒量级。` : '',
    '不要解释过程，直接输出正文。',
    `用户想法：\n${idea.slice(0, 8000)}`,
  );

  const text = await chatCompletion(
    [
      { role: 'system', content: SCRIPT_GEN_SYSTEM },
      { role: 'user', content: promptParts.filter(Boolean).join('\n\n') },
    ],
    opts.model || undefined,
  );
  const out = String(text || '').trim();
  if (!out) throw new Error('AI 未返回剧本');
  return out;
}

/** 小说大纲+章节 → 漫剧剧本 */
export async function adaptNovelToComicScript(opts: {
  draft: string;
  outline?: string;
  durationSec?: number;
  styleBrief?: string;
  model?: string;
}) {
  const draft = String(opts.draft || '').trim();
  if (!draft) throw new Error('没有可改编的内容');
  const prompt = [
    '请把下面的小说大纲/章节内容改编成一条可直接用于漫剧制作的剧本（含分场与镜头感）。',
    '要求：保留主线冲突与人物关系；适合短视频/漫剧节奏；输出中文；不要解释过程。',
    opts.durationSec ? `目标成片体量参考：约 ${opts.durationSec} 秒量级（可拆多镜）。` : '',
    opts.styleBrief?.trim() ? `画风补充：${opts.styleBrief.trim()}` : '',
    opts.outline?.trim()
      ? `小说大纲（供对齐世界观）：\n${opts.outline.trim().slice(0, 4000)}`
      : '',
    `待改编内容：\n${draft.slice(0, 14000)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const text = await chatCompletion(
    [
      { role: 'system', content: SCRIPT_GEN_SYSTEM },
      { role: 'user', content: prompt },
    ],
    opts.model || undefined,
  );
  const out = String(text || '').trim();
  if (!out) throw new Error('AI 未返回漫剧剧本');
  return out;
}

function parseJsonArray(raw: string): unknown[] {
  const text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() || text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  const jsonText = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  const data = JSON.parse(jsonText);
  return Array.isArray(data) ? data : [];
}

/** 从漫剧剧本抽取场景/角色/道具 */
export async function extractSceneItemsFromScript(opts: {
  script: string;
  model?: string;
}): Promise<FilmSceneItem[]> {
  const script = String(opts.script || '').trim();
  if (!script) throw new Error('请先填写漫剧剧本');
  const prompt = [
    '从下面的漫剧剧本中抽取视觉对象，只输出 JSON 数组，不要 Markdown。',
    '每项格式：{"kind":"scene|character|prop","name":"...","description":"...","prompt":"出图提示词"}',
    '最多 12 项；角色优先，其次场景，道具仅关键物件。',
    `剧本：\n${script.slice(0, 12000)}`,
  ].join('\n\n');
  const raw = await chatCompletion(
    [
      {
        role: 'system',
        content: '你是漫剧美术统筹。只输出合法 JSON 数组。',
      },
      { role: 'user', content: prompt },
    ],
    opts.model || undefined,
  );
  const rows = parseJsonArray(raw);
  const out: FilmSceneItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const kindRaw = String(r.kind || '').trim();
    const kind =
      kindRaw === 'character' || kindRaw === 'prop' || kindRaw === 'scene'
        ? kindRaw
        : 'scene';
    const name = String(r.name || '').trim();
    if (!name) continue;
    out.push({
      id: uid(),
      kind,
      name,
      description: String(r.description || '').trim(),
      prompt: String(r.prompt || r.description || name).trim(),
    });
    if (out.length >= 12) break;
  }
  if (!out.length) throw new Error('未能从剧本抽出场景/角色/道具');
  return out;
}

/** 由漫剧剧本拆分镜 */
export async function splitScriptToStoryboard(opts: {
  script: string;
  durationSec?: number;
  model?: string;
}): Promise<FilmStoryboardShot[]> {
  const script = String(opts.script || '').trim();
  if (!script) throw new Error('请先填写漫剧剧本');
  const total = Number(opts.durationSec) || 15;
  const prompt = [
    '把下面的漫剧剧本拆成镜头分镜表，只输出 JSON 数组，不要 Markdown。',
    `成片总时长约 ${total} 秒；镜头数建议 4～10。`,
    '每项格式：{"index":1,"shot":"镜头名","scene":"场景","description":"画面动作","dialogue":"对白","durationSec":3,"prompt":"关键帧提示词"}',
    `剧本：\n${script.slice(0, 12000)}`,
  ].join('\n\n');
  const raw = await chatCompletion(
    [
      {
        role: 'system',
        content: '你是漫剧分镜导演。只输出合法 JSON 数组。',
      },
      { role: 'user', content: prompt },
    ],
    opts.model || undefined,
  );
  const rows = parseJsonArray(raw);
  const out: FilmStoryboardShot[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const description = String(r.description || r.shot || '').trim();
    if (!description) continue;
    out.push({
      id: uid(),
      index: out.length + 1,
      shot: String(r.shot || `镜${out.length + 1}`).trim() || `镜${out.length + 1}`,
      scene: String(r.scene || '').trim(),
      description,
      dialogue: String(r.dialogue || '').trim(),
      durationSec: Math.max(1, Number(r.durationSec) || 3),
      prompt: String(r.prompt || description).trim(),
    });
    if (out.length >= 12) break;
  }
  if (!out.length) throw new Error('未能拆出分镜');
  return out;
}
