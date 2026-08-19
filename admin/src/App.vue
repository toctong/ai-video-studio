<template>
  <router-view class="app-view" />
</template>

<script setup lang="ts">
</script>

<style scoped>
/* 不要写 display:block —— 会覆盖 AdminLayout 根节点 arco-layout 的 display:flex，
   导致侧栏与主区纵向堆叠，主区被 overflow:hidden 裁到视口外，右侧只剩空白。 */
.app-view {
  width: 100%;
  height: 100%;
  min-height: 100vh;
}
</style>
