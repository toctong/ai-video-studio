<template>
  <div>
    <div class="stat-grid" style="margin-bottom: 16px">
      <div v-for="item in cards" :key="item.label" class="stat-card">
        <div class="stat-card__label">{{ item.label }}</div>
        <div class="stat-card__value">{{ item.value }}</div>
      </div>
    </div>

    <a-row :gutter="16">
      <a-col :xs="24" :lg="14">
        <div class="page-card">
          <div class="page-toolbar">
            <h3 style="margin: 0">最近任务</h3>
            <a-button type="text" @click="load">刷新</a-button>
          </div>
          <a-table :data="data?.recentJobs || []" :pagination="false" :loading="loading" row-key="id">
            <template #columns>
              <a-table-column title="类型" data-index="kind" :width="140" />
              <a-table-column title="状态" data-index="status" :width="100">
                <template #cell="{ record }">
                  <a-tag :color="jobColor(record.status)">{{ record.status }}</a-tag>
                </template>
              </a-table-column>
              <a-table-column title="进度" :width="100">
                <template #cell="{ record }">{{ Math.round((record.progress || 0) * 100) }}%</template>
              </a-table-column>
              <a-table-column title="时间" data-index="createdAt" :width="180">
                <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
              </a-table-column>
            </template>
          </a-table>
        </div>
      </a-col>
      <a-col :xs="24" :lg="10">
        <div class="page-card" style="margin-top: 0">
          <div class="page-toolbar">
            <h3 style="margin: 0">最近书库项目</h3>
          </div>
          <a-table :data="data?.recentProjects || []" :pagination="false" :loading="loading" row-key="id">
            <template #columns>
              <a-table-column title="标题" data-index="title" />
              <a-table-column title="更新" :width="160">
                <template #cell="{ record }">{{ formatTime(record.updatedAt) }}</template>
              </a-table-column>
            </template>
          </a-table>
        </div>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import api from '@/api';

const loading = ref(false);
const data = ref<any>(null);

const cards = computed(() => {
  const s = data.value?.stats || {};
  return [
    { label: '用户', value: s.userCount ?? '-' },
    { label: '书库项目', value: s.projectCount ?? '-' },
    { label: '制作项目', value: s.productionCount ?? '-' },
    { label: '资产', value: s.assetCount ?? '-' },
    { label: '进行中任务', value: s.runningJobs ?? '-' },
    { label: '发现内容', value: s.discoverCount ?? '-' },
  ];
});

function formatTime(v: string) {
  return v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-';
}

function jobColor(status: string) {
  if (status === 'completed') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'active' || status === 'queued') return 'arcoblue';
  return 'gray';
}

async function load() {
  loading.value = true;
  try {
    const { data: res } = await api.get('/admin/dashboard');
    data.value = res;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
