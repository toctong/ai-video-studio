<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="sg-banner"
      role="status"
      aria-live="polite"
    >
      <span class="spin" aria-hidden="true" />
      <div class="txt">
        <strong>{{ title }}</strong>
        <em>{{ scriptGenStore.status || '正在生成分镜脚本…' }}</em>
      </div>
      <button
        v-if="canOpen"
        type="button"
        class="go"
        @click="openWorkflow"
      >
        打开画布
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useScriptGenStore } from '@/stores/script-gen';

const route = useRoute();
const router = useRouter();
const scriptGenStore = useScriptGenStore();

const onSameCanvas = computed(() => {
  const wid = scriptGenStore.workflowId;
  if (!wid) return false;
  return (
    route.path.startsWith('/w/') &&
    String(route.params.workflowId || '') === wid
  );
});

/** 离开展示中的画布时才浮层提示；在画布内用蒙版即可 */
const visible = computed(() => scriptGenStore.running && !onSameCanvas.value);

const title = computed(() => {
  const n = String(scriptGenStore.workflowName || '').trim();
  const status = String(scriptGenStore.status || '');
  if (/启动执行|整图执行|正在启动/.test(status)) {
    return n ? `「${n}」启动执行中` : '启动执行中';
  }
  return n ? `「${n}」脚本生成中` : '脚本生成中';
});

const canOpen = computed(() => Boolean(scriptGenStore.workflowId));

function openWorkflow() {
  const id = scriptGenStore.workflowId;
  if (!id) return;
  void router.push(`/w/${id}`);
}
</script>

<style scoped>
.sg-banner {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 120;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  color: var(--ink);
}

.spin {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--accent) 22%, var(--line));
  border-top-color: var(--accent);
  animation: sg-spin 0.7s linear infinite;
}

.txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.txt strong {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.txt em {
  font-style: normal;
  font-size: 12px;
  color: var(--muted);
}

.go {
  flex-shrink: 0;
  border: 0;
  border-radius: 999px;
  padding: 6px 12px;
  background: #f4f4f5;
  color: var(--studio-inset);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.go:hover {
  background: var(--studio-ink);
}

@keyframes sg-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
