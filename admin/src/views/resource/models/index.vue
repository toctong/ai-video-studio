<template>
  <div>
    <div class="page-card" style="margin-bottom: 16px">
      <div class="page-toolbar">
        <div>
          <h3 style="margin: 0">默认模型</h3>
          <p class="hint">前台对话 / 出图 / 视频任务未指定模型时使用这里的默认值。</p>
        </div>
        <a-button type="primary" :loading="savingDefaults" @click="saveDefaults">保存默认</a-button>
      </div>
      <a-form :model="defaults" layout="vertical" style="max-width: 720px">
        <a-form-item label="默认对话模型">
          <a-select v-model="defaults.defaultChatModel" allow-create allow-search allow-clear>
            <a-option v-for="m in chatOptions" :key="m.value" :value="m.value">{{ m.label }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="默认图片模型">
          <a-select v-model="defaults.defaultImageModel" allow-create allow-search allow-clear>
            <a-option v-for="m in imageOptions" :key="m.value" :value="m.value">{{ m.label }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="默认视频模型">
          <a-select v-model="defaults.defaultVideoModel" allow-create allow-search allow-clear>
            <a-option v-for="m in videoOptions" :key="m.value" :value="m.value">{{ m.label }}</a-option>
          </a-select>
        </a-form-item>
      </a-form>
    </div>

    <div class="page-card">
      <div class="page-toolbar">
        <div>
          <h3 style="margin: 0">模型库</h3>
          <p class="hint">落地到本机的模型快照，可供默认模型与前台选择。</p>
        </div>
        <a-space>
          <a-button @click="openCreate">新增模型</a-button>
          <a-button type="primary" :loading="loading" @click="load">刷新</a-button>
          <a-button status="danger" :disabled="!hasSelection" :loading="batchLoading" @click="batchRemove">批量删除</a-button>
        </a-space>
      </div>

      <a-table
        v-model:selectedKeys="selectedKeys"
        row-key="key"
        :loading="loading"
        :data="modelRows"
        :pagination="{ pageSize: 20 }"
        :row-selection="rowSelection"
      >
        <template #columns>
          <a-table-column title="标题" data-index="title" />
          <a-table-column title="Model ID" data-index="modelId" ellipsis tooltip />
          <a-table-column title="渠道" data-index="channelSlug" :width="120" />
          <a-table-column title="能力" :width="160">
            <template #cell="{ record }">
              <a-space>
                <a-tag v-for="m in record.modalities || []" :key="m" size="small">{{ m }}</a-tag>
              </a-space>
            </template>
          </a-table-column>
          <a-table-column title="操作" :width="100" fixed="right">
            <template #cell="{ record }">
              <a-popconfirm content="从本机模型库移除？（内置项下次仍会回显）" @ok="remove(record)">
                <a-button type="text" status="danger" size="small">删除</a-button>
              </a-popconfirm>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </div>

    <a-modal v-model:visible="visible" title="新增模型" :ok-loading="savingModel" @ok="saveModel">
      <a-form :model="modelForm" layout="vertical">
        <a-form-item label="Model ID" required>
          <a-input v-model="modelForm.modelId" placeholder="如 doubao-seed-1-6-250615" />
        </a-form-item>
        <a-form-item label="渠道 slug" required>
          <a-select v-model="modelForm.channelSlug" allow-create allow-search>
            <a-option v-for="s in channelSlugs" :key="s" :value="s">{{ s }}</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="显示名称">
          <a-input v-model="modelForm.title" />
        </a-form-item>
        <a-form-item label="能力">
          <a-select v-model="modelForm.modalities" multiple>
            <a-option value="text">text</a-option>
            <a-option value="image">image</a-option>
            <a-option value="video">video</a-option>
            <a-option value="audio">audio</a-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import api from '@/api';
import { useTableBatch } from '@/composables/useTableBatch';

const { selectedKeys, rowSelection, hasSelection, batchLoading, batchDelete } = useTableBatch();

const loading = ref(false);
const savingDefaults = ref(false);
const savingModel = ref(false);
const visible = ref(false);
const settings = ref<any>({});

const defaults = reactive({
  defaultChatModel: '',
  defaultImageModel: '',
  defaultVideoModel: '',
});

const modelForm = reactive({
  modelId: '',
  channelSlug: 'volcengine',
  title: '',
  modalities: ['text'] as string[],
});

const localModels = computed<any[]>(() =>
  Array.isArray(settings.value?.localModels) ? settings.value.localModels : [],
);

const modelRows = computed(() =>
  localModels.value.map((m) => ({
    ...m,
    key: `${m.channelSlug}:${m.modelId}`,
    title: m.title || m.label || m.modelId,
  })),
);

const channelSlugs = computed(() => {
  const map = settings.value?.localChannels || settings.value?.channelCredentials || {};
  const keys = Object.keys(map);
  return keys.length ? keys : ['volcengine'];
});

function optionsBy(cap: string, pattern: RegExp) {
  return localModels.value
    .filter((m) => {
      const mods = Array.isArray(m.modalities) ? m.modalities : [];
      return mods.includes(cap) || pattern.test(String(m.modelId || ''));
    })
    .map((m) => ({
      label: `${m.title || m.label || m.modelId} (${m.modelId})`,
      value: String(m.modelId),
    }));
}

const chatOptions = computed(() => optionsBy('text', /doubao|chat|seed|deepseek|text/i));
const imageOptions = computed(() => optionsBy('image', /seedream|image/i));
const videoOptions = computed(() => optionsBy('video', /seedance|video/i));

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/settings');
    settings.value = data || {};
    defaults.defaultChatModel = data?.defaultChatModel || '';
    defaults.defaultImageModel = data?.defaultImageModel || '';
    defaults.defaultVideoModel = data?.defaultVideoModel || '';
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function saveDefaults() {
  savingDefaults.value = true;
  try {
    const { data } = await api.put('/admin/settings', {
      defaultChatModel: defaults.defaultChatModel,
      defaultImageModel: defaults.defaultImageModel,
      defaultVideoModel: defaults.defaultVideoModel,
    });
    settings.value = data || {};
    Message.success('默认模型已保存');
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '保存失败');
  } finally {
    savingDefaults.value = false;
  }
}

function openCreate() {
  Object.assign(modelForm, {
    modelId: '',
    channelSlug: channelSlugs.value[0] || 'volcengine',
    title: '',
    modalities: ['text'],
  });
  visible.value = true;
}

async function saveModel() {
  if (!modelForm.modelId.trim() || !modelForm.channelSlug.trim()) {
    Message.warning('请填写 modelId 与渠道');
    return;
  }
  savingModel.value = true;
  try {
    const { data } = await api.post('/admin/settings/models', {
      modelId: modelForm.modelId.trim(),
      channelSlug: modelForm.channelSlug.trim(),
      title: modelForm.title.trim() || modelForm.modelId.trim(),
      modalities: modelForm.modalities,
    });
    settings.value = data || {};
    visible.value = false;
    Message.success('模型已添加');
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '保存失败');
  } finally {
    savingModel.value = false;
  }
}

async function remove(row: any) {
  try {
    const { data } = await api.delete(
      `/admin/settings/models/${encodeURIComponent(row.modelId)}`,
      { params: { channelSlug: row.channelSlug } },
    );
    settings.value = data || {};
    Message.success('已删除');
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e.message || '删除失败');
  }
}

function batchRemove() {
  return batchDelete(
    (key) => {
      const row = modelRows.value.find((r) => r.key === key);
      if (!row) return Promise.reject(new Error('记录不存在'));
      return api.delete(`/admin/settings/models/${encodeURIComponent(row.modelId)}`, {
        params: { channelSlug: row.channelSlug },
      });
    },
    '个模型',
    load,
  );
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
