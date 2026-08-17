<template>
  <div class="skills-page">
    <div class="skills-toolbar">
      <div class="filter-row">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          class="filter-pill"
          :class="{ on: filter === f.id }"
          @click="filter = f.id"
        >
          {{ f.label }}
        </button>
      </div>
      <div class="toolbar-end">
        <button type="button" class="primary-btn" @click="openEditor()">
          <UiIcon name="plus" :size="14" />
          新建提示词
        </button>
        <label class="search-pill">
          <UiIcon name="search" :size="15" />
          <input v-model="keyword" type="search" placeholder="搜索我的提示词" />
        </label>
      </div>
    </div>

    <VirtualCardGrid
      class="skill-grid"
      v-loading="loading"
      :items="filtered"
      :min-column-width="320"
      :gap="16"
      :estimate-size="148"
      :show-done="false"
      :get-key="(s) => s.id"
    >
      <template #default="{ item: s }">
        <article class="skill-card" @click="openDetail(s)">
          <button
            v-if="s.kind === 'custom'"
            type="button"
            class="card-share"
            title="分享到社区"
            :disabled="sharingId === s.id"
            @click.stop="shareToCommunity(s)"
          >
            <UiIcon name="share" :size="14" />
          </button>
          <div class="cover" :style="coverTone(s)">
            <LazyCoverImage v-if="s.coverUrl" :src="s.coverUrl" :alt="s.name" />
            <span
              class="cover-type"
              :class="s.mode === 'video' ? 'video' : 'image'"
            >{{ s.mode === 'video' ? '视频' : '图片' }}</span>
          </div>
          <div class="body">
            <strong>{{ s.name }}</strong>
            <span class="author">
              <UiIcon name="user" :size="12" />
              {{ s.sourceLabel }}
            </span>
            <p>{{ s.desc || s.prompt }}</p>
            <div class="foot">
              <span class="uses" aria-hidden="true" />
              <div class="ops" @click.stop>
                <button
                  v-if="s.kind === 'custom'"
                  type="button"
                  class="op"
                  title="编辑"
                  @click="openEditor(s)"
                >
                  <UiIcon name="pencil" :size="14" />
                </button>
                <button
                  v-if="s.kind === 'custom'"
                  type="button"
                  class="op danger"
                  title="删除"
                  @click="removeItem(s)"
                >
                  <UiIcon name="trash" :size="14" />
                </button>
                <button
                  type="button"
                  class="fav"
                  :class="{ on: s.favorited }"
                  title="收藏"
                  @click="toggleFav(s)"
                >
                  <UiIcon name="sparkles" :size="14" />
                </button>
                <button type="button" class="use-btn" @click="useItem(s)">去使用</button>
              </div>
            </div>
          </div>
        </article>
      </template>
    </VirtualCardGrid>

    <p v-if="!loading && !filtered.length" class="empty">
      {{ emptyText }}
      <button type="button" class="linkish" @click="openEditor()">去新建</button>
    </p>

    <el-dialog
      v-model="detailOpen"
      class="mine-prompt-dialog"
      width="920px"
      top="6vh"
      append-to-body
      destroy-on-close
      :show-close="true"
      :title="null"
      aria-label="提示词详情"
    >
      <div v-if="detail" class="detail-layout">
        <div class="detail-media" :style="coverTone(detail)">
          <LazyCoverImage
            v-if="detail.coverUrl"
            :src="detail.coverUrl"
            :alt="detail.name"
          />
          <span v-else class="cover-badge lg">{{ detail.mode === 'video' ? '视频' : '图片' }}</span>
        </div>
        <div class="detail-panel">
          <div class="detail-top">
            <div class="detail-cats">
              <span class="cat-pill">{{ detail.kind === 'custom' ? '我创建的' : '收藏' }}</span>
              <span class="cat-pill">{{ detail.mode === 'video' ? '视频' : '图片' }}</span>
            </div>
            <button
              v-if="detail.kind === 'custom'"
              type="button"
              class="detail-share"
              :disabled="sharingId === detail.id"
              @click="shareToCommunity(detail)"
            >
              <UiIcon name="share" :size="15" />
              {{ sharingId === detail.id ? '分享中…' : '分享到社区' }}
            </button>
          </div>
          <div class="detail-scroll">
            <h2 class="detail-title">{{ detail.name }}</h2>
            <p v-if="detail.desc" class="detail-desc">{{ detail.desc }}</p>
            <div class="detail-toolbar">
              <button
                type="button"
                class="outline-btn"
                :class="{ on: detail.favorited }"
                @click="toggleFav(detail)"
              >
                <UiIcon name="sparkles" :size="15" />
                {{ detail.favorited ? '已收藏' : '收藏' }}
              </button>
              <button type="button" class="outline-btn" @click="copyPrompt(detail.prompt)">
                <UiIcon name="copy" :size="15" />
                复制提示词
              </button>
              <button
                v-if="detail.kind === 'custom'"
                type="button"
                class="outline-btn"
                @click="editFromDetail"
              >
                <UiIcon name="pencil" :size="15" />
                编辑
              </button>
            </div>
            <div class="editable-head"><span>提示词</span></div>
            <pre class="prompt-block">{{ detail.prompt || '（暂无正文）' }}</pre>
          </div>
          <div class="detail-footer">
            <span class="footer-hint">
              <UiIcon name="user" :size="12" />
              {{ detail.sourceLabel }}
            </span>
            <button type="button" class="cta-btn" @click="useItem(detail)">去使用</button>
          </div>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      v-model="editorOpen"
      class="mine-editor-dialog"
      width="880px"
      top="6vh"
      append-to-body
      destroy-on-close
      :show-close="true"
      :title="null"
      aria-label="编辑提示词"
      @closed="resetEditor"
    >
      <form class="editor-layout" @submit.prevent="saveEditor">
        <div class="editor-cover-col">
          <button
            type="button"
            class="cover-uploader"
            :class="{ has: !!form.coverUrl, busy: coverUploading }"
            :disabled="coverUploading"
            @click="pickCover"
          >
            <LazyCoverImage
              v-if="form.coverUrl"
              :src="form.coverUrl"
              alt="封面预览"
            />
            <div v-else class="cover-empty">
              <UiIcon name="image" :size="28" />
              <strong>上传封面</strong>
              <span>建议 1:1，JPG / PNG / WebP，上传到 File OSS</span>
            </div>
            <span v-if="coverUploading" class="cover-busy">处理中…</span>
          </button>
          <div class="cover-ops">
            <button type="button" class="cover-op" :disabled="coverUploading" @click="pickCover">
              {{ form.coverUrl ? '本地上传' : '上传图片' }}
            </button>
            <button
              type="button"
              class="cover-op"
              :disabled="coverUploading"
              @click="openAssetPicker"
            >
              从资产选择
            </button>
            <button
              v-if="form.coverUrl"
              type="button"
              class="cover-op danger"
              :disabled="coverUploading"
              @click="clearCover"
            >
              移除
            </button>
          </div>
        </div>

        <div class="editor-fields">
          <h2 class="editor-title">{{ editingId ? '编辑提示词' : '新建提示词' }}</h2>

          <label class="field">
            <span>名称</span>
            <input v-model="form.name" type="text" maxlength="60" placeholder="给提示词起个名字" />
          </label>

          <label class="field">
            <span>简介 <em>选填</em></span>
            <input
              v-model="form.desc"
              type="text"
              maxlength="120"
              placeholder="一句话说明用途，展示在卡片上"
            />
          </label>

          <div class="field">
            <span>生成类型</span>
            <div class="mode-row" role="radiogroup" aria-label="生成类型">
              <button
                type="button"
                class="mode-chip"
                :class="{ on: form.mode === 'image' }"
                @click="form.mode = 'image'"
              >
                图片
              </button>
              <button
                type="button"
                class="mode-chip"
                :class="{ on: form.mode === 'video' }"
                @click="form.mode = 'video'"
              >
                视频
              </button>
            </div>
          </div>

          <label class="field grow">
            <span>提示词正文</span>
            <textarea
              v-model="form.prompt"
              rows="10"
              spellcheck="false"
              placeholder="写入完整提示词，可含主题、主体、风格、镜头等…"
            />
          </label>

          <div class="editor-actions">
            <button type="button" class="ghost-btn" @click="editorOpen = false">取消</button>
            <button type="submit" class="save-btn" :disabled="saving || coverUploading">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </form>
    </el-dialog>

    <el-dialog
      v-model="assetPickerOpen"
      class="mine-asset-dialog"
      width="720px"
      top="8vh"
      append-to-body
      destroy-on-close
      title="从资产选择封面"
      @open="loadAssetPicker"
    >
      <label class="asset-search">
        <UiIcon name="search" :size="14" />
        <input v-model="assetPickQ" type="search" placeholder="搜索图片资产…" />
      </label>
      <div v-loading="assetPickLoading" class="asset-grid">
        <button
          v-for="a in filteredImageAssets"
          :key="a.id"
          type="button"
          class="asset-card"
          :class="{ on: form.coverUrl === a.url }"
          @click="pickCoverFromAsset(a)"
        >
          <img :src="a.url" :alt="a.name || '资产'" loading="lazy" />
          <span>{{ a.name || '未命名' }}</span>
        </button>
        <p v-if="!assetPickLoading && !filteredImageAssets.length" class="asset-empty">
          暂无可用图片资产
        </p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '@/api';
