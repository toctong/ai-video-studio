<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" v-if="Component" />
  </router-view>
  <MediaPreviewHost />
  <ScriptGenBanner />
  <LoginDialog />
</template>

<script setup lang="ts">
import MediaPreviewHost from '@/components/MediaPreviewHost.vue';
import ScriptGenBanner from '@/components/studio/ScriptGenBanner.vue';
import LoginDialog from '@/components/LoginDialog.vue';
</script>
