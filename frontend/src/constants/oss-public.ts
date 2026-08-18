/** 浏览器读 MinIO 的公网前缀（与后端 HARDCODED_FILE_OSS.baseUrl 保持一致） */
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
  if (u.startsWith('/nami/')) return namiAsset(u.slice('/nami/'.length));
  const intranetPrefix = `${OSS_INTRANET_BASE.replace(/\/+$/, '')}/${OSS_BUCKET}/`;
  if (u.startsWith(intranetPrefix)) return ossPublicUrl(u.slice(intranetPrefix.length));
  if (u.startsWith(`${OSS_INTRANET_BASE}/`)) {
    return `${OSS_PUBLIC_BASE}${u.slice(OSS_INTRANET_BASE.length)}`;
  }
  return u;
}
