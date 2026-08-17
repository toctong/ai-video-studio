<template>
  <div class="hub-panel">
    <div v-if="status" class="status-card">
      <div class="status-row">
        <span class="status-pill" :class="linked ? 'on' : 'off'">
          {{ linked ? '已对接' : '未对接' }}
        </span>
        <span class="meta">版本 {{ status.catalogVersion || 0 }}</span>
      </div>
      <div v-if="syncItems.length" class="sync-items">
        <span
          v-for="it in syncItems"
          :key="it.key"
          class="sync-item"
          :class="it.ok ? 'ok' : 'off'"
          :title="it.updatedAt ? `最近同步 ${formatTime(it.updatedAt)}` : '尚未同步成功'"
        >
          <i class="dot" />
          {{ it.label }} {{ it.count }}
          <em>{{ it.updatedAt ? formatTime(it.updatedAt) : '未同步' }}</em>
        </span>
      </div>
      <p v-if="status.lastSyncAt" class="sync-line">
        上次同步 {{ formatTime(status.lastSyncAt) }}
        <template v-if="status.lastSyncError">
          · <span class="err">{{ status.lastSyncError }}</span>
        </template>
      </p>
    </div>

    <p class="hint top-hint">
      {{
        form.canToggleDevHub
          ? form.preferDevHub
            ? '已选择开发环境：使用 LUMINA_HUB_DEV_URL / TOKEN（可在下方覆盖）。'
            : '已选择主环境：使用 LUMINA_HUB_URL / TOKEN（可在下方覆盖）。'
          : '请在环境变量或下方填写 Hub 地址与 Token；未配置则不同步。'
      }}
    </p>

    <div v-if="form.canToggleDevHub" class="field switch-field">
      <div class="switch-copy">
        <label>对接开发环境 Hub</label>
        <p class="hint">需在 .env 配置 LUMINA_HUB_DEV_URL（及可选 DEV_TOKEN）</p>
      </div>
      <el-switch
        v-model="form.preferDevHub"
        :disabled="togglingDev"
        @change="onPreferDevHubChange"
      />
    </div>

    <div class="field switch-field">
      <label>启用 Hub 同步</label>
      <el-switch v-model="form.enabled" />
    </div>
    <div class="field">
      <label>Hub 地址</label>
      <input
        v-model="form.baseUrl"
        class="input"
        :placeholder="defaultHubHost ? `回落 ${defaultHubHost}` : '必填：https://your-hub.example'"
      />
    </div>
    <div class="field">
      <label>API Token</label>
      <input
        v-model="form.token"
        class="input"
        type="password"
        :placeholder="form.hasToken ? `已配置 ${form.tokenMasked}，留空不改` : tokenPlaceholder"
        autocomplete="new-password"
      />
    </div>
    <div class="field">
      <label>本机回调 URL</label>
      <input
        v-model="form.callbackUrl"
        class="input"
        :placeholder="defaultCallbackHint"
      />
      <p class="hint">Hub 发布内容时 POST 到此地址；需局域网可达</p>
    </div>
    <div class="field">
      <label>Webhook Secret</label>
      <input
        v-model="form.webhookSecret"
        class="input"
        placeholder="必填：与注册实例时一致"
      />
    </div>
    <div class="field">
      <label>实例名称</label>
      <input v-model="form.instanceName" class="input" placeholder="本机显示名" />
    </div>
    <div class="field">
      <label>同步间隔（分钟）</label>
      <el-input-number v-model="intervalMin" :min="1" :max="120" controls-position="right" />
    </div>

    <div class="actions">
      <button type="button" class="btn-save" :disabled="saving" @click="onSave">
        {{ saving ? '保存中…' : '保存配置' }}
      </button>
      <button type="button" class="btn-ghost" :disabled="busy" @click="onRegister">
        注册到 Hub
      </button>
      <button type="button" class="btn-ghost" :disabled="busy" @click="onSync">
        立即同步
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/api';
import { clearSkillPlazaCache } from '@/api/skills';

