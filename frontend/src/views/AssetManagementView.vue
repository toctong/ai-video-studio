<template>
  <div class="asset-lib">
    <aside class="tree-panel">
      <header class="tree-head">
        <h1>资产管理</h1>
        <el-button size="small" text @click="loadTree">刷新</el-button>
      </header>

      <UiScroll class="tree-scroll" always>
      <div class="tree">
        <div v-for="section in sections" :key="section.id" class="tree-section">
          <div class="section-label">{{ section.label }}</div>
          <button
            v-for="node in section.children"
            :key="node.key"
            type="button"
            class="tree-node"
            :class="{ on: isSelected(node) }"
            :style="{ paddingLeft: `${12 + (node.depth || 0) * 14}px` }"
            @click="selectNode(node)"
          >
            <UiIcon :name="node.icon" :size="16" />
            <span>{{ node.label }}</span>
            <em v-if="node.count != null">{{ node.count }}</em>
          </button>
        </div>
      </div>
      </UiScroll>
    </aside>

    <main class="content">
      <header class="content-head">
        <div>
          <p class="eyebrow">{{ selectedNode?.kind === 'category' ? '素材库' : '我的作品' }}</p>
          <h2>{{ selectedNode?.label || '请选择左侧分类' }}</h2>
        </div>
        <div class="head-actions">
          <el-input
            v-model="keyword"
            clearable
            placeholder="搜索素材"
            class="search"
          />
          <el-button type="primary" :disabled="!canUpload" @click="openUpload">
            <UiIcon name="upload" :size="15" />
            上传素材
          </el-button>
          <input
            ref="fileInput"
            type="file"
            multiple
            hidden
            @change="onFiles"
          />
        </div>
      </header>

      <UiScroll class="content-scroll" always>
      <section v-if="!selectedNode" class="empty">
        <el-empty description="请从左侧选择一个素材库或我的作品" />
      </section>

      <section v-else-if="selectedNode.kind === 'folder'" class="grid">
        <article
          v-for="node in folderChildren"
          :key="node.key"
          class="card folder-card"
          @click="selectNode(node)"
        >
          <div class="thumb">
            <UiIcon name="folder" :size="40" />
            <span class="name-bar">{{ node.label }}</span>
          </div>
          <span class="type-pill">{{ node.kind === 'folder' ? '合集' : '单集' }}</span>
        </article>
        <el-empty v-if="!folderChildren.length" class="grid-empty" description="这个合集还是空的" />
      </section>

      <section v-else class="grid" v-loading="loading">
        <article v-for="a in filteredAssets" :key="a.id" class="card asset-card">
          <div class="thumb">
            <LazyCoverImage v-if="isImage(a)" :src="assetUrl(a)" :alt="a.name" />
            <LazyVideo v-else-if="isVideo(a)" class="asset-video" :src="assetUrl(a)" autoplay />
            <div v-else-if="isAudio(a)" class="media-fallback">
              <UiIcon name="music" :size="36" />
              <audio :src="assetUrl(a)" controls />
            </div>
            <div v-else class="media-fallback">
              <UiIcon name="file" :size="36" />
            </div>
            <span class="name-bar" :title="a.name">{{ a.name || '未命名素材' }}</span>
            <span class="type-pill">{{ typeLabel(a.type) }}</span>
          </div>
          <button type="button" class="delete" title="删除" @click.stop="removeAsset(a)">
            ×
          </button>
        </article>
        <el-empty v-if="!loading && !filteredAssets.length" class="grid-empty" description="暂无素材，点击右上角上传" />
      </section>
      </UiScroll>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '@/api';
import { fetchProductions, fetchProductionFolders, type ProductionFolder, type ProductionRow } from '@/api/productions';
import UiIcon from '@/components/icons/UiIcon.vue';
import { UiScroll } from '@/components/ui';
import LazyCoverImage from '@/components/LazyCoverImage.vue';
import LazyVideo from '@/components/LazyVideo.vue';
import { resolveMediaUrl } from '@/constants/oss-public';
import type { IconName } from '@/components/icons/types';