import { fetchSkillPlaza, submitCommunityPrompt, type PlazaSkillDto } from '@/api/skills';
import {
  createMyPrompt,
  deleteMyPrompt,
  fetchMyPrompts,
  migrateLocalPrompts,
  updateMyPrompt,
  uploadMyPromptCover,
  type UserPromptRow,
} from '@/api/user-prompts';
import {
  isFavoriteId,
  loadFavoriteIds,
  loadLegacyLocalPrompts,
  markLocalPromptsMigrated,
  toggleFavoriteId,
} from '@/utils/my-prompts';
import { saveHomePlazaDraft, type HomeGenMode } from '@/utils/home-plaza-draft';
import { libraryCoverByCategory } from '@/libraries/cover-images';
import { copyText } from '@/utils/clipboard';
import { pickLocalFile } from '@/utils/upload-asset';
import { resolveAssetProjectId } from '@/constants/studio';
import UiIcon from '@/components/icons/UiIcon.vue';
import LazyCoverImage from '@/components/LazyCoverImage.vue';
import VirtualCardGrid from '@/components/VirtualCardGrid.vue';

type PromptAssetRow = {
  id: string;
  url: string;
  name: string;
  type: string;
};

type Row = {
  id: string;
  name: string;
  desc: string;
  prompt: string;
  mode: HomeGenMode;
  kind: 'favorite' | 'custom';
  sourceLabel: string;
  favorited: boolean;
  coverUrl?: string;
  custom?: UserPromptRow;
};

