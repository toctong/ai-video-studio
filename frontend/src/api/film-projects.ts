import {
  createProduction,
  deleteProduction,
  fetchProduction,
  fetchProductions,
  updateProduction,
  type CreateProductionBody,
  type ProductionRow,
} from '@/api/productions';

export type FilmSceneItem = {
  id: string;
  kind: 'scene' | 'character' | 'prop';
  name: string;
  description?: string;
  prompt?: string;
  imageUrl?: string;
};

export type FilmStoryboardShot = {
  id: string;
  index: number;
  shot: string;
  scene?: string;
  description: string;
  dialogue?: string;
  durationSec?: number;
  prompt?: string;
};

export type FilmShotVideo = {
  id: string;
  shotId: string;
  shotLabel?: string;
  url: string;
  assetId?: string;
  status?: string;
  prompt?: string;
};

export type FilmVideoSettings = {
  aspect: string;
  durationSec: number;
  resolution: string;
  fps: number;
};

export type FilmVideoGenMode = 'omni' | 'i2v' | 'grid';

/** standalone=单集直建；series=合集内创作 */
export type FilmEntryMode = 'standalone' | 'series';

export type FilmEpisodeMeta = {
  kind?: 'film';
  collectionId?: string;
  episodeIndex?: number;
  entryMode?: FilmEntryMode;
  currentStep?: number;
  adaptedFrom?: 'novel' | 'paste' | 'blank';
  sourceBookId?: string;
  sourceBookTitle?: string;
  sourceChapterIds?: string[];
  outlineSnapshot?: string;
  videoSettings?: FilmVideoSettings;
  videoGenMode?: FilmVideoGenMode;
  sceneItems?: FilmSceneItem[];
  storyboard?: FilmStoryboardShot[];
  shotVideos?: FilmShotVideo[];
  videoPreview?: {
    url?: string;
    status?: string;
    subtitle?: string;
    notes?: string;
  };
};

export type FilmProject = ProductionRow & {
  meta: ProductionRow['meta'] & FilmEpisodeMeta;
};

/** 合集：容器，本身不是单集流水线 */
export type FilmCollection = ProductionRow & {
  meta: ProductionRow['meta'] & {
    kind?: 'film-collection';
    entryMode?: FilmEntryMode;
    /** 合集级大纲：系列后续创作依赖它 */
    seriesOutline?: string;
    sourceBookId?: string;
    sourceBookTitle?: string;
  };
};

const FILM_TAG = 'film';
const COLLECTION_TAG = 'film-collection';

export function defaultVideoSettings(): FilmVideoSettings {
  return {
    aspect: '16:9',
    durationSec: 15,
    resolution: '1080p',
    fps: 24,
  };
}

export function isFilmCollection(row: ProductionRow) {
  return (
    (row.tags || []).includes(COLLECTION_TAG) ||
    String((row.meta as any)?.kind || '') === 'film-collection'
  );
}

export function isFilmEpisode(row: ProductionRow) {
  if (isFilmCollection(row)) return false;
  return (
    (row.tags || []).includes(FILM_TAG) ||
    String((row.meta as any)?.kind || '') === 'film'
  );
}

/** @deprecated 兼容旧名：仅单集 */
export function isFilmProject(row: ProductionRow) {
  return isFilmEpisode(row);
}

export async function fetchFilmCollections(): Promise<FilmCollection[]> {
  const rows = await fetchProductions();
  return rows.filter(isFilmCollection) as FilmCollection[];
}

export async function fetchFilmEpisodes(collectionId?: string): Promise<FilmProject[]> {
  const rows = await fetchProductions();
  const list = rows.filter(isFilmEpisode) as FilmProject[];
  if (!collectionId) return list;
  return list.filter(
    (p) => String(p.meta?.collectionId || p.folderId || '') === collectionId,
  );
}

/** 兼容旧调用：返回全部单集 */
export async function fetchFilmProjects(): Promise<FilmProject[]> {
  return fetchFilmEpisodes();
}

export async function fetchFilmProject(id: string): Promise<FilmProject> {
  return (await fetchProduction(id)) as FilmProject;
}

export async function fetchFilmCollection(id: string): Promise<FilmCollection> {
  return (await fetchProduction(id)) as FilmCollection;
}

export async function createFilmCollection(
  name: string,
  opts?: {
    sourceBookId?: string;
    sourceBookTitle?: string;
    description?: string;
    entryMode?: FilmEntryMode;
    seriesOutline?: string;
  },
) {
  const entryMode = opts?.entryMode === 'standalone' ? 'standalone' : 'series';
  return (await createProduction({
    name: String(name || '').trim() || '未命名合集',
    description: opts?.description || '',
    projectId: opts?.sourceBookId || '',
    tags: [COLLECTION_TAG],
    status: 'draft',
    meta: {
      kind: 'film-collection',
      entryMode,
      seriesOutline: opts?.seriesOutline || '',
      sourceBookId: opts?.sourceBookId || '',
      sourceBookTitle: opts?.sourceBookTitle || '',
    },
  })) as FilmCollection;
}

