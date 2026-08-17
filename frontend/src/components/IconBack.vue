<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number | string;
  }>(),
  { size: 18 },
);
</script>

<template>
  <svg
    class="icon-back"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M14.5 5.5 8 12l6.5 6.5"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