const filters = [
  { id: 'all', label: '全部' },
  { id: 'fav', label: '收藏' },
  { id: 'custom', label: '我创建的' },
] as const;

const router = useRouter();
const loading = ref(true);
const filter = ref<(typeof filters)[number]['id']>('all');
const keyword = ref('');
const favIds = ref<string[]>(loadFavoriteIds());
const customs = ref<UserPromptRow[]>([]);
const plazaMap = ref<Record<string, PlazaSkillDto>>({});

const detailOpen = ref(false);
const detail = ref<Row | null>(null);
const sharingId = ref('');

const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const coverUploading = ref(false);
const form = reactive({
  name: '',
  desc: '',
  prompt: '',
  mode: 'image' as HomeGenMode,
  coverUrl: '',
  coverOssKey: '',
});

const assetPickerOpen = ref(false);
const assetPickLoading = ref(false);
const assetPickQ = ref('');
const studioAssets = ref<PromptAssetRow[]>([]);

function isImageAsset(a: PromptAssetRow) {
  const type = String(a.type || '').toLowerCase();
  const url = String(a.url || '');
  if (
    type === 'image' ||
    type === 'portrait' ||
    type === 'storyboard' ||
    type === 'keyframe' ||
    type === 'other'
  ) {
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return false;
    return Boolean(url);
  }
  return /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(url) || url.startsWith('data:image');
}

