<template>
  <Teleport to="body">
    <div
      v-if="open && data"
      ref="cmsElRef"
      class="cms"
      :class="{ anchored: !!anchorStyle }"
      :style="anchorStyle || undefined"
      @mousedown="onCmsMouseDown"
    >
      <div class="cms-top">
        <div class="cms-top-main">
          <div v-if="kind === 'video'" class="cms-vid-modes">
            <button
              v-for="m in videoModes"
              :key="m.id"
              type="button"
              class="vid-mode"
              :class="{ on: videoRefMode === m.id }"
              @click="setVideoRefMode(m.id)"
            >
              {{ m.label }}
            </button>
          </div>

          <div v-if="showRefs" class="cms-refs">
            <div class="ref-adds">
              <button
                type="button"
                class="ref-slot"
                title="添加参考图"
                @click="emit('pick-asset', 'image')"
              >
              <UiIcon name="image" :size="22" />
            </button>
              <button
                v-if="kind === 'video' && videoRefMode === 'omni' && omniVideoCount < 3"
                type="button"
                class="ref-slot"
                title="添加参考视频（最多 3 段）"
                @click="emit('pick-asset', 'video')"
              >
                <UiIcon name="clapperboard" :size="22" />
              </button>
            </div>
            <div v-if="kind === 'video' && videoRefMode === 'frames'" class="ref-hint">首帧</div>
            <div v-if="refUrl" class="img-chip" title="参考图">
              <img :src="refUrl" alt="" />
              <span class="chip-kind">图片</span>
              <button type="button" class="chip-x" title="清除参考" @click="emitParam('referenceImage', '')">
                ×
              </button>
            </div>
            <div
              v-for="(r, i) in refs || []"
              :key="r.id"
              class="img-chip"
              :class="{ video: r.kind === 'video' }"
              :title="r.label || (r.kind === 'video' ? `参考视频${i + 1}` : `参考${i + 1}`)"
            >
              <LazyVideoThumb
                v-if="r.kind === 'video' && r.url"
                :src="r.url"
                :poster-url="String((r as any).posterUrl || '')"
              />
              <img v-else-if="r.url" :src="r.url" alt="" />
              <span v-else>{{ i + 1 }}</span>
              <em v-if="kind === 'video'" class="chip-idx">{{ i + 1 }}</em>
              <span class="chip-kind" :class="{ vid: r.kind === 'video' }">
                {{ r.kind === 'video' ? '视频' : '图片' }}
              </span>
              <button
                type="button"
                class="chip-x"
                title="移除参考"
                @click.stop="emit('remove-ref', r.id)"
              >
                ×
              </button>
            </div>
            <div
              v-for="(t, ti) in textRefs"
              :key="t.id"
              class="img-chip text"
              :title="t.label || `文本参考${ti + 1}`"
            >
              <div class="text-face">
                <UiIcon name="file-text" :size="22" />
                <strong>{{ t.label || '文本' }}</strong>
              </div>
              <em v-if="kind === 'video'" class="chip-idx">{{ (refs?.length || 0) + (refUrl ? 1 : 0) + ti + 1 }}</em>
              <span class="chip-kind txt">文本</span>
              <button
                type="button"
                class="chip-x"
                title="移除连线"
                @click.stop="emit('remove-ref', t.id)"
              >
                ×
              </button>
            </div>
          </div>
        </div>
        <button type="button" class="expand" title="关闭" @click="emit('close')">×</button>
      </div>

      <div class="cms-prompt-wrap">
        <AiPromptInput
          :key="promptEditorKey"
          ref="promptInputRef"
          class="cms-prompt"
          :model-value="str('prompt')"
          :rich-doc="promptRichDoc"
          :cited-image-urls="citedImageUrls"
          :cited-video-urls="citedVideoUrls"
          :placeholder="promptPlaceholderHints[0]"
          :placeholder-hints="promptPlaceholderHints"
          :min-height="72"
          :bare="true"
          :show-mention="true"
          :show-templates="false"
          :show-prefs="false"
          :enable-attachments="false"
          :auto-apply-template="false"
          :loading="!!running"
          @update:model-value="onPromptUpdate"
          @update:rich-doc="onRichDocUpdate"
          @generate-payload="onGeneratePayload"
          @mention="openCitePop"
          @submit="flushAndRun"
        />
        <div v-if="citeOpen" class="cite-pop" @mousedown.stop>
          <div class="cite-title">引用参考</div>
          <div class="cite-list">
            <button
              v-for="item in filteredCiteItems"
              :key="item.id"
              type="button"
              class="cite-row"
              @click="pickCite(item)"
            >
              <span class="cite-thumb">
                <img v-if="item.url && item.kind !== 'text'" :src="item.url" alt="" />
                <UiIcon v-else name="file-text" :size="16" />
              </span>
              <span class="cite-name">{{ item.label }}</span>
            </button>
            <p v-if="!filteredCiteItems.length" class="cite-empty">
              {{ citeItems.length ? '无匹配参考' : '请先添加参考' }}
            </p>
          </div>
          <label class="cite-search">
            <input v-model="citeQuery" type="search" placeholder="输入关键词搜索" />
            <UiIcon name="search" :size="14" />
          </label>
        </div>
      </div>
      <div v-if="kind === 'video'" class="cms-bytes">{{ promptBytes }}/2500 字节</div>

      <div class="cms-bar">
        <button type="button" class="mode">
          <UiIcon :name="kind === 'video' ? 'clapperboard' : 'image'" :size="14" />
          {{ kind === 'video' ? '视频生成' : '图片生成' }}
          <UiIcon name="chevron-down" :size="12" />
        </button>

        <div class="model-wrap">
          <button
            type="button"
            class="model-trigger"
            :class="{ open: modelOpen }"
            @click.stop="toggleModel"
          >
            <span>{{ currentModelLabel }}</span>
            <UiIcon name="chevron-down" :size="12" />
          </button>
          <div v-if="modelOpen" class="model-menu" @mousedown.stop>
            <button
              v-for="m in menuModels"
              :key="m.value || 'default'"
              type="button"
              class="model-row"
              :class="{ on: m.value === str('model') }"
              :title="m.label"
              @click="pickModel(m.value)"
            >
              <span class="lab">{{ m.label }}</span>
              <span v-if="m.value === str('model')" class="check">✓</span>
            </button>
          </div>
        </div>

        <div class="prefs-wrap">
          <button
            type="button"
            class="prefs"
            :class="{ on: prefsOpen }"
            :title="prefsSummary"
            @click.stop="togglePrefs"
          >
            <span class="prefs-ico" aria-hidden="true">
              <i :style="aspectIconStyle(aspect)" />
            </span>
            {{ prefsShort }}
            <UiIcon name="chevron-down" :size="12" />
          </button>

          <div v-if="prefsOpen" class="prefs-pop" @mousedown.stop @click.stop>
            <div class="prefs-sec">
              <div class="prefs-label">比例</div>
              <div class="aspect-row">
                <button
                  v-for="a in aspects"
                  :key="a.id"
                  type="button"
                  class="aspect-btn"
                  :class="{ on: aspect === a.id }"
                  :title="a.label"
                  @click="setAspect(a.id)"
                >
                  <span class="aspect-ico" aria-hidden="true">
                    <i :style="aspectIconStyle(a.id)" />
                  </span>
                  <em>{{ a.label }}</em>
                </button>
              </div>
            </div>

            <div class="prefs-sec">
              <div class="prefs-label">清晰度</div>
              <div class="res-row">
                <button
                  v-for="r in resolutions"
                  :key="r.id"
                  type="button"
                  class="res-btn"
                  :class="{ on: resolution === r.id }"
                  @click="setResolution(r.id)"
                >
                  {{ r.label }}
                </button>
              </div>
            </div>

            <div v-if="kind === 'video'" class="prefs-sec">
              <div class="prefs-label">时长</div>
              <div class="res-row">
                <button
                  v-for="d in durations"
                  :key="d"
                  type="button"
                  class="res-btn"
                  :class="{ on: Number(str('durationSec') || 5) === d }"
                  @click="emitParam('durationSec', String(d))"
                >
                  {{ d }}s
                </button>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="mode cite-btn"
          title="@ 引用参考"
          @click.stop="openCitePop"
        >
          @
        </button>

        <span class="gap" />
        <button
          type="button"
          class="send"
          :class="{ stop: running }"
          :title="running ? '终止生成' : '生成'"
          @click="running ? emit('cancel') : flushAndRun()"
        >
          <UiIcon v-if="!running" name="arrow-up" :size="18" />
          <span v-else class="send-stop" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { JSONContent } from '@tiptap/core';
