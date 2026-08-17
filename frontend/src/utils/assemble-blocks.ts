import { useLibrariesStore } from '@/stores/libraries';
import type {
  CharacterLibraryItem,
  ScriptLibraryItem,
  StyleLibraryItem,
  TemplateLibraryItem,
} from '@/libraries/types';
import { defaultStoryRoleByIndex } from '@/utils/story-roles';

export type AssembleBlockKind =
  | 'lore'
  | 'character'
  | 'pacing'
  | 'trope'
  | 'dialogue'
  | 'hook'
  | 'style'
  | 'title';

export type AssembleOption = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  reason?: string;
  /** 用于预览与拼装 */
  preview: string;
  raw: CharacterLibraryItem | StyleLibraryItem | TemplateLibraryItem;
};

export const ASSEMBLE_GROUP_META: Record<
  AssembleBlockKind,
  { title: string; hint: string; min: number; max: number }
> = {
  lore: { title: '世界观 / 设定', hint: '选 1 个主设定', min: 1, max: 1 },
  character: { title: '人物', hint: '选 2～5 个（男主+女主/搭档+对手）', min: 2, max: 5 },
  pacing: { title: '叙事节奏', hint: '选 1 个节奏模板', min: 1, max: 1 },
  trope: { title: '桥段', hint: '选 1～2 个桥段', min: 1, max: 2 },
  dialogue: { title: '台词风格', hint: '选 1 个台词模板', min: 0, max: 1 },
  hook: { title: '开篇 & 结尾钩子', hint: '选 0～1 个钩子', min: 0, max: 1 },
  style: { title: '画面风格', hint: '选 0～1 个风格', min: 0, max: 1 },
  title: { title: '标题 & 简介', hint: '选 0～1 个参考', min: 0, max: 1 },
};

export const ASSEMBLE_KIND_ORDER: AssembleBlockKind[] = [
  'lore',
  'character',
  'pacing',
  'trope',
  'dialogue',
  'hook',
  'style',
  'title',
];

function tokensOf(script: ScriptLibraryItem) {
  return new Set(
    [script.category, script.label, script.blurb, ...(script.tags || [])]
      .join(' ')
      .toLowerCase()
      .split(/[\s,，、/|]+/)
      .filter((t) => t.length >= 2),
  );
}

function scoreItem(
  script: ScriptLibraryItem,
  item: { category: string; label: string; blurb: string; tags?: string[] },
) {
  const bag = tokensOf(script);
  let score = 0;
  const hay = [item.category, item.label, item.blurb, ...(item.tags || [])].join(' ').toLowerCase();
  for (const t of bag) {
    if (hay.includes(t)) score += t.length >= 3 ? 3 : 2;
  }
  for (const tag of item.tags || []) {
    if ((script.tags || []).some((s) => s.includes(tag) || tag.includes(s))) score += 4;
  }
  if (item.category && script.category && item.category.includes(script.category.slice(0, 2))) {
    score += 2;
  }
  return score;
}

function topRanked<T extends { category: string; label: string; blurb: string; tags?: string[] }>(
  script: ScriptLibraryItem,
  list: T[],
  limit = 16,
): T[] {
  return [...list]
    .map((item) => ({ item, score: scoreItem(script, item) }))
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, 'zh'))
    .slice(0, limit)
    .map((x) => x.item);
}

function templatePreview(item: TemplateLibraryItem) {
  return item.content;
}

function characterPreview(item: CharacterLibraryItem) {
  return `${item.description}\n一致性：${item.consistencyPrompt}`;
}

function stylePreview(item: StyleLibraryItem) {
  return item.styleBrief;
}

function libs() {
  return useLibrariesStore();
}

export function buildCandidateCatalogs(script: ScriptLibraryItem) {
  const store = libs();
  const lore = topRanked(script, store.itemsOf('lore') as TemplateLibraryItem[]);
  const character = topRanked(script, store.itemsOf('character') as CharacterLibraryItem[]);
  const pacing = topRanked(script, store.itemsOf('pacing') as TemplateLibraryItem[]);
  const trope = topRanked(script, store.itemsOf('trope') as TemplateLibraryItem[]);
  const dialogue = topRanked(script, store.itemsOf('dialogue') as TemplateLibraryItem[]);
  const hook = topRanked(script, store.itemsOf('hook') as TemplateLibraryItem[]);
  const style = topRanked(script, store.itemsOf('style') as StyleLibraryItem[]);
  const title = topRanked(script, store.itemsOf('title') as TemplateLibraryItem[]);

  const compact = (items: Array<{ id: string; label: string; category: string; tags?: string[]; blurb: string }>) =>
    items.map(({ id, label, category, tags, blurb }) => ({ id, label, category, tags, blurb }));

  return {
    lore: compact(lore),
    character: compact(character),
    pacing: compact(pacing),
    trope: compact(trope),
    dialogue: compact(dialogue),
    hook: compact(hook),
    style: compact(style),
    title: compact(title),
  };
}