export async function createFilmEpisode(opts: {
  collectionId: string;
  name?: string;
  episodeIndex?: number;
  sourceBookId?: string;
  sourceBookTitle?: string;
  outlineSnapshot?: string;
  chapterIds?: string[];
  adaptedFrom?: 'novel' | 'paste' | 'blank';
  entryMode?: FilmEntryMode;
}) {
  const index = Math.max(1, Number(opts.episodeIndex) || 1);
  const name = String(opts.name || '').trim() || `第${index}集`;
  const adapted = opts.adaptedFrom || (opts.sourceBookId ? 'novel' : 'blank');
  const entryMode = opts.entryMode === 'standalone' ? 'standalone' : 'series';
  return (await createProduction({
    name,
    description: '',
    projectId: opts.sourceBookId || '',
    folderId: opts.collectionId,
    tags: [FILM_TAG, `collection:${opts.collectionId}`],
    status: 'draft',
    meta: {
      kind: 'film',
      collectionId: opts.collectionId,
      episodeIndex: index,
      entryMode,
      adaptedFrom: adapted,
      sourceBookId: opts.sourceBookId || '',
      sourceBookTitle: opts.sourceBookTitle || '',
      sourceChapterIds: opts.chapterIds || [],
      outlineSnapshot: opts.outlineSnapshot || '',
      currentStep: 1,
      videoSettings: defaultVideoSettings(),
      videoGenMode: 'omni',
      sceneItems: [],
      storyboard: [],
      shotVideos: [],
      videoPreview: { status: 'draft' },
    },
  })) as FilmProject;
}

/** 空白单集：建容器仅作归属，UI 视为独立项目（无「第 N 集」） */
export async function createFilmProject(
  name: string,
  description = '',
  extraMeta: Record<string, unknown> = {},
) {
  const title = String(name || '').trim() || '未命名项目';
  const collectionId = String(extraMeta.collectionId || '').trim();
  if (!collectionId) {
    const col = await createFilmCollection(title, {
      description: description || '',
      entryMode: 'standalone',
    });
    return createFilmEpisode({
      collectionId: col.id,
      name: title,
      episodeIndex: 1,
      adaptedFrom: 'blank',
      entryMode: 'standalone',
    });
  }
  return createFilmEpisode({
    collectionId,
    name: title,
    episodeIndex: Number(extraMeta.episodeIndex) || 1,
    adaptedFrom: 'blank',
    entryMode: 'series',
  });
}

/** 从小说：先建合集再建第1集（系列模式，大纲进合集） */
export async function createFilmFromNovel(opts: {
  bookId: string;
  bookTitle: string;
  outlineSnapshot?: string;
  chapterIds?: string[];
  name?: string;
}) {
  const title = String(opts.bookTitle || '未命名小说').trim() || '未命名小说';
  const colName = String(opts.name || '').trim() || `《${title}》`;
  const outline = String(opts.outlineSnapshot || '').trim();
  const col = await createFilmCollection(colName, {
    sourceBookId: opts.bookId,
    sourceBookTitle: title,
    description: `由小说《${title}》改编`,
    entryMode: 'series',
    seriesOutline: outline,
  });
  return createFilmEpisode({
    collectionId: col.id,
    name: '第1集',
    episodeIndex: 1,
    sourceBookId: opts.bookId,
    sourceBookTitle: title,
    outlineSnapshot: outline,
    chapterIds: opts.chapterIds,
    adaptedFrom: 'novel',
    entryMode: 'series',
  });
}

export async function updateFilmProject(
  id: string,
  patch: Partial<CreateProductionBody> & { meta?: Record<string, unknown> },
) {
  return (await updateProduction(id, patch)) as FilmProject;
}

export async function removeFilmProject(id: string) {
  await deleteProduction(id);
}

export async function removeFilmCollection(id: string) {
  const eps = await fetchFilmEpisodes(id);
  for (const ep of eps) {
    await deleteProduction(ep.id);
  }
  await deleteProduction(id);
}

export type FilmProjectDraft = {
  name: string;
  description: string;
  script: string;
  style: {
    family?: string;
    sub?: string;
    brief?: string;
  };
  collectionId: string;
  episodeIndex: number;
  entryMode: FilmEntryMode;
  adaptedFrom: 'novel' | 'paste' | 'blank';
  sourceBookId: string;
  sourceBookTitle: string;
  sourceChapterIds: string[];
  outlineSnapshot: string;
  videoSettings: FilmVideoSettings;
  videoGenMode: FilmVideoGenMode;
  sceneItems: FilmSceneItem[];
  storyboard: FilmStoryboardShot[];
  shotVideos: FilmShotVideo[];
  videoPreview: NonNullable<FilmEpisodeMeta['videoPreview']>;
};