const saving = ref(false);
const busy = ref(false);
const togglingDev = ref(false);
const status = ref<any>(null);
const form = reactive({
  enabled: false,
  preferDevHub: false,
  canToggleDevHub: false,
  baseUrl: '',
  token: '',
  hasToken: false,
  tokenMasked: '',
  webhookSecret: '',
  callbackUrl: '',
  instanceName: '',
  syncIntervalMs: 300000,
  defaultBaseUrl: '',
});

const defaultHubHost = computed(() => {
  try {
    if (!form.defaultBaseUrl) return '';
    return new URL(form.defaultBaseUrl).host;
  } catch {
    return '';
  }
});

const tokenPlaceholder = computed(() =>
  form.defaultBaseUrl ? '留空则使用环境变量 Token' : '请填写 Token 或配置 LUMINA_HUB_TOKEN',
);

const linked = computed(() => Boolean(status.value?.enabled && status.value?.configured));

/** 同步分项健康：ok / 条目数 / 最近成功同步时间 */
const syncItems = computed(() => {
  const it = status.value?.items;
  if (!it) return [];
  return [
    { key: 'plaza', label: '提示词', ...it.plaza },
    { key: 'agents', label: '技能', ...it.agents },
    { key: 'channels', label: '渠道', ...it.channels },
    { key: 'models', label: '模型', ...it.models },
    { key: 'workflows', label: '工作流', ...it.workflows },
  ];
});

const intervalMin = computed({
  get: () => Math.round((form.syncIntervalMs || 300000) / 60000),
  set: (v: number) => {
    form.syncIntervalMs = Math.max(1, Number(v) || 5) * 60000;
  },
});

const defaultCallbackHint = computed(() => {
  if (typeof location === 'undefined') return 'http://本机IP:9088/api/hub/webhook';
  return `${location.protocol}//${location.hostname}:47822/api/hub/webhook`;
});

function formatTime(v?: string) {
  if (!v) return '—';
  return new Date(v).toLocaleString();
}

function applyPublicConfig(cfg: any) {
  form.enabled = !!cfg.enabled;
  form.preferDevHub = !!cfg.preferDevHub;
  form.canToggleDevHub = !!cfg.canToggleDevHub;
  form.baseUrl = cfg.baseUrl || '';
  form.token = '';
  form.hasToken = !!cfg.hasToken;
  form.tokenMasked = cfg.tokenMasked || '';
  form.webhookSecret = cfg.webhookSecret || '';
  form.callbackUrl = cfg.callbackUrl || '';
  form.instanceName = cfg.instanceName || '';
  form.syncIntervalMs = cfg.syncIntervalMs || 300000;
  form.defaultBaseUrl = cfg.defaultBaseUrl || '';
}

async function load() {
  try {
    const [cfg, st] = await Promise.all([
      api.get('/hub/config').then((r) => r.data),
      api.get('/hub/status').then((r) => r.data),
    ]);
    applyPublicConfig(cfg);
    status.value = st;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载 Hub 配置失败');
  }
}

