<template>
  <Teleport to="body">
    <div v-if="open" class="irm-mask" @click.self="emit('close')">
      <div class="irm" role="dialog" aria-label="替换节点内容" @mousedown.stop @click.stop>
        <header class="irm-head">
          <div class="title">
            <UiIcon name="image" :size="16" />
            <strong>替换节点内容</strong>
          </div>
          <button type="button" class="x" title="关闭" @click="emit('close')">×</button>
        </header>

        <div class="irm-bar">
          <div class="tabs">
            <button
              v-for="t in tabs"
              :key="t.id"
              type="button"
              class="tab"
              :class="{ on: tab === t.id }"
              @click="tab = t.id"
            >
              {{ t.label }}
            </button>
          </div>
          <label v-if="tab !== 'upload'" class="search">
            <UiIcon name="search" :size="13" />
            <input v-model="keyword" type="search" :placeholder="searchPh" />
          </label>
        </div>

        <div class="irm-body" v-loading="loading">
          <template v-if="tab === 'canvas'">
            <button
              v-for="n in filteredCanvas"
              :key="n.id"
              type="button"
              class="card"
              @click="pickUrl(n.url, n.label)"
            >
              <div class="thumb">
                <img v-if="n.url" :src="n.url" alt="" />
                <UiIcon v-else name="image" :size="22" />
              </div>
              <strong>{{ n.label }}</strong>
            </button>
            <div v-if="!filteredCanvas.length" class="empty">没有同类型画布节点</div>
          </template>

          <template v-else-if="tab === 'project' || tab === 'global'">
            <button
              v-for="a in filteredAssets"
              :key="a.id"
              type="button"
              class="card"
              @click="pickUrl(String(a.url || ''), a.name, a.id)"
            >
              <div class="thumb">
                <img v-if="a.url" :src="a.url" alt="" />
                <UiIcon v-else name="image" :size="22" />
              </div>
              <strong>{{ a.name || a.id.slice(0, 8) }}</strong>
            </button>
            <div v-if="!loading && !filteredAssets.length" class="empty">暂无可用图片素材</div>
          </template>

          <template v-else>
            <div
              class="drop"
              :class="{ over: dragOver }"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop.prevent="onDrop"
            >
              <UiIcon name="upload" :size="28" />
              <strong>拖拽图片到此处上传</strong>
              <p>支持 PNG / JPG / WEBP / GIF</p>
              <button type="button" class="pick" :disabled="uploading" @click="pickLocal">
                {{ uploading ? '上传中…' : '选择本地文件' }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/api';
import UiIcon from '@/components/icons/UiIcon.vue';
import { pickLocalFile, uploadProjectAsset } from '@/utils/upload-asset';

export type ImageReplaceCanvasItem = {
  id: string;
  label: string;
  url: string;
};

type AssetRow = {
  id: string;
  name?: string;
  type?: string;
  url?: string;
  meta?: Record<string, unknown>;
};

const props = defineProps<{
  open: boolean;
  projectId?: string;
  workflowId?: string;
  workflowName?: string;
  canvasNodes: ImageReplaceCanvasItem[];
}>();

const emit = defineEmits<{
  close: [];
  apply: [payload: { url: string; assetId?: string }];
}>();

const tabs = [
  { id: 'canvas', label: '画布节点' },
  { id: 'project', label: '本项目素材' },
  { id: 'global', label: '跨项目素材' },
  { id: 'upload', label: '本地上传' },
] as const;

type TabId = (typeof tabs)[number]['id'];

const tab = ref<TabId>('canvas');
const keyword = ref('');
const loading = ref(false);
const uploading = ref(false);
const assets = ref<AssetRow[]>([]);
const dragOver = ref(false);

const searchPh = computed(() => (tab.value === 'canvas' ? '搜索画布节点' : '搜索素材'));

const filteredCanvas = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return props.canvasNodes.filter((n) => {
    if (!n.url) return false;
    if (!kw) return true;
    return `${n.label} ${n.url}`.toLowerCase().includes(kw);
  });
});

const filteredAssets = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return assets.value.filter((a) => {
    if (!kw) return true;
    return `${a.name || ''} ${a.type || ''}`.toLowerCase().includes(kw);
  });
});

watch(
  () => props.open,
  (v) => {
    if (!v) return;
    tab.value = 'canvas';
    keyword.value = '';
    dragOver.value = false;
    void loadAssets();
  },
);

watch(tab, () => {
  keyword.value = '';
  if (tab.value === 'project' || tab.value === 'global') void loadAssets();
});

