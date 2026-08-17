<template>
  <div class="hub-dir">
    <header class="dir-head">
      <h3 v-if="mode !== 'local-models'" class="dir-title">{{ panelTitle }}</h3>
      <button
        v-if="isHubMode || mode === 'local-channels' || mode === 'local-models'"
        type="button"
        class="count-pill"
        :class="{ static: false }"
        title="重新同步 Hub 目录并刷新本端快照"
        :disabled="syncing"
        @click="onSync"
      >
        <template v-if="mode === 'local-channels' || mode === 'local-models'">
          已落地 {{ localCountLabel }}
        </template>
        <template v-else>已加载 {{ hubCountLabel }}</template>
        <UiIcon name="refresh" :size="12" :class="{ spin: syncing }" />
      </button>
    </header>

    <div class="filter-row">
      <label class="search">
        <UiIcon name="search" :size="15" />
        <input v-model="qName" type="search" placeholder="按名称筛选…" />
      </label>
      <label class="search">
        <UiIcon name="search" :size="15" />
        <input
          v-model="qExtra"
          type="search"
          :placeholder="
            isChannelMode ? '按厂商筛选…' : '按 modelId 或渠道筛选…'
          "
        />
      </label>
    </div>

    <div v-if="isModelMode" class="type-row" role="tablist" aria-label="模型分类">
      <button
        v-for="t in modelTypeTabs"
        :key="t.id"
        type="button"
        class="type-pill"
        role="tab"
        :class="{ on: modelType === t.id }"
        :aria-selected="modelType === t.id"
        @click="modelType = t.id"
      >
        {{ t.label }}
        <span class="type-n">{{ typeCounts[t.id] }}</span>
      </button>
      <span v-if="mode === 'local-models' && currentDefaultLabel" class="default-hint">
        当前默认：{{ currentDefaultLabel }}
      </span>
    </div>

    <!-- Hub / 本地 渠道 -->
    <div v-if="isChannelMode" class="card-grid-wrap">
      <div class="model-grid channels">
        <article
          v-for="ch in displayChannels"
          :key="ch.slug"
          class="hub-card channel"
          :class="{ open: expanded === ch.slug }"
        >
          <header class="card-top">
            <div class="brand">
              <span class="logo-wrap sm">
                <img
                  v-if="channelLogo(ch)"
                  class="logo"
                  :src="channelLogo(ch)"
                  alt=""
                  @error="onLogoError(ch.slug)"
                />
                <span v-else class="logo ph">{{ (ch.title || '?').slice(0, 1) }}</span>
              </span>
              <strong>{{ ch.title || ch.slug }}</strong>
            </div>
            <div class="top-actions">
              <template v-if="mode === 'channels'">
                <button
                  type="button"
                  class="icon-btn"
                  :class="{ on: isPulled(ch.slug) }"
                  :title="isPulled(ch.slug) ? '已拉取（可再点更新快照）' : '拉取'"
                  :disabled="pullingSlug === ch.slug"
                  @click="pullChannel(ch)"
                >
                  <UiIcon
                    :name="isPulled(ch.slug) ? 'check' : 'cloud-download'"
                    :size="15"
                    :class="{ spin: pullingSlug === ch.slug }"
                  />
                </button>
              </template>
              <template v-else>
                <span class="key-pill" :class="{ on: channelHasKey(ch.slug) }">
                  {{ channelHasKey(ch.slug) ? '已配 Key' : '待配 Key' }}
                </span>
                <button type="button" class="linkish" @click="toggleExpand(ch.slug)">
                  {{ expanded === ch.slug ? '收起' : '配置' }}
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  title="移除本端渠道"
                  :disabled="removingSlug === ch.slug"
                  @click="removeChannel(ch.slug)"
                >
                  <UiIcon name="trash" :size="14" />
                </button>
              </template>
            </div>
          </header>

          <div class="channel-body">
            <div class="channel-main">
              <div class="field">
                <span class="lab">API 地址</span>
                <span v-if="apiUrl(ch)" class="val url" :title="apiUrl(ch)">{{
                  apiUrl(ch)
                }}</span>
                <span v-else class="val muted">—</span>
              </div>
              <div v-if="ch.group || ch.category" class="group-tag">
                {{ ch.group || ch.category }}
              </div>
            </div>
            <div class="channel-meta">
              <div class="meta-cell">
                <span class="lab">官方</span>
                <span class="pill">{{ ch.official ? '是' : '否' }}</span>
              </div>
              <div class="meta-cell">
                <span class="lab">状态</span>
                <span class="val ok">{{
                  mode === 'local-channels' ? '已落地' : '已发布'
                }}</span>
              </div>
              <div class="meta-cell">
                <span class="lab">更新</span>
                <span class="val">{{
                  relativeDay(
                    mode === 'local-channels' ? ch.pulledAt || ch.updatedAt : ch.updatedAt,
                  )
                }}</span>
              </div>
            </div>
          </div>

          <div v-if="mode === 'local-channels' && expanded === ch.slug" class="cfg">
            <div class="cfg-row">
              <label>API Base URL</label>
              <input
                v-model="drafts[ch.slug].baseUrl"
                class="cfg-input"
                type="url"
                placeholder="https://…"
              />
            </div>
            <div class="cfg-row">
              <label
                >API Key{{
                  drafts[ch.slug].hasKey
                    ? `（当前 ${drafts[ch.slug].apiKeyMasked || '已保存'}）`
                    : ''
                }}</label
              >
              <input
                v-model="drafts[ch.slug].apiKey"
                class="cfg-input"
                type="password"
                autocomplete="off"
                :placeholder="drafts[ch.slug].hasKey ? '留空则不修改' : '输入 Key'"
              />
            </div>
            <div class="cfg-row">
              <label>代理 URL（可选）</label>
              <input
                v-model="drafts[ch.slug].proxyUrl"
                class="cfg-input"
                type="url"
                placeholder="http://127.0.0.1:7890（仅本渠道走代理，留空直连）"
              />
            </div>
            <div class="cfg-actions">
              <button
                type="button"
                class="btn primary"
                :disabled="savingId === ch.slug"
                @click="saveHub(ch.slug)"
              >
                {{ savingId === ch.slug ? '保存中…' : '保存' }}
              </button>
              <button
                type="button"
                class="btn"
                :disabled="testingId === ch.slug"
                @click="testHub(ch.slug)"
              >
                {{ testingId === ch.slug ? '测试中…' : '测试连接' }}
              </button>
              <p
                v-if="results[ch.slug]"
                class="result"
                :class="{ ok: results[ch.slug].ok }"
              >
                {{ results[ch.slug].message }}
              </p>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- 模型 -->
    <div v-else class="card-grid-wrap">
      <div class="model-grid">
        <article
          v-for="(m, idx) in filteredModels"
          :key="m.modelId + m.channelSlug"
          class="hub-card model"
        >
          <header class="card-top">
            <div class="brand">
              <span class="logo-wrap sm">
                <img
                  v-if="modelLogo(m)"
                  class="logo"
                  :src="modelLogo(m)"
                  alt=""
                  @error="onLogoError(m.channelSlug + ':' + m.modelId)"
                />
                <span v-else class="logo ph">{{
                  (m.channelTitle || m.channelSlug || '?').slice(0, 1)
                }}</span>
              </span>
              <strong>{{ m.channelTitle || m.channelSlug }}</strong>
            </div>
            <div class="top-actions">
              <template v-if="mode === 'local-models'">
                <span v-if="isDefaultModel(m)" class="key-pill on">默认</span>
                <button
                  v-if="defaultCapForModel(m)"
                  type="button"
                  class="btn default-btn"
                  :class="{ primary: !isDefaultModel(m) }"
                  :disabled="settingDefaultId === m.modelId || isDefaultModel(m)"
                  @click="setAsDefault(m)"
                >
                  {{
                    isDefaultModel(m)
                      ? '当前默认'
                      : settingDefaultId === m.modelId
                        ? '设置中…'
                        : '设为默认'
                  }}
                </button>
                <span class="key-pill" :class="{ on: channelHasKey(m.channelSlug) }">
                  {{ channelHasKey(m.channelSlug) ? '可用' : '缺 Key' }}
                </span>
              </template>
              <span
                v-else
                class="key-pill"
                :class="{ on: channelHasKey(m.channelSlug) }"
              >
                {{ channelHasKey(m.channelSlug) ? '可用' : '缺 Key' }}
              </span>
            </div>
          </header>
          <div class="model-main">
            <span class="idx">#{{ idx + 1 }}</span>
            <h3 class="model-name">{{ m.label || m.title || m.modelId }}</h3>
          </div>
          <div class="card-grid">
            <div class="col">
              <div class="field">
                <span class="lab">modelId</span>
                <button type="button" class="val url copy" @click="copyId(m.modelId)">
                  {{ m.modelId }}
                  <UiIcon name="copy" :size="12" />
                </button>
              </div>
              <div class="mod-tags">
                <span v-for="mod in m.modalities || []" :key="mod" class="chip green">{{
                  modalityLabel(mod)
                }}</span>
              </div>
            </div>
            <div class="col meta">
              <div class="meta-cell">
                <span class="lab">渠道</span>
                <span class="val ok">{{ displayModelChannel(m) }}</span>
              </div>
              <div class="meta-cell">
                <span class="lab">状态</span>
                <span class="val ok">{{
                  mode === 'local-models'
                    ? '已落地'
                    : m.enabled === false
                      ? '停用'
                      : '已发布'
                }}</span>
              </div>
              <div class="meta-cell">
                <span class="lab">启用</span>
                <span class="val ok">{{ m.enabled === false ? '否' : '是' }}</span>
              </div>
              <div class="meta-cell">
                <span class="lab">{{ mode === 'local-models' ? '拉取' : '更新' }}</span>
                <span class="val">{{
                  relativeDay(
                    mode === 'local-models' ? m.pulledAt || m.updatedAt : m.updatedAt,
                  )
                }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '@/api';
import UiIcon from '@/components/icons/UiIcon.vue';
import {
  fetchChannelsCatalog,
  fetchModelsCatalog,
  pullHubChannelToLocal,
  refreshLocalModelsFromHub,
  removeLocalHubChannel,
  resolveHubAssetUrl,
  syncHubCatalog,
  type HubChannelDto,
  type HubModelDto,
} from '@/api/hub-catalog';

type PanelMode = 'channels' | 'models' | 'local-channels' | 'local-models';
type LocalChannelView = HubChannelDto & {
  hasKey?: boolean;
  apiKeyMasked?: string;
  pulledAt?: string;
  baseUrl?: string;
  proxyUrl?: string;
};
type LocalModelView = HubModelDto & { pulledAt?: string };

const props = withDefaults(
  defineProps<{
    settings: any;
    mode?: PanelMode;
  }>(),
  { mode: 'channels' },
);
const emit = defineEmits<{ saved: [data: any] }>();

type Draft = {
  baseUrl: string;
  apiKey: string;
  apiKeyMasked: string;
  hasKey: boolean;
  proxyUrl: string;
};

const channels = ref<HubChannelDto[]>([]);
const models = ref<HubModelDto[]>([]);
const hubOrigin = ref('');
const qName = ref('');
const qExtra = ref('');
const expanded = ref('');
const syncing = ref(false);
const pullingSlug = ref('');
const removingSlug = ref('');
const savingId = ref('');
const testingId = ref('');
const settingDefaultId = ref('');
const modelType = ref<'all' | 'text' | 'image' | 'video'>('all');
const drafts = reactive<Record<string, Draft>>({});
const results = reactive<Record<string, { ok: boolean; message: string }>>({});
const logoBroken = reactive<Record<string, boolean>>({});

const isHubMode = computed(
  () => props.mode === 'channels' || props.mode === 'models',
);
const isChannelMode = computed(
  () => props.mode === 'channels' || props.mode === 'local-channels',
);
const isModelMode = computed(
  () => props.mode === 'models' || props.mode === 'local-models',
);

const panelTitle = computed(() => {
  if (props.mode === 'channels') return 'Hub 渠道';
  if (props.mode === 'local-channels') return '本地渠道';
  if (props.mode === 'local-models') return '模型';
  return 'Hub 模型';
});

const modelTypeTabs = [
  { id: 'all' as const, label: '全部' },
  { id: 'text' as const, label: '文本' },
  { id: 'image' as const, label: '图片' },
  { id: 'video' as const, label: '视频' },
];

function modelMatchesType(m: HubModelDto, type: 'all' | 'text' | 'image' | 'video') {
  if (type === 'all') return true;
  const mods = (m.modalities || []).map((x) => String(x).toLowerCase());
  const cat = String(m.category || '').toLowerCase();
  if (type === 'text') {
    return mods.includes('text') || mods.includes('chat') || cat === 'text' || cat === 'chat';
  }
  if (type === 'image') {
    return mods.includes('image') || cat === 'image';
  }
  return mods.includes('video') || cat === 'video';
}

const localChannelMap = computed(() => {
  return (
    props.settings?.localChannels ||
    props.settings?.channelCredentials ||
    {}
  ) as Record<string, LocalChannelView & Draft>;
});

const localChannelsList = computed<LocalChannelView[]>(() => {
  return Object.entries(localChannelMap.value)
    .filter(([slug]) => !!slug)
    .map(([slug, c]) => ({
      slug,
      title: c.title || slug,
      coverUrl: c.coverUrl ?? null,
      website: c.website,
      endpointType: c.endpointType,
      baseUrlHint: c.baseUrl || '',
      apiStyle: c.apiStyle,
      group: c.group,
      category: c.category,
      modelCount: Number(c.modelCount) || 0,
      sort: Number((c as any).sort) || 0,
      official: !!c.official,
      pulledAt: c.pulledAt,
      hasKey: !!c.hasKey,
      apiKeyMasked: c.apiKeyMasked,
      updatedAt: c.pulledAt,
    }));
});

const localModelsList = computed<LocalModelView[]>(() => {
  const list = props.settings?.localModels;
  return Array.isArray(list) ? (list as LocalModelView[]) : [];
});

const filteredHubChannels = computed(() => {
  const n = qName.value.trim().toLowerCase();
  const e = qExtra.value.trim().toLowerCase();
  return channels.value.filter((ch) => {
    if (n && !`${ch.title} ${ch.slug}`.toLowerCase().includes(n)) return false;
    if (
      e &&
      !`${ch.endpointType || ''} ${ch.group || ''} ${ch.category || ''} ${ch.apiStyle || ''}`
        .toLowerCase()
        .includes(e)
    ) {
      return false;
    }
    return true;
  });
});

const filteredLocalChannels = computed(() => {
  const n = qName.value.trim().toLowerCase();
  const e = qExtra.value.trim().toLowerCase();
  return localChannelsList.value.filter((ch) => {
    if (n && !`${ch.title} ${ch.slug}`.toLowerCase().includes(n)) return false;
    if (
      e &&
      !`${ch.endpointType || ''} ${ch.group || ''} ${ch.category || ''} ${ch.apiStyle || ''}`
        .toLowerCase()
        .includes(e)
    ) {
      return false;
    }
    return true;
  });
});

const displayChannels = computed(() =>
  props.mode === 'local-channels' ? filteredLocalChannels.value : filteredHubChannels.value,
);

const pulledSlugs = computed(() => {
  return new Set(Object.keys(localChannelMap.value).filter(Boolean));
});

const pulledModels = computed(() => {
  const pulled = pulledSlugs.value;
  return models.value.filter((m) => m.channelSlug && pulled.has(m.channelSlug));
});

const sourceModels = computed(() =>
  props.mode === 'local-models' ? localModelsList.value : pulledModels.value,
);

const typeCounts = computed(() => {
  const list = sourceModels.value;
  return {
    all: list.length,
    text: list.filter((m) => modelMatchesType(m, 'text')).length,
    image: list.filter((m) => modelMatchesType(m, 'image')).length,
    video: list.filter((m) => modelMatchesType(m, 'video')).length,
  };
});

const filteredModels = computed(() => {
  const n = qName.value.trim().toLowerCase();
  const e = qExtra.value.trim().toLowerCase();
  const list = sourceModels.value.filter((m) => {
    if (!modelMatchesType(m, modelType.value)) return false;
    if (n && !`${m.label || ''} ${m.title || ''} ${m.modelId}`.toLowerCase().includes(n)) {
      return false;
    }
    if (
      e &&
      !`${m.modelId} ${m.channelSlug} ${m.channelTitle || ''} ${(m.modalities || []).join(' ')}`
        .toLowerCase()
        .includes(e)
    ) {
      return false;
    }
    return true;
  });
  if (props.mode !== 'local-models') return list;
  // 默认模型排到最前
  return [...list].sort((a, b) => {
    const da = isDefaultModel(a) ? 0 : 1;
    const db = isDefaultModel(b) ? 0 : 1;
    return da - db;
  });
});

const hubCountLabel = computed(() =>
  props.mode === 'channels' ? channels.value.length : filteredModels.value.length,
);

const localCountLabel = computed(() =>
  props.mode === 'local-channels'
    ? localChannelsList.value.length
    : localModelsList.value.length,
);

const currentDefaultLabel = computed(() => {
  if (props.mode !== 'local-models') return '';
  if (modelType.value === 'all') return '';
  const cap =
    modelType.value === 'image' ? 'image' : modelType.value === 'video' ? 'video' : 'chat';
  const field =
    cap === 'image'
      ? 'defaultImageModel'
      : cap === 'video'
        ? 'defaultVideoModel'
        : 'defaultChatModel';
  const id = String(props.settings?.[field] || '').trim();
  if (!id) return '未设置';
  const hit = localModelsList.value.find((m) => m.modelId === id);
  return hit?.label || hit?.title || id;
});

watch(
  () => [props.settings?.channelCredentials, props.settings?.localChannels],
  () => hydrateDrafts(),
  { deep: true },
);

watch(
  () => props.mode,
  async (mode) => {
    qName.value = '';
    qExtra.value = '';
    expanded.value = '';
    modelType.value = 'all';
    hydrateDrafts();
    // 进入本地模型时，用最新 Hub 缓存刷新本端快照
    if (mode === 'local-models') {
      try {
        const data = await refreshLocalModelsFromHub();
        if (data?.settings) emit('saved', data.settings);
      } catch {
        /* ignore */
      }
    }
  },
);

function ensureDraft(slug: string, hint = '') {
  if (!drafts[slug]) {
    drafts[slug] = { baseUrl: hint, apiKey: '', apiKeyMasked: '', hasKey: false, proxyUrl: '' };
  }
}

function hydrateDrafts() {
  const stored = localChannelMap.value;
  const slugs =
    props.mode === 'local-channels'
      ? Object.keys(stored)
      : channels.value.map((c) => c.slug);
  for (const slug of slugs) {
    const c = stored[slug] || {};
    const hint =
      props.mode === 'local-channels'
        ? String(c.baseUrl || '')
        : channels.value.find((x) => x.slug === slug)?.baseUrlHint || '';
    ensureDraft(slug, hint);
    drafts[slug].baseUrl = String(c.baseUrl || hint || '');
    drafts[slug].apiKey = '';
    drafts[slug].apiKeyMasked = c.apiKeyMasked || '';
    drafts[slug].hasKey = !!c.hasKey;
    drafts[slug].proxyUrl = String((c as any).proxyUrl || '');
  }
}

function channelHasKey(slug: string) {
  return !!localChannelMap.value?.[slug]?.hasKey || !!drafts[slug]?.hasKey;
}

function isPulled(slug: string) {
  return pulledSlugs.value.has(slug);
}

async function pullChannel(ch: HubChannelDto) {
  if (!ch?.slug) return;
  const wasPulled = isPulled(ch.slug);
  pullingSlug.value = ch.slug;
  try {
    const data = await pullHubChannelToLocal(ch.slug);
    emit('saved', data);
    ElMessage.success(
      wasPulled
        ? '已更新本端快照'
        : '已拉取到本端，可在「本地渠道 / 本地模型」中管理',
    );
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '拉取失败');
  } finally {
    pullingSlug.value = '';
  }
}

