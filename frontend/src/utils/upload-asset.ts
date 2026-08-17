import type { AssetType } from '@ai-video-studio/shared';
import api from '@/api';

export type UploadedAsset = {
  id: string;
  url: string;
  name: string;
};

/** 项目资源手动上传（multipart field: file） */
export async function uploadProjectAsset(
  projectId: string,
  file: File,
  opts: {
    type: AssetType;
    name?: string;
    /** 在哪个工作流里上传，写入 meta.workflowId */
    workflowId?: string;
    workflowName?: string;
    /** 素材库文件夹 */
    libraryFolderId?: string;
  },
): Promise<UploadedAsset> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', opts.type);
  if (opts.name) fd.append('name', opts.name);
  if (opts.workflowId) fd.append('workflowId', opts.workflowId);
  if (opts.workflowName) fd.append('workflowName', opts.workflowName);
  if (opts.libraryFolderId) fd.append('libraryFolderId', opts.libraryFolderId);
  const { data } = await api.post(`/projects/${projectId}/assets/upload`, fd, {
    timeout: 300000,
  });
  return {
    id: String(data?.id || ''),
    url: String(data?.url || ''),
    name: String(data?.name || opts.name || file.name || ''),
  };
}

/** 是否已是可用于画布处理的地址（同源、内联或 FileOSS https） */
export function isCanvasSafeImageUrl(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (u.startsWith('data:') || u.startsWith('blob:')) return true;
  // 禁止继续把 /api/uploads 当规范地址
  if (u.startsWith('/api/uploads/')) return false;
  if (u.startsWith('/')) return true;
  try {
    const parsed = new URL(u, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    if (parsed.origin === (typeof window !== 'undefined' ? window.location.origin : 'http://local')) {
      return true;
    }
    // FileOSS / MinIO 永久直链（路径风格或旧 /api/v1）
    return (
      /\/api\/v1\/[^/]+\//.test(parsed.pathname) ||
      /file-oss|ai-file-oss|minio-aka|minio/i.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * 远端 http(s) → 本系统 FileOSS 永久直链（后端 from-url 强制入库 OSS）。
 */
export async function ensureLocalImageUrl(
  projectId: string,
  url: string,
  opts?: { name?: string; workflowId?: string; workflowName?: string },
): Promise<string> {
  const src = String(url || '').trim();
  if (!src) throw new Error('图片地址为空');
  if (isCanvasSafeImageUrl(src)) return src;
  if (!/^https?:\/\//i.test(src)) return src;

  const { data } = await api.post(
    `/projects/${projectId}/assets/from-url`,
    {
      url: src,
      type: 'other',
      name: opts?.name || 'grid-split-source',
      workflowId: opts?.workflowId,
      workflowName: opts?.workflowName,
    },
    { timeout: 300000 },
  );
  const stored = String(data?.url || '').trim();
  if (!stored || !isCanvasSafeImageUrl(stored)) {
    throw new Error('远端图片转存 FileOSS 失败');
  }
  return stored;
}

/** 打开系统文件选择器（须在用户手势同步调用链内触发） */
export function pickLocalFile(opts?: {
  accept?: string;
  multiple?: boolean;
}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts?.accept || 'image/*';
    input.multiple = !!opts?.multiple;
    // display:none 在部分 WebView/浏览器会被忽略 click；移出视口更稳
    input.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;opacity:0;overflow:hidden;';
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      input.remove();
      resolve(files);
    };
    const onWindowFocus = () => {
      // 无 oncancel 的浏览器：对话框关闭后靠 focus 收尾
      window.setTimeout(() => finish(Array.from(input.files || [])), 280);
    };
    input.onchange = () => finish(Array.from(input.files || []));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
    window.addEventListener('focus', onWindowFocus);
  });
}