type CategoryId =
  | 'scene'
  | 'character'
  | 'prop'
  | 'style'
  | 'pose'
  | 'fx'
  | 'expression'
  | 'voice'
  | 'sfx';

type TreeNode = {
  key: string;
  label: string;
  icon: IconName;
  kind: 'category' | 'folder' | 'production';
  assetProjectId?: string;
  assetType?: string;
  folderId?: string;
  productionId?: string;
  depth?: number;
  count?: number | null;
};

const MATERIAL_CATEGORIES: Array<{
  id: CategoryId;
  label: string;
  assetType: string;
  icon: IconName;
}> = [
  { id: 'scene', label: '场景库', assetType: 'scene', icon: 'image' },
  { id: 'character', label: '角色库', assetType: 'character_ref', icon: 'user' },
  { id: 'prop', label: '道具库', assetType: 'prop', icon: 'folder' },
  { id: 'style', label: '风格库', assetType: 'style', icon: 'layers' },
  { id: 'pose', label: '姿势库', assetType: 'pose', icon: 'user' },
  { id: 'fx', label: '特效库', assetType: 'fx', icon: 'sparkles' },
  { id: 'expression', label: '表情库', assetType: 'expression', icon: 'image' },
  { id: 'voice', label: '音色库', assetType: 'voice', icon: 'music' },
  { id: 'sfx', label: '音效库', assetType: 'sfx', icon: 'music' },
];

const folders = ref<ProductionFolder[]>([]);
const productions = ref<ProductionRow[]>([]);
const selectedKey = ref('');
const keyword = ref('');
const assets = ref<any[]>([]);
const loading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const materialNodes: TreeNode[] = MATERIAL_CATEGORIES.map((c) => ({
  key: `material:${c.id}`,
  label: c.label,
  icon: c.icon,
  kind: 'category',
  assetProjectId: '_library',
  assetType: c.assetType,
}));

const sections = computed(() => {
  const workNodes: TreeNode[] = [];
  const folderMap = new Map<string, ProductionFolder[]>();

  for (const f of folders.value) {
    const parent = String(f.parentId || '');
    if (!folderMap.has(parent)) folderMap.set(parent, []);
    folderMap.get(parent)!.push(f);
  }

  const rootFolders = (folderMap.get('') || []).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  const addFolder = (f: ProductionFolder, depth = 0) => {
    const node: TreeNode = {
      key: `work:folder:${f.id}`,
      label: f.name || '未命名合集',
      icon: 'folder',
      kind: 'folder',
      folderId: f.id,
      depth,
    };
    workNodes.push(node);
    const children = folderMap.get(f.id) || [];
    for (const child of children) addFolder(child, depth + 1);
    const childProductions = productions.value.filter((p) => String(p.folderId || '') === f.id);
    for (const p of childProductions) {
      workNodes.push({
        key: `work:production:${p.id}`,
        label: p.name || '未命名单集',
        icon: 'clapperboard',
        kind: 'production',
        productionId: p.id,
        assetProjectId: String(p.projectId || p.id),
        depth: depth + 1,
      });
    }
  };
  for (const f of rootFolders) addFolder(f);

  const rootProductions = productions.value.filter((p) => !String(p.folderId || '').trim());
  for (const p of rootProductions) {
    workNodes.push({
      key: `work:production:${p.id}`,
      label: p.name || '未命名单集',
      icon: 'clapperboard',
      kind: 'production',
      productionId: p.id,
      assetProjectId: String(p.projectId || p.id),
      depth: 0,
    });
  }

  return [
    { id: 'materials', label: '素材库', children: materialNodes },
    { id: 'works', label: '我的作品', children: workNodes },
  ];
});

const selectedNode = computed<TreeNode | undefined>(() => {
  const all = [...materialNodes, ...sections.value.flatMap((s) => s.children)];
  return all.find((n) => n.key === selectedKey.value);
});