const filteredImageAssets = computed(() => {
  const q = assetPickQ.value.trim().toLowerCase();
  return studioAssets.value.filter((a) => {
    if (!isImageAsset(a) || !a.url) return false;
    if (!q) return true;
    return `${a.name} ${a.url}`.toLowerCase().includes(q);
  });
});

const emptyText = computed(() => {
  if (filter.value === 'fav') return '还没有收藏，去提示词广场点星收藏吧。';
  if (filter.value === 'custom') return '还没有自建提示词。';
  return '这里会汇总收藏与自建提示词。';
});

const rows = computed(() => {
  const list: Row[] = [];
  const seen = new Set<string>();

  for (const c of customs.value) {
    seen.add(c.id);
    list.push({
      id: c.id,
      name: c.name,
      desc: c.desc,
      prompt: c.prompt,
      mode: c.mode,
      kind: 'custom',
      sourceLabel: '我创建的',
      favorited: isFavoriteId(c.id),
      coverUrl: c.coverUrl || undefined,
      custom: c,
    });
  }

  for (const id of favIds.value) {
    if (seen.has(id)) continue;
    const s = plazaMap.value[id];
    if (!s) continue;
    list.push({
      id: s.id,
      name: s.name,
      desc: s.desc,
      prompt: String(s.prompt || s.starter || s.desc || ''),
      mode: s.mode === 'video' ? 'video' : 'image',
      kind: 'favorite',
      sourceLabel: s.author || '提示词广场',
      favorited: true,
      coverUrl:
        s.coverUrl ||
        libraryCoverByCategory(
          s.category === 'video' ? '运动' : s.category === 'image' ? '日系' : '都市',
          s.category === 'video' ? 'shot' : 'style',
        ),
    });
  }
  return list;
});

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return rows.value.filter((s) => {
    if (filter.value === 'fav' && !s.favorited) return false;
    if (filter.value === 'custom' && s.kind !== 'custom') return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q) ||
      s.prompt.toLowerCase().includes(q)
    );
  });
});

function coverTone(s: Row) {
  if (s.coverUrl) return {};
  const h = s.mode === 'video' ? 220 : 300;
  return {
    background: `linear-gradient(135deg, hsla(${h},45%,38%,0.95), #151515)`,
  };
}

function refreshDetailFav() {
  if (!detail.value) return;
  detail.value = {
    ...detail.value,
    favorited: isFavoriteId(detail.value.id),
  };
}

function openDetail(s: Row) {
  detail.value = { ...s, favorited: isFavoriteId(s.id) };
  detailOpen.value = true;
}

function useItem(s: Row) {
  const prompt = String(s.prompt || s.desc || s.name).trim();
  saveHomePlazaDraft({
    skillId: s.id,
    name: s.name,
    desc: s.desc,
    prompt,
    mode: s.mode,
  });
  detailOpen.value = false;
  editorOpen.value = false;
  router.push('/home');
}

function toggleFav(s: Row) {
  favIds.value = toggleFavoriteId(s.id);
  if (detail.value?.id === s.id) refreshDetailFav();
}

async function copyPrompt(text: string) {
  const ok = await copyText(String(text || '').trim());
  if (ok) ElMessage.success('已复制提示词');
  else ElMessage.error('复制失败');
}

