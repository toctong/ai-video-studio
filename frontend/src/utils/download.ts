import api from '@/api';

/** 触发浏览器下载文本/JSON 文件 */
export function downloadTextFile(
  content: string,
  filename: string,
  mime = 'application/octet-stream',
) {
  const blob = new Blob([content], { type: mime });
  triggerBlobDownload(blob, filename);
}

export function downloadJson(data: unknown, filename: string) {
  const text = JSON.stringify(data, null, 2);
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  downloadTextFile(text, name, 'application/json;charset=utf-8');
}

/** 文件名清洗：去掉路径非法字符 */
export function sanitizeDownloadName(name: string, fallback = 'download') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\.+/g, '.')
    .trim();
  return cleaned || fallback;
}

/**
 * 用 Blob 触发真实下载（兼容 Chromium / Firefox / Safari / 旧 Edge）。
 * 跨域直链上的 `<a download>` 常被忽略而变成跳转，因此优先走 Blob。
 */
export function triggerBlobDownload(blob: Blob, filename: string) {
  const name = sanitizeDownloadName(filename);
  const nav = window.navigator as Navigator & {
    msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => boolean;
  };
  if (typeof nav.msSaveOrOpenBlob === 'function') {
    nav.msSaveOrOpenBlob(blob, name);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Safari 需延迟 revoke，否则可能下到空文件
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

function extFromMime(mime: string, fallback: string) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  if (m.includes('quicktime')) return 'mov';
  return fallback;
}

function ensureFilenameExt(filename: string, blob: Blob, urlHint: string) {
  const name = sanitizeDownloadName(filename);
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const fromUrl = urlHint.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1];
  const ext = fromUrl || extFromMime(blob.type, 'bin');
  return `${name}.${ext}`;
}

async function fetchAsBlob(src: string): Promise<Blob> {
  // data: / blob: 也可走 fetch
  if (/^data:|^blob:/i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`读取失败（${res.status}）`);
    return res.blob();
  }

  let abs: URL;
  try {
    abs = new URL(src, window.location.href);
  } catch {
    throw new Error('下载地址无效');
  }

  const sameOrigin = abs.origin === window.location.origin;
  const res = await fetch(abs.toString(), {
    mode: sameOrigin ? 'same-origin' : 'cors',
    credentials: sameOrigin ? 'include' : 'omit',
    cache: 'no-cache',
  });
  if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`);
  return res.blob();
}

/** 经后端代理拉本站 OSS（绕过浏览器 CORS，强制 attachment） */
async function fetchViaStorageProxy(src: string, filename: string): Promise<Blob> {
  const res = await api.get('/storage/download', {
    params: { url: src, filename },
    responseType: 'blob',
    timeout: 300_000,
  });
  const blob = res.data as Blob;
  if (!blob || blob.size <= 0) throw new Error('文件为空');
  // 后端若返回 JSON 错误，axios 仍可能把 body 当 blob
  const ct = String(res.headers?.['content-type'] || blob.type || '');
  if (ct.includes('application/json')) {
    const text = await blob.text();
    let msg = '下载失败';
    try {
      msg = String(JSON.parse(text)?.message || msg);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return blob;
}

/**
 * 真实下载远程/本地媒体 URL。
 * 优先直连 fetch → Blob；跨域失败则走 `/api/storage/download` 同源代理。
 * 不会新开标签页。
 */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  const src = String(url || '').trim();
  if (!src) throw new Error('无下载地址');
  const nameHint = sanitizeDownloadName(filename);

  try {
    const blob = await fetchAsBlob(src);
    if (!blob || blob.size <= 0) throw new Error('文件为空');
    triggerBlobDownload(blob, ensureFilenameExt(nameHint, blob, src));
    return;
  } catch (primary: any) {
    // 同源相对路径再试一次（部分环境下 URL 解析差异）
    if (src.startsWith('/') && !src.startsWith('//')) {
      try {
        const blob = await fetchAsBlob(`${window.location.origin}${src}`);
        triggerBlobDownload(blob, ensureFilenameExt(nameHint, blob, src));
        return;
      } catch {
        /* fall through */
      }
    }

    // http(s) 跨域：走后端代理（仅本站 OSS）
    if (/^https?:\/\//i.test(src)) {
      try {
        const blob = await fetchViaStorageProxy(src, nameHint);
        triggerBlobDownload(blob, ensureFilenameExt(nameHint, blob, src));
        return;
      } catch (proxyErr: any) {
        const proxyMsg = String(
          proxyErr?.response?.data?.message ||
            proxyErr?.message ||
            proxyErr ||
            '',
        );
        // 若代理返回的是 blob 形态的 JSON 错误，尽量读出来
        if (proxyErr?.response?.data instanceof Blob) {
          try {
            const t = await proxyErr.response.data.text();
            const j = JSON.parse(t);
            throw new Error(String(j?.message || proxyMsg || '下载失败'));
          } catch (e: any) {
            if (e?.message && !String(e.message).includes('[object')) throw e;
          }
        }
        throw new Error(proxyMsg || '下载失败');
      }
    }

    const reason = String(primary?.message || primary || '');
    if (/Failed to fetch|NetworkError|CORS|blocked|Load failed/i.test(reason)) {
      throw new Error('资源跨域限制，无法下载。请检查对象存储 CORS，或稍后重试。');
    }
    throw new Error(reason || '下载失败');
  }
}