async function removeChannel(slug: string) {
  try {
    await ElMessageBox.confirm(
      `移除本端渠道「${slug}」及其模型快照？不影响 Hub 目录。`,
      '移除本地渠道',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  removingSlug.value = slug;
  try {
    const data = await removeLocalHubChannel(slug);
    emit('saved', data);
    if (expanded.value === slug) expanded.value = '';
    ElMessage.success('已移除');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '移除失败');
  } finally {
    removingSlug.value = '';
  }
}

function channelLogo(ch: HubChannelDto) {
  if (logoBroken[ch.slug]) return '';
  return resolveHubAssetUrl(hubOrigin.value, ch.coverUrl);
}

function modelLogo(m: HubModelDto) {
  const key = `${m.channelSlug}:${m.modelId}`;
  if (logoBroken[key]) return '';
  // 模型卡优先用自身 coverUrl，没有再回落渠道 logo
  return resolveHubAssetUrl(hubOrigin.value, m.coverUrl || m.channelLogo);
}

function onLogoError(key: string) {
  logoBroken[key] = true;
}

function displayModelChannel(m: HubModelDto) {
  const s = m.channelSlug || '';
  return s.split('-')[0] || s;
}

function apiUrl(ch: HubChannelDto) {
  return String(drafts[ch.slug]?.baseUrl || ch.baseUrlHint || '').replace(/\/$/, '');
}

function relativeDay(iso?: string) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const day = 86400000;
  if (diff < day) return '今天';
  if (diff < day * 2) return '昨天';
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;
  return new Date(iso).toLocaleDateString();
}

