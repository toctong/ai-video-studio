<template>
  <div class="settings-page">
    <header class="settings-top">
      <button type="button" class="back" @click="goBack">
        <UiIcon name="arrow-left" :size="18" />
        <span>返回</span>
      </button>
      <h1>个人设置</h1>
    </header>

    <div class="settings-body">
      <aside class="side">
        <div class="profile">
          <span class="avatar">
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" />
            <span v-else>{{ initial }}</span>
          </span>
          <strong>{{ auth.user?.username || auth.displayName }}</strong>
        </div>

        <nav aria-label="设置分区">
          <button
            v-for="s in sections"
            :key="s.id"
            type="button"
            class="nav-item"
            :class="{ on: section === s.id }"
            @click="section = s.id"
          >
            <UiIcon :name="s.icon" :size="16" />
            <span>{{ s.label }}</span>
          </button>
        </nav>
      </aside>

      <section class="panel">
        <template v-if="section === 'account'">
          <h2>账号</h2>
          <p class="lead">修改用户名或登录密码，保存时用当前密码验证</p>
          <div class="form-stack">
            <div class="field">
              <label>用户名</label>
              <input
                v-model="accountForm.username"
                type="text"
                class="input"
                placeholder="请输入用户名"
                autocomplete="username"
              />
              <p class="hint">不改可保持原样；用户名修改周期为 1 年</p>
            </div>
            <div class="field">
              <label>当前密码</label>
              <input
                v-model="accountForm.oldPassword"
                type="password"
                class="input"
                placeholder="验证身份（必填）"
                autocomplete="current-password"
              />
            </div>
            <div class="field">
              <label>新密码</label>
              <input
                v-model="accountForm.newPassword"
                type="password"
                class="input"
                placeholder="不修改请留空，至少 6 位"
                autocomplete="new-password"
              />
            </div>
            <div class="field">
              <label>确认新密码</label>
              <input
                v-model="accountForm.confirmPassword"
                type="password"
                class="input"
                placeholder="再次输入新密码"
                autocomplete="new-password"
              />
            </div>
            <button
              type="button"
              class="btn-save"
              :disabled="accountSaving"
              @click="saveAccount"
            >
              {{ accountSaving ? '保存中…' : '保存账号' }}
            </button>
          </div>
          <TotpBindPanel />
        </template>

        <template v-else-if="section === 'notify'">
          <h2>通知设置</h2>
          <p class="lead">任务完成、失败与系统公告的提醒偏好。</p>
          <div class="soon-box">即将开放</div>
        </template>

        <template v-else-if="section === 'channels'">
          <h2>渠道</h2>
          <p class="lead">在本机配置火山方舟等渠道的 API Key，不依赖外部 Hub。</p>
          <div class="form-stack flat">
            <ChannelsCredentialsPanel
              mode="local-channels"
              :settings="form"
              @saved="onSaved"
            />
          </div>
        </template>

        <template v-else-if="section === 'models'">
          <h2>模型</h2>
          <div class="form-stack flat">
            <ChannelsCredentialsPanel
              mode="local-models"
              :settings="form"
              @saved="onSaved"
            />
          </div>
        </template>

        <template v-else-if="section === 'storage'">
          <h2>任务并发</h2>
          <p class="lead">同时执行的任务数，保存后立即生效。素材文件在「资产管理」中维护，对象存储由后端写死。</p>
          <div class="form-stack">
            <div class="field">
              <label>任务队列并发</label>
              <el-input-number v-model="form.jobConcurrency" :min="1" :max="32" />
            </div>
            <button type="button" class="btn-save" :disabled="saving" @click="saveSystem">
              {{ saving ? '保存中…' : '保存并发' }}
            </button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import api from '@/api';
import ChannelsCredentialsPanel from '@/components/settings/ChannelsCredentialsPanel.vue';
import TotpBindPanel from '@/components/settings/TotpBindPanel.vue';
import { ensureAiSettings } from '@/composables/useAiSettings';
import { useAuthStore } from '@/stores/auth';
import UiIcon from '@/components/icons/UiIcon.vue';
import type { IconName } from '@/components/icons/types';

type SectionId = 'account' | 'notify' | 'channels' | 'models' | 'storage';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const sections: Array<{ id: SectionId; label: string; icon: IconName }> = [
  { id: 'account', label: '账号', icon: 'user' },
  { id: 'notify', label: '通知设置', icon: 'bell' },
  { id: 'channels', label: '渠道', icon: 'zap' },
  { id: 'models', label: '模型', icon: 'sparkles' },
  { id: 'storage', label: '任务并发', icon: 'folder' },
];

const section = ref<SectionId>('account');
const saving = ref(false);
const accountSaving = ref(false);

