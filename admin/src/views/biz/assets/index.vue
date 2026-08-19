<template>
  <div>
    <PageHeader title="资产管理" description="查看与清理用户上传/生成的媒体资产" />

    <div class="page-card">
      <div class="search-bar">
        <a-input
          v-model="q"
          placeholder="搜索名称/提示词/项目"
          allow-clear
          style="width: 260px"
          @press-enter="search"
        >
          <template #prefix><icon-search /></template>
        </a-input>
        <a-select v-model="type" allow-clear placeholder="类型" style="width: 140px">
          <a-option value="image">image</a-option>
          <a-option value="video">video</a-option>
          <a-option value="audio">audio</a-option>
          <a-option value="other">other</a-option>
        </a-select>
        <a-button type="primary" @click="search">搜索</a-button>
        <a-button @click="resetSearch">重置</a-button>
        <a-button status="danger" :disabled="!hasSelection" :loading="batchLoading" @click="batchRemove">批量删除</a-button>
      </div>

      <a-table
        v-model:selectedKeys="selectedKeys"
        row-key="id"
        :loading="loading"
        :data="list"
        :pagination="pagination"
        :bordered="false"
        :row-selection="rowSelection"
        stripe
        @page-change="onPage"
        @page-size-change="onPageSize"
      >
        <template #columns>
          <a-table-column title="预览" :width="90">
            <template #cell="{ record }">
              <a-image v-if="isImage(record)" :src="record.url" width="48" height="48" fit="cover" />
              <span v-else>{{ record.type }}</span>
            </template>
          </a-table-column>
          <a-table-column title="名称" data-index="name" ellipsis tooltip />
          <a-table-column title="类型" data-index="type" :width="100" />
          <a-table-column title="项目ID" data-index="projectId" :width="200" ellipsis tooltip />
          <a-table-column title="创建时间" :width="170">
            <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
          </a-table-column>
          <a-table-column title="操作" :width="120" fixed="right">
            <template #cell="{ record }">
              <a-popconfirm content="确认删除该资产？" @ok="remove(record.id)">
                <a-button type="text" status="danger" size="small">删除</a-button>
              </a-popconfirm>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import dayjs from 'dayjs';
import { Message } from '@arco-design/web-vue';
import api from '@/api';
import PageHeader from '@/components/PageHeader.vue';
import { useTableBatch } from '@/composables/useTableBatch';

const { selectedKeys, rowSelection, hasSelection, batchLoading, batchDelete } = useTableBatch();

const loading = ref(false);
const q = ref('');
const type = ref<string | undefined>();
const list = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(20);
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showTotal: true,
  showPageSize: true,
});

function formatTime(v: string) {
  return v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-';
}

function isImage(row: any) {
  return row?.type === 'image' || String(row?.mimeType || '').startsWith('image/');
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/assets', {
      params: { q: q.value, type: type.value, page: page.value, pageSize: pageSize.value },
    });
    list.value = data.list || [];
    pagination.current = data.page;
    pagination.pageSize = data.pageSize;
    pagination.total = data.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

function resetSearch() {
  q.value = '';
  type.value = undefined;
  search();
}

function onPage(p: number) {
  page.value = p;
  load();
}

function onPageSize(size: number) {
  pageSize.value = size;
  page.value = 1;
  load();
}

async function remove(id: string) {
  try {
    await api.delete(`/admin/assets/${id}`);
    Message.success('已删除');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
  }
}

function batchRemove() {
  return batchDelete((id) => api.delete(`/admin/assets/${id}`), '个资产', load);
}

onMounted(load);
</script>
