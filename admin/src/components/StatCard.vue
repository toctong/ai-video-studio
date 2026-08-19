<template>
  <div class="stat-card" :style="{ '--accent': accent }">
    <div class="stat-card__icon">
      <slot name="icon" />
    </div>
    <div class="stat-card__body">
      <div class="stat-card__label">{{ label }}</div>
      <div class="stat-card__value">{{ value }}</div>
      <div v-if="hint" class="stat-card__hint">{{ hint }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    hint?: string;
    accent?: string;
  }>(),
  { accent: 'rgb(var(--primary-6))' },
);
</script>

<style scoped lang="scss">
.stat-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px 18px 16px;
  border-radius: 12px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  transition: box-shadow 0.2s, transform 0.2s;

  &:hover {
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    transform: translateY(-1px);
  }

  &__icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: #fff;
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #0fc6c2));
    font-size: 20px;
  }

  &__label {
    font-size: 13px;
    color: var(--color-text-3);
  }

  &__value {
    margin-top: 4px;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--color-text-1);
    line-height: 1.15;
  }

  &__hint {
    margin-top: 6px;
    font-size: 12px;
    color: var(--color-text-4);
  }
}
</style>
