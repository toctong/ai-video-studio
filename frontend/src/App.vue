<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" v-if="Component" />
  </router-view>
  <MediaPreviewHost />
  <ScriptGenBanner />
</template>

<script setup lang="ts">
import MediaPreviewHost from '@/components/MediaPreviewHost.vue';
import ScriptGenBanner from '@/components/studio/ScriptGenBanner.vue';
</script>
