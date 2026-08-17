import { ref } from 'vue';

export type MediaPreviewState =
  | { kind: 'image'; urls: string[]; index: number }
  | { kind: 'video'; url: string; poster?: string }
  | null;

/** App-level media lightbox (image: el-image-viewer, video: ArtPlayer). */
export const mediaPreview = ref<MediaPreviewState>(null);

/** 悬停时 dns/连接预热，不拉完整视频，避免和播放器抢带宽 */
export function warmVideoUrl(url: string) {
  const u = String(url || '').trim();
  if (!u || typeof document === 'undefined') return;
  try {
    const host = new URL(u, location.href).origin;
    if (!host || host === 'null') return;
    const key = `video-preconnect:${host}`;
    if (document.head.querySelector(`link[data-warm="${key}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = host;
    link.crossOrigin = 'anonymous';
    link.dataset.warm = key;
    document.head.appendChild(link);
  } catch {
    /* ignore invalid url */
  }
}

export function openImagePreview(urls: string | string[], index = 0) {
  const list = (Array.isArray(urls) ? urls : [urls]).map((u) => String(u || '').trim()).filter(Boolean);
  if (!list.length) return;
  const i = Math.min(Math.max(0, index), list.length - 1);
  mediaPreview.value = { kind: 'image', urls: list, index: i };
}

export function openVideoPreview(url: string, opts?: { poster?: string }) {
  const u = String(url || '').trim();
  if (!u) return;
  const poster = String(opts?.poster || '').trim() || undefined;
  mediaPreview.value = { kind: 'video', url: u, poster };
}

export function closeMediaPreview() {
  mediaPreview.value = null;
}

/** 封面/预览 URL 是否应按视频渲染（勿塞进 <img>） */
export function isVideoUrl(url: string) {
  const u = String(url || '').trim();
  if (!u) return false;
  return (
    /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u) ||
    u.startsWith('data:video') ||
    /\/video\//i.test(u) ||
    /content[_-]?type=video/i.test(u) ||
    (/tos-cn-.*\.volces\.com/i.test(u) && /\/video|mp4|seedance/i.test(u))
  );
}

/** 给 video 加 #t=0.001，便于浏览器预加载后显示首帧 */
export function videoThumbSrc(url: string) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/#/.test(u)) return u;
  return `${u}#t=0.001`;
}

/** Infer image vs video from URL when kind is unknown. */
export function openMediaPreview(url: string, kind?: 'image' | 'video') {
  const u = String(url || '').trim();
  if (!u) return;
  if (kind === 'video' || (!kind && isVideoUrl(u))) {
    openVideoPreview(u);
    return;
  }
  openImagePreview(u);
}