export function emptyFilmDraft(): FilmProjectDraft {
  return {
    name: '',
    description: '',
    script: '',
    style: { family: '', sub: '', brief: '' },
    collectionId: '',
    episodeIndex: 1,
    entryMode: 'standalone',
    adaptedFrom: 'blank',
    sourceBookId: '',
    sourceBookTitle: '',
    sourceChapterIds: [],
    outlineSnapshot: '',
    videoSettings: defaultVideoSettings(),
    videoGenMode: 'omni',
    sceneItems: [],
    storyboard: [],
    shotVideos: [],
    videoPreview: { status: 'draft' },
  };
}

export function toFilmDraft(project: FilmProject): FilmProjectDraft {
  const meta = project.meta || {};
  const adapted =
    meta.adaptedFrom === 'novel' || meta.adaptedFrom === 'paste' || meta.adaptedFrom === 'blank'
      ? meta.adaptedFrom
      : meta.sourceBookId
        ? 'novel'
        : 'blank';
  const mode =
    meta.videoGenMode === 'i2v' || meta.videoGenMode === 'grid' || meta.videoGenMode === 'omni'
      ? meta.videoGenMode
      : 'omni';
  const entryMode: FilmEntryMode =
    meta.entryMode === 'series' || meta.entryMode === 'standalone'
      ? meta.entryMode
      : 'standalone';
  return {
    name: project.name || '',
    description: project.description || '',
    script: project.script || '',
    style: {
      family: project.style?.family || '',
      sub: project.style?.sub || '',
      brief: project.style?.brief || '',
    },
    collectionId: String(meta.collectionId || project.folderId || ''),
    episodeIndex: Math.max(1, Number(meta.episodeIndex) || 1),
    entryMode,
    adaptedFrom: adapted,
    sourceBookId: String(meta.sourceBookId || project.projectId || ''),
    sourceBookTitle: String(meta.sourceBookTitle || ''),
    sourceChapterIds: Array.isArray(meta.sourceChapterIds)
      ? meta.sourceChapterIds.map(String)
      : [],
    outlineSnapshot: String(meta.outlineSnapshot || ''),
    videoSettings: {
      ...defaultVideoSettings(),
      ...(meta.videoSettings || {}),
    },
    videoGenMode: mode,
    sceneItems: Array.isArray(meta.sceneItems) ? meta.sceneItems : [],
    storyboard: Array.isArray(meta.storyboard) ? meta.storyboard : [],
    shotVideos: Array.isArray(meta.shotVideos) ? meta.shotVideos : [],
    videoPreview: {
      status: 'draft',
      ...(meta.videoPreview || {}),
    },
  };
}

export function filmDraftToPatch(draft: FilmProjectDraft, currentStep: number) {
  return {
    name: draft.name,
    description: draft.description,
    script: draft.script,
    style: draft.style,
    projectId: draft.sourceBookId || undefined,
    folderId: draft.collectionId || undefined,
    status: currentStep >= 6 ? 'ready' : 'draft',
    meta: {
      kind: 'film',
      collectionId: draft.collectionId,
      episodeIndex: draft.episodeIndex,
      entryMode: draft.entryMode,
      currentStep,
      adaptedFrom: draft.adaptedFrom,
      sourceBookId: draft.sourceBookId,
      sourceBookTitle: draft.sourceBookTitle,
      sourceChapterIds: draft.sourceChapterIds,
      outlineSnapshot: draft.outlineSnapshot,
      videoSettings: draft.videoSettings,
      videoGenMode: draft.videoGenMode,
      sceneItems: draft.sceneItems,
      storyboard: draft.storyboard,
      videoPreview: draft.videoPreview,
      shotVideos: draft.shotVideos,
    },
  };
}

export function isSeriesEntry(mode: unknown) {
  return String(mode || '') === 'series';
}

export async function updateFilmCollectionOutline(collectionId: string, outline: string) {
  const col = await fetchFilmCollection(collectionId);
  return (await updateProduction(collectionId, {
    meta: {
      ...(col.meta || {}),
      kind: 'film-collection',
      entryMode: col.meta?.entryMode === 'standalone' ? 'standalone' : 'series',
      seriesOutline: String(outline || ''),
      sourceBookId: col.meta?.sourceBookId || '',
      sourceBookTitle: col.meta?.sourceBookTitle || '',
    },
  })) as FilmCollection;
}