const form = reactive<any>({
  chatProvider: '',
  imageProvider: '',
  videoProvider: '',
  providerCredentials: {},
  channelCredentials: {},
  localChannels: {},
  localModels: [],
  defaultChatModel: '',
  defaultImageModel: '',
  defaultVideoModel: '',
  jobConcurrency: 8,
  fileOss: {
    baseUrl: '',
    bucket: '',
    keyPrefix: '',
    configured: false,
  },
});

const accountForm = reactive({
  username: '',
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const initial = computed(() => {
  const n = String(auth.displayName || auth.user?.username || 'U').trim();
  return (n[0] || 'U').toUpperCase();
});

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push('/home');
}

function onSaved(data: any) {
  Object.assign(form, data);
  void ensureAiSettings(true);
}

function syncSectionFromRoute() {
  const q = String(route.query.section || '').trim();
  const ids = sections.map((s) => s.id);
  if ((ids as string[]).includes(q)) {
    section.value = q as SectionId;
    return;
  }
  if (q === 'username' || q === 'password' || q === 'account') {
    section.value = 'account';
  } else if (q === 'hub' || q === 'system') {
    section.value = 'storage';
  } else if (q === 'providers' || q === 'credentials' || q === 'local' || q === 'channels') {
    section.value = 'channels';
  } else if (q === 'capability' || q === 'ark' || q === 'theme') {
    section.value = 'models';
  }
}

watch(section, (id) => {
  const query: Record<string, any> = { ...route.query, section: id };
  delete query.tab;
  if (String(route.query.section || '') === id) return;
  router.replace({ query });
});

onMounted(async () => {
  syncSectionFromRoute();
  await auth.ensureUser(true);
  accountForm.username = auth.user?.username || '';
  try {
    const { data } = await api.get('/settings');
    Object.assign(form, data);
  } catch {
    /* ignore */
  }
});

watch(
  () => route.query.section,
  () => syncSectionFromRoute(),
);

async function saveSystem() {
  saving.value = true;
  try {
    const { data } = await api.put('/settings', {
      jobConcurrency: form.jobConcurrency,
    });
    onSaved(data);
    ElMessage.success('已保存');
  } finally {
    saving.value = false;
  }
}

async function saveAccount() {
  const nextName = accountForm.username.trim();
  const oldPwd = accountForm.oldPassword;
  const newPwd = accountForm.newPassword;
  const confirmPwd = accountForm.confirmPassword;
  const currentName = String(auth.user?.username || '').trim();
  const nameChanged = Boolean(nextName) && nextName !== currentName;
  const pwdChanged = Boolean(newPwd);

  if (!nextName) return ElMessage.warning('请输入用户名');
  if (!oldPwd) return ElMessage.warning('请输入当前密码');
  if (!nameChanged && !pwdChanged) {
    return ElMessage.info('用户名与密码均未修改');
  }
  if (pwdChanged) {
    if (newPwd.length < 6) return ElMessage.warning('新密码至少 6 位');
    if (newPwd !== confirmPwd) return ElMessage.warning('两次输入的新密码不一致');
  }

  accountSaving.value = true;
  try {
    const parts: string[] = [];
    if (nameChanged) {
      await auth.updateUsername(nextName, oldPwd);
      parts.push('用户名');
    }
    if (pwdChanged) {
      await auth.changePassword(oldPwd, newPwd);
      parts.push('密码');
    }
    accountForm.oldPassword = '';
    accountForm.newPassword = '';
    accountForm.confirmPassword = '';
    accountForm.username = auth.user?.username || nextName;
    ElMessage.success(`${parts.join('与')}已更新`);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '修改失败');
  } finally {
    accountSaving.value = false;
  }
}
</script>

<style scoped>
.settings-page {
  /* 跟随全局主题（原先强制深色语义，已统一） */
  --shell-bg: var(--studio-bg);
  --bg: var(--studio-bg);
  --bg-0: var(--studio-bg);
  --surface: var(--studio-panel);
  --surface-2: var(--studio-panel-3);
  --surface-muted: var(--studio-panel-3);
  --bg-1: var(--studio-panel);
  --bg-2: var(--studio-panel);
  --bg-3: var(--studio-panel-3);
  --ink: var(--studio-ink);
  --muted: var(--studio-muted);
  --line: var(--studio-line-strong);
  --el-bg-color: var(--studio-panel);
  --el-bg-color-overlay: var(--studio-panel);
  --el-fill-color-blank: var(--studio-panel);
  --el-fill-color-light: var(--studio-panel-3);
  --el-text-color-primary: var(--studio-ink);
  --el-text-color-regular: var(--studio-text);
  --el-text-color-secondary: var(--studio-muted);
  --el-text-color-placeholder: var(--studio-text-faint);
  --el-border-color: var(--studio-line-strong);
  --el-border-color-hover: var(--studio-line-bright);
  --el-input-bg-color: var(--studio-panel);
  --el-input-text-color: var(--studio-ink);
  --el-input-border-color: var(--studio-line-strong);
  --el-button-bg-color: var(--studio-panel-3);
  --el-button-text-color: var(--studio-ink);
  --el-button-border-color: var(--studio-line-strong);
  min-height: 100%;
  overflow: visible;
  background: var(--studio-bg);
  color: var(--studio-ink);
  padding: 20px 28px 56px;
  box-sizing: border-box;
}