const folderChildren = computed(() => {
  if (!selectedNode.value || selectedNode.value.kind !== 'folder') return [];
  const fid = selectedNode.value.folderId || '';
  const childFolders = folders.value.filter((f) => String(f.parentId || '') === fid);
  const childProductions = productions.value.filter((p) => String(p.folderId || '') === fid);
  return [
    ...childFolders.map((f) => ({
      key: `work:folder:${f.id}`,
      label: f.name || '未命名合集',
      icon: 'folder' as IconName,
      kind: 'folder' as const,
      folderId: f.id,
    })),
    ...childProductions.map((p) => ({
      key: `work:production:${p.id}`,
      label: p.name || '未命名单集',
      icon: 'clapperboard' as IconName,
      kind: 'production' as const,
      productionId: p.id,
      assetProjectId: String(p.projectId || p.id),
    })),
  ];
});

const canUpload = computed(() => {
  const node = selectedNode.value;
  return node?.kind === 'category' || node?.kind === 'production';
});

const filteredAssets = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return assets.value;
  return assets.value.filter((a) => String(a.name || '').toLowerCase().includes(q));
});

function isSelected(node: TreeNode) {
  return selectedKey.value === node.key;
}

function uploadProjectId(node: TreeNode) {
  if (node.kind === 'category') return node.assetProjectId || '_library';
  if (node.kind === 'production') return node.assetProjectId || node.productionId || '_studio';
  return '';
}

function uploadAssetType(node: TreeNode) {
  return node.kind === 'category' ? node.assetType || 'other' : 'other';
}

async function selectNode(node: TreeNode) {
  selectedKey.value = node.key;
  keyword.value = '';
  if (node.kind === 'folder') {
    assets.value = [];
    return;
  }
  await loadAssets(node);
}

