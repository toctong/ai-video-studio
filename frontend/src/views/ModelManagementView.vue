<template>
  <div class="models-page">
    <header class="page-hero">
      <p class="eyebrow">火山方舟 · OpenAI 兼容</p>
      <h1>模型管理</h1>
      <p class="sub">
        配置火山引擎方舟 API Key、默认模型与渠道端点。图片使用 Seedream，视频使用 Seedance，对话使用 Doubao。
      </p>
    </header>

    <div class="dashboard">
      <section class="panel channel-panel">
        <header class="panel-head">
          <div>
            <h2>火山方舟渠道</h2>
            <p>API Key 仅加密保存在本机 SQLite，不会写入前端日志。</p>
          </div>
          <span class="status" :class="{ ok: channel.hasKey }">
            {{ channel.hasKey ? '已配置' : '待配置' }}
          </span>
        </header>

        <div class="form-grid">
          <label class="field full">
            <span>API Base URL</span>
            <el-input v-model="channelDraft.baseUrl" placeholder="https://ark.cn-beijing.volces.com/api/v3" />
          </label>
          <label class="field">
            <span>API Key</span>
            <el-input
              v-model="channelDraft.apiKey"
              type="password"
              show-password
              autocomplete="off"
              :placeholder="channel.hasKey ? `留空则不修改（当前 ${channel.apiKeyMasked || '已保存'}）` : '粘贴火山方舟 API Key'"
            />
          </label>
          <label class="field">
            <span>代理 URL（可选）</span>
            <el-input v-model="channelDraft.proxyUrl" placeholder="http://127.0.0.1:7890" />
          </label>
        </div>

        <div class="panel-actions">
          <el-button type="primary" :loading="savingChannel" @click="saveChannel">保存渠道</el-button>
          <el-button :loading="testing" @click="testChannel">测试连接</el-button>
          <span v-if="channelResult" class="test-result" :class="{ ok: channelResult.ok }">
            {{ channelResult.message }}
          </span>
        </div>
      </section>

      <section class="panel">
        <header class="panel-head">
          <div>
            <h2>默认模型</h2>
            <p>制作大片、工作流与对话默认使用的模型。</p>
          </div>
        </header>

        <div class="form-grid">
          <label class="field">
            <span>对话模型</span>
            <el-select v-model="defaultChatModel" filterable allow-create default-first-option class="full-input">
              <el-option v-for="m in chatModels" :key="m.value" :label="m.label" :value="m.value" />
            </el-select>
          </label>
          <label class="field">
            <span>图片模型</span>
            <el-select v-model="defaultImageModel" filterable allow-create default-first-option class="full-input">
              <el-option v-for="m in imageModels" :key="m.value" :label="m.label" :value="m.value" />
            </el-select>
          </label>
          <label class="field full">
            <span>视频模型</span>
            <el-select v-model="defaultVideoModel" filterable allow-create default-first-option class="full-input">
              <el-option v-for="m in videoModels" :key="m.value" :label="m.label" :value="m.value" />
            </el-select>
          </label>
        </div>

        <div class="panel-actions">
          <el-button type="primary" :loading="savingDefaults" @click="saveDefaults">保存默认模型</el-button>
        </div>
      </section>

      <section class="panel">
        <header class="panel-head">
          <div>
            <h2>模型目录</h2>
            <p>已落地到本机的模型快照，可复制 modelId 到默认模型输入框。</p>
          </div>
        </header>

        <div class="model-table">
          <div v-for="m in localModels" :key="m.modelId + m.channelSlug" class="model-row">
            <div class="model-main">
              <strong>{{ m.title || m.label || m.modelId }}</strong>
              <span>{{ m.modelId }}</span>
            </div>
            <div class="model-meta">
              <el-tag v-for="cap in capabilitiesOf(m)" :key="cap" size="small" effect="plain">
                {{ cap }}
              </el-tag>
              <el-tag size="small" type="info" effect="plain">{{ m.channelTitle || m.channelSlug }}</el-tag>
            </div>
          </div>
          <el-empty v-if="!localModels.length" description="暂无本地模型快照。请在「设置 → 渠道」填写 API Key，并在上方选择默认模型。" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/api';

type ModelOption = { label: string; value: string };

const settings = ref<any>({});
const savingChannel = ref(false);
const savingDefaults = ref(false);
const testing = ref(false);
const channelResult = ref<{ ok: boolean; message: string } | null>(null);

const channelDraft = reactive({
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: '',
  proxyUrl: '',
});

const defaultChatModel = ref('');
const defaultImageModel = ref('');
const defaultVideoModel = ref('');

const channel = computed(() => {
  const c = settings.value?.localChannels?.volcengine || settings.value?.channelCredentials?.volcengine || {};
  return c || {};
});

const localModels = computed<Array<any>>(() => Array.isArray(settings.value?.localModels) ? settings.value.localModels : []);

const chatModels = computed<ModelOption[]>(() => modelOptions('text', /doubao|chat|seed|deepseek|text/i));
const imageModels = computed<ModelOption[]>(() => modelOptions('image', /seedream|image/i));
const videoModels = computed<ModelOption[]>(() => modelOptions('video', /seedance|video/i));

