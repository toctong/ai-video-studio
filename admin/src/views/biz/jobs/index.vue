<template>
  <div>
    <PageHeader title="任务中心" description="查看、取消或清理后台队列任务">
      <template #extra>
        <a-popconfirm content="清空所有已结束任务？" @ok="clearFinished">
          <a-button status="warning">清空已结束</a-button>
        </a-popconfirm>
      </template>
    </PageHeader>

    <div class="page-card">
      <div class="search-bar">
        <a-select v-model="status" allow-clear placeholder="状态" style="width: 160px">
          <a-option value="queued">queued</a-option>
          <a-option value="active">active</a-option>
          <a-option value="completed">completed</a-option>
          <a-option value="failed">failed</a-option>
          <a-option value="cancelled">cancelled</a-option>
        </a-select>
        <a-button type="primary" @click="search">筛选</a-button>
      </div>
      <a-table
        row-key="id"
        :loading="loading"
        :data="list"
        :pagination="pagination"
        :bordered="false"
        stripe
        @page-change="onPage"
        @page-size-change="onPageSize"
      >
        <template #columns>
          <a-table-column title="类型" data-index="kind" :width="150" />
          <a-table-column title="状态" data-index="status" :width="110">
            <template #cell="{ record }">
              <a-tag :color="jobColor(record.status)">{{ record.status }}</a-tag>
            </template>
          </a-table-column>
          <a-table-column title="进度" :width="100">
            <template #cell="{ record }">{{ Math.round((record.progress || 0) * 100) }}%</template>
          </a-table-column>
          <a-table-column title="消息" data-index="message" ellipsis tooltip />
          <a-table-column title="时间" :width="170">
            <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
          </a-table-column>
          <a-table-column title="操作" :width="180" fixed="right">
            <template #cell="{ record }">
              <a-space>
                <a-button
                  v-if="record.status === 'queued' || record.status === 'active'"
                  type="text"
                  size="small"
                  @click="cancel(record.id)"
                >
                  取消
                </a-button>
                <a-popconfirm content="确认删除？" @ok="remove(record.id)">
                  <a-button type="text" status="danger" size="small">删除</a-button>
                </a-popconfirm>
              </a-space>
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

const loading = ref(false);
const status = ref<string | undefined>();
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

function jobColor(s: string) {
  if (s === 'completed') return 'green';
  if (s === 'failed') return 'red';
  if (s === 'active' || s === 'queued') return 'arcoblue';
  return 'gray';
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/jobs', {
      params: { status: status.value, page: page.value, pageSize: pageSize.value },
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

async function cancel(id: string) {
  try {
    await api.post(`/admin/jobs/${id}/cancel`);
    Message.success('已取消');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '取消失败');
  }
}

async function remove(id: string) {
  try {
    await api.delete(`/admin/jobs/${id}`);
    Message.success('已删除');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
  }
}

async function clearFinished() {
  try {
    await api.delete('/admin/jobs/finished');
    Message.success('已清空');
    await load();
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '清空失败');
  }
}

onMounted(load);
</script>