import type { WorkflowFlowNodeData } from '@/components/studio/WorkflowFlowNode.vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import LazyVideoThumb from '@/components/LazyVideoThumb.vue';
import AiPromptInput from '@/components/ai-prompt-input/AiPromptInput.vue';
import { parsePromptDoc } from '@/components/ai-prompt-input/serialize';

type CiteItem = {
  id: string;
  label: string;
  url?: string;
  kind: 'image' | 'video' | 'text';
  expandText?: string;
};

const props = defineProps<{
  open: boolean;
  nodeId?: string;
  data: WorkflowFlowNodeData | null;
  running?: boolean;
  modelOptions: Array<{ value: string; label: string }>;
  refs?: Array<{ id: string; url: string; label?: string; kind?: 'image' | 'video' }>;
  textRefs?: Array<{ id: string; label: string; text?: string }>;
  /** 贴在节点底部的屏幕坐标 */
  anchor?: { left: number; top: number } | null;
}>();

const emit = defineEmits<{
  close: [];
  run: [];
  cancel: [];
  'pick-asset': [kind: 'image' | 'video'];
  'update-param': [key: string, value: string];
  'update-label': [value: string];
  'remove-ref': [nodeId: string];
  layout: [];
}>();

const prefsOpen = ref(false);
const modelOpen = ref(false);
const citeOpen = ref(false);
const citeQuery = ref('');
const promptInputRef = ref<InstanceType<typeof AiPromptInput> | null>(null);

