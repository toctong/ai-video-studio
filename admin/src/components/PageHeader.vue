<template>
  <div class="page-header">
    <div class="page-header__main">
      <div class="page-header__titles">
        <h2 class="page-header__title">{{ title }}</h2>
        <p v-if="description" class="page-header__desc">{{ description }}</p>
      </div>
      <div v-if="$slots.extra" class="page-header__extra">
        <slot name="extra" />
      </div>
    </div>
    <div v-if="$slots.default" class="page-header__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<style scoped lang="scss">
.page-header {
  margin-bottom: 16px;

  &__main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  &__title {
    margin: 0;
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.02em;
    color: var(--color-text-1);
  }

  &__desc {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--color-text-3);
    line-height: 1.5;
  }

  &__extra {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__body {
    margin-top: 14px;
  }
}
</style>