async function shareToCommunity(s: Row) {
  if (s.kind !== 'custom') {
    ElMessage.info('仅自建提示词可分享到社区');
    return;
  }
  const prompt = String(s.prompt || '').trim();
  if (!prompt) {
    ElMessage.warning('提示词正文为空，无法分享');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将「${s.name}」投稿到社区提示词广场？提交后可能需要审核，通过后会出现在广场。`,
      '分享到社区',
      {
        confirmButtonText: '确认分享',
        cancelButtonText: '取消',
        type: 'info',
        autofocus: false,
      },
    );
  } catch {
    return;
  }

  const cover = String(s.coverUrl || '').trim();
  const coverIsRemote = /^https?:\/\//i.test(cover);
  if (cover && !coverIsRemote) {
    ElMessage.warning('封面不是公网地址，将仅分享文字内容');
  }

  sharingId.value = s.id;
  try {
    const res = await submitCommunityPrompt({
      title: s.name,
      description: s.desc || undefined,
      prompt,
      mode: s.mode,
      category: s.mode === 'video' ? 'video' : 'image',
      coverUrl: coverIsRemote ? cover : undefined,
      // tags 只放题材；图片/视频走 category/mode，勿再写入 tags
      tags: ['社区'],
      slug: s.id.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48),
    });
    if (res.autoApproved || res.status === 'published') {
      ElMessage.success('已发布到社区，同步后可在提示词广场看到');
    } else {
      ElMessage.success('已提交社区审核，通过后会出现在提示词广场');
    }
    if (res.coverOmitted) {
      ElMessage.info('封面未随投稿上传（需公网可访问的图片地址）');
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '分享失败');
  } finally {
    sharingId.value = '';
  }
}

async function removeItem(s: Row) {
  if (s.kind !== 'custom') return;
  try {
    await ElMessageBox.confirm(`确定删除「${s.name}」吗？`, '删除提示词', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await deleteMyPrompt(s.id);
    customs.value = await fetchMyPrompts();
    if (detail.value?.id === s.id) detailOpen.value = false;
    ElMessage.success('已删除');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '删除失败');
  }
}

function resetEditor() {
  editingId.value = null;
  form.name = '';
  form.desc = '';
  form.prompt = '';
  form.mode = 'image';
  form.coverUrl = '';
  form.coverOssKey = '';
  saving.value = false;
  coverUploading.value = false;
}

function openEditor(existing?: Row) {
  const base = existing?.custom || (existing?.kind === 'custom' ? existing : null);
  editingId.value = base?.id || null;
  form.name = base?.name || '';
  form.desc = base?.desc || '';
  form.prompt = base?.prompt || '';
  form.mode = base?.mode === 'video' ? 'video' : 'image';
  form.coverUrl = base?.coverUrl || existing?.coverUrl || '';
  form.coverOssKey = '';
  detailOpen.value = false;
  editorOpen.value = true;
}

function editFromDetail() {
  if (!detail.value || detail.value.kind !== 'custom') return;
  openEditor(detail.value);
}

function clearCover() {
  form.coverUrl = '';
  form.coverOssKey = '';
}

function openAssetPicker() {
  if (coverUploading.value) return;
  assetPickQ.value = '';
  assetPickerOpen.value = true;
}

async function loadAssetPicker() {
  assetPickLoading.value = true;
  try {
    const pid = resolveAssetProjectId({});
    const { data } = await api.get(`/projects/${pid}/assets`);
    const rows = Array.isArray(data) ? data : data?.items || [];
    studioAssets.value = rows
      .map((a: any) => ({
        id: String(a.id || ''),
        url: String(a.url || '').trim(),
        name: String(a.name || '').trim(),
        type: String(a.type || '').trim(),
      }))
      .filter((a: PromptAssetRow) => a.id && a.url && isImageAsset(a));
  } catch {
    studioAssets.value = [];
    ElMessage.error('加载资产失败');
  } finally {
    assetPickLoading.value = false;
  }
}

function pickCoverFromAsset(a: PromptAssetRow) {
  const url = String(a.url || '').trim();
  if (!url) {
    ElMessage.warning('该资产没有可用地址');
    return;
  }
  if (!/^https?:\/\//i.test(url) && !url.startsWith('data:image')) {
    ElMessage.warning('请选择可访问的图片资产');
    return;
  }
  form.coverUrl = url;
  form.coverOssKey = '';
  assetPickerOpen.value = false;
  ElMessage.success('已选用资产作为封面');
}

async function pickCover() {
  if (coverUploading.value) return;
  const files = await pickLocalFile({
    accept: 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif',
  });
  const file = files[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) {
    ElMessage.warning('封面请小于 12MB');
    return;
  }
  coverUploading.value = true;
  try {
    const { url, key } = await uploadMyPromptCover(file, editingId.value || undefined);
    if (!url) throw new Error('未返回封面地址');
    form.coverUrl = url;
    form.coverOssKey = key || '';
    ElMessage.success('封面已上传到 OSS');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '封面上传失败');
  } finally {
    coverUploading.value = false;
  }
}

async function saveEditor() {
  const name = form.name.trim();
  const prompt = form.prompt.trim();
  if (!name) {
    ElMessage.warning('请填写名称');
    return;
  }
  if (!prompt) {
    ElMessage.warning('请填写提示词正文');
    return;
  }
  saving.value = true;
  try {
    const desc = form.desc.trim() || prompt.slice(0, 80);
    const coverUrl = form.coverUrl.trim();
    if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
      ElMessage.warning('请先上传封面到 OSS');
      return;
    }
    if (editingId.value) {
      await updateMyPrompt(editingId.value, {
        name,
        desc,
        prompt,
        mode: form.mode,
        coverUrl: coverUrl || '',
        coverOssKey: form.coverOssKey || undefined,
      });
    } else {
      await createMyPrompt({
        name,
        desc,
        prompt,
        mode: form.mode,
        coverUrl: coverUrl || undefined,
        coverOssKey: form.coverOssKey || undefined,
      });
    }
    customs.value = await fetchMyPrompts();
    editorOpen.value = false;
    ElMessage.success('已保存到我的提示词');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function ensureMigrated() {
  const legacy = loadLegacyLocalPrompts().filter((x) => x.prompt.trim());
  if (!legacy.length) {
    markLocalPromptsMigrated();
    return;
  }
  try {
    await migrateLocalPrompts(
      legacy.map((x) => ({
        name: x.name,
        desc: x.desc,
        prompt: x.prompt,
        mode: x.mode,
        coverUrl: /^https?:\/\//i.test(String(x.coverUrl || '')) ? x.coverUrl : undefined,
      })),
    );
    markLocalPromptsMigrated();
    ElMessage.success(`已将 ${legacy.length} 条本地提示词同步到云端`);
  } catch {
    /* 迁移失败不阻断列表；下次仍可重试 */
  }
}

onMounted(async () => {
  loading.value = true;
  try {
    await ensureMigrated();
    const [plaza, mine] = await Promise.all([
      fetchSkillPlaza().catch(() => null),
      fetchMyPrompts(),
    ]);
    const map: Record<string, PlazaSkillDto> = {};
    for (const s of plaza?.skills || []) map[s.id] = s;
    plazaMap.value = map;
    customs.value = mine;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '加载失败');
    customs.value = [];
    plazaMap.value = {};
  } finally {
    favIds.value = loadFavoriteIds();
    loading.value = false;
  }
});
</script>

<style scoped src="./plaza-shared.css"></style>
<style scoped>
.primary-btn {
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-ink);
  color: var(--studio-bg);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.cover {
  position: relative;
}
.cover-type {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 650;
  font-style: normal;
  line-height: 22px;
  letter-spacing: 0.02em;
  color: #fff;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(8px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.cover-type.image {
  background: rgba(14, 116, 144, 0.88);
}
.cover-type.video {
  background: rgba(124, 58, 237, 0.88);
}
.cover-badge {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--studio-text-strong);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.cover-badge.lg {
  font-size: 18px;
}
.card-share {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.5);
  color: var(--studio-ink);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}
.skill-card {
  position: relative;
}
.skill-card:hover .card-share,
.card-share:focus-visible {
  opacity: 1;
}
.card-share:hover:not(:disabled) {
  background: rgba(20, 184, 166, 0.9);
  color: #042f2e;
}
.card-share:disabled {
  opacity: 0.55;
  cursor: wait;
}
.ops {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.op {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}
.op:disabled {
  opacity: 0.45;
  cursor: wait;
}
.op:hover:not(:disabled) {
  color: var(--studio-ink);
  background: var(--studio-glass-2);
}
.outline-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}
.op.danger:hover {
  color: #f87171;
}
.use-btn {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: var(--studio-glass-3);
  color: var(--studio-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}
.use-btn:hover {
  background: var(--studio-line-strong);
}
.linkish {
  margin-left: 8px;
  border: 0;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(340px, 1.05fr);
  gap: 0;
  min-height: min(70vh, 640px);
  max-height: min(82vh, 760px);
}
.detail-media {
  min-height: 100%;
  border-radius: 14px 0 0 14px;
  overflow: hidden;
  background: var(--studio-panel);
}
.detail-media :deep(.lazy-cover) {
  width: 100%;
  height: 100%;
  min-height: min(70vh, 640px);
}
.detail-media :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.detail-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 4px 4px 22px;
}
.detail-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-right: 36px;
  margin-bottom: 4px;
}
.detail-share {
  flex-shrink: 0;
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(20, 184, 166, 0.45);
  background: rgba(20, 184, 166, 0.12);
  color: #5eead4;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.detail-share:hover:not(:disabled) {
  background: rgba(20, 184, 166, 0.2);
}
.detail-share:disabled {
  opacity: 0.55;
  cursor: wait;
}
.detail-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.detail-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cat-pill {
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--studio-line-strong);
  color: var(--studio-text);
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
}
.detail-title {
  margin: 4px 0 0;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--studio-ink);
}
.detail-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--studio-muted);
}
.detail-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.outline-btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--studio-line-strong);
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}
.outline-btn:hover {
  background: var(--studio-glass-2);
}
.outline-btn.on {
  color: #f472b6;
  border-color: rgba(244, 114, 182, 0.45);
  background: rgba(244, 114, 182, 0.08);
}
.editable-head {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--studio-text);
}
.prompt-block {
  margin: 0;
  flex: 1;
  min-height: 180px;
  max-height: 320px;
  overflow: auto;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--studio-glass-2);
  background: var(--studio-inset);
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.detail-footer {
  flex-shrink: 0;
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.footer-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(212, 175, 55, 0.35);
  color: #d4af37;
  font-size: 12px;
}
.cta-btn {
  width: 100%;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: #14b8a6;
  color: #042f2e;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.cta-btn:hover {
  filter: brightness(1.06);
}

.editor-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 22px;
  align-items: stretch;
  min-height: 520px;
}
.editor-cover-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cover-uploader {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border: 1px dashed var(--studio-line-strong);
  border-radius: 16px;
  overflow: hidden;
  background: var(--studio-panel);
  color: var(--studio-muted);
  padding: 0;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.cover-uploader:hover:not(:disabled) {
  border-color: var(--studio-line-bright);
  background: var(--studio-inset);
}
.cover-uploader.has {
  border-style: solid;
  border-color: var(--studio-glass-3);
}
.cover-uploader:disabled {
  cursor: wait;
}
.cover-uploader :deep(.lazy-cover) {
  width: 100%;
  height: 100%;
}
.cover-uploader :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  box-sizing: border-box;
  text-align: center;
}
.cover-empty strong {
  color: var(--studio-ink);
  font-size: 14px;
  font-weight: 600;
}
.cover-empty span {
  font-size: 12px;
  line-height: 1.4;
  color: var(--studio-faint);
}
.cover-busy {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  color: var(--studio-ink);
  font-size: 13px;
  font-weight: 600;
}
.cover-ops {
  display: flex;
  gap: 8px;
}
.cover-op {
  flex: 1;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--studio-glass-3);
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.cover-op:hover {
  background: var(--studio-glass-2);
}
.cover-op.danger:hover {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.35);
}

.editor-fields {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.editor-title {
  margin: 0 0 2px;
  font-size: 20px;
  font-weight: 700;
  color: var(--studio-ink);
  letter-spacing: -0.02em;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.field.grow {
  flex: 1;
  min-height: 0;
}
.field > span {
  font-size: 13px;
  font-weight: 600;
  color: var(--studio-text);
}
.field > span em {
  font-style: normal;
  font-weight: 400;
  color: var(--studio-faint);
  margin-left: 6px;
}
.field input,
.field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--studio-glass-3);
  border-radius: 12px;
  background: var(--studio-panel);
  color: var(--studio-ink);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.field input {
  height: 40px;
  padding: 0 14px;
}
.field textarea {
  flex: 1;
  min-height: 200px;
  padding: 12px 14px;
  line-height: 1.6;
  resize: vertical;
}
.field input:focus,
.field textarea:focus {
  border-color: rgba(20, 184, 166, 0.55);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
}
.mode-row {
  display: flex;
  gap: 10px;
}
.mode-chip {
  height: 36px;
  padding: 0 16px;
  border-radius: 10px;
  border: 1px solid var(--studio-line-strong);
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.mode-chip.on {
  color: var(--studio-bg);
  background: var(--studio-ink);
  border-color: var(--studio-ink);
  font-weight: 600;
}
.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
  margin-top: auto;
}
.ghost-btn {
  height: 40px;
  padding: 0 16px;
  border-radius: 11px;
  border: 1px solid var(--studio-line-strong);
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.ghost-btn:hover {
  background: var(--studio-glass-2);
}
.save-btn {
  height: 40px;
  padding: 0 22px;
  border: 0;
  border-radius: 11px;
  background: #14b8a6;
  color: #042f2e;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.save-btn:hover:not(:disabled) {
  filter: brightness(1.06);
}
.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .detail-layout {
    grid-template-columns: 1fr;
    max-height: none;
    min-height: 0;
  }
  .detail-media {
    border-radius: 14px 14px 0 0;
    aspect-ratio: 4 / 5;
    max-height: 280px;
  }
  .detail-media :deep(.lazy-cover) {
    min-height: 0;
  }
  .detail-panel {
    padding: 16px 4px 4px;
  }
  .editor-layout {
    grid-template-columns: 1fr;
    min-height: 0;
  }
  .cover-uploader {
    max-width: 220px;
    margin: 0 auto;
  }
}
</style>

<style>
.mine-prompt-dialog.el-dialog,
.mine-editor-dialog.el-dialog {
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-2);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
}
.mine-prompt-dialog .el-dialog__header,
.mine-editor-dialog .el-dialog__header {
  margin: 0 !important;
  padding: 0 !important;
  padding-bottom: 0 !important;
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 2;
  width: auto;
  border: 0 !important;
  border-bottom: 0 !important;
}
.mine-prompt-dialog .el-dialog__title,
.mine-editor-dialog .el-dialog__title {
  display: none;
}
.mine-prompt-dialog .el-dialog__headerbtn,
.mine-editor-dialog .el-dialog__headerbtn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
}
.mine-prompt-dialog .el-dialog__headerbtn .el-dialog__close,
.mine-editor-dialog .el-dialog__headerbtn .el-dialog__close {
  color: var(--studio-ink);
}
.mine-prompt-dialog .el-dialog__body,
.mine-editor-dialog .el-dialog__body {
  padding: 18px;
  color: var(--studio-ink);
}
</style>

<style>
.mine-asset-dialog.el-dialog {
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-3);
  border-radius: 16px;
  overflow: hidden;
}
.mine-asset-dialog .el-dialog__header {
  margin: 0;
  padding: 14px 16px 8px;
  border-bottom: 1px solid var(--studio-glass-2);
}
.mine-asset-dialog .el-dialog__title {
  color: var(--studio-text);
  font-size: 15px;
  font-weight: 650;
}
.mine-asset-dialog .el-dialog__headerbtn .el-dialog__close {
  color: var(--studio-text);
}
.mine-asset-dialog .el-dialog__body {
  padding: 12px 16px 16px;
  color: var(--studio-text);
}
.mine-asset-dialog .asset-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  margin-bottom: 12px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-panel);
  color: var(--studio-text-faint);
}
.mine-asset-dialog .asset-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--studio-text);
  font: inherit;
  font-size: 13px;
}
.mine-asset-dialog .asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  max-height: min(52vh, 420px);
  overflow: auto;
  min-height: 160px;
}
.mine-asset-dialog .asset-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-panel);
  color: var(--studio-text);
  cursor: pointer;
  text-align: left;
}
.mine-asset-dialog .asset-card:hover,
.mine-asset-dialog .asset-card.on {
  border-color: rgba(20, 184, 166, 0.55);
  background: rgba(20, 184, 166, 0.08);
}
.mine-asset-dialog .asset-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
  background: var(--studio-panel);
  display: block;
}
.mine-asset-dialog .asset-card span {
  font-size: 11px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mine-asset-dialog .asset-empty {
  grid-column: 1 / -1;
  margin: 28px 0;
  text-align: center;
  color: var(--studio-text-faint);
  font-size: 13px;
}
</style>
