<template>
  <div>
    <PageHeader title="内容总览" description="按模块管理前台运营位；导入导出仍在此统一处理">
      <template #extra>
        <a-space wrap>
          <a-button @click="exportCms">导出 JSON</a-button>
          <a-upload :custom-request="importCms as any" :show-file-list="false" accept="application/json,.json">
            <template #upload-button>
              <a-button :loading="importing">导入 JSON</a-button>
            </template>
          </a-upload>
        </a-space>
      </template>
    </PageHeader>

    <div class="page-card">
      <a-row :gutter="16">
        <a-col v-for="item in CMS_TYPES" :key="item.value" :xs="24" :sm="12" :md="8" :lg="6">
          <div class="cms-tile" @click="$router.push(item.path)">
            <div class="cms-tile__title">{{ item.label }}</div>
            <div class="cms-tile__desc">{{ item.description }}</div>
            <div class="cms-tile__meta">
              <span>{{ counts[item.value] ?? '-' }} 条</span>
              <a-link>进入管理</a-link>
            </div>
          </div>
        </a-col>
      </a-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import api from '@/api';
import PageHeader from '@/components/PageHeader.vue';
import { CMS_TYPES, type CmsType } from './types';

const importing = ref(false);
const counts = reactive<Partial<Record<CmsType, number>>>({});

async function loadCounts() {
  try {
    const { data } = await api.get('/admin/cms');
    const list = Array.isArray(data) ? data : [];
    for (const t of CMS_TYPES) counts[t.value] = 0;
    for (const row of list) {
      const key = row.type as CmsType;
      if (key in counts || CMS_TYPES.some((t) => t.value === key)) {
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '加载统计失败');
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
    await loadCounts();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '导入失败');
    option.onError?.(e);
  } finally {
    importing.value = false;
  }
}

onMounted(loadCounts);
</script>

<style scoped lang="scss">
.cms-tile {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--color-border-2);
  background: var(--color-fill-1);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:hover {
    border-color: rgb(var(--primary-6));
    box-shadow: 0 4px 14px rgba(22, 93, 255, 0.08);
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-1);
  }

  &__desc {
    margin-top: 6px;
    font-size: 12px;
    color: var(--color-text-3);
    min-height: 36px;
  }

  &__meta {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    color: var(--color-text-2);
  }
}
</style>