const textRefs = computed(() => props.textRefs || []);

const citeItems = computed((): CiteItem[] => {
  const items: CiteItem[] = [];
  let imgN = 0;
  let vidN = 0;
  let txtN = 0;
  if (refUrl.value) {
    imgN += 1;
    items.push({
      id: '__param_ref__',
      label: `图${imgN}`,
      url: refUrl.value,
      kind: 'image',
    });
  }
  for (const r of props.refs || []) {
    if (r.kind === 'video') {
      vidN += 1;
      items.push({
        id: r.id,
        label: r.label?.trim() || `视频${vidN}`,
        url: r.url,
        kind: 'video',
      });
    } else {
      imgN += 1;
      items.push({
        id: r.id,
        label: r.label?.trim() || `图${imgN}`,
        url: r.url,
        kind: 'image',
      });
    }
  }
  for (const t of textRefs.value) {
    txtN += 1;
    items.push({
      id: t.id,
      label: t.label?.trim() || `文本${txtN}`,
      kind: 'text',
      expandText: String(t.text || '').trim(),
    });
  }
  return items;
});

const filteredCiteItems = computed(() => {
  const q = citeQuery.value.trim().toLowerCase();
  if (!q) return citeItems.value;
  return citeItems.value.filter(
    (x) =>
      x.label.toLowerCase().includes(q) ||
      String(x.expandText || '').toLowerCase().includes(q),
  );
});