async function onPreferDevHubChange(value: string | number | boolean) {
  const preferDevHub = Boolean(value);
  togglingDev.value = true;
  try {
    const cfg = await api
      .put('/hub/config', { preferDevHub })
      .then((r) => r.data);
    applyPublicConfig(cfg);
    ElMessage.success(preferDevHub ? '已切换为开发环境 Hub' : '已切换为生产环境 Hub');
    status.value = await api.get('/hub/status').then((r) => r.data);
  } catch (e: any) {
    form.preferDevHub = !preferDevHub;
    ElMessage.error(e?.response?.data?.message || '切换失败');
  } finally {
    togglingDev.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    const body: Record<string, unknown> = {
      enabled: form.enabled,
      baseUrl: form.baseUrl.trim(),
      webhookSecret: form.webhookSecret,
      callbackUrl: form.callbackUrl.trim(),
      instanceName: form.instanceName.trim(),
      syncIntervalMs: form.syncIntervalMs,
    };
    if (form.canToggleDevHub) body.preferDevHub = form.preferDevHub;
    if (form.token.trim()) body.token = form.token.trim();
    const cfg = await api.put('/hub/config', body).then((r) => r.data);
    applyPublicConfig(cfg);
    ElMessage.success('已保存');
    status.value = await api.get('/hub/status').then((r) => r.data);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onRegister() {
  busy.value = true;
  try {
    await api.post('/hub/register');
    ElMessage.success('已注册到 Hub');
    status.value = await api.get('/hub/status').then((r) => r.data);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '注册失败');
  } finally {
    busy.value = false;
  }
}

async function onSync() {
  busy.value = true;
  try {
    const res = await api.post('/hub/sync').then((r) => r.data);
    if (res?.ok) {
      clearSkillPlazaCache();
      ElMessage.success('同步完成');
    } else ElMessage.warning(res?.message || '同步未完成');
    status.value = await api.get('/hub/status').then((r) => r.data);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '同步失败');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.hub-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 480px;
}

.status-card {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-line-strong);
}
.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.status-pill.on {
  background: rgba(134, 239, 172, 0.12);
  color: #86efac;
}
.status-pill.off {
  background: var(--studio-panel-3);
  color: var(--studio-muted);
}
.sync-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 10px;
}
.sync-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--studio-muted);
}
.sync-item .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--studio-faint);
}
.sync-item.ok .dot {
  background: #34d399;
}
.sync-item.off .dot {
  background: var(--studio-faint);
}
.sync-item em {
  font-style: normal;
  opacity: 0.7;
}
.meta {
  font-size: 12px;
  color: var(--studio-faint);
}
.sync-line {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--studio-faint);
}
.err {
  color: var(--studio-text-strong);
  background: rgba(248, 113, 113, 0.12);
  border-radius: 6px;
  padding: 1px 6px;
}

.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--studio-muted);
}
.hint.top-hint {
  margin-top: -4px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--studio-muted);
}
.switch-field {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 0 2px;
  gap: 16px;
}
.switch-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.switch-copy .hint {
  margin: 0;
}

.input {
  width: 100%;
  height: 48px;
  box-sizing: border-box;
  padding: 0 16px;
  border: 0;
  border-radius: 14px;
  background: var(--studio-panel);
  color: var(--studio-ink);
  font: inherit;
  font-size: 14px;
  outline: none;
  box-shadow: 0 0 0 1px var(--studio-line-strong) inset;
}
.input::placeholder {
  color: var(--studio-text-faint);
}
.input:focus {
  box-shadow: 0 0 0 1px var(--studio-line-bright) inset;
}

.hub-panel :deep(.el-input-number) {
  width: 160px;
}
.hub-panel :deep(.el-input-number .el-input__wrapper) {
  background: var(--studio-panel) !important;
  box-shadow: 0 0 0 1px var(--studio-line-strong) inset !important;
  border-radius: 12px !important;
}
.hub-panel :deep(.el-input-number .el-input__inner) {
  color: var(--studio-ink) !important;
}
.hub-panel :deep(.el-switch.is-checked .el-switch__core) {
  background-color: var(--studio-ink) !important;
  border-color: var(--studio-ink) !important;
}
.hub-panel :deep(.el-switch.is-checked .el-switch__action) {
  background-color: var(--studio-bg) !important;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}
.btn-save,
.btn-ghost {
  height: 44px;
  padding: 0 18px;
  border-radius: 14px;
  border: 0;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
}
.btn-save {
  background: var(--studio-ink);
  color: var(--studio-bg);
}
.btn-save:hover:not(:disabled) {
  background: var(--studio-ink);
}
.btn-ghost {
  background: var(--studio-panel-3);
  color: var(--studio-text);
  box-shadow: 0 0 0 1px var(--studio-line-strong) inset;
}
.btn-ghost:hover:not(:disabled) {
  background: var(--studio-glass-2);
  color: var(--studio-ink);
}
.btn-save:disabled,
.btn-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