function modalityLabel(m: string) {
  if (m === 'text') return '文本';
  if (m === 'image') return '图片';
  if (m === 'video') return '视频';
  return m;
}

/** 当前筛选/模型对应的默认能力：chat / image / video */
function defaultCapForModel(
  m: HubModelDto,
): 'chat' | 'image' | 'video' | null {
  if (props.mode !== 'local-models') return null;
  if (modelType.value === 'text') return 'chat';
  if (modelType.value === 'image') return 'image';
  if (modelType.value === 'video') return 'video';
  // 全部：按 modalities / category 推断
  if (modelMatchesType(m, 'text')) return 'chat';
  if (modelMatchesType(m, 'image')) return 'image';
  if (modelMatchesType(m, 'video')) return 'video';
  return null;
}

function defaultFieldOf(cap: 'chat' | 'image' | 'video') {
  if (cap === 'image') return 'defaultImageModel' as const;
  if (cap === 'video') return 'defaultVideoModel' as const;
  return 'defaultChatModel' as const;
}

function isDefaultModel(m: HubModelDto) {
  if (props.mode !== 'local-models') return false;
  const id = m.modelId;
  if (!id) return false;
  // 「全部」下：任一能力的默认都算
  if (modelType.value === 'all') {
    return (
      String(props.settings?.defaultChatModel || '').trim() === id ||
      String(props.settings?.defaultImageModel || '').trim() === id ||
      String(props.settings?.defaultVideoModel || '').trim() === id
    );
  }
  const cap = defaultCapForModel(m);
  if (!cap) return false;
  const field = defaultFieldOf(cap);
  return String(props.settings?.[field] || '').trim() === id;
}

