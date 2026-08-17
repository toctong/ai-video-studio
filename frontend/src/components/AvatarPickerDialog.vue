<template>
  <el-dialog
    v-model="visible"
    title="选择头像"
    width="680px"
    append-to-body
    align-center
    destroy-on-close
    class="avatar-picker-dialog"
    :z-index="3200"
    @open="onOpen"
  >
    <div v-loading="loading" class="grid-wrap">
      <el-empty v-if="!loading && !items.length" description="暂无可用头像，请点「换一批」重试" />
      <div v-else class="grid">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="item"
          :class="{ active: selected?.id === item.id }"
          :title="item.title"
          @click="selected = item"
        >
          <img :src="item.previewUrl" :alt="item.title" loading="lazy" referrerpolicy="no-referrer" />
        </button>
      </div>
    </div>
    <template #footer>
      <div class="footer">
        <el-button :loading="loading" @click="reloadFresh">换一批</el-button>
        <div class="footer-right">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" :disabled="!selected" :loading="applying" @click="confirm">
            使用此头像
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import api from '@/api';
import { useAuthStore } from '@/stores/auth';

type AvatarItem = { id: string; title: string; previewUrl: string };

const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ applied: [] }>();

const auth = useAuthStore();
const loading = ref(false);
const applying = ref(false);
const items = ref<AvatarItem[]>([]);
const selected = ref<AvatarItem | null>(null);

async function load(refresh = false) {
  loading.value = true;
  try {
    const { data } = await api.get('/auth/avatar-library', {
      params: { page: 1, limit: 24, refresh: refresh ? 1 : undefined },
    });
    items.value = Array.isArray(data?.items) ? data.items : [];
    selected.value = null;
  } catch (e: any) {
    items.value = [];
    ElMessage.error(e?.response?.data?.message || '加载头像库失败');
  } finally {
    loading.value = false;
  }
}

function onOpen() {
  void load(true);
}

function reloadFresh() {
  void load(true);
}

async function confirm() {
  if (!selected.value?.previewUrl) return;
  applying.value = true;
  try {
    await auth.applyLibraryAvatar(selected.value.previewUrl);
    ElMessage.success('头像已更新');
    emit('applied');
    visible.value = false;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '应用头像失败');
  } finally {
    applying.value = false;
  }
}
</script>

<style scoped>
.grid-wrap {
  min-height: 300px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}
.item {
  aspect-ratio: 1;
  padding: 3px;
  border: 2px solid transparent;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s var(--ease), transform 0.15s var(--ease);
}
.item:hover {
  border-color: color-mix(in srgb, var(--line-strong) 80%, transparent);
  transform: translateY(-1px);
}
.item.active {
  border-color: var(--accent);
}
.item img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: var(--surface-2);
  display: block;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.footer-right {
  display: flex;
  gap: 8px;
}
@media (max-width: 640px) {
  .grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .footer {
    flex-direction: column;
    align-items: stretch;
  }
  .footer-right {
    justify-content: flex-end;
  }
}
</style>

<style>
.avatar-picker-dialog.el-dialog {
  border-radius: 16px;
  overflow: hidden;
}
.avatar-picker-dialog .el-dialog__body {
  padding-top: 8px;
  max-height: min(60vh, 520px);
  overflow: auto;
}
</style>
