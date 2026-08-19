<template>
  <div class="page-card">
    <div class="page-toolbar">
      <div>
        <h3 style="margin: 0">渠道库</h3>
        <p class="hint">配置渠道 Base URL / API Key，前台生成与后台默认模型共用。</p>
      </div>
      <a-space>
        <a-button @click="openCreate">新增渠道</a-button>
        <a-button type="primary" :loading="loading" @click="load">刷新</a-button>
      </a-space>
    </div>

    <a-table row-key="slug" :loading="loading" :data="rows" :pagination="false">
      <template #columns>
        <a-table-column title="名称" data-index="title" />
        <a-table-column title="Slug" data-index="slug" :width="140" />
        <a-table-column title="Base URL" data-index="baseUrl" ellipsis tooltip />
        <a-table-column title="密钥" :width="110">
          <template #cell="{ record }">
            <a-tag :color="record.hasKey ? 'green' : 'orangered'">
              {{ record.hasKey ? '已配置' : '未配置' }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="模型数" data-index="modelCount" :width="90" />
        <a-table-column title="操作" :width="180" fixed="right">
          <template #cell="{ record }">
            <a-space>
              <a-button type="text" size="small" @click="openEdit(record)">配置</a-button>
              <a-popconfirm
                v-if="record.slug !== 'volcengine'"
                content="确认删除该渠道及其落地模型？"
                @ok="remove(record.slug)"
              >
                <a-button type="text" status="danger" size="small">删除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </a-table-column>
      </template>
    </a-table>

    <a-modal
      v-model:visible="visible"
      :title="editing ? `配置渠道 · ${form.slug}` : '新增渠道'"
      :ok-loading="saving"
      @ok="save"
    >
      <a-form :model="form" layout="vertical">
        <a-form-item v-if="!editing" label="Slug" required>
          <a-input v-model="form.slug" placeholder="如 openai / custom-ark" />
        </a-form-item>
        <a-form-item label="显示名称">
          <a-input v-model="form.title" />
        </a-form-item>
        <a-form-item label="Base URL">
          <a-input v-model="form.baseUrl" placeholder="https://..." />
        </a-form-item>
        <a-form-item label="代理（可选）">
          <a-input v-model="form.proxyUrl" placeholder="http://127.0.0.1:7890" />
        </a-form-item>
        <a-form-item :label="editing && form.hasKey ? 'API Key（留空不改）' : 'API Key'">
          <a-input-password v-model="form.apiKey" allow-clear />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import api from '@/api';

const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const editing = ref(false);
const settings = ref<any>({});

const form = reactive({
  slug: '',
  title: '',
  baseUrl: '',
  proxyUrl: '',
  apiKey: '',
  hasKey: false,
});

const rows = computed(() => {
  const map = settings.value?.localChannels || settings.value?.channelCredentials || {};
  return Object.entries(map).map(([slug, c]: [string, any]) => ({
    slug,
    title: c.title || slug,
    baseUrl: c.baseUrl || '',
    hasKey: !!c.hasKey,
    modelCount: c.modelCount ?? 0,
    proxyUrl: c.proxyUrl || '',
  }));
});

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/settings');
    settings.value = data || {};
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = false;
  Object.assign(form, {
    slug: '',
    title: '',
    baseUrl: '',
    proxyUrl: '',
    apiKey: '',
    hasKey: false,
  });
  visible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  Object.assign(form, {
    slug: row.slug,
    title: row.title || '',
    baseUrl: row.baseUrl || '',
    proxyUrl: row.proxyUrl || '',
    apiKey: '',
    hasKey: !!row.hasKey,
  });
  visible.value = true;
}

async function save() {
  const slug = form.slug.trim();
  if (!slug) {
    Message.warning('请填写 slug');
    return;
  }
  saving.value = true;
  try {
    const patch: Record<string, string> = {
      baseUrl: form.baseUrl.trim(),
      proxyUrl: form.proxyUrl.trim(),
      title: form.title.trim() || slug,
    };
    if (form.apiKey.trim()) patch.apiKey = form.apiKey.trim();
    const { data } = await api.put('/admin/settings', {
      channelCredentials: { [slug]: patch },
    });
    settings.value = data || {};
    visible.value = false;
    Message.success('渠道已保存');
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function remove(slug: string) {
  try {
    const { data } = await api.delete(`/admin/settings/channels/${encodeURIComponent(slug)}`);
    settings.value = data || {};
    Message.success('已删除');
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
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
