<template>
  <div class="login">
    <div class="bg" aria-hidden="true">
      <svg class="wave wave-tr" width="1337" height="1337" viewBox="0 0 1337 1337">
        <defs>
          <path
            id="login-wave-1"
            fill-rule="evenodd"
            d="M1337,668.5 C1337,1037.455193874239 1037.455193874239,1337 668.5,1337 C523.6725684305388,1337 337,1236 370.50000000000006,1094 C434.03835568300906,824.6732385973953 6.906089672974592e-14,892.6277623047779 0,668.5000000000001 C0,299.5448061257611 299.5448061257609,1.1368683772161603e-13 668.4999999999999,0 C1037.455193874239,0 1337,299.544806125761 1337,668.5Z"
          />
          <linearGradient id="login-grad-1" x1="0.79" y1="0.62" x2="0.21" y2="0.86">
            <stop offset="0" stop-color="#d1fae5" />
            <stop offset="1" stop-color="#10b981" />
          </linearGradient>
        </defs>
        <use href="#login-wave-1" fill="url(#login-grad-1)" />
      </svg>
      <svg class="wave wave-bl" width="968" height="896" viewBox="0 0 968 896">
        <defs>
          <path
            id="login-wave-2"
            fill-rule="evenodd"
            d="M896,448 C1142.6325445712241,465.5747656464056 695.2579309733121,896 448,896 C200.74206902668806,896 5.684341886080802e-14,695.2579309733121 0,448.0000000000001 C0,200.74206902668806 200.74206902668791,5.684341886080802e-14 447.99999999999994,0 C695.2579309733121,0 475,418 896,448Z"
          />
          <linearGradient id="login-grad-2" x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0" stop-color="#10b981" />
            <stop offset="1" stop-color="#d1fae5" />
          </linearGradient>
        </defs>
        <use href="#login-wave-2" fill="url(#login-grad-2)" />
      </svg>
    </div>

    <div class="panel">
      <header class="panel-head">
        <div class="brand-row">
          <div class="mark" aria-hidden="true">
            <BrandLogo />
          </div>
          <h1 class="brand-title">AIGC 视频工厂</h1>
        </div>
        <ThemeToggle />
      </header>

      <h2 class="mode-label">密码登录</h2>

      <el-form class="login-form" size="large" @submit.prevent="onSubmit">
        <el-form-item>
          <el-input
            v-model="username"
            autocomplete="username"
            placeholder="请输入用户名"
            clearable
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="password"
            type="password"
            autocomplete="current-password"
            show-password
            placeholder="请输入密码"
          />
        </el-form-item>
        <el-button
          class="submit-btn"
          type="primary"
          native-type="submit"
          :loading="loading"
          size="large"
          round
        >
          确 认
        </el-button>
      </el-form>

      <div class="panel-foot">
        <span>AI 视频 · 动漫 · 短剧 · 漫剧</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import api from '@/api';
import { useAuthStore } from '@/stores/auth';
import ThemeToggle from '@/components/ThemeToggle.vue';
import BrandLogo from '@/components/BrandLogo.vue';
import { useThemeStore } from '@/stores/theme';
import { readStorage, STORAGE_KEYS } from '@/utils/storage';

const auth = useAuthStore();
const theme = useThemeStore();
const router = useRouter();
const savedUser = readStorage(STORAGE_KEYS.lastUsername);
const username = ref(savedUser || 'admin');
const password = ref(savedUser ? '' : 'admin123');
const loading = ref(false);

