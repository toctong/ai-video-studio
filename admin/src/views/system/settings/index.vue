<template>
  <div class="page-card">
    <div class="page-toolbar">
      <h3 style="margin: 0">系统设置</h3>
      <a-button type="primary" :loading="loading" @click="load">刷新</a-button>
    </div>
    <a-alert type="info" style="margin-bottom: 16px">
      MinIO、渠道库、模型库请使用左侧「对象存储 / 渠道管理 / 模型管理」。任务并发仅在此处配置。
    </a-alert>
    <a-spin :loading="loading" style="width: 100%">
      <a-descriptions v-if="data" :column="1" bordered size="large">
        <a-descriptions-item label="对象存储">
          <a-tag :color="data.fileOss?.configured ? 'green' : 'orangered'">
            {{ data.fileOss?.configured ? '已配置' : '未配置' }}
          </a-tag>
          <span style="margin-left: 8px">{{ data.fileOss?.bucket || '-' }}</span>
        </a-descriptions-item>
        <a-descriptions-item label="渠道数">
          {{ Object.keys(data.localChannels || data.channelCredentials || {}).length }}
        </a-descriptions-item>
        <a-descriptions-item label="模型数">{{ (data.localModels || []).length }}</a-descriptions-item>
        <a-descriptions-item label="默认对话">{{ data.defaultChatModel || '-' }}</a-descriptions-item>
        <a-descriptions-item label="默认图片">{{ data.defaultImageModel || '-' }}</a-descriptions-item>
        <a-descriptions-item label="默认视频">{{ data.defaultVideoModel || '-' }}</a-descriptions-item>
        <a-descriptions-item label="任务并发">
          <a-space>
            <a-input-number v-model="jobConcurrency" :min="1" :max="32" />
            <a-button type="primary" size="small" :loading="saving" @click="saveConcurrency">保存</a-button>
          </a-space>
        </a-descriptions-item>
      </a-descriptions>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import api from '@/api';

const loading = ref(false);
const saving = ref(false);
const data = ref<any>(null);
const jobConcurrency = ref(8);

async function load() {
  loading.value = true;
  try {
    const { data: res } = await api.get('/admin/settings');
    data.value = res;
    jobConcurrency.value = Number(res?.jobConcurrency || 8);
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function saveConcurrency() {
  saving.value = true;
  try {
    const { data: res } = await api.put('/admin/settings', {
      jobConcurrency: jobConcurrency.value,
    });
    data.value = res;
    Message.success('并发已保存');
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