async function setAsDefault(m: HubModelDto) {
  const cap = defaultCapForModel(m);
  if (!cap || !m.modelId) return;
  if (isDefaultModel(m)) {
    ElMessage.info('已是当前默认');
    return;
  }
  settingDefaultId.value = m.modelId;
  try {
    const field = defaultFieldOf(cap);
    const { data } = await api.put('/settings', { [field]: m.modelId });
    emit('saved', data);
    ElMessage.success(
      cap === 'image' ? '已设为默认出图模型' : cap === 'video' ? '已设为默认视频模型' : '已设为默认对话模型',
    );
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '设置失败');
  } finally {
    settingDefaultId.value = '';
  }
}

function toggleExpand(slug: string) {
  ensureDraft(slug);
  expanded.value = expanded.value === slug ? '' : slug;
}

async function copyId(id: string) {
  try {
    await navigator.clipboard.writeText(id);
    ElMessage.success('已复制');
  } catch {
    ElMessage.info(id);
  }
}

async function loadHubOrigin() {
  try {
    const { data } = await api.get('/hub/config');
    hubOrigin.value = String(data?.baseUrl || data?.defaultBaseUrl || '').replace(/\/+$/, '');
  } catch {
    hubOrigin.value = '';
  }
}

async function loadCatalog() {
  await loadHubOrigin();
  if (isHubMode.value) {
    const [ch, mo] = await Promise.all([fetchChannelsCatalog(), fetchModelsCatalog()]);
    channels.value = ch.items;
    models.value = mo.items;
    Object.keys(logoBroken).forEach((k) => delete logoBroken[k]);
  }
  hydrateDrafts();
}

