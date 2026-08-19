import api from '@/api';

export type CmsItemType =
  | 'banner'
  | 'entry'
  | 'showcase'
  | 'discover'
  | 'tool'
  | 'skill'
  | 'nav'
  | 'brand'
  | 'notice';

export type CmsItem = {
  id: string;
  type: CmsItemType;
  slug: string;
  title: string;
  subtitle: string;
  description?: string | null;
  coverUrl: string;
  videoUrl: string;
  linkPath: string;
  meta?: Record<string, unknown> | null;
  sort: number;
  enabled: boolean;
};

export type CmsHomeBundle = {
  banners: CmsItem[];
  entries: CmsItem[];
  showcases: CmsItem[];
  discovers: CmsItem[];
  tools: CmsItem[];
  skills: CmsItem[];
  nav: CmsItem[];
  brand: CmsItem[];
  notices: CmsItem[];
};

export async function fetchCmsHome(): Promise<CmsHomeBundle> {
  const { data } = await api.get('/cms/home');
  return {
    banners: data?.banners || [],
    entries: data?.entries || [],
    showcases: data?.showcases || [],
    discovers: data?.discovers || [],
    tools: data?.tools || [],
    skills: data?.skills || [],
    nav: data?.nav || [],
    brand: data?.brand || [],
    notices: data?.notices || [],
  };
}

export async function fetchCmsByType(type: CmsItemType): Promise<CmsItem[]> {
  const { data } = await api.get('/cms', { params: { type } });
  return Array.isArray(data) ? data : [];
}
