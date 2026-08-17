<template>
  <div class="logs-redirect" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useHttpLogsModal } from '@/composables/useHttpLogsModal';

/** 兼容旧 /logs 链接：打开弹框并回到首页 */
const router = useRouter();
const { show } = useHttpLogsModal();

onMounted(() => {
  show();
  void router.replace('/home');
});
</script>

<style scoped>
.logs-redirect {
  min-height: 40vh;
}
</style>
