<template>
  <div>
    <p class="desc">{{ hint }}</p>
    <el-descriptions :column="1" border size="small">
      <el-descriptions-item label="插件 ID">{{ plugin.id }}</el-descriptions-item>
      <el-descriptions-item label="分组">{{ plugin.group }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="plugin.enabled ? 'success' : 'info'" size="small">
          {{ plugin.enabled ? '已启用' : '即将推出' }}
        </el-tag>
      </el-descriptions-item>
    </el-descriptions>
    <div class="actions">
      <el-button type="primary" @click="goUse">{{ primaryLabel }}</el-button>
      <el-button @click="$router.push('/settings')">配置默认模型</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useProjectStore } from '@/stores/project';

const props = defineProps<{ plugin: any }>();
const router = useRouter();

const hint = computed(() => {
  if (props.plugin.id === 'llm-chat') {
    return '全站写作（大纲 / 分章 / 去味 / 提取角色）共用此对话底座，请在系统设置中配置默认 Chat 模型。';
  }
  return props.plugin.description || '该插件已接入平台能力目录。';
});

const primaryLabel = computed(() => props.plugin.primaryAction?.label || '前往使用');

function goUse() {
  const target = String(props.plugin.primaryAction?.target || 'settings');
  if (target === 'settings') {
    router.push('/settings');
    return;
  }
  if (target === 'assemble') {
    router.push({ path: '/', query: { create: 'assemble' } });
    return;
  }
  const projectId = useProjectStore().current?.id;
  if (target.startsWith('script')) {
    if (!projectId) {
      ElMessage.warning('请先打开一个项目');
      router.push('/');
      return;
    }
    const tab = target.includes(':') ? target.split(':')[1] : '';
    router.push(
      tab === 'characters'
        ? `/books/${projectId}/characters`
        : `/books/${projectId}/chapters`,
    );
    return;
  }
  router.push('/');
}
</script>

<style scoped>
.desc { color: var(--muted); line-height: 1.6; margin: 0 0 12px; }
.actions { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
</style>
