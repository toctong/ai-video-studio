<template>
  <div>
    <PageHeader :title="meta.label" :description="meta.description">
      <template #extra>
        <a-button type="primary" @click="openCreate">
          <template #icon><icon-plus /></template>
          新建{{ meta.label }}
        </a-button>
      </template>
    </PageHeader>

    <div class="page-card">
      <div class="search-bar">
        <a-input v-model="q" placeholder="搜索标题/slug" allow-clear style="width: 220px" @press-enter="load">
          <template #prefix><icon-search /></template>
        </a-input>
        <a-button type="primary" :loading="loading" @click="load">刷新</a-button>
        <a-button :disabled="!hasSelection" :loading="batchLoading" @click="batchSetEnabled(true)">批量启用</a-button>
        <a-button :disabled="!hasSelection" :loading="batchLoading" @click="batchSetEnabled(false)">批量停用</a-button>
        <a-button status="danger" :disabled="!hasSelection" :loading="batchLoading" @click="batchDeleteCms">批量删除</a-button>
      </div>

      <a-table
        v-model:selectedKeys="selectedKeys"
        row-key="id"
        :loading="loading"
        :data="list"
        :pagination="{ pageSize: 20 }"
        :bordered="false"
        :row-selection="rowSelection"
        stripe
      >
        <template #columns>
          <a-table-column title="预览" :width="80">
            <template #cell="{ record }">
              <a-image v-if="record.coverUrl" :src="record.coverUrl" width="48" height="32" fit="cover" />
              <span v-else>-</span>
            </template>
          </a-table-column>
          <a-table-column title="标题" data-index="title" />
          <a-table-column title="Slug" data-index="slug" :width="140" ellipsis tooltip />
          <a-table-column title="跳转" data-index="linkPath" :width="160" ellipsis tooltip />
          <a-table-column title="排序" data-index="sort" :width="80" />
          <a-table-column title="启用" :width="90">
            <template #cell="{ record }">
              <a-switch
                :model-value="record.enabled"
                size="small"
                @change="(v: string | number | boolean) => toggleEnabled(record, Boolean(v))"
              />
            </template>
          </a-table-column>
          <a-table-column title="操作" :width="140" fixed="right">
            <template #cell="{ record }">
              <a-space>
                <a-button type="text" size="small" @click="openEdit(record)">编辑</a-button>
                <a-popconfirm content="确认删除？" @ok="remove(record.id)">
                  <a-button type="text" status="danger" size="small">删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </div>

    <a-modal
      v-model:visible="visible"
      :title="editing ? `编辑${meta.label}` : `新建${meta.label}`"
      width="720px"
      :ok-loading="saving"
      unmount-on-close
      :align-center="true"
      :mask-closable="false"
      @ok="save"
    >
      <a-form :model="form" layout="vertical" class="cms-form" size="small">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="Slug（业务键，可改）">
              <a-input v-model="form.slug" placeholder="如 banner-seedance" allow-clear />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="排序">
              <a-input-number v-model="form.sort" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="标题">
          <a-input v-model="form.title" />
        </a-form-item>
        <a-form-item label="副标题 / Kicker">
          <a-input v-model="form.subtitle" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model="form.description" :auto-size="{ minRows: 2, maxRows: 3 }" />
        </a-form-item>

        <a-form-item label="封面">
          <a-space direction="vertical" fill style="width: 100%">
            <a-input v-model="form.coverUrl" placeholder="https://... 或下方上传" allow-clear />
            <a-input
              v-model="coverFileName"
              placeholder="存储文件名（编辑时可改，上传时生效）"
              allow-clear
            >
              <template #prepend>文件名</template>
            </a-input>
            <a-space>
              <a-upload
                :custom-request="((opt: any) => uploadMedia(opt, 'cover')) as any"
                :show-file-list="false"
                accept="image/*"
              >
                <template #upload-button>
                  <a-button :loading="uploadingCover" size="small" type="outline">上传封面</a-button>
                </template>
              </a-upload>
              <span class="field-hint">可先改文件名再上传；编辑时会回填上次文件名</span>
            </a-space>
            <a-image
              v-if="form.coverUrl"
              class="media-preview"
              :src="form.coverUrl"
              width="160"
              height="90"
              fit="cover"
            />
          </a-space>
        </a-form-item>

        <a-form-item v-if="showVideo" label="视频">
          <a-space direction="vertical" fill style="width: 100%">
            <a-input v-model="form.videoUrl" placeholder="https://... 或下方上传" allow-clear />
            <a-input
              v-model="videoFileName"
              placeholder="存储文件名（编辑时可改，上传时生效）"
              allow-clear
            >
              <template #prepend>文件名</template>
            </a-input>
            <a-space>
              <a-upload
                :custom-request="((opt: any) => uploadMedia(opt, 'video')) as any"
                :show-file-list="false"
                accept="video/*"
              >
                <template #upload-button>
                  <a-button :loading="uploadingVideo" size="small" type="outline">上传视频</a-button>
                </template>
              </a-upload>
              <span class="field-hint">轮播/发现可配视频；有视频时前台优先播视频</span>
            </a-space>
            <video
              v-if="form.videoUrl"
              class="media-preview"
              :src="form.videoUrl"
              controls
              muted
              playsinline
            />
          </a-space>
        </a-form-item>

        <a-form-item label="跳转路径">
          <a-input v-model="form.linkPath" placeholder="/films?new=1" />
        </a-form-item>
        <a-form-item label="扩展 meta（JSON）">
          <a-textarea
            v-model="metaJson"
            :auto-size="{ minRows: 2, maxRows: 5 }"
            placeholder='{"icon":"plus","tone":"tone-film"}'
          />
        </a-form-item>
        <a-form-item label="启用">
          <a-switch v-model="form.enabled" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import api from '@/api';
