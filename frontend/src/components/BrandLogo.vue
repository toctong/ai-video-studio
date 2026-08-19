<template>
  <span class="brand-logo" aria-hidden="true">
    <img :src="resolved" alt="" width="40" height="40" @error="onError" />
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { namiAsset } from '@/constants/oss-public';

const props = defineProps<{ src?: string }>();

const fallback = namiAsset('logo.png');
const useFallback = ref(false);

const resolved = computed(() => {
  if (useFallback.value) return fallback;
  const u = String(props.src || '').trim();
  return u || fallback;
});

watch(
  () => props.src,
  () => {
    useFallback.value = false;
  },
);

function onError() {
  if (!useFallback.value) useFallback.value = true;
}
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
