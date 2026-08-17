<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import AssembleA2UIPanel from '@/components/AssembleA2UIPanel.vue';

const props = defineProps<{ modelValue: boolean; initialMode?: 'choose' | 'quick' | 'assemble' }>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  created: [projectId: string];
}>();

const panelKey = ref(0);

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const startMode = computed(() => props.initialMode || 'choose');

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      panelKey.value += 1;
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
    }
  },
);

onUnmounted(() => {
  document.documentElement.style.overflow = '';
});

function close() {
  visible.value = false;
}

function onCreated(projectId: string) {
  visible.value = false;
  emit('created', projectId);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="create-fs studio-create"
      role="dialog"
      aria-modal="true"
      aria-label="新建小说"
    >
      <AssembleA2UIPanel
        :key="'create-a2ui-' + panelKey"
        :initial-mode="startMode"
        @created="onCreated"
        @back="close"
        @cancel="close"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.create-fs {
  --shell-bg: var(--studio-bg);
  --bg-0: var(--studio-bg);
  --bg: var(--studio-bg);
  --surface: var(--studio-panel);
  --surface-2: var(--studio-panel-3);
  --surface-muted: var(--studio-panel-3);
  --ink: var(--studio-ink);
  --text: var(--studio-ink);
  --muted: var(--studio-muted);
  --line: var(--studio-line-strong);
  --line-strong: var(--studio-line-bright);
  --accent: var(--studio-text);
  --accent-2: var(--studio-ink);
  --accent-ink: var(--studio-bg);
  --accent-soft: var(--studio-glass-2);
  --hover-bg: var(--studio-glass-2);
  --shadow-sm: none;
  --shadow: none;
  --ease: ease;
  position: fixed;
  inset: 0;
  z-index: 3200;
  width: 100vw;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--studio-bg);
  color: var(--studio-ink);
}
.create-fs :deep(.create-a2ui) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  border-radius: 0;
}
</style>

