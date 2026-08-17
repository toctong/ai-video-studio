import api from '@/api';

export type DiscoverKind = 'workflow' | 'skill' | 'template' | 'production';

export type DiscoverPost = {
  id: string;
  kind: DiscoverKind;
  title: string;
  description: string;
  thumbUrl: string;
  sourceId: string;
  authorUserId: number;
  authorName: string;
  shareToken: string;
  likeCount: number;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  payload?: Record<string, unknown>;
};

export async function fetchDiscoverFeed(params?: {
  kind?: DiscoverKind | string;
  q?: string;
  take?: number;
}): Promise<DiscoverPost[]> {
  const { data } = await api.get('/discover', { params });
  return Array.isArray(data) ? data : [];
}

export async function fetchDiscoverPost(id: string): Promise<DiscoverPost> {
  const { data } = await api.get(`/discover/${encodeURIComponent(id)}`);
  return data;
}

export async function fetchDiscoverByToken(token: string): Promise<DiscoverPost> {
  const { data } = await api.get(`/discover/share/${encodeURIComponent(token)}`);
  return data;
}

export async function publishToDiscover(body: {
  kind: DiscoverKind;
  title: string;
  description?: string;
  thumbUrl?: string;
  sourceId?: string;
  payload: Record<string, unknown>;
}): Promise<DiscoverPost> {
  const { data } = await api.post('/discover/publish', body);
  return data;
}

export async function likeDiscoverPost(id: string): Promise<{ id: string; likeCount: number }> {
  const { data } = await api.post(`/discover/${encodeURIComponent(id)}/like`);
  return data;
}

export async function unpublishDiscover(id: string): Promise<void> {
  await api.delete(`/discover/${encodeURIComponent(id)}`);
}
