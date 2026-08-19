<template>
  <el-dialog
    v-model="visible"
    title="登录"
    width="420px"
    align-center
    append-to-body
    :close-on-click-modal="true"
    destroy-on-close
    class="login-dialog"
    @closed="onClosed"
  >
    <el-form class="login-dialog__form" size="large" @submit.prevent="onSubmit">
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
          @keyup.enter="onSubmit"
        />
      </el-form-item>
      <el-button
        class="login-dialog__submit"
        type="primary"
        native-type="submit"
        :loading="loading"
        size="large"
        round
      >
        确 认
      </el-button>
    </el-form>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { readStorage, STORAGE_KEYS } from '@/utils/storage';

const auth = useAuthStore();
const theme = useThemeStore();
const router = useRouter();

const visible = ref(false);
const loading = ref(false);
const username = ref('');
const password = ref('');

watch(
  () => auth.loginDialogOpen,
  (open) => {
    visible.value = open;
    if (open) {
      const saved = readStorage(STORAGE_KEYS.lastUsername);
      username.value = saved || 'admin';
      password.value = saved ? '' : 'admin123';
    }
  },
  { immediate: true },
);

watch(visible, (v) => {
  if (!v && auth.loginDialogOpen) auth.closeLoginDialog();
});

function onClosed() {
  auth.closeLoginDialog();
}

async function onSubmit() {
  if (!username.value.trim()) {
    ElMessage.warning('请输入用户名');
    return;
  }
  if (!password.value) {
    ElMessage.warning('请输入密码');
    return;
  }
  loading.value = true;
  try {
    const data = await auth.login(username.value, password.value, '');
    theme.syncFromUser(auth.user);
    auth.closeLoginDialog();

    if (data?.totpSetupRequired) {
      ElMessage.warning('请先用腾讯身份验证器完成绑定');
      await router.replace({ path: '/settings', query: { section: 'account', totp: '1' } });
      return;
    }

    ElMessage.success('登录成功');
  } catch (e: any) {
    const raw = e?.response?.data?.message;
    const msg = Array.isArray(raw) ? raw.join('；') : raw;
    ElMessage.error(String(msg || '登录失败'));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-dialog__form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.login-dialog__submit {
  width: 100%;
  margin-top: 4px;
}
</style>