async function refreshLocalIfNeeded() {
  if (props.mode !== 'local-models') return;
  try {
    const data = await refreshLocalModelsFromHub();
    if (data?.settings) emit('saved', data.settings);
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  await loadCatalog();
  await refreshLocalIfNeeded();
});

async function onSync() {
  syncing.value = true;
  try {
    const res = await syncHubCatalog();
    if (res?.ok) {
      await loadCatalog();
      if (res.settings) {
        emit('saved', res.settings);
      } else {
        // 兜底：再显式刷新本地模型快照
        try {
          const data = await refreshLocalModelsFromHub();
          if (data?.settings) emit('saved', data.settings);
          else {
            const { data: settings } = await api.get('/settings');
            emit('saved', settings);
          }
        } catch {
          const { data } = await api.get('/settings');
          emit('saved', data);
        }
      }
      const n = Number(res.localModelsRefreshed) || 0;
      const pruned = Number((res as any).localChannelsPruned) || 0;
      const parts = ['已同步 Hub 目录'];
      if (n > 0) parts.push(`刷新 ${n} 个本地渠道`);
      if (pruned > 0) parts.push(`移除 ${pruned} 个已下架渠道`);
      ElMessage.success(parts.join('，'));
    } else {
      ElMessage.warning(res?.message || '同步未完成');
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '同步失败');
  } finally {
    syncing.value = false;
  }
}