function onPromptUpdate(v: string) {
  emitParam('prompt', v);
}

function parseUrlList(raw: string): string[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const promptRichDoc = computed(() => parsePromptDoc(str('promptDoc')));
const citedImageUrls = computed(() => parseUrlList(str('citedImageUrls')));
const citedVideoUrls = computed(() => parseUrlList(str('citedVideoUrls')));
const promptEditorKey = computed(
  () => `${props.nodeId || 'node'}-${props.open ? '1' : '0'}`,
);

function onRichDocUpdate(doc: JSONContent) {
  emitParam('promptDoc', JSON.stringify(doc));
}

function onGeneratePayload(p: { prompt: string; imageUrls: string[]; videoUrls: string[] }) {
  emitParam('prompt', p.prompt);
  emitParam('citedImageUrls', JSON.stringify(p.imageUrls || []));
  emitParam('citedVideoUrls', JSON.stringify(p.videoUrls || []));
}

function flushAndRun() {
  const payload = promptInputRef.value?.getGeneratePayload?.();
  if (payload) onGeneratePayload(payload);
  emit('run');
}

function openCitePop() {
  citeOpen.value = true;
  citeQuery.value = '';
  prefsOpen.value = false;
  modelOpen.value = false;
}

function closeCitePop() {
  citeOpen.value = false;
}

function pickCite(item: CiteItem) {
  promptInputRef.value?.insertCite?.({
    label: item.label,
    id: item.id,
    expandText: item.kind === 'text' ? item.expandText : undefined,
    url: item.kind === 'text' ? undefined : item.url,
    mediaKind: item.kind,
  });
  closeCitePop();
}
const kind = computed(() =>
  props.data?.nodeType === 'ai.video' ? ('video' as const) : ('image' as const),
);

const hasExistingMedia = computed(() => {
  const p = props.data?.params || {};
  return Boolean(
    String(props.data?.previewImage || props.data?.previewVideo || '').trim() ||
      String(p.lastImage || p.lastVideo || p.url || '').trim(),
  );
});

const promptPlaceholderHints = computed(() => {
  if (kind.value === 'video') {
    return hasExistingMedia.value
      ? [
          '试试说「把镜头拉近一点」随时为你开启下一轮创作',
          '输入修改需求，可切换文生视频 / 首尾帧 / 全能参考',
        ]
      : [
          '试试说「生成一段雨夜街头漫步」随时为你开启下一轮创作',
          '输入视频描述，可切换文生视频 / 首尾帧 / 全能参考',
        ];
  }
  if (textRefs.value.length) {
    return [
      '试试说「按参考文案生成画面」随时为你开启下一轮创作',
      '已连文本作参考；在此补充自定义生成需求，按 @ 引用素材',
    ];
  }
  if (hasExistingMedia.value) {
    return [
      '试试说「换成暖色调光影」随时为你开启下一轮创作',
      '输入修改或重新生成需求，按 @ 引用素材',
    ];
  }
  return [
    '试试说「生成一张赛博朋克夜景」随时为你开启下一轮创作',
    '输入画面描述，按 @ 引用素材，或连接文本节点作参考',
  ];
});

const cmsElRef = ref<HTMLElement | null>(null);
let sheetResizeObs: ResizeObserver | null = null;

const anchorStyle = computed(() => {
  const a = props.anchor;
  if (!a || !Number.isFinite(a.left) || !Number.isFinite(a.top)) return null;
  return {
    position: 'fixed' as const,
    left: `${Math.round(a.left)}px`,
    top: `${Math.round(a.top)}px`,
    right: 'auto',
    bottom: 'auto',
    margin: '0',
    transform: 'none',
  };
});

defineExpose({
  getSheetRect: () => cmsElRef.value?.getBoundingClientRect() ?? null,
});

const videoModes = [
  { id: 'text', label: '文生视频' },
  { id: 'frames', label: '首尾帧' },
  { id: 'omni', label: '全能参考' },
] as const;

type VideoRefMode = (typeof videoModes)[number]['id'];

const videoRefMode = computed<VideoRefMode>(() => {
  const raw = String(props.data?.params?.refMode || '').trim().toLowerCase();
  if (raw === 'frames' || raw === '首尾帧') return 'frames';
  if (raw === 'omni' || raw === '全能' || raw === '全能参考') return 'omni';
  return 'text';
});

const showRefs = computed(() => {
  if (kind.value !== 'video') return true;
  return videoRefMode.value !== 'text';
});

const refUrl = computed(() => String(props.data?.params?.referenceImage || '').trim());

const omniImageCount = computed(
  () => (props.refs || []).filter((r) => r.kind !== 'video').length + (refUrl.value ? 1 : 0),
);
const omniVideoCount = computed(() => (props.refs || []).filter((r) => r.kind === 'video').length);

const promptBytes = computed(() => {
  const s = str('prompt');
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length;
  }
});

