<template>
  <svg
    class="studio-mark"
    :width="size"
    :height="size"
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M6 5.5h10.5c2.6 0 4.7 2.1 4.7 4.7v0c0 2.6-2.1 4.7-4.7 4.7H11L6 22.5V5.5Z"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <path d="M10.5 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 18 });
</script>

<style scoped>
.studio-mark {
  display: block;
  flex-shrink: 0;
}
</style>
