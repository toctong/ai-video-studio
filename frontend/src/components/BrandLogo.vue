<template>
  <span class="brand-logo" aria-hidden="true">
    <img :src="resolved" alt="" width="40" height="40" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { namiAsset } from '@/constants/oss-public';

const props = defineProps<{ src?: string }>();

const resolved = computed(() => {
  const u = String(props.src || '').trim();
  return u || namiAsset('logo.png');
});
</script>

<style scoped>
.brand-logo {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  line-height: 0;
}
.brand-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