function isImageAsset(a: AssetRow) {
  const type = String(a.type || '');
  const url = String(a.url || '');
  if (type === 'image' || type === 'portrait' || type === 'storyboard' || type === 'keyframe') {
    return true;
  }
  return /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(url) || url.startsWith('data:image');
}

async function loadAssets() {
  if (!props.projectId) {
    assets.value = [];
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.get(`/projects/${props.projectId}/assets`);
    const list: AssetRow[] = Array.isArray(data) ? data : data?.items || [];
    const wid = String(props.workflowId || '').trim();
    assets.value = list.filter((a) => {
      if (!isImageAsset(a) || !a.url) return false;
      if (tab.value === 'project' && wid) {
        return String(a.meta?.workflowId || '') === wid || !a.meta?.workflowId;
      }
      return true;
    });
  } catch {
    assets.value = [];
  } finally {
    loading.value = false;
  }
}

function pickUrl(url: string, _label?: string, assetId?: string) {
  const u = String(url || '').trim();
  if (!u) {
    ElMessage.warning('无效图片');
    return;
  }
  emit('apply', { url: u, assetId });
  emit('close');
}

async function pickLocal() {
  const files = await pickLocalFile({ accept: 'image/*', multiple: false });
  if (!files[0]) return;
  await uploadFile(files[0]);
}

function onDrop(ev: DragEvent) {
  dragOver.value = false;
  const file = ev.dataTransfer?.files?.[0];
  if (file) void uploadFile(file);
}

async function uploadFile(file: File) {
  if (!props.projectId) {
    ElMessage.warning('缺少项目，无法上传');
    return;
  }
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请上传图片文件');
    return;
  }
  uploading.value = true;
  try {
    const asset = await uploadProjectAsset(props.projectId, file, {
      type: 'storyboard',
      name: file.name,
      workflowId: props.workflowId,
      workflowName: props.workflowName,
    });
    pickUrl(asset.url || '', file.name, asset.id);
  } catch {
    ElMessage.error('上传失败');
  } finally {
    uploading.value = false;
  }
}
</script>

<style scoped>
.irm-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 24px;
}
.irm {
  width: min(780px, 100%);
  max-height: min(78vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-3);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  color: var(--studio-text);
  overflow: hidden;
}
.irm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--studio-glass-2);
}
.title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.title strong {
  font-size: 15px;
  font-weight: 650;
}
.x {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text-soft);
  font-size: 18px;
  cursor: pointer;
}
.x:hover {
  background: var(--studio-glass-2);
  color: #fff;
}
.irm-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--studio-glass-2);
  flex-wrap: wrap;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.tab {
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--studio-line-strong);
  background: transparent;
  color: var(--studio-text-soft);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.tab:hover {
  color: var(--studio-text-strong);
  border-color: var(--studio-line-bright);
}
.tab.on {
  border-color: #fff;
  color: #fff;
  font-weight: 650;
}
.search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--studio-glass-3);
  color: var(--studio-text-faint);
  min-width: 180px;
  margin-left: auto;
}
.search input {
  border: 0 !important;
  background: transparent !important;
  color: #fff !important;
  outline: none;
  width: 140px;
  font: inherit;
  font-size: 12px;
}
.irm-body {
  flex: 1;
  min-height: 280px;
  overflow: auto;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  align-content: start;
}
.card {
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.thumb {
  aspect-ratio: 1;
  border-radius: 12px;
  background: var(--studio-glass-2);
  border: 1px solid var(--studio-glass-2);
  display: grid;
  place-items: center;
  color: var(--studio-text-faint);
  margin-bottom: 8px;
  overflow: hidden;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card:hover .thumb {
  border-color: var(--studio-line-bright);
}
.card strong {
  display: block;
  font-size: 12px;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 48px 16px;
  color: var(--studio-text-faint);
  font-size: 13px;
}
.drop {
  grid-column: 1 / -1;
  min-height: 280px;
  border: 1px dashed var(--studio-line-strong);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--studio-text-faint);
  text-align: center;
  padding: 24px;
}
.drop.over {
  border-color: var(--studio-text-faint);
  background: var(--studio-glass);
}
.drop strong {
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}
.drop p {
  margin: 0;
  font-size: 12px;
}
.pick {
  margin-top: 8px;
  height: 40px;
  padding: 0 22px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-ink);
  color: var(--studio-inset);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.pick:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pick:hover:not(:disabled) {
  background: #f0f0f0;
}
</style>
