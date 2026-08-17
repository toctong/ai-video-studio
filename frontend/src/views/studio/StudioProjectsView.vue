<template>
  <div class="projects-page">
    <header class="projects-head">
      <div class="head-left">
        <button
          type="button"
          class="back-btn"
          :title="currentFolderId ? '返回全部项目' : '返回首页'"
          @click="onBack"
        >
          <UiIcon name="arrow-left" :size="18" />
        </button>
        <nav class="crumb" aria-label="路径">
          <button
            type="button"
            class="crumb-link"
            :class="{ active: !currentFolderId, 'drop-target': dropTarget === 'root' }"
            @click="goRoot"
            @dragover.prevent="onRootDragOver"
            @dragleave="onRootDragLeave"
            @drop.prevent="onRootDrop"
          >
            我的项目
          </button>
          <template v-for="(crumb, idx) in folderPath" :key="crumb.id">
            <span class="crumb-sep">/</span>
            <button
              v-if="idx < folderPath.length - 1"
              type="button"
              class="crumb-link"
              @click="enterFolder(crumb)"
            >
              {{ crumb.name }}
            </button>
            <span v-else class="crumb-current">{{ crumb.name }}</span>
          </template>
        </nav>
      </div>
      <div class="head-right">
        <template v-if="selectMode">
          <button
            type="button"
            class="head-action"
            :disabled="!selectedCount"
            title="移动至"
            @click="openMoveDialog"
          >
            <UiIcon name="folder-input" :size="15" />
            <span>移动至</span>
          </button>
          <button
            type="button"
            class="head-action"
            :disabled="!selectedCount"
            title="删除"
            @click="batchRemove"
          >
            <UiIcon name="trash" :size="15" />
            <span>删除</span>
          </button>
          <button type="button" class="head-btn outline" @click="exitSelectMode">取消</button>
        </template>
        <button
          v-else
          type="button"
          class="head-btn outline"
          title="多选"
          @click="enterSelectMode"
        >
          多选
        </button>
        <button type="button" class="head-btn outline" title="创建合集" @click="createFolder">
          <UiIcon name="folder-plus" :size="15" />
          <span>创建合集</span>
        </button>
        <label class="search-pill">
          <UiIcon name="search" :size="15" />
          <input v-model="keyword" type="search" placeholder="搜索" />
        </label>
      </div>
    </header>

    <div class="project-grid" v-loading="loading">
      <button type="button" class="proj-card create" :disabled="creating" @click="router.push('/films?new=1')">
        <UiIcon name="clapperboard" :size="32" />
        <span>制作大片</span>
      </button>
      <article
        v-for="f in visibleFolders"
        :key="'f-' + f.id"
        class="proj-card folder"
        :class="{
          selected: isFolderSelected(f.id),
          'drop-target': dropTarget === f.id,
          'select-mode': selectMode,
        }"
        draggable="true"
        @click="onFolderClick(f)"
        @dragstart="onFolderDragStart(f, $event)"
        @dragend="onProdDragEnd"
        @dragover.prevent="onFolderDragOver(f, $event)"
        @dragleave="onFolderDragLeave(f)"
        @drop.prevent="onFolderDrop(f, $event)"
      >
        <button
          v-if="selectMode"
          type="button"
          class="sel-check"
          :class="{ on: isFolderSelected(f.id) }"
          title="选择"
          @click.stop="toggleFolderSelect(f.id)"
        >
          <UiIcon v-if="isFolderSelected(f.id)" name="check" :size="12" />
        </button>
        <div class="folder-body">
          <UiIcon name="folder" :size="56" class="folder-icon" />
          <strong :title="f.name">{{ f.name || '未命名合集' }}</strong>
        </div>
        <div class="card-ops" @click.stop>
          <button type="button" title="移动" :disabled="busyId === f.id" @click="openMoveFolder(f)">
            <UiIcon name="folder-input" :size="16" />
          </button>
          <button type="button" title="重命名" :disabled="busyId === f.id" @click="renameFolder(f)">
            <UiIcon name="pencil" :size="16" />
          </button>
          <button
            type="button"
            title="删除"
            class="danger"
            :disabled="busyId === f.id"
            @click="removeFolder(f)"
          >
            <UiIcon name="trash" :size="16" />
          </button>
        </div>
      </article>

      <article
        v-for="p in filteredProjects"
        :key="p.id"
        class="proj-card item"
        :class="{ selected: isProdSelected(p.id), 'select-mode': selectMode }"
        draggable="true"
        @click="onProdClick(p)"
        @dragstart="onProdDragStart(p, $event)"
        @dragend="onProdDragEnd"
      >
        <button
          v-if="selectMode"
          type="button"
          class="sel-check"
          :class="{ on: isProdSelected(p.id) }"
          title="选择"
          @click.stop="toggleProdSelect(p.id)"
        >
          <UiIcon v-if="isProdSelected(p.id)" name="check" :size="12" />
        </button>
        <div class="thumb" :class="{ empty: !p.thumbUrl }">
          <MediaThumb v-if="p.thumbUrl" :url="p.thumbUrl" />
          <div class="card-ops" @click.stop>
            <button type="button" title="移动" :disabled="busyId === p.id" @click="openMoveProd(p)">
              <UiIcon name="folder-input" :size="16" />
            </button>
            <button type="button" title="复制" :disabled="busyId === p.id" @click="duplicateProd(p)">
              <UiIcon name="copy" :size="16" />
            </button>
            <button type="button" title="重命名" :disabled="busyId === p.id" @click="renameProd(p)">
              <UiIcon name="pencil" :size="16" />
            </button>
            <button
              type="button"
              title="删除"
              class="danger"
              :disabled="busyId === p.id"
              @click="removeProd(p)"
            >
              <UiIcon name="trash" :size="16" />
            </button>
          </div>
        </div>
        <div class="meta">
          <strong :title="p.name">{{ p.name || '未命名单集' }}</strong>
          <em>编辑于 {{ relativeTime(p) }}</em>
        </div>
      </article>
    </div>

    <p v-if="!loading && (filteredProjects.length || visibleFolders.length)" class="end-hint">
      没有更多项目了
    </p>
    <p v-else-if="!loading" class="end-hint">
      {{ currentFolderId ? '合集是空的，点「制作大片」开始' : '还没有项目，点「制作大片」开始' }}
    </p>

    <Teleport to="body">
      <div v-if="moveOpen" class="move-mask" @click.self="closeMoveDialog">
        <div class="move-dialog" role="dialog" aria-modal="true" aria-label="移动至">
          <header class="move-head">
            <h2>移动至</h2>
            <button type="button" class="move-close" title="关闭" @click="closeMoveDialog">
              <UiIcon name="x" :size="18" />
            </button>
          </header>
          <div class="move-list">
            <button
              type="button"
              class="move-row root"
              :class="{ active: moveTargetId === '' }"
              @click="moveTargetId = ''"
            >
              <UiIcon name="folder" :size="18" />
              <span>我的项目</span>
            </button>
            <button
              v-for="f in moveFolderOptions"
              :key="f.id"
              type="button"
              class="move-row child"
              :class="{ active: moveTargetId === f.id }"
              :style="{ paddingLeft: `${24 + f.depth * 18}px` }"
              @click="moveTargetId = f.id"
            >
              <UiIcon name="folder" :size="18" />
              <span>{{ f.name || '未命名合集' }}</span>
            </button>
          </div>
          <footer class="move-foot">
            <button type="button" class="head-btn outline" @click="closeMoveDialog">取消</button>
            <button type="button" class="head-btn solid" :disabled="moving" @click="confirmMove">
              {{ moving ? '移动中…' : '移动' }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <input
      ref="importInput"
      type="file"
      accept="application/json,.json"
      hidden
      @change="onImportFile"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  createProduction,
  createProductionFolder,
  deleteProduction,
  deleteProductionFolder,
  fetchProduction,
  fetchProductionFolders,
  fetchProductions,
  updateProduction,
  updateProductionFolder,
  type ProductionFolder,
  type ProductionRow,
} from '@/api/productions';
import { isFilmCollection, isFilmEpisode, isFilmProject } from '@/api/film-projects';
import { createWorkflow } from '@/api/workflows';
import { createBlankProduction, ensureCompiledProduction } from '@/utils/compile-production';
import { routeImportedJson } from '@/utils/import-workflow-json';
import UiIcon from '@/components/icons/UiIcon.vue';
import MediaThumb from '@/components/MediaThumb.vue';