.settings-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
  max-width: 1280px;
  margin-left: auto;
  margin-right: auto;
}
.settings-top h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 10px 0 6px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.back:hover {
  color: var(--studio-ink);
  background: var(--studio-glass-2);
}

.settings-body {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 48px;
  max-width: 1280px;
  margin: 0 auto;
}

.side {
  min-width: 0;
}
.profile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 20px;
  padding: 0 8px;
}
.avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #c084fc, #f472b6);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.profile strong {
  font-size: 14px;
  font-weight: 600;
  word-break: break-all;
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  margin-bottom: 4px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.nav-item:hover {
  color: var(--studio-ink);
  background: var(--studio-glass);
}
.nav-item.on {
  color: var(--studio-ink);
  background: var(--studio-glass-3);
}

.panel h2 {
  margin: 0 0 20px;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.panel {
  border-bottom: none;
  padding: 0;
}
.lead {
  margin: -8px 0 16px;
  color: var(--studio-faint);
  font-size: 13px;
}

.seg {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  margin: 0 0 20px;
  border-radius: 999px;
  background: var(--studio-panel-3);
  gap: 2px;
}
.seg-item {
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}
.seg-item:hover {
  color: var(--studio-ink);
}
.seg-item.on {
  background: var(--studio-ink);
  color: var(--studio-bg);
}

.sub-lead {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--studio-faint);
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 420px;
}
.form-stack :deep(.el-input-number) {
  width: 160px;
}
.form-stack :deep(.el-input__wrapper) {
  background: var(--studio-panel) !important;
  box-shadow: 0 0 0 1px var(--studio-line-strong) inset !important;
}
.form-stack :deep(.el-input__inner) {
  color: var(--studio-ink) !important;
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

.input {
  height: 48px;
  padding: 0 16px;
  border: 0;
  border-radius: 14px;
  background: var(--studio-panel);
  color: var(--studio-ink);
  font: inherit;
  font-size: 14px;
  outline: none;
}
.input::placeholder {
  color: var(--studio-text-faint);
}
.input:focus {
  box-shadow: 0 0 0 1px var(--studio-line-bright);
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--studio-muted);
}

.btn-save {
  width: 100%;
  max-width: 420px;
  height: 48px;
  border: 0;
  border-radius: 14px;
  background: var(--studio-ink);
  color: var(--studio-bg);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
}
.btn-save:hover:not(:disabled) {
  background: var(--studio-ink);
}
.btn-save:disabled {
  opacity: 0.55;
  cursor: wait;
}

.soon-box {
  height: 120px;
  border-radius: 16px;
  background: var(--studio-panel);
  color: var(--studio-muted);
  display: grid;
  place-items: center;
  font-size: 14px;
}

.empty-hint {
  margin: 0;
  padding: 36px 20px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  border: 1px dashed var(--line);
  border-radius: 14px;
}

.form-stack.flat {
  max-width: none;
}
.form-stack.flat :deep(.plaza-head) {
  margin-bottom: 14px;
}
.form-stack.flat :deep(.cred-card),
.form-stack.flat :deep(.ark-card) {
  border: 1px solid var(--studio-line-strong);
  border-radius: 14px;
  background: var(--studio-panel);
  margin-bottom: 0;
}
.form-stack.flat :deep(.el-input__wrapper),
.form-stack.flat :deep(.el-input-number) {
  background: var(--studio-panel) !important;
  box-shadow: 0 0 0 1px var(--studio-line-strong) inset !important;
}
.form-stack.flat :deep(.el-input__inner) {
  color: var(--studio-ink) !important;
}
.form-stack.flat :deep(.el-button) {
  --el-button-bg-color: var(--studio-panel-3);
  --el-button-border-color: var(--studio-line-strong);
  --el-button-text-color: var(--studio-ink);
  --el-button-hover-bg-color: var(--studio-glass-2);
  --el-button-hover-border-color: var(--studio-line-bright);
  --el-button-hover-text-color: var(--studio-ink);
}
.form-stack.flat :deep(.el-button--primary) {
  --el-button-bg-color: var(--studio-ink);
  --el-button-border-color: var(--studio-ink);
  --el-button-text-color: var(--studio-bg);
  --el-button-hover-bg-color: var(--studio-ink);
  --el-button-hover-border-color: var(--studio-ink);
  --el-button-hover-text-color: var(--studio-bg);
}

@media (max-width: 800px) {
  .settings-body {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .side nav {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .nav-item {
    width: auto;
  }
}
</style>
