<template>
  <div class="page-card">
    <div class="page-toolbar">
      <a-space wrap>
        <a-input v-model="q" placeholder="搜索项目标题" allow-clear style="width: 240px" @press-enter="search" />
        <a-button type="primary" @click="search">搜索</a-button>
      </a-space>
    </div>
    <a-table
      row-key="id"
      :loading="loading"
      :data="list"
      :pagination="pagination"
      @page-change="onPage"
      @page-size-change="onPageSize"
    >
      <template #columns>
        <a-table-column title="标题" data-index="title" />
        <a-table-column title="归档" :width="90">
          <template #cell="{ record }">
            <a-tag :color="record.archived ? 'gray' : 'green'">{{ record.archived ? '是' : '否' }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="更新时间" :width="170">
          <template #cell="{ record }">{{ formatTime(record.updatedAt) }}</template>
        </a-table-column>
        <a-table-column title="操作" :width="120" fixed="right">
          <template #cell="{ record }">
            <a-popconfirm content="确认删除该书库项目？" @ok="remove(record.id)">
              <a-button type="text" status="danger" size="small">删除</a-button>
            </a-popconfirm>
          </template>
        </a-table-column>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import dayjs from 'dayjs';
import { Message } from '@arco-design/web-vue';
import api from '@/api';

const loading = ref(false);
const q = ref('');
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

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/projects', {
      params: { q: q.value, page: page.value, pageSize: pageSize.value },
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
    await api.delete(`/admin/projects/${id}`);
    Message.success('已删除');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
  }
}

onMounted(load);
</script>