const PROD_MIME = 'application/x-production';
const FOLDER_MIME = 'application/x-production-folder';

const router = useRouter();
const loading = ref(false);
const creating = ref(false);
const busyId = ref('');
const keyword = ref('');
const rows = ref<ProductionRow[]>([]);
const folders = ref<ProductionFolder[]>([]);
const currentFolderId = ref('');
const importInput = ref<HTMLInputElement | null>(null);

const selectMode = ref(false);
const selectedProdIds = ref<Set<string>>(new Set());
const selectedFolderIds = ref<Set<string>>(new Set());

const dropTarget = ref<string | null>(null);
const draggingProdId = ref('');
const draggingFolderId = ref('');

const moveOpen = ref(false);
const moveTargetId = ref('');
const moving = ref(false);
const moveProdIds = ref<string[]>([]);
const moveFolderIds = ref<string[]>([]);

const currentFolder = computed(() =>
  folders.value.find((f) => f.id === currentFolderId.value) || null,
);

const folderPath = computed(() => {
  const path: ProductionFolder[] = [];
  let id = currentFolderId.value;
  const guard = new Set<string>();
  while (id && !guard.has(id)) {
    guard.add(id);
    const f = folders.value.find((x) => x.id === id);
    if (!f) break;
    path.unshift(f);
    id = String(f.parentId || '');
  }
  return path;
});

