/** 提示词 / Skill 广场 → 首页输入框的草稿桥接（避免长文案塞进 URL） */

export type HomeGenMode = 'image' | 'video';

/** prompt=提示词广场（图/视频开单）；agent=Skill 广场（画布 Agent 节点） */
export type HomePlazaKind = 'prompt' | 'agent';

export type HomePlazaDraft = {
  skillId?: string;
  name?: string;
  desc?: string;
  prompt: string;
  mode: HomeGenMode;
  kind?: HomePlazaKind;
  slash?: string;
};

const KEY = 'lumina.home.plazaDraft';

export function resolvePlazaGenMode(opts: {
  mode?: string | null;
  category?: string | null;
  tags?: string[] | null;
}): HomeGenMode {
  const mode = String(opts.mode || '').toLowerCase();
  const category = String(opts.category || '').toLowerCase();
  // 题材 tags（人像写真等）不再表示图/视频；仅看 mode / category
  if (mode === 'video' || category === 'video') return 'video';
  if (mode === 'image' || category === 'image') return 'image';
  const tags = (opts.tags || []).map((t) => String(t).toLowerCase());
  // 兼容极旧数据：tags 里仍写了「视频」
  if (tags.some((t) => t === '视频' || t === 'video')) return 'video';
  return 'image';
}

export function saveHomePlazaDraft(draft: HomePlazaDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

export function takeHomePlazaDraft(): HomePlazaDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const data = JSON.parse(raw) as Partial<HomePlazaDraft>;
    const prompt = String(data.prompt || '').trim();
    const name = data.name ? String(data.name).trim() : undefined;
    if (!prompt && !name) return null;
    const kind: HomePlazaKind = data.kind === 'agent' ? 'agent' : 'prompt';
    return {
      skillId: data.skillId ? String(data.skillId) : undefined,
      name,
      desc: data.desc ? String(data.desc) : undefined,
      prompt: prompt || String(name || ''),
      mode: data.mode === 'video' ? 'video' : 'image',
      kind,
      slash: data.slash ? String(data.slash) : undefined,
    };
  } catch {
    return null;
  }
}