const menuModels = computed(() => {
  const list = props.modelOptions || [];
  if (!list.length) return [{ value: '', label: '默认模型' }];
  if (!list.some((m) => !m.value)) return [{ value: '', label: '默认模型' }, ...list];
  return list;
});

const currentModelLabel = computed(() => {
  const v = str('model');
  return menuModels.value.find((m) => m.value === v)?.label || '默认模型';
});

const aspects = [
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '3:2', label: '3:2' },
  { id: '2:3', label: '2:3' },
  { id: '21:9', label: '21:9' },
];

const resolutions = computed(() =>
  kind.value === 'video'
    ? [
        { id: '480p', label: '480p' },
        { id: '720p', label: '720p' },
        { id: '1080p', label: '1080p' },
      ]
    : [
        { id: '1K', label: '1K' },
        { id: '2K', label: '2K' },
        { id: '4K', label: '4K' },
      ],
);

const durations = [5, 10, 15, 30];

function str(key: string) {
  return String(props.data?.params?.[key] ?? '');
}

function emitParam(key: string, value: string) {
  emit('update-param', key, value);
}

function setVideoRefMode(mode: VideoRefMode) {
  emitParam('refMode', mode);
}

const aspect = computed(() => str('aspect') || '16:9');
const resolution = computed(() => {
  if (kind.value === 'video') return str('resolution') || '480p';
  return str('size') || '1K';
});
const durationSec = computed(() => Number(str('durationSec') || 5) || 5);

const prefsShort = computed(() => {
  if (kind.value === 'video') {
    return `${aspect.value} / ${durationSec.value}S / ${resolution.value}`;
  }
  return `${aspect.value} / ${resolution.value}`;
});
const prefsSummary = computed(() => prefsShort.value);

function aspectIconStyle(ratio: string) {
  const [aw, ah] = String(ratio || '1:1')
    .split(':')
    .map((n) => Number(n) || 1);
  const max = 18;
  let w = max;
  let h = max;
  if (aw >= ah) {
    h = Math.max(8, Math.round((max * ah) / aw));
  } else {
    w = Math.max(8, Math.round((max * aw) / ah));
  }
  return { width: `${w}px`, height: `${h}px` };
}

function togglePrefs() {
  prefsOpen.value = !prefsOpen.value;
  if (prefsOpen.value) modelOpen.value = false;
}

function toggleModel() {
  modelOpen.value = !modelOpen.value;
  if (modelOpen.value) prefsOpen.value = false;
}

function pickModel(value: string) {
  emitParam('model', value);
  modelOpen.value = false;
}

function setAspect(id: string) {
  emitParam('aspect', id);
  syncDerivedSize(id, resolution.value);
}

function setResolution(id: string) {
  if (kind.value === 'video') emitParam('resolution', id);
  else emitParam('size', id);
  syncDerivedSize(aspect.value, id);
}

