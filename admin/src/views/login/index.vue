<template>
  <div class="login">
    <aside class="login__brand">
      <div class="login__brand-inner">
        <BrandLogo size="lg" class="login__brand-logo" />
        <h1>AI Video Studio</h1>
        <p>内容运营 · 渠道模型 · 对象存储 · 业务数据一站管理</p>
        <img class="login__hero" :src="loginHeroUrl" alt="" aria-hidden="true" />
        <ul class="login__features">
          <li>运营 CMS 可视化配置</li>
          <li>MinIO / 渠道 / 模型集中治理</li>
          <li>用户、任务与资产全景观测</li>
        </ul>
      </div>
    </aside>

    <section class="login__panel">
      <div class="login__toolbar">
        <a-button type="text" size="small" @click="app.toggleTheme()">
          <template #icon>
            <icon-moon v-if="!app.isDark" />
            <icon-sun v-else />
          </template>
          {{ app.isDark ? '浅色' : '深色' }}
        </a-button>
      </div>

      <div class="login__body">
        <div class="login__content">
          <header class="login__mobile-brand">
            <BrandLogo size="lg" class="login__mobile-logo" />
            <div>
              <h2 class="login__mobile-title">Video Studio</h2>
              <p class="login__mobile-desc">后台管理系统</p>
            </div>
          </header>

          <h3 class="login__title">欢迎回来</h3>
          <p class="login__subtitle">请使用管理员账号登录后台</p>

          <a-form
            class="login__form"
            :model="form"
            layout="vertical"
            size="large"
            @submit-success="onSubmit"
          >
            <a-form-item field="username" label="账号" :rules="[{ required: true, message: '请输入账号' }]">
              <a-input v-model="form.username" placeholder="管理员账号" allow-clear autocomplete="username">
                <template #prefix><icon-user class="login__input-icon" /></template>
              </a-input>
            </a-form-item>
            <a-form-item field="password" label="密码" :rules="[{ required: true, message: '请输入密码' }]">
              <a-input-password
                v-model="form.password"
                placeholder="密码"
                allow-clear
                autocomplete="current-password"
              >
                <template #prefix><icon-lock class="login__input-icon" /></template>
              </a-input-password>
            </a-form-item>
            <a-form-item field="totpCode" label="动态验证码">
              <a-input v-model="form.totpCode" placeholder="已绑定验证器时填写" allow-clear />
            </a-form-item>
            <a-form-item hide-label>
              <a-button class="login__btn" type="primary" html-type="submit" long size="large" :loading="loading">
                登录
              </a-button>
            </a-form-item>
          </a-form>
        </div>
      </div>

      <footer class="login__footer">© {{ year }} AI Video Studio Admin</footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import BrandLogo from '@/components/BrandLogo.vue';
import loginHeroUrl from '@/assets/login-hero.svg';

const router = useRouter();
const auth = useAuthStore();
const app = useAppStore();
const loading = ref(false);
const year = new Date().getFullYear();
const form = reactive({
  username: 'admin',
  password: '',
  totpCode: '',
});

async function onSubmit() {
  loading.value = true;
  try {
    await auth.login(form.username, form.password, form.totpCode);
    Message.success('登录成功');
    router.replace('/dashboard');
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e?.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.login {
  display: flex;
  width: 100%;
  height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--color-bg-1);

  &__brand {
    position: relative;
    display: none;
    flex: 1.45;
    align-items: center;
    justify-content: center;
    padding: clamp(32px, 5vw, 56px);
    overflow: hidden;
    color: #fff;
    background:
      radial-gradient(circle at 18% 20%, rgba(22, 93, 255, 0.45), transparent 42%),
      radial-gradient(circle at 85% 15%, rgba(15, 198, 194, 0.35), transparent 38%),
      linear-gradient(145deg, #0b1b3a 0%, #13294d 45%, #0f3d4a 100%);

    @media (min-width: 768px) {
      display: flex;
    }
  }

  &__brand-inner {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 460px;

    h1 {
      margin: 18px 0 10px;
      font-size: clamp(28px, 3.5vw, 36px);
      font-weight: 700;
      letter-spacing: -0.03em;
    }

    > p {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.72);
    }
  }

  &__brand-logo {
    filter: drop-shadow(0 12px 30px rgba(22, 93, 255, 0.35));
  }

  &__hero {
    display: block;
    width: min(100%, 520px);
    max-height: min(36vh, 260px);
    margin: 24px 0 8px;
    object-fit: contain;
    animation: login-float 6s ease-in-out infinite;
  }

  &__features {
    display: grid;
    gap: 10px;
    margin: 28px 0 0;
    padding: 0;
    list-style: none;

    li {
      padding: 10px 14px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 13px;
      color: rgba(255, 255, 255, 0.88);
    }
  }

  &__panel {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--color-bg-1);
  }

  &__toolbar {
    position: absolute;
    top: 16px;
    right: clamp(16px, 3vw, 28px);
    z-index: 2;
  }

  &__body {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 56px 24px 48px;
    overflow: auto;
  }

  &__content {
    box-sizing: border-box;
    width: 100%;
    max-width: 400px;
    padding: 8px 4px 16px;
  }

  &__mobile-brand {
    display: none;
    gap: 12px;
    align-items: center;
    margin-bottom: 28px;
  }

  &__mobile-logo {
    flex-shrink: 0;
    filter: drop-shadow(0 8px 18px rgba(22, 93, 255, 0.25));
  }

  &__mobile-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text-1);
  }

  &__mobile-desc {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--color-text-3);
  }

  &__title {
    margin: 0 0 8px;
    font-size: clamp(22px, 4vw, 28px);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-text-1);
  }

  &__subtitle {
    margin: 0 0 28px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-text-3);
  }

  &__form {
    :deep(.arco-form-item-label-col > label) {
      font-weight: 500;
      color: var(--color-text-2);
    }
  }

  &__input-icon {
    font-size: 18px;
    color: var(--color-text-3);
  }

  :deep(.arco-input-wrapper) {
    height: 44px;
    border-radius: 8px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  :deep(.arco-input-wrapper:focus-within) {
    border-color: rgb(var(--primary-6));
    box-shadow: 0 0 0 2px rgba(var(--primary-6), 0.12);
  }

  &__btn {
    height: 44px;
    border-radius: 8px;
  }

  &__footer {
    flex-shrink: 0;
    padding: 16px;
    font-size: 12px;
    color: var(--color-text-4);
    text-align: center;
  }
}

@media (max-width: 767px) {
  .login__mobile-brand {
    display: flex;
  }

  .login__body {
    align-items: flex-start;
    padding-top: 72px;
  }
}

@keyframes login-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .login__hero {
    animation: none;
  }
}
</style>