import PageHeader from '@/components/PageHeader.vue';
import { useTableBatch } from '@/composables/useTableBatch';
import { CMS_TYPES, type CmsType } from './types';

const {
  selectedKeys,
  rowSelection,
  hasSelection,
  selectionCount,
  batchLoading,
  runBatchAction,
  batchDelete,
} = useTableBatch();

const props = defineProps<{
  cmsType: CmsType;
}>();

const meta = computed(
  () => CMS_TYPES.find((t) => t.value === props.cmsType) || CMS_TYPES[0],
);

/** 轮播、官方发现需要视频字段 */
const showVideo = computed(() => props.cmsType === 'banner' || props.cmsType === 'discover');

const loading = ref(false);
const saving = ref(false);
const uploadingCover = ref(false);
const uploadingVideo = ref(false);
const visible = ref(false);
const editing = ref(false);
const editId = ref('');
const q = ref('');
const list = ref<any[]>([]);
const metaJson = ref('{}');
const coverFileName = ref('');
const videoFileName = ref('');

const form = reactive({
  type: props.cmsType as string,
  slug: '',
  title: '',
  subtitle: '',
  description: '',
  coverUrl: '',
  videoUrl: '',
  linkPath: '',
  sort: 0,
  enabled: true,
});

function fileNameFromUrl(url: string) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const path = raw.includes('://') ? new URL(raw).pathname : raw;
    const base = decodeURIComponent(path.split('/').pop() || '');
    // buildKey 会追加 -xxxxxxxx，回填时尽量去掉便于改名
    return base.replace(/-([a-f0-9]{8})(\.[^.]+)$/i, '$2');
  } catch {
    return raw.split('/').pop() || '';
  }
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/cms', {
      params: { type: props.cmsType, q: q.value || undefined },
    });
    list.value = Array.isArray(data) ? data : [];
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = false;
  editId.value = '';
  Object.assign(form, {
    type: props.cmsType,
    slug: '',
    title: '',
    subtitle: '',
    description: '',
    coverUrl: '',
    videoUrl: '',
    linkPath: '',
    sort: 0,
    enabled: true,
  });
  metaJson.value = '{}';
  coverFileName.value = '';
  videoFileName.value = '';
  visible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  editId.value = row.id;
  Object.assign(form, {
    type: props.cmsType,
    slug: row.slug || '',
    title: row.title || '',
    subtitle: row.subtitle || '',
    description: row.description || '',
    coverUrl: row.coverUrl || '',
    videoUrl: row.videoUrl || '',
    linkPath: row.linkPath || '',
    sort: Number(row.sort) || 0,
    enabled: row.enabled !== false,
  });
  metaJson.value = JSON.stringify(row.meta || {}, null, 2);
  coverFileName.value = fileNameFromUrl(row.coverUrl || '');
  videoFileName.value = fileNameFromUrl(row.videoUrl || '');
  visible.value = true;
}

