<template>
  <el-dialog
    v-model="visible"
    title="个人中心"
    width="560px"
    append-to-body
    align-center
    destroy-on-close
    class="profile-center-dialog"
    @open="onOpen"
  >
    <div class="profile">
      <section class="avatar-section">
        <div class="avatar-preview">
          <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" />
          <span v-else>{{ initial }}</span>
        </div>
        <div class="avatar-actions">
          <div class="avatar-title">头像</div>
          <p class="avatar-tip">支持头像库挑选，或本地上传 JPG / PNG / WebP / GIF（≤2MB）</p>
          <div class="avatar-btns">
            <el-upload
              accept="image/jpeg,image/png,image/webp,image/gif"
              :show-file-list="false"
              :disabled="uploading"
              :http-request="uploadLocal"
            >
              <el-button :loading="uploading" round>本地上传</el-button>
            </el-upload>
            <el-button round :disabled="uploading" @click="libraryOpen = true">头像库</el-button>
          </div>
        </div>
      </section>

      <section class="block">
        <header class="block-head">
          <strong>账号信息</strong>
          <span>登录用户名与展示昵称</span>
        </header>
        <div class="field">
          <span class="label">用户名</span>
          <div class="row">
            <el-input v-model="username" maxlength="32" placeholder="登录用户名" />
            <el-button :loading="savingUsername" @click="saveUsernamePrompt">保存</el-button>
          </div>
        </div>
        <div class="field">
          <span class="label">昵称</span>
          <div class="row">
            <el-input v-model="nickname" maxlength="32" placeholder="顶部导航与概览展示名" clearable />
            <el-button type="primary" :loading="savingNickname" @click="saveNickname">保存</el-button>
          </div>
        </div>
      </section>

      <section class="block">
        <header class="block-head">
          <strong>修改密码</strong>
          <span>至少 6 位</span>
        </header>
        <div class="field">
          <span class="label">原密码</span>
          <el-input v-model="oldPassword" type="password" show-password placeholder="当前登录密码" />
        </div>
        <div class="field">
          <span class="label">新密码</span>
          <el-input v-model="newPassword" type="password" show-password placeholder="新密码" />
        </div>
        <div class="field">
          <span class="label">确认新密码</span>
          <div class="row">
            <el-input
              v-model="confirmPassword"
              type="password"
              show-password
              placeholder="再输入一次"
            />
            <el-button type="primary" :loading="savingPassword" @click="savePassword">
              更新密码
            </el-button>
          </div>
        </div>
      </section>
    </div>
  </el-dialog>

  <AvatarPickerDialog v-model="libraryOpen" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { UploadRequestOptions } from 'element-plus';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import AvatarPickerDialog from '@/components/AvatarPickerDialog.vue';

const visible = defineModel<boolean>({ required: true });
const auth = useAuthStore();

const nickname = ref('');
const username = ref('');
const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const savingNickname = ref(false);
const savingUsername = ref(false);
const savingPassword = ref(false);
const uploading = ref(false);
const libraryOpen = ref(false);

const initial = computed(() => String(auth.displayName || '作').slice(0, 1));

function onOpen() {
  nickname.value = auth.user?.nickname?.trim() || auth.user?.username || '';
  username.value = auth.user?.username || '';
  oldPassword.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  void auth.ensureUser(true);
}

async function saveNickname() {
  const next = nickname.value.trim();
  if (!next) {
    ElMessage.warning('昵称不能为空');
    return;
  }
  const current = auth.user?.nickname?.trim() || '';
  if (next === current) {
    ElMessage.info('昵称未变更');
    return;
  }
  savingNickname.value = true;
  try {
    await auth.updateNickname(next);
    ElMessage.success('昵称已更新');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败');
  } finally {
    savingNickname.value = false;
  }
}

async function saveUsernamePrompt() {
  const next = username.value.trim();
  if (!next) {
    ElMessage.warning('用户名不能为空');
    return;
  }
  if (next === auth.user?.username) {
    ElMessage.info('用户名未变更');
    return;
  }
  try {
    const { value } = await ElMessageBox.prompt('修改用户名需要验证当前密码', '确认修改用户名', {
      confirmButtonText: '确认修改',
      cancelButtonText: '取消',
      inputType: 'password',
      inputPlaceholder: '输入当前密码',
      inputValidator: (v) => (!!String(v || '').trim() ? true : '请输入密码'),
    });
    savingUsername.value = true;
    await auth.updateUsername(next, String(value || ''));
    ElMessage.success('用户名已更新');
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.response?.data?.message || '修改用户名失败');
  } finally {
    savingUsername.value = false;
  }
}

async function savePassword() {
  if (!oldPassword.value) {
    ElMessage.warning('请输入原密码');
    return;
  }
  if (newPassword.value.length < 6) {
    ElMessage.warning('新密码至少 6 位');
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    ElMessage.warning('两次输入的新密码不一致');
    return;
  }
  savingPassword.value = true;
  try {
    await auth.changePassword(oldPassword.value, newPassword.value);
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    ElMessage.success('密码已更新');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '修改密码失败');
  } finally {
    savingPassword.value = false;
  }
}

async function uploadLocal(options: UploadRequestOptions) {
  uploading.value = true;
  try {
    await auth.uploadAvatar(options.file as File);
    ElMessage.success('头像已更新');
    options.onSuccess?.({} as never);
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '上传失败');
    options.onError?.(e as never);
  } finally {
    uploading.value = false;
  }
}
</script>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.avatar-section {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface));
}

.avatar-preview {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 30px;
  font-weight: 800;
  color: var(--accent-ink);
  background: linear-gradient(145deg, var(--accent), var(--accent-2));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-actions {
  min-width: 0;
  flex: 1;
}
.avatar-title {
  font-size: 14px;
  font-weight: 750;
  color: var(--ink);
}
.avatar-tip {
  margin: 4px 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}
.avatar-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.block-head strong {
  font-size: 14px;
  color: var(--ink);
}
.block-head span {
  font-size: 12px;
  color: var(--muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.label {
  font-size: 12.5px;
  color: var(--muted);
}
.row {
  display: flex;
  gap: 8px;
}
.row :deep(.el-input) {
  flex: 1;
}

@media (max-width: 560px) {
  .avatar-section {
    flex-direction: column;
    text-align: center;
  }
  .avatar-btns {
    justify-content: center;
  }
  .row {
    flex-direction: column;
  }
}
</style>

<style>
.profile-center-dialog.el-dialog {
  border-radius: 16px;
  overflow: hidden;
}
.profile-center-dialog .el-dialog__header {
  margin-right: 0;
  padding: 16px 20px 8px;
}
.profile-center-dialog .el-dialog__body {
  padding: 8px 20px 20px;
  max-height: min(72vh, 680px);
  overflow: auto;
}
.profile-center-dialog .el-dialog__title {
  font-weight: 750;
}
</style>
