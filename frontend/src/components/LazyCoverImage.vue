<template>
  <el-image
    class="lazy-cover"
    :src="src"
    :fit="fit"
    :alt="alt"
    lazy
    :hide-on-click-modal="true"
  >
    <template #placeholder>
      <div class="lazy-cover__ph" aria-hidden="true">
        <el-skeleton animated>
          <template #template>
            <el-skeleton-item variant="image" class="lazy-cover__sk" />
          </template>
        </el-skeleton>
      </div>
    </template>
    <template #error>
      <div class="lazy-cover__err">
        <slot name="error">
          <span class="lazy-cover__fallback" />
        </slot>
      </div>
    </template>
  </el-image>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    src?: string;
    alt?: string;
    fit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
  }>(),
  {
    src: '',
    alt: '',
    fit: 'cover',
  },
);
</script>

<style scoped>
.lazy-cover {
  width: 100%;
  height: 100%;
  display: block;
}
.lazy-cover :deep(.el-image__inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.lazy-cover :deep(.el-image__wrapper),
.lazy-cover :deep(.el-image__placeholder),
.lazy-cover :deep(.el-image__error) {
  width: 100%;
  height: 100%;
}
.lazy-cover__ph,
.lazy-cover__err {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: stretch;
  background: var(--studio-panel-2);
  overflow: hidden;
}
.lazy-cover__ph :deep(.el-skeleton),
.lazy-cover__sk {
  width: 100% !important;
  height: 100% !important;
}
.lazy-cover__ph :deep(.el-skeleton__item) {
  width: 100% !important;
  height: 100% !important;
  border-radius: 0;
  background: linear-gradient(90deg, var(--studio-panel) 25%, var(--studio-line-strong) 37%, var(--studio-panel) 63%);
  background-size: 400% 100%;
}
.lazy-cover__fallback {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--studio-panel-2);
}
</style>