function syncDerivedSize(asp: string, res: string) {
  if (kind.value === 'image') {
    const size = res === '4K' ? '4K' : res === '2K' ? '2K' : '1K';
    emitParam('size', size);
    return;
  }
  const portrait = asp === '9:16' || asp === '3:4' || asp === '2:3';
  const square = asp === '1:1';
  let imageSize = '1280x720';
  if (res === '480p') {
    if (square) imageSize = '480x480';
    else if (portrait) imageSize = '480x854';
    else imageSize = '854x480';
  } else if (res === '1080p') {
    if (square) imageSize = '1080x1080';
    else if (portrait) imageSize = '1080x1920';
    else imageSize = '1920x1080';
  } else {
    if (square) imageSize = '720x720';
    else if (portrait) imageSize = '720x1280';
    else imageSize = '1280x720';
  }
  emitParam('imageSize', imageSize);
}

function onCmsMouseDown(e: MouseEvent) {
  e.stopPropagation();
  const t = e.target as HTMLElement | null;
  if (modelOpen.value && !t?.closest?.('.model-wrap')) modelOpen.value = false;
  if (prefsOpen.value && !t?.closest?.('.prefs-wrap')) prefsOpen.value = false;
  // 点输入区 / 弹层空白：关闭引用参考（仅保留点在弹层本身或 @ 按钮时不关）
  if (citeOpen.value && !t?.closest?.('.cite-pop') && !t?.closest?.('.cite-btn')) {
    citeOpen.value = false;
  }
}

function onDocDown(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (modelOpen.value && !t?.closest?.('.model-wrap') && !t?.closest?.('.cms')) {
    modelOpen.value = false;
  }
  if (prefsOpen.value && !t?.closest?.('.prefs-wrap') && !t?.closest?.('.cms')) {
    prefsOpen.value = false;
  }
  if (citeOpen.value && !t?.closest?.('.cite-pop') && !t?.closest?.('.cite-btn')) {
    citeOpen.value = false;
  }
}

watch(
  () => props.open,
  (v) => {
    if (!v) {
      prefsOpen.value = false;
      modelOpen.value = false;
      citeOpen.value = false;
    }
  },
);

watch(
  () => [props.open, cmsElRef.value] as const,
  ([open, el]) => {
    sheetResizeObs?.disconnect();
    sheetResizeObs = null;
    if (!open || !el || typeof ResizeObserver === 'undefined') return;
    sheetResizeObs = new ResizeObserver(() => emit('layout'));
    sheetResizeObs.observe(el);
    void nextTick(() => emit('layout'));
  },
  { flush: 'post' },
);

onMounted(() => window.addEventListener('mousedown', onDocDown));
onUnmounted(() => {
  window.removeEventListener('mousedown', onDocDown);
  sheetResizeObs?.disconnect();
  sheetResizeObs = null;
});
</script>

