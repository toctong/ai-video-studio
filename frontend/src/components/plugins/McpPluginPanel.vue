<template>
  <div class="mcp-panel">
    <p class="desc">{{ plugin.description }}</p>
    <p v-if="plugin.repoHint" class="repo">参考：{{ plugin.repoHint }}</p>

    <el-descriptions :column="1" border size="small">
      <el-descriptions-item label="类型">
        <el-tag size="small" :type="kindTag">{{ kindLabel }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag size="small" :type="plugin.enabled ? 'success' : 'info'">
          {{ plugin.enabled ? '已启用' : '即将推出' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="插件 ID">{{ plugin.id }}</el-descriptions-item>
    </el-descriptions>

    <div v-if="tools.length" class="tools">
      <div class="tools-title">MCP 工具</div>
      <div v-for="t in tools" :key="t.name" class="tool-row">
        <code>{{ t.name }}</code>
        <p>{{ t.description }}</p>
        <span class="serves">→ {{ t.serves }}</span>
      </div>
    </div>
    <el-empty v-else description="暂无工具清单" :image-size="48" />

    <div class="actions">
      <el-button
        v-if="plugin.enabled && plugin.primaryAction"
        type="primary"
        @click="goPrimary"
      >
        {{ plugin.primaryAction.label }}
      </el-button>
      <el-button @click="$router.push('/settings')">系统设置</el-button>
      <el-button @click="$emit('close')">关闭</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import api from '@/api';
import { useProjectStore } from '@/stores/project';

const props = defineProps<{ plugin: any }>();
defineEmits<{ close: [] }>();

const router = useRouter();
const tools = ref<Array<{ name: string; description: string; serves: string }>>([]);

const kindLabel = computed(() => {
  if (props.plugin.kind === 'mcp') return 'MCP 工具包';
  if (props.plugin.kind === 'provider') return '接入';
  return '内置能力';
});

const kindTag = computed(() => {
  if (props.plugin.kind === 'mcp') return 'warning';
  if (props.plugin.kind === 'provider') return 'primary';
  return 'info';
});

async function loadTools() {
  try {
    const { data } = await api.get(`/plugins/${props.plugin.id}`);
    tools.value = data.tools || [];
  } catch {
    tools.value = [];
  }
}

function goPrimary() {
  const target = String(props.plugin.primaryAction?.target || '');
  if (target === 'settings') {
    router.push('/settings');
    return;
  }
  if (target === 'assemble') {
    router.push({ path: '/', query: { create: 'assemble' } });
    return;
  }
  if (target === 'home') {
    router.push('/');
    return;
  }
  if (target.startsWith('libraries:')) {
    const kind = target.slice('libraries:'.length);
    if (kind === 'styles' || kind === 'style') router.push('/refs?tab=style');
    else if (kind === 'shots' || kind === 'shot') router.push('/refs?tab=shot');
    else if (kind === 'characters' || kind === 'character') router.push('/refs?tab=character');
    else router.push('/refs');
    return;
  }
  if (target === 'libraries') {
    router.push('/refs');
    return;
  }
  if (target === 'script' || target.startsWith('script:')) {
    const tab = target.includes(':') ? target.split(':')[1] : '';
    const projectId = useProjectStore().current?.id;
    if (!projectId) {
      ElMessage.warning('请先在工作台打开或创建一个项目');
      router.push('/');
      return;
    }
    router.push(
      tab === 'characters'
        ? `/books/${projectId}/characters`
        : `/books/${projectId}/chapters`,
    );
    return;
  }
  router.push('/');
}

watch(
  () => props.plugin?.id,
  () => void loadTools(),
  { immediate: true },
);

onMounted(loadTools);
</script>

<style scoped>
.desc {
  margin: 0 0 8px;
  color: var(--muted);
  line-height: 1.6;
  font-size: 13px;
}
.repo {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}
.tools {
  margin-top: 16px;
}
.tools-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}
.tool-row {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  margin-bottom: 8px;
}
.tool-row code {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
}
.tool-row p {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--ink);
  line-height: 1.45;
}
.serves {
  display: inline-block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}
.actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
