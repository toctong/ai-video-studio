<template>
  <div>
    <PageHeader title="对象存储（MinIO）" description="配置后前台上传/素材直链走此存储。留空 AccessKey 表示不修改已保存密钥。">
      <template #extra>
        <a-space>
          <a-button :loading="testing" @click="test">测试连通</a-button>
          <a-button type="primary" :loading="saving" @click="save">保存</a-button>
        </a-space>
      </template>
    </PageHeader>

    <div class="page-card">
      <a-spin :loading="loading" style="width: 100%">
        <a-form :model="form" layout="vertical" style="max-width: 720px">
          <a-form-item label="公网读地址 baseUrl">
            <a-input v-model="form.baseUrl" placeholder="https://minio.example.com 或 http://host:9000" />
          </a-form-item>
          <a-form-item label="S3 API Endpoint（可填内网）">
            <a-input v-model="form.apiEndpoint" placeholder="http://127.0.0.1:9000" />
          </a-form-item>
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="Bucket">
                <a-input v-model="form.bucket" placeholder="aivideo" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="Key Prefix">
                <a-input v-model="form.keyPrefix" placeholder="ai/video-studio" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item :label="`Access Key ID${hasId ? '（已配置，留空不改）' : ''}`">
            <a-input-password v-model="form.accessKeyId" placeholder="Access Key" allow-clear />
          </a-form-item>
          <a-form-item :label="`Access Key Secret${hasSecret ? '（已配置，留空不改）' : ''}`">
            <a-input-password v-model="form.accessKeySecret" placeholder="Secret Key" allow-clear />
          </a-form-item>
          <a-alert v-if="statusText" :type="statusOk ? 'success' : 'warning'" :content="statusText" />
        </a-form>
      </a-spin>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import api from '@/api';
import PageHeader from '@/components/PageHeader.vue';

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const hasId = ref(false);
const hasSecret = ref(false);
const statusOk = ref(false);
const statusText = ref('');

const form = reactive({
  baseUrl: '',
  apiEndpoint: '',
  bucket: '',
  keyPrefix: '',
  accessKeyId: '',
  accessKeySecret: '',
});

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/settings');
    const f = data?.fileOss || {};
    form.baseUrl = f.baseUrl || '';
    form.apiEndpoint = f.apiEndpoint || '';
    form.bucket = f.bucket || '';
    form.keyPrefix = f.keyPrefix || '';
    form.accessKeyId = '';
    form.accessKeySecret = '';
    hasId.value = !!f.hasAccessKeyId;
    hasSecret.value = !!f.hasAccessKeySecret;
    statusOk.value = !!f.configured;
    statusText.value = f.configured ? '当前已配置可用' : '尚未配置完整';
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const fileOss: Record<string, string> = {
      baseUrl: form.baseUrl.trim(),
      apiEndpoint: form.apiEndpoint.trim(),
      bucket: form.bucket.trim(),
      keyPrefix: form.keyPrefix.trim(),
    };
    if (form.accessKeyId.trim()) fileOss.accessKeyId = form.accessKeyId.trim();
    if (form.accessKeySecret.trim()) fileOss.accessKeySecret = form.accessKeySecret.trim();
    const { data } = await api.put('/admin/settings', { fileOss });
    const f = data?.fileOss || {};
    hasId.value = !!f.hasAccessKeyId;
    hasSecret.value = !!f.hasAccessKeySecret;
    form.accessKeyId = '';
    form.accessKeySecret = '';
    statusOk.value = !!f.configured;
    statusText.value = '已保存';
    Message.success('MinIO 配置已保存');
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function test() {
  testing.value = true;
  try {
    const { data } = await api.post('/admin/settings/file-oss/test');
    statusOk.value = !!data?.ok;
    statusText.value = String(data?.message || (data?.ok ? '连通正常' : '连通失败'));
    if (data?.ok) Message.success(statusText.value);
    else Message.warning(statusText.value);
  } catch (e: any) {
    statusOk.value = false;
    statusText.value = e?.response?.data?.message || e.message || '测试失败';
    Message.error(statusText.value);
  } finally {
    testing.value = false;
  }
}

onMounted(load);
</script>
