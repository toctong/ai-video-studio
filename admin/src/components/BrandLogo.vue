<template>
  <img
    class="brand-logo"
    :class="{ 'brand-logo--sm': size === 'sm', 'brand-logo--lg': size === 'lg' }"
    :src="logoUrl"
    alt="AI Video Studio"
    draggable="false"
  />
</template>

<script setup lang="ts">
import logoUrl from '@/assets/logo.svg';

withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { size: 'md' },
);
</script>

<style scoped lang="scss">
.brand-logo {
  display: block;
  width: 34px;
  height: 34px;
  object-fit: contain;
  user-select: none;

  &--sm {
    width: 28px;
    height: 28px;
  }

  &--lg {
    width: 56px;
    height: 56px;
  }
}
</style>
