/** 跨 A2UI remount 记录已播过入场动效的卡片，避免整组重绘时反复闪 */
const seen = new Set<string>();

export function takeCardFresh(value: string) {
  const v = String(value || '');
  if (!v || v.startsWith('_loading_') || v.startsWith('_empty_')) return false;
  if (seen.has(v)) return false;
  seen.add(v);
  return true;
}

export function resetCardFresh() {
  seen.clear();
}