<style scoped>
.cms {
  position: fixed;
  left: 50%;
  bottom: 88px;
  transform: translateX(-50%);
  z-index: 58;
  width: min(720px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 14px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--studio-panel) 97%, transparent);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  color: var(--studio-text);
  backdrop-filter: blur(16px);
}
.cms.anchored {
  left: auto;
  bottom: auto;
  transform: none;
}
.cms-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.cms-top-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.cms-vid-modes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.vid-mode {
  height: 30px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--studio-text-soft);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.vid-mode:hover {
  color: var(--studio-text-strong);
  background: var(--studio-glass-2);
}
.vid-mode.on {
  color: var(--studio-ink);
  border-color: var(--studio-text-soft);
  background: var(--studio-glass-2);
}
.cms-refs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ref-adds {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  order: -1;
}
.ref-hint {
  font-size: 11px;
  color: var(--studio-text-faint);
  margin-right: -2px;
}
.ref-slot {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  border: 1px dashed var(--studio-line-strong);
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.ref-slot.soft {
  width: 64px;
  height: 64px;
}
.ref-slot:hover {
  border-color: var(--studio-text-faint);
  color: #fff;
}
.img-chip {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--studio-line-strong);
  background: var(--studio-glass-2);
  flex-shrink: 0;
}
.img-chip img,
.img-chip video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.img-chip span:not(.chip-kind) {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 11px;
  color: var(--studio-text-soft);
}
.chip-idx {
  position: absolute;
  left: 4px;
  top: 4px;
  z-index: 2;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  display: grid;
  place-items: center;
  line-height: 1;
}
.chip-kind {
  position: absolute;
  left: 4px;
  bottom: 4px;
  z-index: 2;
  height: 18px;
  padding: 0 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.62);
  color: var(--studio-ink);
  font-size: 10px;
  font-weight: 700;
  line-height: 18px;
  letter-spacing: 0.02em;
  pointer-events: none;
}
.chip-kind.vid {
  background: rgba(30, 90, 160, 0.78);
}
.chip-kind.txt {
  background: rgba(90, 70, 40, 0.82);
}
.img-chip.text {
  background: var(--studio-glass);
  border-color: rgba(255, 220, 160, 0.22);
}
.text-face {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 6px 18px;
  box-sizing: border-box;
  color: rgba(255, 230, 180, 0.88);
}
.text-face strong {
  max-width: 100%;
  margin: 0;
  font-size: 10px;
  font-weight: 650;
  line-height: 1.25;
  text-align: center;
  color: var(--studio-text-strong);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}
.img-chip .chip-x {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 2;
  width: 18px;
  height: 18px;
  margin: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.img-chip .chip-x:hover {
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
}
.expand {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text-faint);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  font-size: 18px;
  line-height: 1;
}
.expand:hover {
  background: var(--studio-glass-2);
  color: #fff;
}
.cms-prompt-wrap {
  position: relative;
  width: 100%;
}
.cms-prompt {
  width: 100%;
}
.cms-prompt :deep(.ai-prompt) {
  --ink: var(--studio-ink);
  --muted: var(--studio-text-faint);
  --accent: #9fe0ef;
  --accent-soft: var(--studio-glass-3);
  --prompt-tag-bg: var(--studio-glass-3);
  --prompt-tag-fg: var(--studio-ink);
  background: transparent;
  border: 0;
  box-shadow: none;
  color: var(--studio-ink);
}
.cms-prompt :deep(.ai-prompt-body),
.cms-prompt :deep(.ai-prompt-main),
.cms-prompt :deep(.ai-prompt-editor) {
  width: 100%;
}
.cms-prompt :deep(.editor-scroll) {
  max-height: 140px;
}
.cms-prompt :deep(.tiptap-container) {
  min-height: 64px;
  max-height: none;
  overflow: visible;
  color: var(--studio-ink) !important;
  font-size: 14px;
  line-height: 1.55;
  padding: 0;
}
.cms-prompt :deep(.tiptap-container p) {
  margin: 0;
  padding: 0;
  min-height: 1.55em;
  color: var(--studio-ink) !important;
  font-size: 14px;
  line-height: 1.55;
}
.cms-prompt :deep(.ai-prompt-placeholder) {
  color: var(--studio-line-bright);
  font-size: 14px;
  line-height: 1.55;
  top: 0 !important;
  left: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
.cms-prompt :deep(.ai-prompt-p) {
  margin: 0;
  padding: 0;
  color: var(--studio-ink);
  font-size: 14px;
  line-height: 1.55;
  min-height: 1.55em;
}
.cms-prompt :deep(.mention-tag) {
  background: rgba(96, 165, 250, 0.22);
  color: #93c5fd;
  max-width: min(220px, 100%);
  min-width: 0;
  overflow: hidden;
}
.cms-prompt :deep(.mention-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cms-prompt :deep(.placeholder-tag),
.cms-prompt :deep(.select-tag) {
  background: var(--studio-line-strong);
  color: var(--studio-ink);
}
.cms-prompt :deep(.placeholder-tag .placeholder),
.cms-prompt :deep(.placeholder-tag .editable-content),
.cms-prompt :deep(.select-tag .custom-select) {
  color: var(--studio-ink);
  font-size: 13px;
}

.cite-pop {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 30;
  width: min(320px, 100%);
  border-radius: 14px;
  background: var(--studio-panel);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  padding: 10px;
  color: var(--studio-ink);
}
.cite-title {
  font-size: 12px;
  color: var(--studio-text-soft);
  margin: 0 4px 8px;
}
.cite-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow: auto;
}
.cite-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  padding: 8px;
  cursor: pointer;
}
.cite-row:hover {
  background: var(--studio-glass-2);
}
.cite-thumb {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--studio-inset);
  display: grid;
  place-items: center;
  color: var(--studio-text-soft);
  flex-shrink: 0;
}
.cite-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.cite-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cite-empty {
  margin: 8px 4px;
  font-size: 12px;
  color: var(--studio-text-faint);
}
.cite-search {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  background: var(--studio-glass-2);
  color: var(--studio-text-faint);
}
.cite-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--studio-ink);
  font: inherit;
  font-size: 12px;
  outline: none;
}
.cite-search input::placeholder {
  color: var(--studio-line-bright);
}
.cite-btn {
  min-width: 32px;
  padding: 0 10px;
  font-weight: 600;
}