async function onSubmit() {
  loading.value = true;
  try {
    const data = await auth.login(username.value, password.value, '');
    theme.syncFromUser(auth.user);

    if (data?.totpSetupRequired) {
      ElMessage.warning('请先用腾讯身份验证器完成绑定');
      await router.replace({ path: '/settings', query: { section: 'account', totp: '1' } });
      return;
    }

    // 未配 FileOSS 时直接进设置，避免进首页被拦回造成「登不进去」错觉
    try {
      const { data: settings } = await api.get('/settings');
      if (!settings?.fileOss?.configured) {
        ElMessage.warning('请先配置 MinIO 对象存储后再使用系统');
        await router.replace({ path: '/settings', query: { section: 'storage' } });
        return;
      }
    } catch {
      /* 设置接口异常时仍进首页，由路由守卫处理 */
    }

    const { DEFAULT_HOME } = await import('@/constants/app-nav');
    await router.replace(DEFAULT_HOME);
  } catch (e: any) {
    const raw = e?.response?.data?.message;
    const msg = Array.isArray(raw) ? raw.join('；') : raw;
    if (e?.response?.data?.code === 'FILE_OSS_REQUIRED') {
      ElMessage.warning(String(msg || '请先配置对象存储'));
      await router.replace({ path: '/settings', query: { section: 'storage' } });
      return;
    }
    ElMessage.error(String(msg || '登录失败'));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  --login-bg: #eef0f6;
  --login-primary: #10b981;
  --login-primary-soft: #d1fae5;
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  overflow: hidden;
  background: var(--login-bg);
}

[data-theme='dark'] .login {
  --login-bg: #1a1b2e;
  --login-primary: #34d399;
  --login-primary-soft: #12352a;
}

.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.wave {
  position: absolute;
  display: block;
}

.wave-tr {
  top: -900px;
  right: -300px;
  width: 1337px;
  height: 1337px;
}

.wave-bl {
  bottom: -400px;
  left: -200px;
  width: 968px;
  height: 896px;
}

.panel {
  position: relative;
  z-index: 1;
  width: min(448px, 100%);
  padding: 24px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
  background: var(--surface);
  box-shadow: none;
  animation: panel-in 0.45s var(--ease) both;
}

@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 28px;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.mark {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #121212;
  overflow: hidden;
  flex-shrink: 0;
}

.brand-title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--login-primary);
  line-height: 1.2;
  white-space: nowrap;
}

.mode-label {
  margin: 0 0 18px;
  font-size: 18px;
  font-weight: 500;
  color: var(--login-primary);
  line-height: 1.4;
}

.login-form {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.login-form :deep(.el-form-item__label) {
  display: none;
}

.login-form :deep(.el-input__wrapper) {
  border-radius: 8px;
  min-height: 38px;
  padding: 1px 12px;
  box-shadow: 0 0 0 1px var(--line) inset !important;
  background: var(--surface);
  transition: box-shadow 0.2s var(--ease);
}

[data-theme='dark'] .login-form :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--line) 90%, transparent) inset !important;
}

.login-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--login-primary) inset !important;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px var(--login-primary) inset,
    0 0 0 2px color-mix(in srgb, var(--login-primary) 18%, transparent) !important;
}

.login-form :deep(.el-input__inner) {
  height: 36px;
  font-size: 14px;
}

.submit-btn {
  width: 100%;
  margin-top: 4px;
  height: 40px !important;
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.12em;
  background: var(--login-primary) !important;
  border-color: var(--login-primary) !important;
}

.submit-btn:hover,
.submit-btn:focus {
  background: color-mix(in srgb, var(--login-primary) 88%, #000) !important;
  border-color: color-mix(in srgb, var(--login-primary) 88%, #000) !important;
}

.panel-foot {
  margin-top: 22px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

.panel-head :deep(.theme-toggle) {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 8px;
  color: var(--muted);
  background: transparent;
}

.panel-head :deep(.theme-toggle:hover) {
  color: var(--login-primary);
  background: color-mix(in srgb, var(--login-primary) 10%, transparent);
}

@media (max-width: 640px) {
  .wave-tr {
    top: -1170px;
    right: -100px;
  }
  .wave-bl {
    bottom: -760px;
    left: -100px;
  }
  .brand-title {
    font-size: 22px;
  }
  .panel {
    padding: 20px 16px;
  }
  .login-form {
    max-width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: none;
  }
}
</style>