function lookupOf(kind: AssembleBlockKind) {
  const store = libs();
  return new Map(store.itemsOf(kind).map((i) => [i.id, i as AssembleOption['raw']]));
}

export function resolveAssembleOptions(
  kind: AssembleBlockKind,
  picks: Array<{ id: string; reason?: string }>,
): AssembleOption[] {
  const map = lookupOf(kind);
  const out: AssembleOption[] = [];
  for (const p of picks) {
    const raw = map.get(p.id);
    if (!raw) continue;
    let preview = '';
    if ('content' in raw) preview = templatePreview(raw);
    else if ('styleBrief' in raw) preview = stylePreview(raw);
    else preview = characterPreview(raw);
    out.push({
      id: raw.id,
      label: raw.label,
      category: raw.category,
      tags: raw.tags,
      blurb: raw.blurb,
      reason: p.reason,
      preview,
      raw,
    });
  }
  return out;
}

/** 把 AI 扩充结果转成可勾选积木（不在本地库也能创建/导出） */
export function optionFromAiExpand(
  kind: AssembleBlockKind,
  row: {
    id: string;
    label: string;
    category?: string;
    tags?: string[];
    blurb?: string;
    preview?: string;
  },
): AssembleOption {
  const label = String(row.label || '').trim() || '未命名';
  const blurb = String(row.blurb || label).trim().slice(0, 120);
  const preview = String(row.preview || blurb).trim() || blurb;
  const category = String(row.category || 'AI扩充').trim() || 'AI扩充';
  const tags = Array.isArray(row.tags) && row.tags.length ? row.tags.map(String) : ['AI扩充'];
  const id = row.id || `ai-${kind}-${Date.now().toString(36)}`;

  if (kind === 'character') {
    const raw: CharacterLibraryItem = {
      id,
      label,
      category,
      tags,
      blurb,
      description: preview,
      consistencyPrompt: blurb,
    };
    return { id, label, category, tags, blurb, reason: 'AI 扩充', preview, raw };
  }
  if (kind === 'style') {
    const raw: StyleLibraryItem = {
      id,
      label,
      category,
      tags,
      blurb,
      styleBrief: preview,
    };
    return { id, label, category, tags, blurb, reason: 'AI 扩充', preview, raw };
  }
  const raw: TemplateLibraryItem = {
    id,
    label,
    category,
    tags,
    blurb,
    content: preview,
  };
  return { id, label, category, tags, blurb, reason: 'AI 扩充', preview, raw };
}

/** 草稿里的 pick（含 ai-*）优先用草稿字段，本地库命中再补全 raw */
export function resolveDraftPickOptions(
  kind: AssembleBlockKind,
  picks: Array<{ id: string; label?: string; blurb?: string; preview?: string }>,
): AssembleOption[] {
  return picks.map((p) => {
    const local = resolveAssembleOptions(kind, [{ id: p.id }])[0];
    if (local) {
      return {
        ...local,
        label: p.label || local.label,
        blurb: p.blurb || local.blurb,
        preview: p.preview || local.preview,
      };
    }
    return optionFromAiExpand(kind, {
      id: p.id,
      label: p.label || p.id,
      blurb: p.blurb,
      preview: p.preview || p.blurb,
    });
  });
}

export function catalogsFromGroups(
  groups: Partial<Record<AssembleBlockKind, AssembleOption[]>>,
) {
  const out: Record<string, Array<{ id: string; label: string; category: string; tags?: string[]; blurb: string }>> =
    {};
  for (const kind of ASSEMBLE_KIND_ORDER) {
    out[kind] = (groups[kind] || []).map(({ id, label, category, tags, blurb }) => ({
      id,
      label,
      category,
      tags,
      blurb,
    }));
  }
  return out;
}

export function mergeAiExpandedIntoGroups(
  groups: Partial<Record<AssembleBlockKind, AssembleOption[]>>,
  items: Record<string, Array<{ id: string; label: string; category?: string; tags?: string[]; blurb?: string; preview?: string }>>,
) {
  const next: Partial<Record<AssembleBlockKind, AssembleOption[]>> = { ...groups };
  for (const kind of ASSEMBLE_KIND_ORDER) {
    const rows = items[kind] || [];
    if (!rows.length) continue;
    const cur = [...(next[kind] || [])];
    const labels = new Set(cur.map((o) => o.label));
    for (const row of rows) {
      if (!row?.label || labels.has(row.label)) continue;
      cur.unshift(optionFromAiExpand(kind, row));
      labels.add(row.label);
    }
    next[kind] = cur.slice(0, 14);
  }
  return next;
}

