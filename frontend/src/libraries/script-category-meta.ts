import type { ScriptCategoryMeta } from '@/stores/libraries';
import { useLibrariesStore } from '@/stores/libraries';

export type { ScriptCategoryMeta };

export function categoryOption(category: string) {
  const meta = useLibrariesStore().scriptCategoryMeta[category];
  return {
    label: category,
    value: category,
    mark: meta?.mark || category.slice(0, 1),
    description: meta?.description || `「${category}」题材方向，选中后继续挑灵感主线。`,
  };
}

export function categoryOptionsFor(categories: string[]) {
  return categories.map((c) => categoryOption(c));
}