const selectedCount = computed(
  () => selectedProdIds.value.size + selectedFolderIds.value.size,
);

const visibleFolders = computed(() => {
  const parent = currentFolderId.value;
  const q = keyword.value.trim().toLowerCase();
  let list = folders.value.filter((f) => String(f.parentId || '') === parent);
  list = [...list].sort(
    (a, b) =>
      (a.sortOrder || 0) - (b.sortOrder || 0) ||
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
  );
  if (q) list = list.filter((f) => f.name.toLowerCase().includes(q));
  return list;
});

const moveBlockedFolderIds = computed(() => {
  const blocked = new Set(moveFolderIds.value);
  for (const id of moveFolderIds.value) {
    for (const d of collectDescendantIds(id)) blocked.add(d);
  }
  return blocked;
});

const moveFolderOptions = computed(() => {
  const byParent = new Map<string, ProductionFolder[]>();
  for (const f of folders.value) {
    if (moveBlockedFolderIds.value.has(f.id)) continue;
    const p = String(f.parentId || '');
    const list = byParent.get(p) || [];
    list.push(f);
    byParent.set(p, list);
  }
  for (const list of byParent.values()) {
    list.sort(
      (a, b) =>
        (a.sortOrder || 0) - (b.sortOrder || 0) ||
        String(a.name || '').localeCompare(String(b.name || '')),
    );
  }
  const out: Array<ProductionFolder & { depth: number }> = [];
  const walk = (parentId: string, depth: number) => {
    for (const f of byParent.get(parentId) || []) {
      out.push({ ...f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk('', 0);
  return out;
});

function collectDescendantIds(rootId: string) {
  const byParent = new Map<string, string[]>();
  for (const f of folders.value) {
    const p = String(f.parentId || '');
    const list = byParent.get(p) || [];
    list.push(f.id);
    byParent.set(p, list);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of byParent.get(cur) || []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}
const filteredProjects = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  const fid = currentFolderId.value;
  let list = rows.value.filter((p) => String(p.folderId || '') === fid);
  list = [...list].sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
  );
  if (!q) return list;
  return list.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.tags?.some((t) => t.toLowerCase().includes(q)),
  );
});

function relativeTime(p: ProductionRow) {
  const raw = p.updatedAt || p.createdAt;
  if (!raw) return '刚刚';
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return '刚刚';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

function isProdSelected(id: string) {
  return selectedProdIds.value.has(id);
}
function isFolderSelected(id: string) {
  return selectedFolderIds.value.has(id);
}

function enterSelectMode() {
  selectMode.value = true;
}

function exitSelectMode() {
  selectMode.value = false;
  selectedProdIds.value = new Set();
  selectedFolderIds.value = new Set();
}

function toggleProdSelect(id: string) {
  if (!selectMode.value) return;
  const next = new Set(selectedProdIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedProdIds.value = next;
}

function toggleFolderSelect(id: string) {
  if (!selectMode.value) return;
  const next = new Set(selectedFolderIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedFolderIds.value = next;
}

function goRoot() {
  currentFolderId.value = '';
  exitSelectMode();
}

function enterFolder(f: ProductionFolder) {
  currentFolderId.value = f.id;
  exitSelectMode();
}

function onBack() {
  if (currentFolderId.value) {
    const parent = String(currentFolder.value?.parentId || '');
    currentFolderId.value = parent;
    exitSelectMode();
    return;
  }
  router.push('/home');
}

async function load() {
  loading.value = true;
  try {
    const [prods, fols] = await Promise.all([fetchProductions(), fetchProductionFolders()]);
    rows.value = prods;
    folders.value = fols;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function createBlank() {
  creating.value = true;
  try {
    const production = await createBlankProduction({
      name: '未命名单集',
      folderId: currentFolderId.value || '',
    });
    ElMessage.success('已创建项目');
    await load();
    await openProduction(production);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function createFolder() {
  try {
    const { value } = await ElMessageBox.prompt('输入合集名称', '创建合集', {
      inputValue: '我的合集',
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputValidator: (v) => (!!String(v || '').trim() ? true : '名称不能为空'),
    });
    await createProductionFolder({
      name: String(value).trim(),
      parentId: currentFolderId.value || '',
    });
    ElMessage.success('已创建合集');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败');
  }
}

function onFolderClick(f: ProductionFolder) {
  if (selectMode.value) {
    toggleFolderSelect(f.id);
    return;
  }
  enterFolder(f);
}

function onProdClick(p: ProductionRow) {
  if (selectMode.value) {
    toggleProdSelect(p.id);
    return;
  }
  void openProduction(p);
}

async function openProduction(p: ProductionRow) {
  try {
    // 大片单集 → 六步流水线；合集 → 合集页
    if (isFilmCollection(p)) {
      await router.push(`/films/c/${p.id}`);
      return;
    }
    if (isFilmEpisode(p) || isFilmProject(p)) {
      await router.push({ path: `/films/${p.id}`, query: { step: '1' } });
      return;
    }

    const { production } = await ensureCompiledProduction({ production: p });
    await router.push({ path: `/films/${production.id}`, query: { step: '1' } });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '打开失败');
  }
}

async function openImportedWorkflow(opts: {
  name: string;
  description?: string;
  tags?: string[];
  document: import('@ai-video-studio/shared').WorkflowDocument;
  toast?: string;
}) {
  const { production } = await ensureCompiledProduction({
    create: {
      name: opts.name,
      description: opts.description || '从 JSON 导入',
      tags: opts.tags || ['imported'],
      script: '',
      folderId: currentFolderId.value || '',
    },
  });
  const w = await createWorkflow({
    name: production.name,
    description: production.description,
    graph: opts.document,
    tags: [...(production.tags || []), `production:${production.id}`],
  });
  await updateProduction(production.id, { workflowId: w.id, status: 'ready' });
  ElMessage.success(opts.toast || '已导入');
  await load();
  ElMessage.info('已创建项目，可进入「制作大片」继续生成');
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  creating.value = true;
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const routed = routeImportedJson(raw, file.name.replace(/\.json$/i, '') || '导入');

    if (routed.kind === 'production') {
      const body = routed.body;
      const { production } = await ensureCompiledProduction({
        create: {
          name: routed.name,
          description: String(body.description || '从 JSON 导入'),
          script: String(body.script || ''),
          cast: Array.isArray(body.cast) ? (body.cast as any) : [],
          scenes: Array.isArray(body.scenes) ? (body.scenes as any) : [],
          style: body.style && typeof body.style === 'object' ? (body.style as any) : {},
          templateId: String(body.templateId || ''),
          tags: Array.isArray(body.tags) ? (body.tags as string[]) : ['imported'],
          thumbUrl: String(body.thumbUrl || ''),
          folderId: currentFolderId.value || '',
        },
        forceRecompile: true,
      });
      ElMessage.success('已导入项目');
      await load();
      await openProduction(production);
      return;
    }

    if (routed.kind === 'comfy') {
      await ElMessageBox.alert(routed.summary, 'Comfy 导入报告', {
        confirmButtonText: routed.report.stats.mapped ? '打开画布' : '知道了',
      });
      if (!routed.report.stats.mapped) return;
      await openImportedWorkflow({
        name: `Comfy·${routed.name}`.slice(0, 48),
        description: `从 ComfyUI（${routed.source}）导入`,
        tags: ['imported', 'comfy'],
        document: routed.document,
        toast: `已导入 Comfy 图（映射 ${routed.report.stats.mapped} 节点）`,
      });
      return;
    }

    if (routed.kind === 'nodepack') {
      await openImportedWorkflow({
        name: routed.name,
        description: routed.pack.description || '节点包导入',
        tags: [...(routed.pack.tags || []), 'imported', 'nodepack'],
        document: routed.pack.document,
        toast: '已导入节点包为新项目',
      });
      return;
    }

    await openImportedWorkflow({
      name: routed.name,
      description: routed.description,
      tags: routed.tags,
      document: routed.document,
    });
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '导入失败');
  } finally {
    creating.value = false;
  }
}

async function duplicateProd(p: ProductionRow) {
  busyId.value = p.id;
  try {
    const full = await fetchProduction(p.id);
    await createProduction({
      name: `${full.name || '未命名单集'} 副本`,
      description: full.description,
      script: full.script,
      cast: full.cast,
      scenes: full.scenes,
      style: full.style,
      assetIds: full.assetIds,
      templateId: full.templateId,
      shotLibraryId: full.shotLibraryId,
      tags: [...(full.tags || []), 'copy'],
      thumbUrl: full.thumbUrl,
      meta: { ...(full.meta || {}), copiedFrom: full.id },
      status: 'draft',
      folderId: full.folderId || currentFolderId.value || '',
    });
    ElMessage.success('已复制');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '复制失败');
  } finally {
    busyId.value = '';
  }
}

async function renameProd(p: ProductionRow) {
  try {
    const { value } = await ElMessageBox.prompt('输入新的项目名称', '重命名', {
      inputValue: p.name || '未命名单集',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (v) => (!!String(v || '').trim() ? true : '名称不能为空'),
    });
    busyId.value = p.id;
    await updateProduction(p.id, { name: String(value).trim() });
    ElMessage.success('已重命名');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '重命名失败');
  } finally {
    busyId.value = '';
  }
}

async function removeProd(p: ProductionRow) {
  try {
    await ElMessageBox.confirm(`确定删除「${p.name || '未命名'}」？此操作不可恢复。`, '删除项目', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    busyId.value = p.id;
    await deleteProduction(p.id);
    ElMessage.success('已删除');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  } finally {
    busyId.value = '';
  }
}

async function renameFolder(f: ProductionFolder) {
  try {
    const { value } = await ElMessageBox.prompt('输入新的合集名称', '重命名合集', {
      inputValue: f.name || '我的合集',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValidator: (v) => (!!String(v || '').trim() ? true : '名称不能为空'),
    });
    busyId.value = f.id;
    await updateProductionFolder(f.id, { name: String(value).trim() });
    ElMessage.success('已重命名');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '重命名失败');
  } finally {
    busyId.value = '';
  }
}

async function removeFolder(f: ProductionFolder) {
  try {
    await ElMessageBox.confirm(
      `确定删除合集「${f.name || '未命名'}」？其中的单集与子合集将一并删除，不可恢复。`,
      '删除合集',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
    busyId.value = f.id;
    const parent = String(f.parentId || '');
    await deleteProductionFolder(f.id);
    if (currentFolderId.value === f.id) currentFolderId.value = parent;
    ElMessage.success('已删除合集');
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  } finally {
    busyId.value = '';
  }
}

function onProdDragStart(p: ProductionRow, ev: DragEvent) {
  if (selectMode.value) {
    ev.preventDefault();
    return;
  }
  draggingProdId.value = p.id;
  draggingFolderId.value = '';
  ev.dataTransfer?.setData(PROD_MIME, p.id);
  ev.dataTransfer!.effectAllowed = 'move';
}

function onFolderDragStart(f: ProductionFolder, ev: DragEvent) {
  if (selectMode.value) {
    ev.preventDefault();
    return;
  }
  draggingFolderId.value = f.id;
  draggingProdId.value = '';
  ev.dataTransfer?.setData(FOLDER_MIME, f.id);
  ev.dataTransfer!.effectAllowed = 'move';
}

function onProdDragEnd() {
  draggingProdId.value = '';
  draggingFolderId.value = '';
  dropTarget.value = null;
}

function readProdDragId(ev: DragEvent) {
  return ev.dataTransfer?.getData(PROD_MIME) || draggingProdId.value || '';
}

function readFolderDragId(ev: DragEvent) {
  return ev.dataTransfer?.getData(FOLDER_MIME) || draggingFolderId.value || '';
}

function onFolderDragOver(f: ProductionFolder, ev: DragEvent) {
  const types = ev.dataTransfer?.types;
  const hasProd =
    !!draggingProdId.value || (types && [...types].includes(PROD_MIME));
  const hasFolder =
    !!draggingFolderId.value || (types && [...types].includes(FOLDER_MIME));
  if (!hasProd && !hasFolder) return;
  if (draggingFolderId.value === f.id) return;
  dropTarget.value = f.id;
}

function onFolderDragLeave(f: ProductionFolder) {
  if (dropTarget.value === f.id) dropTarget.value = null;
}

async function onFolderDrop(f: ProductionFolder, ev: DragEvent) {
  dropTarget.value = null;
  const folderId = readFolderDragId(ev);
  if (folderId) {
    if (folderId === f.id) return;
    try {
      await updateProductionFolder(folderId, { parentId: f.id });
      ElMessage.success(`已移入「${f.name}」`);
      await load();
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || e?.message || '移动失败');
    }
    return;
  }
  const id = readProdDragId(ev);
  if (!id) return;
  try {
    await updateProduction(id, { folderId: f.id });
    ElMessage.success(`已移入「${f.name}」`);
    await load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '移动失败');
  }
}

function onRootDragOver(ev: DragEvent) {
  const types = ev.dataTransfer?.types;
  const hasProd =
    !!draggingProdId.value || (types && [...types].includes(PROD_MIME));
  const hasFolder =
    !!draggingFolderId.value || (types && [...types].includes(FOLDER_MIME));
  if (!hasProd && !hasFolder) return;
  dropTarget.value = 'root';
}

function onRootDragLeave() {
  if (dropTarget.value === 'root') dropTarget.value = null;
}

async function onRootDrop(ev: DragEvent) {
  dropTarget.value = null;
  const folderId = readFolderDragId(ev);
  if (folderId) {
    try {
      await updateProductionFolder(folderId, { parentId: '' });
      ElMessage.success('已移回我的项目');
      await load();
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.message || e?.message || '移动失败');
    }
    return;
  }
  const id = readProdDragId(ev);
  if (!id) return;
  try {
    await updateProduction(id, { folderId: '' });
    ElMessage.success('已移回我的项目');
    await load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '移动失败');
  }
}