.cms-bytes {
  align-self: flex-end;
  margin-top: -6px;
  font-size: 11px;
  color: var(--studio-line-bright);
}
.cms-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mode,
.model-trigger,
.prefs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-glass);
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  max-width: 200px;
}
.model-trigger span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-trigger:hover,
.model-trigger.open,
.prefs:hover,
.prefs.on {
  border-color: var(--studio-line-bright);
  background: var(--studio-glass-3);
  color: #fff;
}
.model-wrap,
.prefs-wrap {
  position: relative;
}
.prefs-ico {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
}
.prefs-ico i,
.aspect-ico i {
  display: block;
  border: 1.5px solid currentColor;
  border-radius: 2px;
  opacity: 0.85;
}
.gap {
  flex: 1;
}
.send {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 999px;
  background: var(--studio-ink);
  color: var(--studio-inset);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}
.send:hover {
  filter: brightness(0.96);
}
.send.stop {
  background: var(--studio-ink);
}
.send-stop {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: var(--studio-inset);
}
.model-menu,
.prefs-pop {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 5;
  padding: 6px;
  border-radius: 14px;
  background: var(--studio-panel-3);
  border: 1px solid var(--studio-glass-3);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
}
.model-menu {
  min-width: 260px;
  max-width: min(360px, 70vw);
  max-height: 280px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.prefs-pop {
  min-width: 180px;
  width: 280px;
}
.model-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  height: 34px;
  min-height: 34px;
  max-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 13px;
  line-height: 1.2;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
}
.model-row:hover,
.model-row.on {
  background: var(--studio-glass-2);
  color: #fff;
}
.model-row .lab {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-row .check {
  flex-shrink: 0;
  color: #7dd3fc;
  font-size: 12px;
}
.prefs-sec + .prefs-sec {
  margin-top: 12px;
}
.prefs-label {
  font-size: 11px;
  color: var(--studio-text-faint);
  margin-bottom: 8px;
}
.aspect-row,
.res-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.aspect-btn,
.res-btn {
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--studio-glass-3);
  background: var(--studio-glass);
  color: var(--studio-text-strong);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.aspect-btn em {
  font-style: normal;
}
.aspect-btn.on,
.res-btn.on {
  border-color: var(--studio-line-bright);
  background: var(--studio-glass-3);
  color: #fff;
}
.aspect-ico {
  display: grid;
  place-items: center;
}
</style>
