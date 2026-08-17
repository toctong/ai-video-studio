<template>
  <Teleport to="body">
    <div v-if="open" class="logs-mask" @mousedown.self="hide">
      <div
        class="logs-panel"
        role="dialog"
        aria-label="接口日志"
        tabindex="-1"
        @keydown.esc="hide"
      >
        <header class="logs-head">
          <div class="head-left">
            <strong>接口日志</strong>
            <span class="head-meta">路径、参数、返回与耗时</span>
          </div>
          <button type="button" class="icon-btn" title="关闭" @click="hide">
            <UiIcon name="x" :size="15" />
          </button>
        </header>
        <div class="logs-body">
          <HttpLogTable class="logs-table" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import HttpLogTable from '@/components/logs/HttpLogTable.vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import { useHttpLogsModal } from '@/composables/useHttpLogsModal';

const { open, hide } = useHttpLogsModal();

watch(open, (v) => {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = v ? 'hidden' : '';
});
</script>

<style scoped>
.logs-mask {
  --el-bg-color: var(--studio-panel);
  --el-bg-color-overlay: var(--studio-panel);
  --el-fill-color-blank: var(--studio-panel);
  --el-fill-color-light: var(--studio-panel-3);
  --el-text-color-primary: var(--studio-ink);
  --el-text-color-regular: var(--studio-text);
  --el-border-color: var(--studio-line-strong);
  --el-mask-color: rgba(0, 0, 0, 0.55);
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 20px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.62);
}

.logs-panel {
  width: min(1180px, calc(100vw - 28px));
  height: min(86vh, 880px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--studio-panel-3);
  background: var(--studio-panel);
  color: var(--studio-ink);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
}

.logs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--studio-panel-3);
  background: var(--studio-bg);
  flex-shrink: 0;
}

.head-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.head-left strong {
  font-size: 14px;
  font-weight: 650;
}

.head-meta {
  font-size: 12px;
  color: var(--studio-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 0;
  background: transparent;
  color: var(--studio-text-soft);
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--studio-glass-2);
  color: #fff;
}

.logs-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 14px 14px;
  box-sizing: border-box;
  background: var(--studio-bg);
}

.logs-table {
  flex: 1;
  min-height: 0;
}

@media (max-width: 720px) {
  .logs-mask {
    padding: 0;
  }
  .logs-panel {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    border: 0;
  }
}
</style>