function beginMoveDialog(prodIds: string[], folderIds: string[]) {
  if (!prodIds.length && !folderIds.length) return;
  moveProdIds.value = prodIds;
  moveFolderIds.value = folderIds;
  moveTargetId.value = '';
  moveOpen.value = true;
}

function openMoveDialog() {
  if (!selectedCount.value) return;
  beginMoveDialog([...selectedProdIds.value], [...selectedFolderIds.value]);
}

function openMoveProd(p: ProductionRow) {
  beginMoveDialog([p.id], []);
}

function openMoveFolder(f: ProductionFolder) {
  beginMoveDialog([], [f.id]);
}

function closeMoveDialog() {
  moveOpen.value = false;
  moveProdIds.value = [];
  moveFolderIds.value = [];
}

async function confirmMove() {
  const prodIds = [...moveProdIds.value];
  const folderIds = [...moveFolderIds.value];
  if (!prodIds.length && !folderIds.length) {
    closeMoveDialog();
    return;
  }
  const target = String(moveTargetId.value || '');
  if (folderIds.some((id) => id === target || moveBlockedFolderIds.value.has(target))) {
    ElMessage.warning('不能移动到自身或其子文件夹');
    return;
  }
  moving.value = true;
  try {
    for (const id of prodIds) {
      await updateProduction(id, { folderId: target });
    }
    for (const id of folderIds) {
      await updateProductionFolder(id, { parentId: target });
    }
    const n = prodIds.length + folderIds.length;
    ElMessage.success(`已移动 ${n} 项`);
    closeMoveDialog();
    exitSelectMode();
    await load();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '移动失败');
  } finally {
    moving.value = false;
  }
}

