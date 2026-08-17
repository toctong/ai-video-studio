/**
 * AIGC 视频工厂 Hub 连接：仅从环境变量读取，不内置任何地址或 Token。
 *
 * - LUMINA_HUB_URL / LUMINA_HUB_TOKEN：主环境
 * - LUMINA_HUB_DEV_URL / LUMINA_HUB_DEV_TOKEN：可选开发环境（设置页开关）
 * - 设置页可覆盖具体值；未配置则 Hub 不启用
 */

import { readEnv } from '../../config/env';

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

/** 是否配置了开发 Hub，且非 production（才展示切换开关） */
export function canToggleDevHub(): boolean {
  if (readEnv('NODE_ENV') === 'production') return false;
  return Boolean(readEnv('LUMINA_HUB_DEV_URL'));
}

/** @deprecated 使用 canToggleDevHub */
export function useLocalHubDefaults(): boolean {
  return canToggleDevHub();
}

export function resolveEnvHubUrl(preferDevHub = false): string {
  if (preferDevHub && canToggleDevHub()) {
    return stripTrailingSlash(readEnv('LUMINA_HUB_DEV_URL'));
  }
  return stripTrailingSlash(readEnv('LUMINA_HUB_URL'));
}

export function resolveEnvHubToken(preferDevHub = false): string {
  if (preferDevHub && canToggleDevHub()) {
    return readEnv('LUMINA_HUB_DEV_TOKEN') || readEnv('LUMINA_HUB_TOKEN');
  }
  return readEnv('LUMINA_HUB_TOKEN');
}
