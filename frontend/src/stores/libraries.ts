import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '@/api';
import type {
  AnyLibraryItem,
  LibraryKind,
  ScriptLibraryItem,
} from '@/libraries/types';
import { LIBRARY_KINDS } from '@/libraries/types';

export type ScriptCategoryMeta = {
  mark: string;
  description: string;
};

export type LibraryPack = {
  kind: LibraryKind;
  title?: string;
  sub?: string;
  categories: string[];
  items: AnyLibraryItem[];
  count: number;
  categoryMeta?: Record<string, ScriptCategoryMeta>;
};

export const useLibrariesStore = defineStore('libraries', () => {
  const packs = ref<Partial<Record<LibraryKind, LibraryPack>>>({});
  const loading = ref<Partial<Record<LibraryKind, boolean>>>({});
  const errors = ref<Partial<Record<LibraryKind, string>>>({});
  const inflight = new Map<LibraryKind, Promise<LibraryPack>>();

  const readyKinds = computed(
    () => LIBRARY_KINDS.filter((k) => !!packs.value[k]) as LibraryKind[],
  );

  function itemsOf(kind: LibraryKind): AnyLibraryItem[] {
    return packs.value[kind]?.items || [];
  }

  function categoriesOf(kind: LibraryKind): string[] {
    return packs.value[kind]?.categories || [];
  }

  const scripts = computed(() => itemsOf('script') as ScriptLibraryItem[]);
  const scriptCategories = computed(() => categoriesOf('script'));
  const scriptCategoryMeta = computed(
    () => packs.value.script?.categoryMeta || ({} as Record<string, ScriptCategoryMeta>),
  );

  async function ensureKind(kind: LibraryKind, force = false): Promise<LibraryPack> {
    if (!force && packs.value[kind]) return packs.value[kind]!;
    const pending = inflight.get(kind);
    if (pending && !force) return pending;

    const job = (async () => {
      loading.value = { ...loading.value, [kind]: true };
      errors.value = { ...errors.value, [kind]: undefined };
      try {
        const { data } = await api.get(`/libraries/${kind}`);
        const pack: LibraryPack = {
          kind,
          title: data.title,
          sub: data.sub,
          categories: Array.isArray(data.categories) ? data.categories : [],
          items: Array.isArray(data.items) ? data.items : [],
          count: Number(data.count) || 0,
          categoryMeta: data.categoryMeta || undefined,
        };
        packs.value = { ...packs.value, [kind]: pack };
        return pack;
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.message || '加载资源库失败';
        errors.value = { ...errors.value, [kind]: msg };
        throw e;
      } finally {
        loading.value = { ...loading.value, [kind]: false };
        inflight.delete(kind);
      }
    })();

    inflight.set(kind, job);
    return job;
  }

  async function ensureAll(force = false) {
    await Promise.all(LIBRARY_KINDS.map((k) => ensureKind(k, force)));
  }

  function findById(kind: LibraryKind, id: string) {
    return itemsOf(kind).find((x) => x.id === id) || null;
  }

  return {
    packs,
    loading,
    errors,
    readyKinds,
    scripts,
    scriptCategories,
    scriptCategoryMeta,
    itemsOf,
    categoriesOf,
    ensureKind,
    ensureAll,
    findById,
  };
});
