import api from '@/api';

export type ShotExpandCharacter = {
  name: string;
  role: string;
  appearance: string;
  portraitPrompt: string;
  sheetPrompt?: string;
};

export type ShotExpandScene = {
  name: string;
  description: string;
  imagePrompt: string;
};

export type ShotExpandProp = {
  name: string;
  role: string;
  description: string;
  propPrompt: string;
};

export type ShotExpandResult = {
  id: string;
  label: string;
  category: string;
  castCount: number;
  castRoles: string[];
  durationSec: number;
  videoPrompt: string;
  prompt?: string;
  storyPlot?: string;
  plotGridPrompt?: string;
  characters: ShotExpandCharacter[];
  scene: ShotExpandScene;
  props?: ShotExpandProp[];
  portraitUrls?: Record<string, string>;
  sheetUrls?: Record<string, string>;
  sceneUrl?: string;
  plotGridUrl?: string;
  propUrls?: Record<string, string>;
  saved?: boolean;
  updatedAt?: string;
};

/** 读取已入库镜头细案（无则 404） */
export async function fetchShotExpand(shotId: string) {
  const { data } = await api.get<ShotExpandResult>(
    `/libraries/shots/${encodeURIComponent(shotId)}/expand`,
  );
  return data;
}

/** AI 扩写镜头细案：定妆 + 设定板 + 剧情宫格 + 豆包成片提示词 */
export async function expandShot(
  shotId: string,
  opts?: { model?: string; durationSec?: number },
) {
  const { data } = await api.post<ShotExpandResult>(
    `/libraries/shots/${encodeURIComponent(shotId)}/expand`,
    {
      model: opts?.model || undefined,
      durationSec: opts?.durationSec,
    },
    { timeout: 300000 },
  );
  return data;
}

export type ShotRenderResult = {
  url: string;
  assetId?: string;
  prompt?: string;
};

export async function renderShotPortrait(
  shotId: string,
  opts?: { characterIndex?: number; model?: string; portraitPrompt?: string },
) {
  const { data } = await api.post<ShotRenderResult>(
    `/libraries/shots/${encodeURIComponent(shotId)}/render/portrait`,
    {
      characterIndex: opts?.characterIndex ?? 0,
      model: opts?.model,
      portraitPrompt: opts?.portraitPrompt,
    },
    { timeout: 180000 },
  );
  return data;
}

export async function renderShotCharacterSheet(
  shotId: string,
  opts?: { characterIndex?: number; model?: string; sheetPrompt?: string },
) {
  const { data } = await api.post<ShotRenderResult>(
    `/libraries/shots/${encodeURIComponent(shotId)}/render/sheet`,
    {
      characterIndex: opts?.characterIndex ?? 0,
      model: opts?.model,
      sheetPrompt: opts?.sheetPrompt,
    },
    { timeout: 180000 },
  );
  return data;
}

export async function renderShotScene(
  shotId: string,
  opts?: { model?: string; imagePrompt?: string },
) {
  const { data } = await api.post<ShotRenderResult>(
    `/libraries/shots/${encodeURIComponent(shotId)}/render/scene`,
    {
      model: opts?.model,
      imagePrompt: opts?.imagePrompt,
    },
    { timeout: 180000 },
  );
  return data;
}

export async function renderShotPlotGrid(
  shotId: string,
  opts?: { model?: string; plotGridPrompt?: string },
) {
  const { data } = await api.post<ShotRenderResult>(
    `/libraries/shots/${encodeURIComponent(shotId)}/render/plot-grid`,
    {
      model: opts?.model,
      plotGridPrompt: opts?.plotGridPrompt,
    },
    { timeout: 180000 },
  );
  return data;
}
