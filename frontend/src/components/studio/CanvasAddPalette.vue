<template>
  <Teleport to="body">
    <div v-if="open" class="add-root" @mousedown.self="close" @contextmenu.prevent>
      <div
        class="add-menu"
        :style="menuStyle"
        role="menu"
        aria-label="添加节点"
        @mousedown.stop
      >
        <button type="button" class="row" @click="onUpload">
          <UiIcon name="arrow-up" :size="15" />
          <span>上传</span>
        </button>
        <button type="button" class="row" @click="quickAdd('input.text')">
          <UiIcon name="file-text" :size="15" />
          <span>添加文本节点</span>
        </button>
        <button type="button" class="row" @click="quickAdd('input.note')">
          <UiIcon name="pencil" :size="15" />
          <span>添加备注节点</span>
        </button>
        <button type="button" class="row" @click="quickAdd('ai.image')">
          <UiIcon name="image" :size="15" />
          <span>添加图片节点</span>
        </button>
        <button type="button" class="row" @click="quickAdd('ai.video')">
          <UiIcon name="clapperboard" :size="15" />
          <span>添加视频节点</span>
        </button>
        <button type="button" class="row" @click="onAudio">
          <UiIcon name="music" :size="15" />
          <span>添加音频节点</span>
        </button>
        <button type="button" class="row" @click="quickAdd('ai.chat')">
          <UiIcon name="sparkles" :size="15" />
          <span>添加 Agent 节点</span>
        </button>
        <button type="button" class="row" @click="onPlugins">
          <UiIcon name="wand" :size="15" />
          <span>插件库</span>
        </button>
        <button type="button" class="row" @click="onFit">
          <UiIcon name="maximize" :size="15" />
          <span>适应屏幕</span>
        </button>
        <div class="sep" />
        <button type="button" class="row" :disabled="!canPaste" @click="onPaste">
          <UiIcon name="copy" :size="15" />
          <span>粘贴</span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiIcon from '@/components/icons/UiIcon.vue';

const props = defineProps<{
  open: boolean;
  x?: number;
  y?: number;
  canPaste?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  add: [type: string];
  upload: [];
  fit: [];
  paste: [];
  plugins: [];
  'audio-unsupported': [];
}>();

const menuStyle = computed(() => {
  const w = 178;
  const h = 420;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  let left = props.x != null ? props.x : vw / 2 - w / 2;
  let top = props.y != null ? props.y : vh / 2 - h / 2;
  left = Math.max(12, Math.min(left, vw - w - 12));
  top = Math.max(12, Math.min(top, vh - h - 12));
  return { left: `${left}px`, top: `${top}px`, width: `${w}px` };
});

function close() {
  emit('close');
}

function quickAdd(type: string) {
  emit('add', type);
  close();
}

function onUpload() {
  emit('upload');
  close();
}

function onFit() {
  emit('fit');
  close();
}

function onPaste() {
  if (!props.canPaste) return;
  emit('paste');
  close();
}

function onAudio() {
  emit('audio-unsupported');
  close();
}

function onPlugins() {
  emit('plugins');
  close();
}
</script>

<style scoped>
.add-root {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: transparent;
}
.add-menu {
  position: fixed;
  padding: 6px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--studio-panel) 75%, transparent);
  backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  color: var(--studio-text);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.add-menu .row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 9px 10px;
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}
.add-menu .row:hover:not(:disabled) {
  background: var(--studio-glass-2);
}
.add-menu .row:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.add-menu .sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--studio-glass-3);
}
</style>
