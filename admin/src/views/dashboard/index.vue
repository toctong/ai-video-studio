<template>
  <div class="dashboard">
    <PageHeader title="工作台" description="系统运行概览与近期动态">
      <template #extra>
        <a-space>
          <a-button @click="load" :loading="loading">
            <template #icon><icon-refresh /></template>
            刷新
          </a-button>
          <a-button type="primary" @click="$router.push('/cms')">
            <template #icon><icon-apps /></template>
            去运营 CMS
          </a-button>
        </a-space>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard
        v-for="item in cards"
        :key="item.label"
        :label="item.label"
        :value="item.value"
        :hint="item.hint"
        :accent="item.accent"
      >
        <template #icon>
          <component :is="item.icon" />
        </template>
      </StatCard>
    </div>

    <div class="quick-grid">
      <div
        v-for="q in quickLinks"
        :key="q.path"
        class="quick-card"
        @click="$router.push(q.path)"
      >
        <div class="quick-card__icon" :style="{ background: q.bg }">
          <component :is="q.icon" />
        </div>
        <div>
          <strong>{{ q.title }}</strong>
          <p>{{ q.desc }}</p>
        </div>
      </div>
    </div>

    <a-row :gutter="16">
      <a-col :xs="24" :lg="14">
        <div class="page-card">
          <div class="page-toolbar">
            <div>
              <h3 class="section-title">最近任务</h3>
              <p class="section-sub">队列中的最新运行记录</p>
            </div>
            <a-button type="text" @click="$router.push('/jobs')">查看全部</a-button>
          </div>
          <a-table
            :data="data?.recentJobs || []"
            :pagination="false"
            :loading="loading"
            row-key="id"
            :bordered="false"
            stripe
          >
            <template #columns>
              <a-table-column title="类型" data-index="kind" :width="150" ellipsis tooltip />
              <a-table-column title="状态" data-index="status" :width="110">
                <template #cell="{ record }">
                  <a-tag :color="jobColor(record.status)" size="small">{{ record.status }}</a-tag>
                </template>
              </a-table-column>
              <a-table-column title="进度" :width="140">
                <template #cell="{ record }">
                  <a-progress
                    :percent="Math.min(100, Math.round((record.progress || 0) * 100))"
                    size="small"
                    :status="record.status === 'failed' ? 'danger' : undefined"
                  />
                </template>
              </a-table-column>
              <a-table-column title="时间" :width="160">
                <template #cell="{ record }">{{ formatTime(record.createdAt) }}</template>
              </a-table-column>
            </template>
          </a-table>
        </div>
      </a-col>
      <a-col :xs="24" :lg="10">
        <div class="page-card">
          <div class="page-toolbar">
            <div>
              <h3 class="section-title">最近书库项目</h3>
              <p class="section-sub">按更新时间排序</p>
            </div>
            <a-button type="text" @click="$router.push('/projects')">查看全部</a-button>
          </div>
          <a-table
            :data="data?.recentProjects || []"
            :pagination="false"
            :loading="loading"
            row-key="id"
            :bordered="false"
            stripe
          >
            <template #columns>
              <a-table-column title="标题" data-index="title" ellipsis tooltip />
              <a-table-column title="更新" :width="150">
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
import {
  IconApps,
  IconBook,
  IconCalendar,
  IconFolder,
  IconStorage,
  IconThunderbolt,
  IconUser,
  IconVideoCamera,
} from '@arco-design/web-vue/es/icon';
import api from '@/api';
import PageHeader from '@/components/PageHeader.vue';
import StatCard from '@/components/StatCard.vue';

const loading = ref(false);
const data = ref<any>(null);

const cards = computed(() => {
  const s = data.value?.stats || {};
  return [
    { label: '用户', value: s.userCount ?? '-', hint: '注册账号', accent: '#165dff', icon: IconUser },
    { label: '书库项目', value: s.projectCount ?? '-', hint: '小说/剧本库', accent: '#0fc6c2', icon: IconBook },
    { label: '制作项目', value: s.productionCount ?? '-', hint: '成片制作', accent: '#722ed1', icon: IconVideoCamera },
    { label: '资产', value: s.assetCount ?? '-', hint: '图片/视频素材', accent: '#f77234', icon: IconFolder },
    { label: '进行中任务', value: s.runningJobs ?? '-', hint: '队列 active', accent: '#f53f3f', icon: IconCalendar },
    { label: '发现内容', value: s.discoverCount ?? '-', hint: '社区投稿', accent: '#00b42a', icon: IconApps },
  ];
});

const quickLinks = [
  { path: '/cms', title: '内容运营', desc: '轮播 / 入口 / 公告', icon: IconApps, bg: 'linear-gradient(135deg,#165dff,#4080ff)' },
  { path: '/storage', title: '对象存储', desc: 'MinIO 配置与连通', icon: IconStorage, bg: 'linear-gradient(135deg,#0fc6c2,#37d4cf)' },
  { path: '/channels', title: '渠道管理', desc: 'API Key / 线路', icon: IconThunderbolt, bg: 'linear-gradient(135deg,#f7ba1e,#fadc19)' },
  { path: '/users', title: '用户管理', desc: '角色与账号', icon: IconUser, bg: 'linear-gradient(135deg,#722ed1,#b37feb)' },
];

function formatTime(v: string) {
  return v ? dayjs(v).format('MM-DD HH:mm') : '-';
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

<style scoped lang="scss">
.dashboard {
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 14px;
    margin-bottom: 16px;
  }

  .quick-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .quick-card {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--color-bg-2);
    border: 1px solid var(--color-border-2);
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
    }

    &__icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      color: #fff;
      flex-shrink: 0;
    }

    strong {
      display: block;
      font-size: 14px;
      color: var(--color-text-1);
    }

    p {
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--color-text-3);
    }
  }

  .section-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .section-sub {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--color-text-3);
  }

  .page-card {
    margin-bottom: 16px;
  }
}
</style>
