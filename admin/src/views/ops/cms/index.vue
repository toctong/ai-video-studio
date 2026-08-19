<template>
  <div>
    <PageHeader title="内容运营 CMS" description="管理轮播、入口、精选、发现、工具箱、技能精选、导航、品牌 Logo、公告">
      <template #extra>
        <a-space wrap>
          <a-button @click="exportCms">导出 JSON</a-button>
          <a-upload :custom-request="importCms as any" :show-file-list="false" accept="application/json,.json">
            <template #upload-button>
              <a-button :loading="importing">导入 JSON</a-button>
            </template>
          </a-upload>
          <a-button type="primary" @click="openCreate">
            <template #icon><icon-plus /></template>
            新建
          </a-button>
        </a-space>
      </template>
    </PageHeader>

    <div class="page-card">
      <div class="search-bar">
        <a-select v-model="type" style="width: 140px" @change="load">
          <a-option value="">全部类型</a-option>
          <a-option v-for="t in types" :key="t.value" :value="t.value">{{ t.label }}</a-option>
        </a-select>
        <a-input v-model="q" placeholder="搜索标题/slug" allow-clear style="width: 220px" @press-enter="load">
          <template #prefix><icon-search /></template>
        </a-input>
        <a-button type="primary" :loading="loading" @click="load">刷新</a-button>
      </div>

    <a-table row-key="id" :loading="loading" :data="list" :pagination="{ pageSize: 20 }" :bordered="false" stripe>
      <template #columns>
        <a-table-column title="类型" data-index="type" :width="100">
          <template #cell="{ record }">
            <a-tag>{{ typeLabel(record.type) }}</a-tag>
          </template>
        </a-table-column>
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
      :title="editing ? '编辑内容' : '新建内容'"
      width="720px"
      :ok-loading="saving"
      @ok="save"
    >
      <a-form :model="form" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="类型" required>
              <a-select v-model="form.type">
                <a-option v-for="t in types" :key="t.value" :value="t.value">{{ t.label }}</a-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="Slug">
              <a-input v-model="form.slug" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
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
          <a-textarea v-model="form.description" :auto-size="{ minRows: 2, maxRows: 4 }" />
        </a-form-item>
        <a-form-item label="封面">
          <a-space direction="vertical" fill style="width: 100%">
            <a-input v-model="form.coverUrl" placeholder="https://... 或点击上传" />
            <a-upload
              :custom-request="((opt: any) => uploadMedia(opt, 'cover')) as any"
              :show-file-list="false"
              accept="image/*"
            >
              <template #upload-button>
                <a-button :loading="uploadingCover" size="small">上传封面到 MinIO</a-button>
              </template>
            </a-upload>
            <a-image v-if="form.coverUrl" :src="form.coverUrl" width="160" fit="cover" />
          </a-space>
        </a-form-item>
        <a-form-item v-if="form.type === 'discover'" label="视频">
          <a-space direction="vertical" fill style="width: 100%">
            <a-input v-model="form.videoUrl" placeholder="https://... 或点击上传" />
            <a-upload
              :custom-request="((opt: any) => uploadMedia(opt, 'video')) as any"
              :show-file-list="false"
              accept="video/*"
            >
              <template #upload-button>
                <a-button :loading="uploadingVideo" size="small">上传视频到 MinIO</a-button>
              </template>
            </a-upload>
          </a-space>
        </a-form-item>
        <a-form-item label="跳转路径">
          <a-input v-model="form.linkPath" placeholder="/films?new=1" />
        </a-form-item>
        <a-form-item label="扩展 meta（JSON）">
          <a-textarea v-model="metaJson" :auto-size="{ minRows: 3, maxRows: 8 }" placeholder='{"icon":"plus","tone":"tone-film"}' />
        </a-form-item>
        <a-form-item label="启用">
          <a-switch v-model="form.enabled" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import api from '@/api';
import PageHeader from '@/components/PageHeader.vue';

const types = [
  { value: 'banner', label: '轮播' },
  { value: 'entry', label: '入口卡' },
  { value: 'showcase', label: '精选作品' },
  { value: 'discover', label: '官方发现' },
  { value: 'tool', label: '工具箱' },
  { value: 'skill', label: '技能精选' },
  { value: 'nav', label: '侧栏导航' },
  { value: 'brand', label: '品牌 Logo' },
  { value: 'notice', label: '公告' },
];

const loading = ref(false);
const saving = ref(false);
const importing = ref(false);
const uploadingCover = ref(false);
const uploadingVideo = ref(false);
const visible = ref(false);
const editing = ref(false);
const editId = ref('');
const type = ref('');
const q = ref('');
const list = ref<any[]>([]);
const metaJson = ref('{}');

const form = reactive({
  type: 'banner',
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

function typeLabel(t: string) {
  return types.find((x) => x.value === t)?.label || t;
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/cms', {
      params: { type: type.value || undefined, q: q.value || undefined },
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
    type: type.value || 'banner',
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
  visible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  editId.value = row.id;
  Object.assign(form, {
    type: row.type,
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
  loadingRef.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/admin/cms/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    });
    const url = String(data?.url || '');
    if (!url) throw new Error('上传成功但未返回 URL');
    if (field === 'cover') form.coverUrl = url;
    else form.videoUrl = url;
    Message.success('已上传');
    option.onSuccess?.(data);
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '上传失败');
    option.onError?.(e);
  } finally {
    loadingRef.value = false;
  }
}

async function exportCms() {
  try {
    const { data } = await api.get('/admin/cms/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cms-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Message.success(`已导出 ${data?.items?.length || 0} 条`);
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '导出失败');
  }
}

async function importCms(option: {
  fileItem: { file?: File };
  onSuccess?: (r: any) => void;
  onError?: (e: any) => void;
}) {
  const file = option.fileItem?.file;
  if (!file) {
    option.onError?.(new Error('无文件'));
    return;
  }
  importing.value = true;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(items) || !items.length) throw new Error('JSON 中没有 items');
    const mode = window.confirm('合并导入（同 type+slug 覆盖）？\n取消则整库替换。')
      ? 'merge'
      : 'replace';
    if (mode === 'replace' && !window.confirm('确认整库替换？现有 CMS 内容将被清空。')) {
      option.onError?.(new Error('已取消'));
      return;
    }
    const { data } = await api.post('/admin/cms/import', { items, mode });
    Message.success(`导入完成：新建 ${data.created || 0}，更新 ${data.updated || 0}`);
    option.onSuccess?.(data);
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '导入失败');
    option.onError?.(e);
  } finally {
    importing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.hint {
  margin: 6px 0 0;
  color: var(--color-text-3);
  font-size: 13px;
}
</style>
