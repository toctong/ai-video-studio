/** 出图宫格布局：单图 / N 宫格（仿即梦九宫格等） */

export const IMAGE_GRID_LAYOUTS = [
  { id: '1', label: '单图', rows: 1, cols: 1, cells: 1 },
  { id: '4', label: '4 宫格', rows: 2, cols: 2, cells: 4 },
  { id: '9', label: '9 宫格', rows: 3, cols: 3, cells: 9 },
  { id: '16', label: '16 宫格', rows: 4, cols: 4, cells: 16 },
  { id: '25', label: '25 宫格', rows: 5, cols: 5, cells: 25 },
] as const;

export type ImageGridId = (typeof IMAGE_GRID_LAYOUTS)[number]['id'];

export type ImageGridLayout = (typeof IMAGE_GRID_LAYOUTS)[number];

/** 章剧情板可选宫格（不含单图） */
export const CHAPTER_PLOT_GRID_LAYOUTS = IMAGE_GRID_LAYOUTS.filter((g) => g.id !== '1');

export const DEFAULT_CHAPTER_PLOT_GRID_ID: ImageGridId = '25';

export function resolveImageGrid(id?: string | null): ImageGridLayout {
  const raw = String(id || '1').trim();
  return IMAGE_GRID_LAYOUTS.find((g) => g.id === raw) || IMAGE_GRID_LAYOUTS[0];
}

export function isMultiImageGrid(id?: string | null): boolean {
  return resolveImageGrid(id).cells > 1;
}

/** 从有序节拍列表填满 cellCount 格：不足补衔接，超过保首尾均匀抽样 */
export function pickTextsForGrid(texts: string[], cellCount: number): string[] {
  const n = Math.max(1, Math.floor(cellCount) || 1);
  const cleaned = texts.map((t) => String(t || '').trim()).filter(Boolean);
  if (!cleaned.length) {
    return Array.from({ length: n }, (_, i) => `节拍 ${i + 1}：承接上一瞬间的氛围过场`);
  }
  if (cleaned.length === n) return cleaned.slice();
  if (cleaned.length < n) {
    const out = cleaned.slice();
    while (out.length < n) {
      const i = out.length + 1;
      out.push(`节拍 ${i}：氛围/过场衔接，保持同一时空与角色身份，轻微推进站位或光影`);
    }
    return out;
  }
  // 超过：首尾必留，中间均匀抽样
  if (n === 1) return [cleaned[0]];
  if (n === 2) return [cleaned[0], cleaned[cleaned.length - 1]];
  const out: string[] = [cleaned[0]];
  const midSlots = n - 2;
  const midSrc = cleaned.slice(1, -1);
  for (let i = 0; i < midSlots; i++) {
    const idx = Math.round((i / Math.max(midSlots - 1, 1)) * (midSrc.length - 1));
    out.push(midSrc[Math.min(Math.max(idx, 0), midSrc.length - 1)]);
  }
  out.push(cleaned[cleaned.length - 1]);
  return out;
}
