<template>
  <aside v-if="data" class="insp" @mousedown.stop>
    <div class="insp-head">
      <div>
        <div class="type">{{ catalogTitle }}</div>
        <input
          class="title"
          :value="label"
          placeholder="节点名称"
          @input="emit('update-label', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <button type="button" class="x" title="关闭" @click="emit('close')">×</button>
    </div>

    <div class="insp-body">
      <template v-if="kind === 'text'">
        <label class="field">
          <span class="field-head">
            <span>提示词</span>
            <CopyButton :text="str('value')" sm quiet label="复制" success-msg="已复制提示词" />
          </span>
          <textarea
            rows="8"
            :value="str('value')"
            placeholder="写提示词，再连到生图 / 视频…"
            @input="emitParam('value', ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
        <div class="block">
          <div class="block-label">参考图</div>
          <div v-if="str('referenceImage')" class="refs">
            <div class="ref">
              <img :src="str('referenceImage')" alt="" />
              <span>参考</span>
            </div>
          </div>
          <p v-else class="hint">在文本节点上点「上传参考 / 拖入参考图」</p>
          <div class="media-actions">
            <button type="button" class="ghost sm" @click="emit('pick-asset')">打开资产并拖入</button>
            <button
              v-if="str('referenceImage')"
              type="button"
              class="ghost sm"
              @click="emitParam('referenceImage', '')"
            >
              清除参考图
            </button>
          </div>
        </div>
        <p class="hint">文本节点已下线：重新打开工作流会自动迁入生图/视频弹框。</p>
      </template>

      <template v-else-if="kind === 'media-input'">
        <div class="block">
          <div class="preview">
            <img v-if="!isVideoInput && mediaUrl" :src="mediaUrl" alt="" />
            <LazyVideoThumb
              v-else-if="isVideoInput && mediaUrl"
              :src="mediaUrl"
              :poster-url="String(data?.params?.posterUrl || data?.previewImage || '')"
            />
            <div v-else class="ph">尚未选择文件</div>
          </div>
          <div class="media-actions">
            <button type="button" class="ghost" :disabled="uploading" @click="emit('upload')">
              {{ uploading ? '上传中…' : '上传文件' }}
            </button>
            <button type="button" class="ghost" @click="emit('pick-asset')">从资产选择</button>
          </div>
          <input
            class="url"
            :value="mediaUrl"
            placeholder="或粘贴 URL"
            @input="emitParam('url', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </template>

      <template v-else>
        <p v-if="data.catalog?.description" class="desc">{{ data.catalog.description }}</p>
        <template v-if="schemaFields.length">
          <label v-for="f in schemaFields" :key="f.key" class="field">
            <span class="field-head">
              <span>{{ f.label || f.key }}</span>
              <CopyButton
                v-if="f.type === 'textarea' || /prompt|value|text/i.test(f.key)"
                :text="str(f.key)"
                sm
                quiet
                label="复制"
                success-msg="已复制"
              />
            </span>
            <textarea
              v-if="f.type === 'textarea'"
              rows="4"
              :value="str(f.key)"
              :placeholder="f.placeholder || ''"
              @input="emitParam(f.key, ($event.target as HTMLTextAreaElement).value)"
            />
            <select
              v-else-if="f.type === 'select'"
              :value="str(f.key)"
              @change="emitParam(f.key, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="o in f.options || []" :key="String(o.value)" :value="String(o.value)">
                {{ o.label }}
              </option>
            </select>
            <input
              v-else-if="f.type === 'number'"
              type="number"
              :min="f.min"
              :max="f.max"
              :step="f.step || 1"
              :value="str(f.key)"
              @input="emitParam(f.key, ($event.target as HTMLInputElement).value)"
            />
            <label v-else-if="f.type === 'bool'" class="check">
              <input
                type="checkbox"
                :checked="str(f.key) === 'true' || str(f.key) === '1'"
                @change="
                  emitParam(
                    f.key,
                    ($event.target as HTMLInputElement).checked ? 'true' : 'false',
                  )
                "
              />
              启用
            </label>
            <input
              v-else
              :value="str(f.key)"
              :placeholder="f.placeholder || ''"
              @input="emitParam(f.key, ($event.target as HTMLInputElement).value)"
            />
          </label>
        </template>
        <template v-else>
          <label v-for="key in paramKeys" :key="key" class="field">
            <span>{{ key }}</span>
            <textarea
              v-if="isLong(key)"
              rows="4"
              :value="str(key)"
              @input="emitParam(key, ($event.target as HTMLTextAreaElement).value)"
            />
            <input
              v-else
              :value="str(key)"
              @input="emitParam(key, ($event.target as HTMLInputElement).value)"
            />
          </label>
          <p v-if="!paramKeys.length" class="hint">此节点无额外参数，用端口连线即可</p>
        </template>
      </template>

      <div class="ports">
        <div v-if="inputs.length">
          <div class="block-label">输入</div>
          <div v-for="p in inputs" :key="p.id" class="port">
            <i :style="{ background: portColor(p.type) }" />
            {{ p.label || p.id }}
            <em>{{ p.type }}</em>
          </div>
        </div>
        <div v-if="outputs.length">
          <div class="block-label">输出</div>
          <div v-for="p in outputs" :key="p.id" class="port">
            <i :style="{ background: portColor(p.type) }" />
            {{ p.label || p.id }}
            <em>{{ p.type }}</em>
          </div>
        </div>
      </div>
    </div>

    <div class="insp-foot">
      <button
        v-if="canRun"
        type="button"
        class="run"
        :disabled="running"
        @click="emit('run')"
      >
        {{ running ? '执行中…' : '运行此节点' }}
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WorkflowFlowNodeData } from '@/components/studio/WorkflowFlowNode.vue';
import { portColor } from '@/utils/workflow-connect';
import CopyButton from '@/components/CopyButton.vue';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';