async function batchRemove() {
  if (!selectedCount.value) return;
  const prodN = selectedProdIds.value.size;
  const folderN = selectedFolderIds.value.size;
  let msg = '';
  if (prodN && folderN) {
    msg = `确定删除 ${prodN} 个项目和 ${folderN} 个文件夹？文件夹内的项目与子文件夹将一并删除，不可恢复。`;
  } else if (prodN) {
    msg = `确定删除选中的 ${prodN} 个项目？此操作不可恢复。`;
  } else {
    msg = `确定删除选中的 ${folderN} 个文件夹？其中的项目与子文件夹将一并删除，不可恢复。`;
  }
  try {
    await ElMessageBox.confirm(msg, '批量删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    const prodIds = [...selectedProdIds.value];
    const folderIds = [...selectedFolderIds.value];
    for (const id of prodIds) {
      await deleteProduction(id);
    }
    for (const id of folderIds) {
      await deleteProductionFolder(id);
    }
    if (folderIds.includes(currentFolderId.value)) {
      let id = currentFolderId.value;
      while (id && folderIds.includes(id)) {
        const f = folders.value.find((x) => x.id === id);
        id = String(f?.parentId || '');
      }
      currentFolderId.value = id;
    }
    ElMessage.success('已删除');
    exitSelectMode();
    await load();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  }
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.projects-page {
  min-height: 100%;
  overflow: visible;
  padding: 20px 28px 48px;
  max-width: 1280px;
  margin: 0 auto;
  box-sizing: border-box;
  background: var(--studio-bg);
  color: var(--studio-ink);
}

.projects-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}

.head-left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.crumb {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.crumb-link {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 8px;
  color: var(--studio-muted);
}
.crumb-link.active,
.crumb-link:hover {
  color: var(--studio-ink);
}
.crumb-link.drop-target {
  outline: 1px dashed var(--studio-line-bright);
  color: var(--studio-ink);
}
.crumb-sep {
  color: var(--studio-muted);
  font-weight: 400;
}
.crumb-current {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.back-btn {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.back-btn:hover {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.head-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.head-action:hover:not(:disabled) {
  color: var(--studio-ink);
  background: var(--studio-glass-2);
}
.head-action:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.head-btn {
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.head-btn.outline {
  border: 1px solid var(--studio-line-bright);
  background: transparent;
  color: var(--studio-ink);
}
.head-btn.outline:hover {
  background: var(--studio-glass-2);
}
.head-btn.solid {
  border: 0;
  border-radius: 10px;
  background: var(--studio-ink);
  color: var(--studio-bg);
  font-weight: 600;
}
.head-btn.solid:disabled {
  opacity: 0.5;
  cursor: wait;
}

.search-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  min-width: 200px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--studio-panel);
  color: var(--studio-faint);
}
.search-pill input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.search-pill input::placeholder {
  color: var(--studio-faint);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}

.proj-card {
  position: relative;
  border: 1px solid transparent;
  border-radius: 16px;
  background: var(--studio-panel);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}
.proj-card.create {
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--studio-muted);
}
.proj-card.create:hover:not(:disabled) {
  background: var(--studio-panel-3);
  color: var(--studio-ink);
  border-color: var(--studio-line-bright);
}
.proj-card.create:disabled {
  opacity: 0.6;
  cursor: wait;
}
.proj-card.create span {
  font-size: 14px;
  font-weight: 500;
}

.proj-card.item {
  padding: 10px 10px 0;
}
.proj-card.item .thumb {
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: var(--studio-inset);
}
.proj-card.item:hover,
.proj-card.folder:hover {
  border-color: var(--studio-line-bright);
  background: var(--studio-panel-2);
  transform: translateY(-2px);
  box-shadow: var(--shadow-hover);
}
.proj-card.item:hover .card-ops,
.proj-card.folder:hover .card-ops {
  opacity: 1;
  pointer-events: auto;
}
.proj-card.selected {
  border-color: var(--studio-line-bright);
}
.proj-card.drop-target {
  border-color: var(--studio-line-bright);
  background: var(--studio-panel-3);
  box-shadow: inset 0 0 0 1px var(--studio-glass-3);
}
.proj-card.select-mode:hover .card-ops {
  opacity: 0;
  pointer-events: none;
}

.proj-card.folder {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.folder-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
  min-width: 0;
  width: 100%;
}
.folder-icon {
  color: var(--studio-muted);
}
.folder-body strong {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.sel-check {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--studio-text-soft);
  background: rgba(0, 0, 0, 0.35);
  color: var(--studio-bg);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.sel-check.on {
  background: var(--studio-ink);
  border-color: var(--studio-ink);
}

.thumb {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: 12px;
  background: var(--studio-inset);
  overflow: hidden;
}
.thumb.empty {
  background: var(--studio-inset-2);
  box-shadow: inset 0 0 0 1px var(--studio-glass);
}
.thumb :deep(.media-thumb) {
  width: 100%;
  height: 100%;
}

.card-ops {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
  z-index: 2;
}
.proj-card.folder .card-ops {
  top: 14px;
  right: 14px;
}
.card-ops button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.65));
}
.card-ops button:hover {
  opacity: 0.85;
}
.card-ops button:disabled {
  opacity: 0.4;
  cursor: wait;
}
.card-ops button.danger:hover {
  color: #fca5a5;
}

.meta {
  padding: 10px 4px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.meta strong {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta em {
  font-style: normal;
  font-size: 12px;
  color: var(--studio-faint);
}

.end-hint {
  margin: 36px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--studio-muted);
}

.move-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  display: grid;
  place-items: center;
  padding: 24px;
}
.move-dialog {
  width: min(420px, 100%);
  border-radius: 16px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-2);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  color: var(--studio-ink);
  overflow: hidden;
}
.move-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 8px;
}
.move-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.move-close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.move-close:hover {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}
.move-list {
  padding: 8px 12px 16px;
  max-height: min(360px, 50vh);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.move-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  font-size: 14px;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
  box-sizing: border-box;
}
.move-row:hover {
  background: var(--studio-glass-2);
}
.move-row.active {
  background: var(--studio-glass-3);
}
.move-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px 16px;
}
</style>
