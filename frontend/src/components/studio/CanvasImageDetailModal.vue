<template>
  <Teleport to="body">
    <div v-if="open" class="cid-mask" @mousedown.self="onMaskClose" @click.self="onMaskClose">
      <div class="cid" role="dialog" aria-label="图片详情" @mousedown.stop @click.stop>
        <button type="button" class="x" title="关闭" @click="emit('close')">×</button>

        <div class="cid-left">
          <div v-if="url" class="cid-frame">
            <img :src="url" alt="" @load="onImgLoad" />
          </div>
          <div v-else class="ph">暂无图片</div>
        </div>

        <aside class="cid-right">
          <h3>生成信息</h3>

          <div class="row">
            <span class="lab">模型</span>
            <strong>{{ model || '—' }}</strong>
          </div>
          <div class="row">
            <span class="lab">比例</span>
            <strong>{{ aspect || '—' }}</strong>
          </div>

          <div class="prompt-block">
            <div class="prompt-head">
              <span class="lab">提示词</span>
              <button type="button" class="use" title="写入底部生图条" @click="emit('use-prompt', prompt || '')">
                <UiIcon name="pencil" :size="12" />
                使用
              </button>
            </div>
            <div class="prompt-box">
              <button
                v-if="prompt"
                type="button"
                class="copy"
                title="复制"
                @click="copyPrompt"
              >
                <UiIcon name="copy" :size="13" />
              </button>
              <UiScroll class="prompt-scroll" :max-height="240" always>
                <p>{{ prompt || '暂无生成记录（生成后显示接口提示词）' }}</p>
              </UiScroll>
            </div>
          </div>

          <div class="row">
            <span class="lab">生成时间</span>
            <strong>{{ generatedAt || '—' }}</strong>
          </div>

          <div class="divider" />

          <div class="sec">图片信息</div>
          <div class="row">
            <span class="lab">尺寸</span>
            <strong>{{ sizeText }}</strong>
          </div>
          <div class="row">
            <span class="lab">大小</span>
            <strong>{{ fileSizeText }}</strong>
          </div>

          <button type="button" class="dl" :disabled="!url" @click="download">
            <UiIcon name="download" :size="16" />
            下载图片
          </button>
        </aside>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import UiIcon from '@/components/icons/UiIcon.vue';
import { UiScroll } from '@/components/ui';
import { copyText } from '@/utils/clipboard';
import { downloadUrl } from '@/utils/download';

const props = defineProps<{
  open: boolean;
  url: string;
  model?: string;
  aspect?: string;
  prompt?: string;
  generatedAt?: string;
  width?: number;
  height?: number;
  fileName?: string;
}>();

const emit = defineEmits<{
  close: [];
  'use-prompt': [prompt: string];
}>();

const natural = ref({ w: 0, h: 0 });
const fileBytes = ref<number | null>(null);
/** 打开后短时忽略蒙层关闭，防止双击第二下落点把弹层立刻关掉 */
let ignoreMaskCloseUntil = 0;

function onMaskClose() {
  if (Date.now() < ignoreMaskCloseUntil) return;
  emit('close');
}

const sizeText = computed(() => {
  const w = props.width || natural.value.w;
  const h = props.height || natural.value.h;
  if (w && h) return `${w} × ${h}`;
  return '—';
});

const fileSizeText = computed(() => {
  const n = fileBytes.value;
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
});

function onImgLoad(ev: Event) {
  const img = ev.target as HTMLImageElement;
  if (img?.naturalWidth) natural.value = { w: img.naturalWidth, h: img.naturalHeight };
}

async function probeFileSize(url: string) {
  fileBytes.value = null;
  if (!url) return;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const len = res.headers.get('content-length');
    if (len && Number.isFinite(Number(len))) {
      fileBytes.value = Number(len);
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    fileBytes.value = blob.size;
  } catch {
    fileBytes.value = null;
  }
}

async function copyPrompt() {
  const t = String(props.prompt || '').trim();
  if (!t) {
    ElMessage.info('暂无提示词');
    return;
  }
  const ok = await copyText(t);
  if (ok) ElMessage.success('已复制提示词');
  else ElMessage.error('复制失败');
}

async function download() {
  const url = String(props.url || '').trim();
  if (!url) return;
  try {
    await downloadUrl(url, `${props.fileName || 'image'}.png`);
    ElMessage.success('已开始下载');
  } catch (e: any) {
    ElMessage.error(e?.message || '下载失败');
  }
}

watch(
  () => [props.open, props.url] as const,
  ([open, url]) => {
    if (!open) {
      natural.value = { w: 0, h: 0 };
      fileBytes.value = null;
      return;
    }
    ignoreMaskCloseUntil = Date.now() + 400;
    void probeFileSize(String(url || ''));
  },
);
</script>

<style scoped>
.cid-mask {
  position: fixed;
  inset: 0;
  z-index: 2400;
  background: rgba(0, 0, 0, 0.62);
  display: grid;
  place-items: center;
  padding: 28px;
}
.cid {
  position: relative;
  width: min(1100px, calc(100vw - 48px));
  height: min(88vh, 860px);
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 340px);
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-3);
  border-radius: 18px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  color: var(--studio-text);
  overflow: hidden;
}
.x {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  color: var(--studio-text-strong);
  font-size: 18px;
  cursor: pointer;
}
.x:hover {
  background: var(--studio-glass-3);
  color: #fff;
}
.cid-left {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--studio-inset);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
}
.cid-frame {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
}
.cid-frame img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
}
.ph {
  color: var(--studio-line-bright);
  font-size: 14px;
}
.cid-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 20px 18px;
  border-left: 1px solid var(--studio-glass-2);
  min-height: 0;
  overflow: hidden;
}
.cid-right h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 700;
}
.row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.lab {
  font-size: 12px;
  color: var(--studio-text-faint);
  font-weight: 600;
}
.row strong {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}
.prompt-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}
.prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}
.use {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-glass-2);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
.use:hover {
  background: var(--studio-line-strong);
}
.prompt-box {
  position: relative;
  flex: 1;
  min-height: 120px;
  max-height: 240px;
  border-radius: 12px;
  background: var(--studio-inset);
  border: 1px solid var(--studio-glass-2);
  overflow: hidden;
}
.prompt-scroll {
  height: 100%;
}
.prompt-scroll :deep(.el-scrollbar__view) {
  padding: 12px 36px 12px 12px;
  box-sizing: border-box;
}
.prompt-box p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--studio-text-strong);
  white-space: pre-wrap;
  word-break: break-word;
}
.copy {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: var(--studio-glass-2);
  color: var(--studio-text-soft);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
}
.copy:hover {
  background: var(--studio-glass-3);
  color: #fff;
}
.divider {
  height: 1px;
  background: var(--studio-glass-2);
  margin: 4px 0;
  flex-shrink: 0;
}
.sec {
  font-size: 13px;
  font-weight: 700;
  color: var(--studio-text-strong);
  flex-shrink: 0;
}
.dl {
  margin-top: auto;
  flex-shrink: 0;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: var(--studio-ink);
  color: var(--studio-inset);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}
.dl:hover:not(:disabled) {
  background: #f0f0f0;
}
.dl:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (max-width: 840px) {
  .cid {
    grid-template-columns: 1fr;
    height: min(92vh, 960px);
    grid-template-rows: minmax(0, 48vh) minmax(0, 1fr);
  }
}
</style>