export function localFallbackGroups(script: ScriptLibraryItem) {
  const catalogs = buildCandidateCatalogs(script);
  const groups: Record<AssembleBlockKind, AssembleOption[]> = {} as any;
  for (const kind of ASSEMBLE_KIND_ORDER) {
    groups[kind] = resolveAssembleOptions(
      kind,
      (catalogs[kind] || []).slice(0, 5).map((x) => ({ id: x.id, reason: '按标签相近推荐' })),
    );
  }
  return groups;
}

export function composeAssembleIdea(input: {
  script: ScriptLibraryItem;
  picks: Partial<Record<AssembleBlockKind, AssembleOption[]>>;
  scale?: { wordsWan: number; volumes: number } | null;
}) {
  const { script, picks } = input;
  const scaleLine = input.scale
    ? `篇幅按用户指定「约 ${Math.round(input.scale.wordsWan)} 万字 · ${Math.round(input.scale.volumes)} 卷」设计`
    : '篇幅默认按长篇网文（预估成书约 100～200 万字、可写到完本）设计';
  const lines: string[] = [
    '请根据以下「积木拼装」素材，整合成一部通顺完整、可长线连载的小说大纲。',
    `${scaleLine}：先分卷、再给首卷细章；禁止短剧分集/短篇收束；禁止把大纲文档字数写成「全文约几千字」。`,
    '要求：各积木融进同一条故事线，不要简单罗列；人物动机自洽；节奏与桥段落到「卷 / 章」；台词风格贯穿对话描写。',
    '',
    '【核心灵感】',
    script.idea,
  ];
  if (script.sampleSkeleton?.trim()) {
    lines.push(
      '',
      '【示例骨架参考】（仅作开篇节拍参考，请扩成「分卷总纲 + 首卷 30～50 章细目」，不要照抄成短篇五段完结）',
      script.sampleSkeleton.trim(),
    );
  }

  const pushBlock = (title: string, items?: AssembleOption[]) => {
    if (!items?.length) return;
    lines.push('', `【${title}】`);
    items.forEach((it, i) => {
      lines.push(`${items.length > 1 ? `${i + 1}. ` : ''}${it.label}（${it.category}）`);
      lines.push(it.preview);
    });
  };

  pushBlock('世界观 / 设定', picks.lore);
  if (picks.character?.length) {
    lines.push('', '【人物设定】');
    picks.character.forEach((it, i) => {
      const role = defaultStoryRoleByIndex(i, picks.character!.length);
      lines.push(`${i + 1}. 【${role}】${it.label}（${it.category}）`);
      lines.push(it.preview);
    });
  }
  pushBlock('叙事节奏', picks.pacing);
  pushBlock('关键桥段', picks.trope);
  pushBlock('台词风格参考', picks.dialogue);
  pushBlock('开篇 & 结尾钩子', picks.hook);
  pushBlock('画面风格', picks.style);
  pushBlock('标题与简介参考', picks.title);

  if (input.scale) {
    const w = Math.round(Number(input.scale.wordsWan) || 150);
    const v = Math.round(Number(input.scale.volumes) || 7);
    lines.push(
      '',
      '【成书目标】（用户指定，必须遵守）',
      `预估成书约 ${w} 万字 · ${v} 卷`,
      `分卷按 ${v} 卷左右规划；首卷写细目录，后续卷写关键大节点；可持续连载到约 ${w} 万字完本。`,
    );
  } else {
    lines.push(
      '',
      '【成书目标】预估成书约 150～200 万字，分 5～8 卷，可持续连载至完本。',
    );
  }
  lines.push(
    '',
    '请输出可直接用于后续分章写作的完整大纲：含分卷大纲 + 首卷细目录（30章以上）+ 后续卷关键大节点。',
  );
  return lines.join('\n');
}

export function deriveTitleFromPicks(
  script: ScriptLibraryItem,
  picks: Partial<Record<AssembleBlockKind, AssembleOption[]>>,
) {
  const titlePick = picks.title?.[0];
  if (titlePick) {
    const m = titlePick.preview.match(/^标题[：:]\s*(.+)$/m);
    if (m?.[1]?.trim()) return m[1].trim();
    if (!titlePick.label.includes('简介') && !titlePick.label.includes('模板')) {
      return titlePick.label;
    }
  }
  return script.label;
}

export function deriveDescriptionFromPicks(
  script: ScriptLibraryItem,
  picks: Partial<Record<AssembleBlockKind, AssembleOption[]>>,
) {
  const titlePick = picks.title?.[0];
  if (titlePick) {
    const body = titlePick.preview
      .split(/\n/)
      .filter((l) => !/^标题[：:]/.test(l.trim()))
      .join('\n')
      .replace(/^简介[：:]\s*/m, '')
      .trim();
    if (body) return body.slice(0, 500);
  }
  return script.idea;
}

export function deriveStyleBrief(picks: Partial<Record<AssembleBlockKind, AssembleOption[]>>) {
  return picks.style?.[0]?.preview || '';
}
