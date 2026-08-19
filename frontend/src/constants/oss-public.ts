/**
 * 浏览器侧历史素材公网前缀（仅域名/桶名，不含密钥）。
 * 新内容请走 CMS / 后台上传返回的完整 URL；此处用于兼容旧 nami 路径改写。
 * 部署时可按实际 MinIO 公网域名调整。
 */
export const OSS_PUBLIC_BASE = 'https://minio-aka.iepose.cn';
export const OSS_BUCKET = 'ai-video-studio';
const OSS_INTRANET_BASE = 'http://100.66.1.5:9000';

export function ossPublicUrl(key: string) {
  const objectKey = String(key || '').replace(/^\/+/, '');
  const encoded = objectKey
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `${OSS_PUBLIC_BASE.replace(/\/+$/, '')}/${OSS_BUCKET}/${encoded}`;
}

/** 爬取的纳米静态资源，对象 key 为 nami/... */
export function namiAsset(relPath: string) {
  const rel = String(relPath || '')
    .replace(/^\/+/, '')
    .replace(/^nami\//, '');
  return ossPublicUrl(`nami/${rel}`);
}

/** 本机 /nami/... 或内网 MinIO 直链，统一改写成公网域名 */
export function resolveMediaUrl(url: string) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('nami/')) return namiAsset(u.slice('nami/'.length));
  if (u.startsWith('/nami/')) return namiAsset(u.slice('/nami/'.length));
  const intranetPrefix = `${OSS_INTRANET_BASE.replace(/\/+$/, '')}/${OSS_BUCKET}/`;
  if (u.startsWith(intranetPrefix)) return ossPublicUrl(u.slice(intranetPrefix.length));
  if (u.startsWith(`${OSS_INTRANET_BASE}/`)) {
    return `${OSS_PUBLIC_BASE}${u.slice(OSS_INTRANET_BASE.length)}`;
  }
  return u;
}