function modelOptions(cap: string, pattern: RegExp): ModelOption[] {
  const list = localModels.value.filter((m: any) => {
    const mods = Array.isArray(m.modalities) ? m.modalities : [];
    return mods.includes(cap) || pattern.test(String(m.modelId || ''));
  });
  const source = list.length ? list : localModels.value;
  return source.map((m: any) => ({
    label: String(m.title || m.label || m.modelId || '').trim(),
    value: String(m.modelId || '').trim(),
  })).filter((x) => x.value);
}

function capabilitiesOf(m: any) {
  const map: Record<string, string> = { text: '对话', image: '图片', video: '视频', audio: '音频' };
  const mods = Array.isArray(m.modalities) ? m.modalities : [];
  return mods.map((x: string) => map[x] || x);
}

async function loadSettings() {
  try {
    const { data } = await api.get('/settings');
    settings.value = data || {};
    const c = channel.value;
    channelDraft.baseUrl = String(c.baseUrl || channelDraft.baseUrl).trim();
    channelDraft.proxyUrl = String(c.proxyUrl || '').trim();
    channelDraft.apiKey = '';
    defaultChatModel.value = String(data?.defaultChatModel || '').trim();
    defaultImageModel.value = String(data?.defaultImageModel || '').trim();
    defaultVideoModel.value = String(data?.defaultVideoModel || '').trim();
  } catch (e: any) {
    ElMessage.error(String(e?.response?.data?.message || e?.message || '读取模型配置失败'));
  }
}

async function saveChannel() {
  savingChannel.value = true;
  channelResult.value = null;
  try {
    const patch: Record<string, any> = {
      baseUrl: channelDraft.baseUrl.trim(),
      proxyUrl: channelDraft.proxyUrl.trim(),
    };
    if (channelDraft.apiKey.trim()) patch.apiKey = channelDraft.apiKey.trim();
    const { data } = await api.put('/settings', {
      channelCredentials: { volcengine: patch },
    });
    settings.value = data || {};
    channelDraft.apiKey = '';
    ElMessage.success('火山方舟渠道已保存');
  } catch (e: any) {
    ElMessage.error(String(e?.response?.data?.message || e?.message || '保存失败'));
  } finally {
    savingChannel.value = false;
  }
}

async function testChannel() {
  if (!channel.value.hasKey && !channelDraft.apiKey.trim()) {
    ElMessage.warning('请先保存 API Key');
    return;
  }
  if (channelDraft.apiKey.trim()) await saveChannel();
  testing.value = true;
  channelResult.value = null;
  try {
    const model =
      defaultChatModel.value ||
      chatModels.value[0]?.value ||
      defaultImageModel.value ||
      imageModels.value[0]?.value ||
      '';
    const { data } = await api.post('/ai/channels/volcengine/test', { model, capability: 'chat' });
    channelResult.value = { ok: !!data?.ok, message: String(data?.message || '测试完成') };
  } catch (e: any) {
    channelResult.value = {
      ok: false,
      message: String(e?.response?.data?.message || e?.message || '测试失败'),
    };
  } finally {
    testing.value = false;
  }
}

async function saveDefaults() {
  savingDefaults.value = true;
  try {
    const { data } = await api.put('/settings', {
      defaultChatModel: defaultChatModel.value.trim(),
      defaultImageModel: defaultImageModel.value.trim(),
      defaultVideoModel: defaultVideoModel.value.trim(),
    });
    settings.value = data || {};
    ElMessage.success('默认模型已保存');
  } catch (e: any) {
    ElMessage.error(String(e?.response?.data?.message || e?.message || '保存失败'));
  } finally {
    savingDefaults.value = false;
  }
}

onMounted(loadSettings);
</script>

<style scoped>
.models-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px 28px 56px;
  color: var(--studio-ink);
}
.page-hero {
  margin-bottom: 22px;
}
.eyebrow {
  margin: 0 0 8px;
  color: #3b82f6;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.page-hero h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.sub {
  margin: 10px 0 0;
  color: var(--studio-muted);
  font-size: 14px;
  line-height: 1.7;
  max-width: 780px;
}
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.panel {
  padding: 20px;
  border: 1px solid var(--studio-line-strong);
  border-radius: 20px;
  background: var(--studio-panel);
}
.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.panel-head h2 {
  margin: 0 0 6px;
  font-size: 18px;
}
.panel-head p {
  margin: 0;
  color: var(--studio-muted);
  font-size: 13px;
  line-height: 1.55;
}
.status {
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--studio-panel-3);
  color: var(--studio-muted);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.status.ok {
  color: #3b82f6;
  background: rgba(37, 99, 235, 0.14);
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field span {
  color: var(--studio-muted);
  font-size: 13px;
  font-weight: 600;
}
.full {
  grid-column: 1 / -1;
}
.full-input {
  width: 100%;
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
}
.test-result {
  font-size: 13px;
  color: var(--studio-muted);
}
.test-result.ok {
  color: #16a34a;
}
.model-table {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--studio-line-strong);
  border-radius: 14px;
  background: var(--studio-bg);
}
.model-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.model-main strong {
  font-size: 14px;
}
.model-main span {
  color: var(--studio-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
.model-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
@media (max-width: 760px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .model-row {
    flex-direction: column;
    align-items: flex-start;
  }
  .model-meta {
    justify-content: flex-start;
  }
}
</style>
