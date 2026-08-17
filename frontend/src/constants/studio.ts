/**
 * 平台级遗留资产桶（旧工作室路径）。
 * 新项目应写入真实 `projectId`；仅平台开单（无书库项目）时回退此桶。
 * @deprecated 请用 resolveAssetProjectId()
 */
export const STUDIO_PROJECT_ID = '_studio';

/** 平台开单默认资产项目（兼容旧数据） */
export const PLATFORM_ASSET_PROJECT_ID = '_studio';

/** 资产/运行用的项目桶：项目/工作流 projectId 优先，否则平台桶 */
export function resolveAssetProjectId(opts?: {
  projectId?: string | null;
  productionProjectId?: string | null;
  workflowProjectId?: string | null;
}): string {
  const id = String(
    opts?.productionProjectId ||
      opts?.workflowProjectId ||
      opts?.projectId ||
      '',
  ).trim();
  if (id && id !== STUDIO_PROJECT_ID) return id;
  if (id === STUDIO_PROJECT_ID) return PLATFORM_ASSET_PROJECT_ID;
  return PLATFORM_ASSET_PROJECT_ID;
}

export function isPlatformAssetProject(id?: string | null) {
  const v = String(id || '').trim();
  return !v || v === PLATFORM_ASSET_PROJECT_ID || v === STUDIO_PROJECT_ID;
}
