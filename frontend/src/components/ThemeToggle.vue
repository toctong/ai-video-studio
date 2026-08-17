<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="theme.isDark ? '切换浅色' : '切换暗黑'"
    :title="theme.isDark ? '切换浅色' : '切换暗黑'"
    @click="theme.toggle()"
  >
    <el-icon :size="16">
      <Moon v-if="!theme.isDark" />
      <Sunny v-else />
    </el-icon>
  </button>
</template>

<script setup lang="ts">
import { Moon, Sunny } from '@element-plus/icons-vue';
import { useThemeStore } from '@/stores/theme';

const theme = useThemeStore();
</script>

<style scoped>
.theme-toggle {
  display: inline-grid;
  place-items: center;
  width: var(--control-h);
  height: var(--control-h);
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.theme-toggle:hover {
  color: var(--ink);
  background: var(--hover-bg);
}
</style>
