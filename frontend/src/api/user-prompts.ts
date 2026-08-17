import api from '@/api';
import type { HomeGenMode } from '@/utils/home-plaza-draft';

export type UserPromptRow = {
  id: string;
  name: string;
  desc: string;
  prompt: string;
  mode: HomeGenMode;
  coverUrl: string;
  createdAt: string;
  updatedAt: string;
};

export async function fetchMyPrompts(): Promise<UserPromptRow[]> {
  const { data } = await api.get('/user-prompts');
  return Array.isArray(data) ? data : [];
}

export async function createMyPrompt(body: {
  name: string;
  desc?: string;
  prompt: string;
  mode?: HomeGenMode;
  coverUrl?: string;
  coverOssKey?: string;
}): Promise<UserPromptRow> {
  const { data } = await api.post('/user-prompts', body);
  return data;
}

export async function updateMyPrompt(
  id: string,
  body: {
    name?: string;
    desc?: string;
    prompt?: string;
    mode?: HomeGenMode;
    coverUrl?: string;
    coverOssKey?: string;
  },
): Promise<UserPromptRow> {
  const { data } = await api.patch(`/user-prompts/${id}`, body);
  return data;
}

export async function deleteMyPrompt(id: string): Promise<void> {
  await api.delete(`/user-prompts/${id}`);
}

/** 上传封面到 File OSS，返回公网 URL */
export async function uploadMyPromptCover(
  file: File,
  promptId?: string,
): Promise<{ url: string; key: string }> {
  const fd = new FormData();
  fd.append('file', file);
  if (promptId) fd.append('promptId', promptId);
  const { data } = await api.post('/user-prompts/cover', fd, {
    timeout: 300000,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return {
    url: String(data?.url || ''),
    key: String(data?.key || ''),
  };
}

export async function migrateLocalPrompts(
  items: Array<{
    name: string;
    desc?: string;
    prompt: string;
    mode?: string;
    coverUrl?: string;
  }>,
): Promise<{ ok: boolean; count: number; items: UserPromptRow[] }> {
  const { data } = await api.post('/user-prompts/migrate', { items });
  return data;
}
