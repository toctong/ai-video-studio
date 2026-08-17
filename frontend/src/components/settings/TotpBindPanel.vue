<template>
  <div class="totp-panel">
    <h3 class="sub">身份验证器（推荐腾讯身份验证器）</h3>
    <p class="lead">
      绑定后登录需输入 App 中的 6 位动态码。兼容腾讯身份验证器、Google Authenticator 等 TOTP。
    </p>

    <template v-if="enabled">
      <p class="ok">已绑定验证器</p>
      <div class="row">
        <input v-model="disablePassword" type="password" class="input" placeholder="当前密码" />
        <input
          v-model="disableCode"
          class="input code"
          inputmode="numeric"
          maxlength="6"
          placeholder="动态码"
        />
        <button type="button" class="btn danger" :disabled="busy" @click="disable">
          关闭绑定
        </button>
      </div>
    </template>

    <template v-else>
      <button type="button" class="btn primary" :disabled="busy" @click="begin">
        {{ setup ? '刷新二维码' : '开始绑定' }}
      </button>
      <div v-if="setup" class="setup">
        <img class="qr" :src="setup.qrDataUrl" alt="TOTP 二维码" />
        <p class="hint">用腾讯身份验证器扫码，或手动输入密钥：</p>
        <code class="secret">{{ setup.secret }}</code>
        <div class="row">
          <input
            v-model="confirmCode"
            class="input code"
            inputmode="numeric"
            maxlength="6"
            placeholder="输入 App 中 6 位码"
          />
          <button type="button" class="btn primary" :disabled="busy" @click="confirm">
            确认绑定
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const enabled = computed(() => Boolean(auth.user?.totpEnabled));
const busy = ref(false);
const setup = ref<{ secret: string; qrDataUrl: string } | null>(null);
const confirmCode = ref('');
const disablePassword = ref('');
const disableCode = ref('');

async function begin() {
  busy.value = true;
  try {
    const { data } = await api.post('/auth/totp/setup');
    setup.value = { secret: data.secret, qrDataUrl: data.qrDataUrl };
    confirmCode.value = '';
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '获取二维码失败');
  } finally {
    busy.value = false;
  }
}

async function confirm() {
  const code = confirmCode.value.trim();
  if (!/^\d{6}$/.test(code)) {
    ElMessage.warning('请输入 6 位动态码');
    return;
  }
  busy.value = true;
  try {
    const { data } = await api.post('/auth/totp/confirm', { code });
    if (data?.user) auth.applyUserProfile(data.user);
    setup.value = null;
    ElMessage.success('已绑定身份验证器');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '绑定失败');
  } finally {
    busy.value = false;
  }
}

async function disable() {
  if (!disablePassword.value || !/^\d{6}$/.test(disableCode.value.trim())) {
    ElMessage.warning('请填写密码与 6 位动态码');
    return;
  }
  busy.value = true;
  try {
    const { data } = await api.post('/auth/totp/disable', {
      password: disablePassword.value,
      code: disableCode.value.trim(),
    });
    if (data?.user) auth.applyUserProfile(data.user);
    disablePassword.value = '';
    disableCode.value = '';
    ElMessage.success('已关闭验证器绑定');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '关闭失败');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.totp-panel {
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid var(--line);
}
.sub {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
}
.lead {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}
.ok {
  margin: 0 0 12px;
  color: #16a34a;
  font-size: 13px;
  font-weight: 600;
}
.setup {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.qr {
  width: 180px;
  height: 180px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #fff;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}
.secret {
  font-size: 13px;
  word-break: break-all;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--line) 35%, transparent);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.input {
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  min-width: 140px;
}
.input.code {
  width: 120px;
  min-width: 120px;
  letter-spacing: 0.12em;
}
.btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text, #fafafa);
  cursor: pointer;
  font: inherit;
}
.btn.primary {
  background: #fafafa;
  border-color: #fafafa;
  color: #0a0a0a;
}
.btn.primary:hover:not(:disabled) {
  background: #e5e5e5;
  border-color: #e5e5e5;
}
.btn.danger {
  color: #fca5a5;
  border-color: color-mix(in srgb, #ef4444 40%, var(--line));
  background: transparent;
}
.btn.danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.1);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
