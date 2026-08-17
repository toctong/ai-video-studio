<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { fetchWorkflowRun } from '@/api/workflows';

/** 旧运行页：跳回对应工作流，并打开运行日志弹框 */
const route = useRoute();
const router = useRouter();

onMounted(async () => {
  const runId = String(route.params.runId || '');
  if (!runId) {
    router.replace('/home');
    return;
  }
  try {
    const run = await fetchWorkflowRun(runId);
    if (run.workflowId) {
      router.replace({
        path: `/w/${run.workflowId}`,
        query: { run: runId },
      });
      return;
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '运行不存在');
  }
  router.replace('/home');
});
</script>

<template>
  <div class="redirect" v-loading="true" />
</template>

<style scoped>
.redirect {
  min-height: 40vh;
}
</style>
