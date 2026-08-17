/** 成书篇幅：预估总字数（万）+ 卷数，创建时由用户选定 */

export type BookScale = {
  /** 预估成书总字数，单位：万字 */
  wordsWan: number;
  /** 建议卷数 */
  volumes: number;
};

export type BookScalePreset = BookScale & {
  id: string;
  label: string;
};

export const DEFAULT_BOOK_SCALE: BookScale = { wordsWan: 150, volumes: 7 };

export const BOOK_SCALE_PRESETS: BookScalePreset[] = [
  { id: '80-5', label: '80 万 · 5 卷', wordsWan: 80, volumes: 5 },
  { id: '120-6', label: '120 万 · 6 卷', wordsWan: 120, volumes: 6 },
  { id: '150-7', label: '150 万 · 7 卷', wordsWan: 150, volumes: 7 },
  { id: '200-8', label: '200 万 · 8 卷', wordsWan: 200, volumes: 8 },
  { id: '300-10', label: '300 万 · 10 卷', wordsWan: 300, volumes: 10 },
];

export function clampBookScale(input: Partial<BookScale> | null | undefined): BookScale {
  const wordsWan = Math.round(Number(input?.wordsWan) || DEFAULT_BOOK_SCALE.wordsWan);
  const volumes = Math.round(Number(input?.volumes) || DEFAULT_BOOK_SCALE.volumes);
  return {
    wordsWan: Math.min(500, Math.max(30, wordsWan || DEFAULT_BOOK_SCALE.wordsWan)),
    volumes: Math.min(20, Math.max(3, volumes || DEFAULT_BOOK_SCALE.volumes)),
  };
}

export function formatBookScaleLabel(scale: BookScale): string {
  const s = clampBookScale(scale);
  return `预估成书约 ${s.wordsWan} 万字 · ${s.volumes} 卷`;
}

/** 写入大纲生成 idea / 提示词 */
export function formatBookScaleIdeaBlock(scale: BookScale): string {
  const s = clampBookScale(scale);
  return [
    '【成书目标】（用户指定，必须遵守）',
    formatBookScaleLabel(s),
    `分卷按 ${s.volumes} 卷左右规划；首卷写细目录，后续卷写关键大节点；可持续连载到约 ${s.wordsWan} 万字完本。`,
    '禁止把大纲文档字数写成「全文约几千字」；篇幅定位必须写用户指定的成书字数与卷数。',
  ].join('\n');
}

export function matchBookScalePreset(scale: BookScale): string | 'custom' {
  const s = clampBookScale(scale);
  const hit = BOOK_SCALE_PRESETS.find((p) => p.wordsWan === s.wordsWan && p.volumes === s.volumes);
  return hit?.id || 'custom';
}