function parseMeta() {
  try {
    const v = JSON.parse(metaJson.value || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new Error('meta JSON 格式不正确');
  }
}

async function save() {
  saving.value = true;
  try {
    const body = {
      ...form,
      type: props.cmsType,
      meta: parseMeta(),
    };
    if (editing.value) {
      await api.patch(`/admin/cms/${editId.value}`, body);
    } else {
      await api.post('/admin/cms', body);
    }
    Message.success('已保存');
    visible.value = false;
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(row: any, enabled: boolean) {
  try {
    await api.patch(`/admin/cms/${row.id}`, { enabled });
    row.enabled = enabled;
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '更新失败');
  }
}

async function remove(id: string) {
  try {
    await api.delete(`/admin/cms/${id}`);
    Message.success('已删除');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
  }
}

async function batchSetEnabled(enabled: boolean) {
  await runBatchAction({
    title: enabled ? '批量启用' : '批量停用',
    content: `确认${enabled ? '启用' : '停用'}选中的 ${selectionCount.value} 项？`,
    action: async (ids) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.patch(`/admin/cms/${id}`, { enabled })),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (fail === 0) Message.success(`已更新 ${ok} 项`);
      else Message.warning(`成功 ${ok} 项，失败 ${fail} 项`);
    },
    onDone: load,
  });
}

function batchDeleteCms() {
  return batchDelete((id) => api.delete(`/admin/cms/${id}`), '条内容', load);
}

async function uploadMedia(
  option: { fileItem: { file?: File }; onSuccess?: (r: any) => void; onError?: (e: any) => void },
  field: 'cover' | 'video',
) {
  const file = option.fileItem?.file;
  if (!file) {
    option.onError?.(new Error('无文件'));
    return;
  }
  const loadingRef = field === 'cover' ? uploadingCover : uploadingVideo;
  const nameRef = field === 'cover' ? coverFileName : videoFileName;
  loadingRef.value = true;
  try {
    // 未填文件名时用本地原名，编辑时保留上次名称
    if (!String(nameRef.value || '').trim()) {
      nameRef.value = file.name || '';
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('fileName', String(nameRef.value || '').trim());
    const { data } = await api.post('/admin/cms/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    });
    const url = String(data?.url || '');
    if (!url) throw new Error('上传成功但未返回 URL');
    if (field === 'cover') form.coverUrl = url;
    else form.videoUrl = url;
    if (data?.fileName) nameRef.value = String(data.fileName);
    else nameRef.value = fileNameFromUrl(url) || nameRef.value;
    Message.success('已上传');
    option.onSuccess?.(data);
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '上传失败');
    option.onError?.(e);
  } finally {
    loadingRef.value = false;
  }
}

watch(
  () => props.cmsType,
  () => {
    q.value = '';
    load();
  },
);

onMounted(load);
</script>

<style scoped>
.cms-form :deep(.arco-form-item) {
  margin-bottom: 12px;
}

.field-hint {
  font-size: 12px;
  color: var(--color-text-3);
}

.media-preview {
  display: block;
  max-width: 220px;
  max-height: 120px;
  border-radius: 8px;
  background: var(--color-fill-2);
}
</style>