export type InspectorRef = { id: string; url: string; label?: string };

const props = defineProps<{
  data: WorkflowFlowNodeData | null;
  running?: boolean;
  uploading?: boolean;
  modelOptions?: Array<{ value: string; label: string }>;
  refs?: InspectorRef[];
}>();

const emit = defineEmits<{
  close: [];
  run: [];
  upload: [];
  'pick-asset': [];
  'update-param': [key: string, value: string];
  'update-label': [value: string];
}>();

const kind = computed(() => {
  const t = props.data?.nodeType || '';
  if (t === 'ai.video') return 'video';
  if (t === 'ai.image' || t === 'ai.chat') return 'image';
  if (t === 'input.image' || t === 'input.video') return 'media-input';
  if (t === 'input.text') return 'text';
  return 'generic';
});

const catalogTitle = computed(
  () => props.data?.catalog?.title || props.data?.nodeType || '节点',
);
const label = computed(() => String(props.data?.label || ''));
const isVideoInput = computed(() => props.data?.nodeType === 'input.video');
const mediaUrl = computed(() => String(props.data?.params?.url || '').trim());
const canRun = computed(() => {
  const t = props.data?.nodeType || '';
  return t.startsWith('ai.') || t.startsWith('library.');
});
const inputs = computed(() => props.data?.catalog?.inputs || []);
const outputs = computed(() => props.data?.catalog?.outputs || []);

const paramKeys = computed(() => {
  const params = props.data?.params || {};
  const defaults = props.data?.catalog?.defaultParams || {};
  const keys = new Set([...Object.keys(defaults), ...Object.keys(params)]);
  return [...keys].filter((k) => !['prompt', 'name', 'assetId'].includes(k)).slice(0, 12);
});

const schemaFields = computed(() => props.data?.catalog?.paramSchema || []);

function str(key: string) {
  const v = props.data?.params?.[key];
  return v == null ? '' : String(v);
}

function isLong(key: string) {
  return str(key).length > 40 || /prompt|system|text|value|brief/i.test(key);
}

function emitParam(key: string, value: string) {
  emit('update-param', key, value);
}
</script>

<style scoped>
.insp {
  position: absolute;
  right: 10px;
  top: 52px;
  bottom: 72px;
  width: 300px;
  z-index: 16;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: var(--ink);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.insp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--line);
}

.type {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 4px;
}

.title {
  width: 220px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
  outline: none;
}

.x {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--muted);
  cursor: pointer;
}

.insp-body {
  flex: 1;
  overflow: auto;
  padding: 12px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field textarea,
.field input,
.field select,
.url {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-1);
  color: var(--ink);
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
  resize: vertical;
}

.block-label {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 6px;
  font-weight: 650;
}

.linked {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text);
  max-height: 120px;
  overflow: auto;
  white-space: pre-wrap;
}

.hint,
.desc {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}

.ghost {
  border: 1px solid var(--line);
  background: var(--bg-1);
  color: var(--text);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
}

.media-actions {
  display: flex;
  gap: 8px;
}

.media-actions .ghost {
  flex: 1;
}

.ghost.sm {
  padding: 5px 8px;
  font-size: 11px;
}

.preview {
  height: 120px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-1);
  margin-bottom: 8px;
  display: grid;
  place-items: center;
}

.preview img,
.preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ph {
  color: var(--muted);
  font-size: 12px;
}

.refs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ref {
  width: 48px;
  text-align: center;
  font-size: 10px;
  color: var(--muted);
}

.ref img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
  margin-bottom: 2px;
}

.ports {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid #2a2a30;
}

.port {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text);
  margin-bottom: 4px;
}

.port i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.port em {
  margin-left: auto;
  font-style: normal;
  color: var(--muted);
  font-size: 10px;
}

.insp-foot {
  padding: 12px 14px;
  border-top: 1px solid var(--line);
}

.run {
  width: 100%;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
  cursor: pointer;
}

.run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
