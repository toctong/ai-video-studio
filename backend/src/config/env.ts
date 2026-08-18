/**
 * 环境变量约定：
 * - 本地/非 production：基础项可有默认，便于开箱启动
 * - production：JWT / SETTINGS / 管理员口令须显式配置（密钥不再校验长度与强度）
 * - 对象存储在后端写死 MinIO，不再走 env / 设置页 / 本地磁盘
 */

/** 仅本地开发可用的默认密钥（production 禁用） */
const DEV_JWT_SECRET = 'aivideo-local-jwt-secret-do-not-use-in-prod';
const DEV_SETTINGS_SECRET = 'aivideo-local-settings-secret-do-not-use-in-prod';
const DEV_ADMIN_PASSWORD = 'admin123';

export function readEnv(name: string): string {
  return String(process.env[name] ?? '').trim();
}

export function isProductionRuntime(): boolean {
  return readEnv('NODE_ENV') === 'production';
}

export function requireEnv(name: string): string {
  const v = readEnv(name);
  if (!v) {
    throw new Error(`缺少必需环境变量 ${name}。请参考 .env.example 配置后重启。`);
  }
  return v;
}

/**
 * JWT / SETTINGS 密钥：
 * - 已配置：直接用（不校验长度/强度）
 * - 未配置且非 production：回落本地默认并打日志
 * - 未配置且 production：抛错
 */
export function resolveSecret(name: 'JWT_SECRET' | 'SETTINGS_SECRET'): string {
  const configured = readEnv(name);
  if (configured) return configured;
  if (isProductionRuntime()) {
    throw new Error(`生产环境必须设置 ${name}。请参考 .env.example。`);
  }
  const fallback = name === 'JWT_SECRET' ? DEV_JWT_SECRET : DEV_SETTINGS_SECRET;
  console.warn(
    `[env] ${name} 未设置，已使用本地开发默认值。生产部署请在 .env 中配置。`,
  );
  return fallback;
}

/** @deprecated 请用 resolveSecret；保留别名避免旧调用报错 */
export function requireSecret(name: 'JWT_SECRET' | 'SETTINGS_SECRET' | string): string {
  if (name === 'JWT_SECRET' || name === 'SETTINGS_SECRET') {
    return resolveSecret(name);
  }
  return requireEnv(name);
}

/**
 * 首次建管理员口令：
 * - 已配置 ADMIN_PASSWORD：使用之
 * - 非 production 且未配置：默认 admin123
 * - production 必须显式配置且不能是 admin123
 */
export function resolveAdminPassword(): string {
  const configured = readEnv('ADMIN_PASSWORD');
  if (configured) {
    if (isProductionRuntime() && (/admin123/i.test(configured) || configured.length < 8)) {
      throw new Error(
        '生产环境 ADMIN_PASSWORD 过弱：至少 8 位，且不能使用示例口令 admin123。',
      );
    }
    return configured;
  }
  if (isProductionRuntime()) {
    throw new Error('生产环境首次启动必须设置 ADMIN_PASSWORD。');
  }
  console.warn(
    `[env] ADMIN_PASSWORD 未设置，首次管理员口令默认为 ${DEV_ADMIN_PASSWORD}。生产请务必修改。`,
  );
  return DEV_ADMIN_PASSWORD;
}

export function resolveAdminUsername(): string {
  return readEnv('ADMIN_USERNAME') || 'admin';
}

/**
 * TypeORM synchronize：
 * - 显式 true/false 为准
 * - 未设置：非 production 默认 true，production 默认 false
 */
export function typeormSynchronizeEnabled(): boolean {
  const raw = readEnv('TYPEORM_SYNCHRONIZE').toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return !isProductionRuntime();
}

/**
 * CORS：
 * - 显式 CORS_ORIGIN=* / 列表
 * - 未设置：非 production 反射 Origin（本地前后端分端口）；production 仅同站
 */
export function resolveCorsOrigin(): boolean | string | string[] {
  const raw = readEnv('CORS_ORIGIN');
  if (!raw) return isProductionRuntime() ? false : true;
  if (raw === '*') return true;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 1) return list[0];
  return list;
}

/** 单容器 / 本地开发：未配 MinIO 时用磁盘；配了 Key 或 STORAGE_MODE=minio 则走 MinIO */
export function isLocalStorageMode(): boolean {
  const raw = readEnv('STORAGE_MODE').toLowerCase();
  if (raw === 's3' || raw === 'minio' || raw === 'oss') return false;
  if (raw === 'local' || raw === 'file') {
    // 设置页 / 环境变量已配齐 MinIO 时，不再强制落盘
    return !readEnv('FILE_OSS_ACCESS_KEY_ID');
  }
  return !readEnv('FILE_OSS_ACCESS_KEY_ID');
}

export function minioConfiguredInEnv(): boolean {
  return Boolean(
    readEnv('FILE_OSS_ACCESS_KEY_ID') &&
      readEnv('FILE_OSS_ACCESS_KEY_SECRET') &&
      (readEnv('FILE_OSS_BUCKET') || readEnv('FILE_OSS_BASE_URL')),
  );
}