async function loadAssets(node: TreeNode) {
  const projectId = uploadProjectId(node);
  if (!projectId) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/projects/${encodeURIComponent(projectId)}/assets`, {
      params: node.kind === 'category' ? { type: node.assetType } : {},
    });
    assets.value = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  } catch (e: any) {
    assets.value = [];
    ElMessage.error(String(e?.response?.data?.message || e?.message || '加载素材失败'));
  } finally {
    loading.value = false;
  }
}

async function loadTree() {
  try {
    const [prods, fols] = await Promise.all([fetchProductions(), fetchProductionFolders()]);
    productions.value = prods;
    folders.value = fols;
  } catch (e: any) {
    ElMessage.error(String(e?.response?.data?.message || e?.message || '加载项目失败'));
  }
}

function openUpload() {
  fileInput.value?.click();
}

async function onFiles(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  const node = selectedNode.value;
  if (!node || !files.length) return;
  const projectId = uploadProjectId(node);
  if (!projectId) return;
  const type = uploadAssetType(node);

  let ok = 0;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    fd.append('name', file.name);
    try {
      await api.post(`/projects/${encodeURIComponent(projectId)}/assets/upload`, fd);
      ok += 1;
    } catch (e: any) {
      ElMessage.error(String(e?.response?.data?.message || e?.message || `${file.name} 上传失败`));
    }
  }
  if (ok) ElMessage.success(`已上传 ${ok} 个素材`);
  await loadAssets(node);
}

async function removeAsset(a: any) {
  const node = selectedNode.value;
  if (!node) return;
  const projectId = uploadProjectId(node);
  if (!projectId) return;
  try {
    await ElMessageBox.confirm(`确定删除「${a.name || '素材'}」？`, '删除素材', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await api.delete(`/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(a.id)}`);
    ElMessage.success('已删除');
    await loadAssets(node);
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(String(e?.response?.data?.message || e?.message || '删除失败'));
  }
}

function assetUrl(a: { url?: string }) {
  return resolveMediaUrl(String(a?.url || ''));
}

function isImage(a: any) {
  return /^image\//i.test(a.mimeType || '') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url || '');
}

function isVideo(a: any) {
  return /^video\//i.test(a.mimeType || '') || /\.(mp4|webm|mov)(\?|$)/i.test(a.url || '');
}

function isAudio(a: any) {
  return /^audio\//i.test(a.mimeType || '') || /\.(mp3|wav|ogg|m4a)(\?|$)/i.test(a.url || '');
}

function typeLabel(type?: string) {
  const map: Record<string, string> = {
    scene: '场景',
    character_ref: '角色',
    prop: '道具',
    style: '风格',
    pose: '姿势',
    fx: '特效',
    expression: '表情',
    voice: '音色',
    sfx: '音效',
    video: '视频',
    image: '图片',
    other: '其他',
  };
  return map[String(type || '')] || String(type || '其他');
}

onMounted(async () => {
  await loadTree();
  selectedKey.value = materialNodes[0].key;
  if (selectedNode.value) await loadAssets(selectedNode.value);
});
</script>

<style scoped>
.asset-lib {
  --tree-width: 250px;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--tree-width) minmax(0, 1fr);
  background: var(--studio-bg);
  color: var(--studio-ink);
}
.tree-panel {
  border-right: 1px solid var(--studio-line-strong);
  background: var(--studio-panel);
  padding: 22px 14px;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tree-scroll {
  flex: 1;
  min-height: 0;
}
.tree-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 0 6px;
}
.tree-head h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.tree {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.section-label {
  padding: 0 8px 7px;
  color: var(--studio-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.tree-node:hover {
  background: var(--studio-glass);
  color: var(--studio-ink);
}
.tree-node.on {
  background: rgba(37, 99, 235, 0.14);
  color: #eff6ff;
}
.tree-node span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-node em {
  color: var(--studio-muted);
  font-style: normal;
  font-size: 11px;
}
.content {
  min-width: 0;
  min-height: 0;
  padding: 24px 26px 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.content-scroll {
  flex: 1;
  min-height: 0;
  padding-bottom: 56px;
}
.content-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.eyebrow {
  margin: 0 0 6px;
  color: #3b82f6;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.content-head h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search {
  width: 240px;
}
.empty {
  display: grid;
  place-items: center;
  min-height: 320px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 12px;
  min-height: 180px;
}
.grid-empty {
  grid-column: 1 / -1;
  display: grid;
  place-items: center;
  min-height: 360px;
}
.card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: #141414;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.card:hover {
  transform: translateY(-2px);
  border-color: rgba(59, 130, 246, 0.45);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
}
.card .thumb {
  position: relative;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #2a2a2a, #121212);
  color: var(--studio-muted);
  overflow: hidden;
}
.card .thumb :deep(.lazy-cover),
.card .thumb img,
.card .thumb video,
.card .thumb .asset-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transform: scale(1.02);
  transition: transform 0.35s ease;
}
.card:hover .thumb :deep(.lazy-cover),
.card:hover .thumb img,
.card:hover .thumb video,
.card:hover .thumb .asset-video {
  transform: scale(1.08);
}
.media-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  padding: 12px;
  color: #737373;
}
.media-fallback audio {
  width: 100%;
}
.name-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  padding: 22px 10px 10px;
  font-size: 12px;
  font-weight: 550;
  line-height: 1.3;
  color: #fff;
  text-align: center;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.78));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.type-pill {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 1;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  pointer-events: none;
}
.folder-card .thumb {
  color: #93c5fd;
}
.delete {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
  line-height: 1;
  font-size: 16px;
}
.card:hover .delete {
  opacity: 1;
}
.delete:hover {
  background: rgba(239, 68, 68, 0.85);
}
@media (max-width: 820px) {
  .asset-lib {
    grid-template-columns: 1fr;
  }
  .tree-panel {
    border-right: 0;
    border-bottom: 1px solid var(--studio-line-strong);
  }
  .content-head {
    flex-direction: column;
  }
  .head-actions {
    width: 100%;
  }
  .search {
    flex: 1;
  }
}
</style>