async function saveHub(slug: string) {
  ensureDraft(slug);
  savingId.value = slug;
  try {
    const d = drafts[slug];
    const { data } = await api.put('/settings', {
      channelCredentials: {
        [slug]: {
          baseUrl: d.baseUrl,
          proxyUrl: d.proxyUrl ?? '',
          ...(d.apiKey ? { apiKey: d.apiKey } : {}),
        },
      },
    });
    emit('saved', data);
    d.apiKey = '';
    const c = data?.channelCredentials?.[slug] || data?.localChannels?.[slug] || {};
    d.apiKeyMasked = c.apiKeyMasked || d.apiKeyMasked;
    d.hasKey = !!c.hasKey || d.hasKey;
    d.proxyUrl = String(c.proxyUrl ?? d.proxyUrl ?? '');
    ElMessage.success('已保存');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '保存失败');
  } finally {
    savingId.value = '';
  }
}

async function testHub(slug: string) {
  ensureDraft(slug);
  testingId.value = slug;
  try {
    const d = drafts[slug];
    if (d.apiKey || d.baseUrl || d.proxyUrl !== undefined) {
      await api.put('/settings', {
        channelCredentials: {
          [slug]: {
            baseUrl: d.baseUrl,
            proxyUrl: d.proxyUrl ?? '',
            ...(d.apiKey ? { apiKey: d.apiKey } : {}),
          },
        },
      });
    }
    const { data } = await api.post(`/ai/channels/${encodeURIComponent(slug)}/test`);
    results[slug] = {
      ok: !!data?.ok,
      message: data?.message || (data?.ok ? '连接正常' : '连接失败'),
    };
  } catch (e: any) {
    results[slug] = {
      ok: false,
      message: e?.response?.data?.message || e?.message || '连接失败',
    };
  } finally {
    testingId.value = '';
  }
}
</script>

