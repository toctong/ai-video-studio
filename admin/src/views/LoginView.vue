<template>
  <div class="login-page">
    <div class="login-panel">
      <div class="login-panel__brand">
        <div class="mark">AV</div>
        <h1>AI Video Studio</h1>
        <p>后台管理系统</p>
      </div>
      <a-form :model="form" layout="vertical" @submit-success="onSubmit">
        <a-form-item field="username" label="账号" :rules="[{ required: true, message: '请输入账号' }]">
          <a-input v-model="form.username" placeholder="管理员账号" allow-clear size="large" />
        </a-form-item>
        <a-form-item field="password" label="密码" :rules="[{ required: true, message: '请输入密码' }]">
          <a-input-password v-model="form.password" placeholder="密码" allow-clear size="large" />
        </a-form-item>
        <a-form-item field="totpCode" label="动态验证码（已绑定时填写）">
          <a-input v-model="form.totpCode" placeholder="可选" allow-clear size="large" />
        </a-form-item>
        <a-button type="primary" html-type="submit" long size="large" :loading="loading">
          登录
        </a-button>
      </a-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Message } from '@arco-design/web-vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
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
.login-page {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 20%, rgba(22, 93, 255, 0.18), transparent 40%),
    radial-gradient(circle at 80% 10%, rgba(15, 198, 194, 0.16), transparent 35%),
    linear-gradient(160deg, #f7f8fa 0%, #eef2ff 100%);
}

.login-panel {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 16px;
  padding: 36px 32px 28px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);

  &__brand {
    text-align: center;
    margin-bottom: 28px;

    .mark {
      width: 52px;
      height: 52px;
      margin: 0 auto 12px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: 700;
      background: linear-gradient(135deg, #165dff, #0fc6c2);
    }

    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 650;
    }

    p {
      margin: 8px 0 0;
      color: var(--color-text-3);
    }
  }
}
</style>
