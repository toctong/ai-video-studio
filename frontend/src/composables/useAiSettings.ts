import { computed, ref } from 'vue';
import api from '@/api';
import {
  fetchModelsCatalog,
  filterHubModelsForCapability,
  type HubModelDto,
} from '@/api/hub-catalog';
import {
  inferProviderFromModel,
  type AiCapability,
  type AiModelOption,
  type AiProviderId,
} from '@/constants/ai-providers';

type AiSettingsSnapshot = {
  chatProvider: AiProviderId;
  imageProvider: AiProviderId;
  videoProvider: AiProviderId;
  defaultChatModel: string;
  defaultImageModel: string;
  defaultVideoModel: string;
  channelCredentials: Record<string, { hasKey?: boolean }>;
  localChannels: Record<string, { hasKey?: boolean }>;
};

const loaded = ref(false);
const loading = ref(false);
const hubModels = ref<HubModelDto[]>([]);
const snapshot = ref<AiSettingsSnapshot>({
  chatProvider: '',
  imageProvider: '',
  videoProvider: '',
  defaultChatModel: '',
  defaultImageModel: '',
  defaultVideoModel: '',
  channelCredentials: {},
  localChannels: {},
});

function optionsOf(cap: AiCapability): AiModelOption[] {
  const creds =
    snapshot.value.localChannels || snapshot.value.channelCredentials || {};
  const pulled = new Set(Object.keys(creds).filter(Boolean));
  // 未拉取的渠道，模型不展示
  return filterHubModelsForCapability(
    hubModels.value.filter((m) => pulled.has(m.channelSlug)),
    cap,
  );
}

function pickRecommended(items: AiModelOption[]): string {
  const hit = items.find((m) => m.recommended) || items[0];
  return hit?.value || '';
}

export async function ensureAiSettings(force = false) {
  if (loaded.value && !force) return snapshot.value;
  if (loading.value) {
    while (loading.value) {
      await new Promise((r) => setTimeout(r, 40));
    }
    return snapshot.value;
  }
  loading.value = true;
  try {
    const [{ data }, catalog] = await Promise.all([
      api.get('/settings'),
      fetchModelsCatalog(),
    ]);
    hubModels.value = catalog.items || [];
    const channelCredentials = (data?.channelCredentials || {}) as Record<
      string,
      { hasKey?: boolean }
    >;
    const localChannels = (data?.localChannels || channelCredentials) as Record<
      string,
      { hasKey?: boolean }
    >;
    snapshot.value = {
      chatProvider: String(data?.chatProvider || '').trim(),
      imageProvider: String(data?.imageProvider || '').trim(),
      videoProvider: String(data?.videoProvider || '').trim(),
      defaultChatModel: String(data?.defaultChatModel || '').trim(),
      defaultImageModel: String(data?.defaultImageModel || '').trim(),
      defaultVideoModel: String(data?.defaultVideoModel || '').trim(),
      channelCredentials,
      localChannels,
    };

    if (!snapshot.value.defaultChatModel) {
      snapshot.value.defaultChatModel = pickRecommended(optionsOf('chat'));
    }
    if (!snapshot.value.defaultImageModel) {
      snapshot.value.defaultImageModel = pickRecommended(optionsOf('image'));
    }
    if (!snapshot.value.defaultVideoModel) {
      snapshot.value.defaultVideoModel = pickRecommended(optionsOf('video'));
    }
    loaded.value = true;
  } catch {
    /* keep defaults */
  } finally {
    loading.value = false;
  }
  return snapshot.value;
}

export function useAiSettings() {
  const settings = computed(() => snapshot.value);

  function providerOf(cap: AiCapability): AiProviderId {
    if (cap === 'image') return snapshot.value.imageProvider || '';
    if (cap === 'video') return snapshot.value.videoProvider || '';
    return snapshot.value.chatProvider || '';
  }

  function defaultOf(cap: AiCapability): string {
    if (cap === 'image') return snapshot.value.defaultImageModel;
    if (cap === 'video') return snapshot.value.defaultVideoModel;
    return snapshot.value.defaultChatModel;
  }

  return {
    settings,
    ensure: ensureAiSettings,
    ensureAiSettings,
    providerOf,
    defaultOf,
    pickDefault: defaultOf,
    optionsOf,
    modelsOf: optionsOf,
    inferProviderFromModel,
    hubModels: computed(() => hubModels.value),
  };
}
