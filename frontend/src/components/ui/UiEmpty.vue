<template>
  <div class="empty-state ui-empty" :class="{ compact }">
    <h2 v-if="title" class="empty-title">{{ title }}</h2>
    <p v-if="lead" class="empty-lead">{{ lead }}</p>
    <div v-if="$slots.default" class="ui-empty-actions">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  lead?: string;
  compact?: boolean;
}>();
</script>

<style scoped>
.ui-empty.compact {
  padding: 28px 16px;
}
.ui-empty-actions {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
</style>
