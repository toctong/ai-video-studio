import type { AxiosInstance } from 'axios';
import type { AssetType } from '@ai-video-studio/shared';
import type { PromptImageAttachment } from './attachment';

export async function uploadPromptImages(
  api: AxiosInstance,
  projectId: string,
  images: PromptImageAttachment[],
  type: AssetType = 'other',
) {
  const uploaded: Array<{ id: string; url: string; name: string }> = [];
  for (const img of images) {
    if (!img.file) continue;
    const fd = new FormData();
    fd.append('file', img.file);
    fd.append('type', type);
    fd.append('name', img.name);
    const { data } = await api.post(`/projects/${projectId}/assets/upload`, fd);
    uploaded.push({ id: data.id, url: data.url, name: data.name || img.name });
  }
  return uploaded;
}

/** Midjourney 等支持在 prompt 前拼参考图 URL */
export function prependImageUrls(prompt: string, urls: string[]) {
  if (!urls.length) return prompt;
  return `${urls.join(' ')} ${prompt}`.trim();
}

export function describeAttachedImages(
  prompt: string,
  uploaded: Array<{ name: string; url: string }>,
) {
  if (!uploaded.length) return prompt;
  const lines = uploaded.map((u, i) => `${i + 1}. ${u.name}（${u.url}）`).join('\n');
  return `${prompt.trim()}\n\n【用户附带参考图】\n${lines}`.trim();
}