<style scoped>
.hub-dir {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dir-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pull-hub-btn {
  height: 32px;
  padding: 0 12px;
  gap: 6px;
  font-size: 13px;
  font-weight: 650;
}
.pull-hub-btn :deep(.spin) {
  animation: spin 0.8s linear infinite;
}
.dir-title {
  margin: 0;
  font-size: 20px;
  font-weight: 750;
  color: var(--ink);
  letter-spacing: -0.02em;
}
.count-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #a3a3a3;
  background: color-mix(in srgb, var(--surface, #1a1a1a) 80%, #fff 4%);
  border: 1px solid var(--line);
  cursor: pointer;
}
.count-pill.static {
  cursor: default;
}
.count-pill.static:hover {
  color: #a3a3a3;
  border-color: var(--line);
}
.count-pill:hover {
  color: var(--ink);
  border-color: #404040;
}
.icon-btn.on {
  color: #86efac;
}
.count-pill :deep(.spin) {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.type-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.default-hint {
  margin-left: 4px;
  font-size: 12px;
  color: #a3a3a3;
}
.default-btn {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.type-pill:hover {
  color: var(--ink);
  border-color: #404040;
}
.type-pill.on {
  color: var(--ink);
  background: color-mix(in srgb, #fff 8%, transparent);
  border-color: #525252;
}
.type-n {
  font-size: 11px;
  font-weight: 650;
  color: #737373;
}
.type-pill.on .type-n {
  color: #a3a3a3;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  flex: 1;
  height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface, #141414) 92%, #fff 3%);
  color: var(--muted);
}
.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}
.model-grid.channels {
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
}

.hub-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px 18px 18px;
  background: color-mix(in srgb, #161616 88%, #fff 3%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.hub-card.open {
  border-color: color-mix(in srgb, #34d399 40%, var(--line));
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.brand strong {
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.logo-wrap {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: #f4f4f5;
  border: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  overflow: hidden;
}
.logo-wrap.sm {
  width: 26px;
  height: 26px;
  border-radius: 7px;
}
.logo {
  width: 22px;
  height: 22px;
  object-fit: contain;
  display: block;
}
.logo-wrap.sm .logo {
  width: 18px;
  height: 18px;
}
.logo.ph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #166534;
  background: #dcfce7;
  text-transform: lowercase;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.key-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
  color: #a3a3a3;
  border: 1px solid var(--line);
  background: transparent;
}
.key-pill.on {
  color: #86efac;
  border-color: color-mix(in srgb, #34d399 35%, var(--line));
  background: color-mix(in srgb, #10b981 12%, transparent);
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  flex-shrink: 0;
}
.icon-btn:hover:not(:disabled) {
  color: var(--ink);
  background: color-mix(in srgb, #fff 6%, transparent);
}
.icon-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.icon-btn :deep(.spin) {
  animation: spin 0.8s linear infinite;
}
.linkish {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: #60a5fa;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.linkish:hover {
  text-decoration: underline;
}

.channel-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px 40px;
  align-items: start;
}
.channel-main {
  min-width: 0;
}
.channel-main .field {
  margin-bottom: 6px;
}
.channel-meta {
  display: grid;
  grid-template-columns: auto auto;
  gap: 12px 28px;
  align-content: start;
  flex-shrink: 0;
}
@media (max-width: 720px) {
  .channel-body {
    grid-template-columns: 1fr;
  }
}

.card-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(180px, 1fr);
  gap: 16px 28px;
  align-items: start;
}
@media (max-width: 720px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
.idx {
  font-size: 12px;
  color: #737373;
  margin-bottom: 2px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.lab {
  font-size: 11px;
  color: #737373;
  font-weight: 500;
}
.val {
  font-size: 13px;
  color: var(--ink);
  word-break: normal;
  overflow-wrap: normal;
}
.val.muted {
  color: #737373;
}
.val.ok {
  color: #4ade80;
  font-weight: 650;
}
.val.url {
  color: #4ade80;
  text-decoration: none;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  display: block;
}
.val.copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: #60a5fa;
  font-weight: 650;
}
.group-tag {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 650;
  color: #60a5fa;
}
.chip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 650;
  color: #93c5fd;
  background: color-mix(in srgb, #3b82f6 16%, transparent);
}
.chip.green {
  color: #86efac;
  background: color-mix(in srgb, #10b981 16%, transparent);
}
.mod-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}
.meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  align-content: start;
}
.meta-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 26px;
  padding: 0 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  color: var(--ink);
  background: #1c1c1c;
  border: 1px solid var(--line);
  width: fit-content;
}

.model-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.model-name {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  color: var(--ink);
  letter-spacing: -0.01em;
}

.cfg {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cfg-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cfg-row label {
  font-size: 12px;
  color: var(--muted);
}
.cfg-input {
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #0f0f0f;
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.cfg-input:focus {
  border-color: #404040;
}
.cfg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  border: 1px solid var(--line);
  background: #1a1a1a;
  color: var(--ink);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn.primary {
  border-color: transparent;
  background: #fafafa;
  color: #111;
  font-weight: 650;
}
.btn.ghost {
  background: transparent;
  color: var(--muted);
}
.btn.ghost:hover {
  color: var(--ink);
}
.result {
  margin: 0;
  font-size: 12px;
  color: #fca5a5;
}
.result.ok {
  color: #86efac;
}
</style>
