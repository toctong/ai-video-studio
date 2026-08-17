export type PromptImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** object URL 或远端图片 URL，供预览 */
  previewUrl: string;
  /** 本地上传文件；远端引用时可为空 */
  file?: File;
  /** 已托管的图片 URL，提交时直接当参考图，无需再上传 */
  remoteUrl?: string;
};

export const PROMPT_IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif';
export const PROMPT_IMAGE_MAX_COUNT = 6;
export const PROMPT_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB

/** 从已有图片 URL 做成参考图附件（生成结果「引用」） */
export function remoteImageAttachment(
  url: string,
  opts?: { name?: string; id?: string },
): PromptImageAttachment | null {
  const remoteUrl = String(url || '').trim();
  if (!remoteUrl) return null;
  const name = String(opts?.name || '').trim() || remoteUrl.split('/').pop()?.split('?')[0] || '参考图.png';
  return {
    id: opts?.id || `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    mimeType: 'image/png',
    size: 0,
    previewUrl: remoteUrl,
    remoteUrl,
  };
}

/** 仅撤销 blob: object URL，远端 http(s) 不要 revoke */
export function revokeAttachmentPreview(url: string) {
  const u = String(url || '').trim();
  if (!u.startsWith('blob:')) return;
  try {
    URL.revokeObjectURL(u);
  } catch {
    /* noop */
  }
}

/** 输入层 @ 展示用：真实文件名（不含路径） */
export function attachmentMentionLabel(img: Pick<PromptImageAttachment, 'name'>, fallbackIndex = 1) {
  const base = String(img.name || '')
    .trim()
    .replace(/^.*[/\\]/, '');
  if (!base) return `@图${Math.max(1, fallbackIndex)}`;
  return base.startsWith('@') ? base : `@${base}`;
}
