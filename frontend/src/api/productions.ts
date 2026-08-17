import api from '@/api';

export type ProductionCastMember = {
  name: string;
  role?: string;
  appearance?: string;
  portraitPrompt?: string;
  sheetPrompt?: string;
  portraitAssetId?: string;
  sheetAssetId?: string;
};

export type ProductionScene = {
  name: string;
  description?: string;
  imagePrompt?: string;
  sceneAssetId?: string;
};

export type ProductionStyle = {
  family?: string;
  sub?: string;
  brief?: string;
  lock?: string;
};

export type ProductionRow = {
  id: string;
  projectId: string;
  folderId: string;
  chapterId: string;
  workflowId: string;
  name: string;
  description: string;
  script: string;
  cast: ProductionCastMember[];
  scenes: ProductionScene[];
  style: ProductionStyle;
  assetIds: string[];
  templateId: string;
  shotLibraryId: string;
  status: string;
  tags: string[];
  thumbUrl: string;
  meta: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductionFolder = {
  id: string;
  name: string;
  parentId: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateProductionBody = Partial<
  Omit<ProductionRow, 'id' | 'createdAt' | 'updatedAt'>
>;

export async function fetchProductions(params?: {
  projectId?: string;
  chapterId?: string;
  folderId?: string;
}): Promise<ProductionRow[]> {
  const { data } = await api.get('/productions', { params });
  return Array.isArray(data) ? data : [];
}

export async function fetchProduction(id: string): Promise<ProductionRow> {
  const { data } = await api.get(`/productions/${encodeURIComponent(id)}`);
  return data;
}

export async function createProduction(body: CreateProductionBody): Promise<ProductionRow> {
  const { data } = await api.post('/productions', body);
  return data;
}

export async function updateProduction(
  id: string,
  body: CreateProductionBody,
): Promise<ProductionRow> {
  const { data } = await api.patch(`/productions/${encodeURIComponent(id)}`, body);
  return data;
}

export async function deleteProduction(id: string): Promise<void> {
  await api.delete(`/productions/${encodeURIComponent(id)}`);
}

export async function fetchProductionFolders(): Promise<ProductionFolder[]> {
  const { data } = await api.get('/production-folders');
  return Array.isArray(data) ? data : [];
}

export async function createProductionFolder(body: {
  name?: string;
  parentId?: string;
  sortOrder?: number;
}): Promise<ProductionFolder> {
  const { data } = await api.post('/production-folders', body);
  return data;
}

export async function updateProductionFolder(
  id: string,
  body: { name?: string; parentId?: string; sortOrder?: number },
): Promise<ProductionFolder> {
  const { data } = await api.patch(`/production-folders/${encodeURIComponent(id)}`, body);
  return data;
}

export async function deleteProductionFolder(id: string): Promise<void> {
  await api.delete(`/production-folders/${encodeURIComponent(id)}`);
}
