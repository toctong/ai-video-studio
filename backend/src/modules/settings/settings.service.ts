import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import {
  AI_PROVIDER_IDS,
  AI_PROVIDER_META,
  LEGACY_DEFAULT_CHAT_MODELS,
  LEGACY_DEFAULT_IMAGE_MODELS,
  LEGACY_DEFAULT_VIDEO_MODELS,
  VOLCENGINE_ARK_BASE,
  type AiProviderId,
  defaultModelFor,
  defaultProviderFor,
  inferProviderFromModel,
  looksLikeVolcArkApiKey,
  normalizeProviderId,
} from '@ai-video-studio/shared';
import { resolveSecret } from '../../config/env';
import { FILE_OSS_EMPTY } from '../../config/file-oss.hardcode';
import { AppSetting } from '../../entities/app-setting.entity';
import { JobConcurrencyNotifier } from './job-concurrency.notifier';

export type ProviderCredential = {
  baseUrl: string;
  apiKey: string;
  /** 可选：该渠道出站代理，如 http://127.0.0.1:7890（仅该渠道生效） */
  proxyUrl?: string;
};

/** 本端已拉取的 Hub 渠道（凭证 + 目录快照，落后端） */
export type LocalChannelRecord = ProviderCredential & {
  title?: string;
  coverUrl?: string | null;
  website?: string;
  endpointType?: string;
  apiStyle?: string;
  /** Hub：接在 baseUrl 后，如 /api/v3 */
  apiPrefix?: string;
  paths?: Record<string, string>;
  /** 最近一次从 Hub 同步到的 baseUrlHint，用于判断用户是否手改过 baseUrl */
  hubBaseUrlHint?: string;
  group?: string;
  category?: string;
  modelCount?: number;
  sort?: number;
  official?: boolean;
  pulledAt?: string;
};

export type LocalChannelPublic = {
  baseUrl: string;
  apiKey: string;
  apiKeyMasked: string;
  hasKey: boolean;
  /** 明文返回：代理地址不算密钥 */
  proxyUrl?: string;
  title?: string;
  coverUrl?: string | null;
  website?: string;
  endpointType?: string;
  apiStyle?: string;
  group?: string;
  category?: string;
  modelCount?: number;
  sort?: number;
  official?: boolean;
  pulledAt?: string;
};

/** 本端已拉取渠道下的模型快照 */
export type LocalModelRecord = {
  modelId: string;
  channelSlug: string;
  slug?: string;
  title?: string;
  label?: string;
  channelTitle?: string;
  channelLogo?: string | null;
  coverUrl?: string | null;
  category?: string;
  endpointType?: string;
  baseUrlHint?: string;
  apiPrefix?: string;
  apiStyle?: string;
  paths?: Record<string, string>;
  callPath?: string;
  endpointUrlHint?: string;
  modalities?: string[];
  enabled?: boolean;
  recommended?: boolean;
  contextWindow?: number | string | null;
  updatedAt?: string;
  pulledAt?: string;
};

export type ProviderCredentialPublic = {
  baseUrl: string;
  apiKey: string;
  apiKeyMasked: string;
  hasKey: boolean;
};

export type FileOssConfig = {
  /** 公网读地址（拼永久直链） */
  baseUrl: string;
  /**
   * S3 API Endpoint；空则与 baseUrl 相同。
   * 公网反代导致 SignatureDoesNotMatch 时可填内网如 http://ip:9000
   */
  apiEndpoint: string;
  bucket: string;
  keyPrefix: string;
  accessKeyId: string;
  accessKeySecret: string;
};

export type FileOssPublic = {
  baseUrl: string;
  apiEndpoint: string;
  bucket: string;
  keyPrefix: string;
  accessKeyIdMasked: string;
  accessKeySecretMasked: string;
  hasAccessKeyId: boolean;
  hasAccessKeySecret: boolean;
  /** 是否已配齐，可正常使用系统 */
  configured: boolean;
};

export type SystemSettings = {
  chatProvider: AiProviderId;
  imageProvider: AiProviderId;
  videoProvider: AiProviderId;
  providerCredentials: Record<AiProviderId, ProviderCredential>;
  /** Hub 渠道凭证，按 channelSlug 存（含本端拉取快照） */
  channelCredentials: Record<string, LocalChannelRecord>;
  /** 已拉取渠道对应的模型快照 */
  localModels: LocalModelRecord[];
  defaultChatModel: string;
  defaultImageModel: string;
  defaultVideoModel: string;
  defaultTtsModel: string;
  defaultMusicModel: string;
  jobConcurrency: number;
  fileOss: FileOssConfig;
};

export type PublicSettings = Omit<
  SystemSettings,
  'providerCredentials' | 'channelCredentials' | 'fileOss' | 'localModels'
> & {
  providerCredentials: Record<AiProviderId, ProviderCredentialPublic>;
  channelCredentials: Record<string, LocalChannelPublic>;
  /** 同 channelCredentials，语义更清晰给前端本地 Tab 用 */
  localChannels: Record<string, LocalChannelPublic>;
  localModels: LocalModelRecord[];
  fileOss: FileOssPublic;
};

function emptyCreds(): Record<AiProviderId, ProviderCredential> {
  const out = {} as Record<AiProviderId, ProviderCredential>;
  for (const meta of AI_PROVIDER_META) {
    out[meta.id] = { baseUrl: meta.defaultBaseUrl, apiKey: '' };
  }
  return out;
}

const DEFAULTS: SystemSettings = {
  chatProvider: 'volcengine',
  imageProvider: 'volcengine',
  videoProvider: 'volcengine',
  providerCredentials: emptyCreds(),
  channelCredentials: {},
  localModels: [],
  defaultChatModel: '',
  defaultImageModel: '',
  defaultVideoModel: '',
  defaultTtsModel: 'tts-1-hd',
  defaultMusicModel: 'suno-v4',
  jobConcurrency: 8,
  fileOss: { ...FILE_OSS_EMPTY },
};

const BUILTIN_VOLC_CHANNEL: LocalChannelRecord = {
  title: '火山方舟',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: '',
  proxyUrl: undefined,
  apiStyle: 'ark',
  apiPrefix: '/api/v3',
  paths: {
    text: '/chat/completions',
    image: '/images/generations',
    video: '/contents/generations/tasks',
    models: '/models',
  },
  group: '内置渠道',
  category: 'volcengine',
  official: true,
  modelCount: 3,
  sort: 0,
};

const BUILTIN_VOLC_MODELS: LocalModelRecord[] = [
  {
    modelId: 'doubao-seed-1-6-250615',
    channelSlug: 'volcengine',
    title: 'Doubao Seed 1.6',
    label: 'Doubao Seed 1.6',
    channelTitle: '火山方舟',
    modalities: ['text'],
    enabled: true,
    recommended: true,
  },
  {
    modelId: 'doubao-seedream-5-0-pro-260628',
    channelSlug: 'volcengine',
    title: 'Seedream 5.0 Pro',
    label: 'Seedream 5.0 Pro',
    channelTitle: '火山方舟',
    modalities: ['image'],
    enabled: true,
    recommended: true,
  },
  {
    modelId: 'doubao-seedance-2-0-260128',
    channelSlug: 'volcengine',
    title: 'Seedance 2.0',
    label: 'Seedance 2.0',
    channelTitle: '火山方舟',
    modalities: ['video'],
    enabled: true,
    recommended: true,
  },
];

function maskKey(key: string) {
  if (!key) return '';
  if (key.length > 8) return `${key.slice(0, 4)}****${key.slice(-4)}`;
  return '****';
}

function asProviderId(v: string | undefined, fallback: AiProviderId = 'volcengine'): AiProviderId {
  const n = normalizeProviderId(v || fallback);
  if ((AI_PROVIDER_IDS as readonly string[]).includes(n)) return n;
  return fallback;
}

/** Hub 约定 baseUrlHint 常为纯主机；拼接 apiPrefix（默认 /api/v3） */
function normalizeVolcBaseForSettings(raw: string, apiPrefix = '/api/v3'): string {
  let b = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  const prefix = String(apiPrefix || '/api/v3').trim() || '/api/v3';
  const p = prefix.startsWith('/') ? prefix : `/${prefix}`;
  if (!b) return VOLCENGINE_ARK_BASE;
  if (!/volces\.com|ark\.cn-beijing|ark\./i.test(b)) return b;
  if (b.endsWith(p) || /\/api\/v\d+$/i.test(b)) return b;
  try {
    const u = new URL(b);
    if (!u.pathname || u.pathname === '/') return `${u.origin}${p}`;
  } catch {
    /* ignore */
  }
  return `${b}${p}`;
}

function isKnownChatModel(model: string) {
  const m = String(model || '').trim();
  return /doubao-seed|deepseek-v4-|ep-|gpt-|claude|o1|o3|o4/i.test(m);
}

function isKnownImageModel(model: string) {
  const m = String(model || '').trim();
  return /seedream|ep-|gpt-image|chatgpt-image|dall-e|flux|kolors/i.test(m);
}

function isKnownVideoModel(model: string) {
  const m = String(model || '').trim();
  return /seedance|ep-|sora|veo|kling/i.test(m);
}

@Injectable()
export class SettingsService {
  private readonly secret = createHash('sha256')
    .update(resolveSecret('SETTINGS_SECRET'))
    .digest();
  private migrated = false;

  constructor(
    @InjectRepository(AppSetting) private readonly repo: Repository<AppSetting>,
    private readonly jobConcurrencyNotifier: JobConcurrencyNotifier,
  ) {}

  private encrypt(plain: string) {
    if (!plain) return '';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.secret, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  private decrypt(raw?: string | null) {
    const s = String(raw || '');
    if (!s) return '';
    if (!s.startsWith('v1:')) return s;
    try {
      const [, ivB64, tagB64, dataB64] = s.split(':');
      const decipher = createDecipheriv('aes-256-gcm', this.secret, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return '';
    }
  }

  private async getRaw(key: string) {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? '';
  }

  private async setRaw(key: string, value: string) {
    let row = await this.repo.findOne({ where: { key } });
    if (!row) row = this.repo.create({ key, value });
    else row.value = value;
    await this.repo.save(row);
  }

  private async ensureMigrated() {
    if (this.migrated) return;
    this.migrated = true;

    const creds = await this.loadCredentials();
    await this.persistCredentials(creds);

    // 环境变量迁入设置：库内为空时每次启动都可补齐（便于后接 MinIO）
    const envId = String(process.env.FILE_OSS_ACCESS_KEY_ID || '').trim();
    const envSecret = String(process.env.FILE_OSS_ACCESS_KEY_SECRET || '').trim();
    const envBucket = String(process.env.FILE_OSS_BUCKET || '').trim();
    const envBase = String(process.env.FILE_OSS_BASE_URL || '').trim();
    const envApi = String(process.env.FILE_OSS_API_ENDPOINT || '').trim();
    const envPrefix = String(process.env.FILE_OSS_KEY_PREFIX || '').trim();
    if (envBase && !(await this.getRaw('fileOssBaseUrl'))) {
      await this.setRaw('fileOssBaseUrl', envBase.replace(/\/+$/, ''));
    }
    if (envApi && !(await this.getRaw('fileOssApiEndpoint'))) {
      await this.setRaw('fileOssApiEndpoint', envApi.replace(/\/+$/, ''));
    }
    if (envBucket && !(await this.getRaw('fileOssBucket'))) {
      await this.setRaw('fileOssBucket', envBucket);
    }
    if (envPrefix && !(await this.getRaw('fileOssKeyPrefix'))) {
      await this.setRaw('fileOssKeyPrefix', envPrefix);
    }
    if (envId && !(await this.getRaw('fileOssAccessKeyId'))) {
      await this.setRaw('fileOssAccessKeyId', this.encrypt(envId));
    }
    if (envSecret && !(await this.getRaw('fileOssAccessKeySecret'))) {
      await this.setRaw('fileOssAccessKeySecret', this.encrypt(envSecret));
    }
    if (!(await this.getRaw('fileOssMigratedFromEnv'))) {
      await this.setRaw('fileOssMigratedFromEnv', '1');
    }

    // 旧内置 FileOSS 域名作废：改由 FILE_OSS_BASE_URL / 设置页配置（不再写入任何内置地址）
    if (!(await this.getRaw('fileOssMinioEndpointMigrated'))) {
      const cur = String((await this.getRaw('fileOssBaseUrl')) || '').replace(/\/+$/, '');
      if (cur && /ai-file-oss|file-oss\.iepose/i.test(cur)) {
        const envBase = String(process.env.FILE_OSS_BASE_URL || '')
          .trim()
          .replace(/\/+$/, '');
        await this.setRaw('fileOssBaseUrl', envBase);
      }
      await this.setRaw('fileOssMinioEndpointMigrated', '1');
    }

    // 内置仅火山；OpenAI 兼容能力走 Hub 渠道
    if (!(await this.getRaw('chatProvider')) || (await this.getRaw('chatProvider')) === 'openaiHk') {
      await this.setRaw('chatProvider', 'volcengine');
    }
    if (!(await this.getRaw('imageProvider')) || (await this.getRaw('imageProvider')) === 'openaiHk') {
      await this.setRaw('imageProvider', 'volcengine');
    }
    if (!(await this.getRaw('videoProvider')) || (await this.getRaw('videoProvider')) === 'openaiHk') {
      await this.setRaw('videoProvider', 'volcengine');
    }
    if (!(await this.getRaw('removedBuiltinOpenaiHk'))) {
      await this.setRaw('removedBuiltinOpenaiHk', '1');
    }

    const chatModel = await this.getRaw('defaultChatModel');
    const legacyChat = LEGACY_DEFAULT_CHAT_MODELS as readonly string[];
    if (!chatModel || (legacyChat.includes(chatModel) && !(await this.getRaw('migratedToVolcChat')))) {
      if (!(await this.getRaw('migratedToVolcChat'))) {
        await this.setRaw('defaultChatModel', defaultModelFor('chat', 'volcengine'));
        await this.setRaw('chatProvider', 'volcengine');
        await this.setRaw('migratedToVolcChat', '1');
      } else if (!chatModel) {
        await this.setRaw('defaultChatModel', defaultModelFor('chat', 'volcengine'));
      }
    } else if (chatModel && !isKnownChatModel(chatModel)) {
      await this.setRaw('defaultChatModel', defaultModelFor('chat', 'volcengine'));
      await this.setRaw('chatProvider', 'volcengine');
    }

    // 默认对话迁到 DeepSeek-V4-pro
    if (!(await this.getRaw('migratedToDeepSeekV4Pro'))) {
      await this.setRaw('defaultChatModel', defaultModelFor('chat', 'volcengine'));
      await this.setRaw('chatProvider', 'volcengine');
      await this.setRaw('migratedToDeepSeekV4Pro', '1');
    }

    const imageModel = await this.getRaw('defaultImageModel');
    const legacyImage = LEGACY_DEFAULT_IMAGE_MODELS as readonly string[];
    if (!imageModel || !isKnownImageModel(imageModel) || legacyImage.includes(imageModel)) {
      await this.setRaw('defaultImageModel', defaultModelFor('image', 'volcengine'));
      await this.setRaw('imageProvider', 'volcengine');
    }

    // 默认出图迁到 Seedream 5.0 Pro
    if (!(await this.getRaw('migratedToSeedream50ProDefault'))) {
      await this.setRaw('defaultImageModel', defaultModelFor('image', 'volcengine'));
      await this.setRaw('imageProvider', 'volcengine');
      await this.setRaw('migratedToSeedream50ProDefault', '1');
      await this.setRaw('migratedToVolcImage', '1');
      await this.setRaw('migratedToSeedream50Pro', '1');
      await this.setRaw('migratedToGptImage2', '1');
    }

    const videoModel = await this.getRaw('defaultVideoModel');
    const legacyVideo = LEGACY_DEFAULT_VIDEO_MODELS as readonly string[];
    if (!videoModel || legacyVideo.includes(videoModel) || !isKnownVideoModel(videoModel)) {
      if (!(await this.getRaw('migratedToVolcVideo'))) {
        await this.setRaw('defaultVideoModel', defaultModelFor('video', 'volcengine'));
        await this.setRaw('videoProvider', 'volcengine');
        await this.setRaw('migratedToVolcVideo', '1');
      } else if (!videoModel) {
        await this.setRaw('defaultVideoModel', defaultModelFor('video', 'volcengine'));
      }
    }

    // 确保 imageProvider 与模型一致
    const finalImage = (await this.getRaw('defaultImageModel')) || defaultModelFor('image', 'volcengine');
    const imgProv =
      (await this.getRaw('imageProvider')) ||
      inferProviderFromModel('image', finalImage) ||
      defaultProviderFor('image');
    await this.setRaw('imageProvider', asProviderId(imgProv, 'volcengine'));
  }

  private async loadCredentials(): Promise<Record<AiProviderId, ProviderCredential>> {
    const base = emptyCreds();
    const raw = await this.getRaw('providerCredentials');

    let parsed: Record<string, { baseUrl?: string; apiKey?: string }> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
    }

    for (const meta of AI_PROVIDER_META) {
      const row = parsed[meta.id] || {};
      let baseUrl = String(row.baseUrl || meta.defaultBaseUrl || '').replace(/\/$/, '');
      let apiKey = this.decrypt(row.apiKey || '');

      if (meta.id === 'volcengine') {
        if (!apiKey) {
          const maybe = this.decrypt(parsed.volcengine?.apiKey || '');
          apiKey = maybe;
        }
        // 误存的加密串 / 非方舟 Key 会导致方舟直接报 key format
        if (apiKey && !looksLikeVolcArkApiKey(apiKey)) {
          apiKey = '';
        }
        if (!baseUrl || /openai-hk/i.test(baseUrl)) baseUrl = VOLCENGINE_ARK_BASE;
      }

      base[meta.id] = { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
    }

    return base;
  }

  private async persistCredentials(creds: Record<AiProviderId, ProviderCredential>) {
    const serializable: Record<string, { baseUrl: string; apiKey: string }> = {};
    for (const id of AI_PROVIDER_IDS) {
      serializable[id] = {
        baseUrl: creds[id].baseUrl.replace(/\/$/, ''),
        apiKey: creds[id].apiKey ? this.encrypt(creds[id].apiKey) : '',
      };
    }
    await this.setRaw('providerCredentials', JSON.stringify(serializable));
  }

  private async loadChannelCredentials(): Promise<Record<string, LocalChannelRecord>> {
    const raw = await this.getRaw('channelCredentials');
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      const out: Record<string, LocalChannelRecord> = {};
      for (const [slug, row] of Object.entries(parsed || {})) {
        const key = String(slug || '').trim();
        if (!key || !row) continue;
        out[key] = {
          baseUrl: String(row.baseUrl || '').replace(/\/$/, ''),
          apiKey: this.decrypt(String(row.apiKey || '')),
          proxyUrl: String(row.proxyUrl || '').trim() || undefined,
          title: row.title != null ? String(row.title) : undefined,
          coverUrl: row.coverUrl != null ? String(row.coverUrl) : null,
          website: row.website != null ? String(row.website) : undefined,
          endpointType: row.endpointType != null ? String(row.endpointType) : undefined,
          apiStyle: row.apiStyle != null ? String(row.apiStyle) : undefined,
          apiPrefix: row.apiPrefix != null ? String(row.apiPrefix) : undefined,
          paths:
            row.paths && typeof row.paths === 'object'
              ? (row.paths as Record<string, string>)
              : undefined,
          hubBaseUrlHint:
            row.hubBaseUrlHint != null ? String(row.hubBaseUrlHint).replace(/\/$/, '') : undefined,
          group: row.group != null ? String(row.group) : undefined,
          category: row.category != null ? String(row.category) : undefined,
          modelCount: Number(row.modelCount) || 0,
          sort: Number(row.sort) || 0,
          official: !!row.official,
          pulledAt: row.pulledAt != null ? String(row.pulledAt) : undefined,
        };
      }
      return out;
    } catch {
      return {};
    }
  }

  private async persistChannelCredentials(creds: Record<string, LocalChannelRecord>) {
    const serializable: Record<string, Record<string, unknown>> = {};
    for (const [slug, row] of Object.entries(creds)) {
      const key = String(slug || '').trim();
      if (!key || !row) continue;
      serializable[key] = {
        baseUrl: String(row.baseUrl || '').replace(/\/$/, ''),
        apiKey: row.apiKey ? this.encrypt(row.apiKey) : '',
        proxyUrl: String(row.proxyUrl || '').trim(),
        title: row.title || '',
        coverUrl: row.coverUrl || '',
        website: row.website || '',
        endpointType: row.endpointType || '',
        apiStyle: row.apiStyle || '',
        apiPrefix: row.apiPrefix || '',
        paths: row.paths && typeof row.paths === 'object' ? row.paths : undefined,
        hubBaseUrlHint: row.hubBaseUrlHint || '',
        group: row.group || '',
        category: row.category || '',
        modelCount: Number(row.modelCount) || 0,
        sort: Number(row.sort) || 0,
        official: !!row.official,
        pulledAt: row.pulledAt || '',
      };
    }
    await this.setRaw('channelCredentials', JSON.stringify(serializable));
  }

  private async loadLocalModels(): Promise<LocalModelRecord[]> {
    const raw = await this.getRaw('hub.local.models');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as LocalModelRecord[]) : [];
    } catch {
      return [];
    }
  }

  private async persistLocalModels(items: LocalModelRecord[]) {
    await this.setRaw('hub.local.models', JSON.stringify(items || []));
  }

  private toPublicChannel(c: LocalChannelRecord): LocalChannelPublic {
    return {
      baseUrl: c.baseUrl || '',
      apiKey: '',
      apiKeyMasked: maskKey(c.apiKey),
      hasKey: !!c.apiKey,
      proxyUrl: c.proxyUrl || '',
      title: c.title,
      coverUrl: c.coverUrl,
      website: c.website,
      endpointType: c.endpointType,
      apiStyle: c.apiStyle,
      group: c.group,
      category: c.category,
      modelCount: c.modelCount,
      sort: c.sort,
      official: c.official,
      pulledAt: c.pulledAt,
    };
  }

  /**
   * 从 Hub 目录拉取渠道到本端：写入渠道快照 + 该渠道模型快照（均落后端）。
   */
  async pullHubChannel(
    channel: {
      slug: string;
      title?: string;
      coverUrl?: string | null;
      website?: string;
      endpointType?: string;
      apiStyle?: string;
      apiPrefix?: string;
      paths?: Record<string, string>;
      group?: string;
      category?: string;
      modelCount?: number;
      sort?: number;
      official?: boolean;
      baseUrlHint?: string;
    },
    models: LocalModelRecord[],
  ) {
    const slug = String(channel.slug || '').trim();
    if (!slug) throw new Error('渠道 slug 无效');
    const creds = await this.loadChannelCredentials();
    const prev = creds[slug] || { baseUrl: '', apiKey: '' };
    const now = new Date().toISOString();
    const hubBase = String(channel.baseUrlHint || '').replace(/\/$/, '');
    const prevBase = String(prev.baseUrl || '').replace(/\/$/, '');
    const prevHubHint = String(prev.hubBaseUrlHint || '').replace(/\/$/, '');
    // 仅当用户手改过 baseUrl（与上次 Hub 提示不同）时保留；否则跟 Hub 最新地址
    const userOverrodeBase =
      !!prevBase &&
      !!prevHubHint &&
      prevBase !== prevHubHint &&
      !/openai-hk|api\.openai-hk/i.test(prevBase);
    const nextBase = userOverrodeBase ? prevBase : hubBase || prevBase;
    creds[slug] = {
      ...prev,
      baseUrl: nextBase,
      hubBaseUrlHint: hubBase || prevHubHint || undefined,
      title: channel.title || prev.title || slug,
      coverUrl: channel.coverUrl ?? prev.coverUrl ?? null,
      website: channel.website || prev.website,
      endpointType: channel.endpointType || prev.endpointType,
      apiStyle: channel.apiStyle || prev.apiStyle,
      apiPrefix: channel.apiPrefix || prev.apiPrefix,
      paths: channel.paths || prev.paths,
      group: channel.group || prev.group,
      category: channel.category || prev.category,
      modelCount: Number(channel.modelCount ?? models.length) || 0,
      sort: channel.sort !== undefined ? Number(channel.sort) || 0 : prev.sort || 0,
      official: channel.official ?? prev.official,
      pulledAt: now,
    };
    await this.persistChannelCredentials(creds);

    const others = (await this.loadLocalModels()).filter((m) => m.channelSlug !== slug);
    const pulledModels = models
      .filter((m) => m.modelId && m.channelSlug === slug)
      .map((m) => ({ ...m, pulledAt: now }));
    await this.persistLocalModels([...others, ...pulledModels]);
    return this.getPublic();
  }

  async getFileOssConfig(): Promise<FileOssConfig> {
    await this.ensureMigrated();
    const envBase = String(process.env.FILE_OSS_BASE_URL || '').trim();
    const envApi = String(process.env.FILE_OSS_API_ENDPOINT || '').trim();
    const envBucket = String(process.env.FILE_OSS_BUCKET || '').trim();
    const envPrefix = String(process.env.FILE_OSS_KEY_PREFIX || '').trim();
    const envId = String(process.env.FILE_OSS_ACCESS_KEY_ID || '').trim();
    const envSecret = String(process.env.FILE_OSS_ACCESS_KEY_SECRET || '').trim();

    const baseUrl = String((await this.getRaw('fileOssBaseUrl')) || envBase || '')
      .trim()
      .replace(/\/+$/, '');
    const apiEndpoint = String((await this.getRaw('fileOssApiEndpoint')) || envApi || '')
      .trim()
      .replace(/\/+$/, '');
    const bucket = String((await this.getRaw('fileOssBucket')) || envBucket || '').trim();
    const keyPrefix = String(
      (await this.getRaw('fileOssKeyPrefix')) || envPrefix || FILE_OSS_EMPTY.keyPrefix,
    )
      .trim()
      .replace(/^\/+|\/+$/g, '');
    const accessKeyId =
      this.decrypt(await this.getRaw('fileOssAccessKeyId')) || envId || '';
    const accessKeySecret =
      this.decrypt(await this.getRaw('fileOssAccessKeySecret')) || envSecret || '';

    return {
      baseUrl,
      apiEndpoint,
      bucket,
      keyPrefix,
      accessKeyId,
      accessKeySecret,
    };
  }

  async upsertLocalModel(input: Partial<LocalModelRecord> & { modelId: string; channelSlug: string }) {
    const modelId = String(input.modelId || '').trim();
    const channelSlug = String(input.channelSlug || '').trim();
    if (!modelId || !channelSlug) {
      throw new Error('modelId 与 channelSlug 必填');
    }
    const models = await this.loadLocalModels();
    const idx = models.findIndex(
      (m) => m.modelId === modelId && m.channelSlug === channelSlug,
    );
    const next: LocalModelRecord = {
      ...(idx >= 0 ? models[idx] : {}),
      ...input,
      modelId,
      channelSlug,
      title: String(input.title || input.label || modelId).trim(),
      label: String(input.label || input.title || modelId).trim(),
      modalities: Array.isArray(input.modalities) ? input.modalities : ['text'],
      enabled: input.enabled !== false,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) models[idx] = next;
    else models.push(next);
    await this.persistLocalModels(models);
    return this.getPublic();
  }

  async removeLocalModel(modelId: string, channelSlug?: string) {
    const id = String(modelId || '').trim();
    if (!id) return this.getPublic();
    const slug = String(channelSlug || '').trim();
    const models = (await this.loadLocalModels()).filter((m) => {
      if (m.modelId !== id) return true;
      if (slug && m.channelSlug !== slug) return true;
      return false;
    });
    await this.persistLocalModels(models);
    return this.getPublic();
  }

  async findLocalModel(modelIdOrSlug: string): Promise<LocalModelRecord | null> {
    const key = String(modelIdOrSlug || '').trim();
    if (!key) return null;
    const internal = await this.getInternal();
    return (
      (internal.localModels || []).find(
        (m) => String(m.modelId || '') === key || String(m.slug || '') === key,
      ) || null
    );
  }

  async findLocalChannel(slug: string): Promise<(LocalChannelRecord & { slug: string }) | null> {
    const key = String(slug || '').trim();
    if (!key) return null;
    const internal = await this.getInternal();
    const local = internal.channelCredentials?.[key];
    if (!local) return null;
    return { ...local, slug: key };
  }

  private toPublicFileOss(c: FileOssConfig): FileOssPublic {
    const diskFallback = c.bucket === 'local' && !c.accessKeyId;
    const configured = diskFallback
      ? true
      : Boolean(c.baseUrl && c.bucket && c.accessKeyId && c.accessKeySecret);
    return {
      baseUrl: c.baseUrl,
      apiEndpoint: c.apiEndpoint || '',
      bucket: c.bucket,
      keyPrefix: c.keyPrefix,
      accessKeyIdMasked: maskKey(c.accessKeyId),
      accessKeySecretMasked: maskKey(c.accessKeySecret),
      hasAccessKeyId: !!c.accessKeyId,
      hasAccessKeySecret: !!c.accessKeySecret,
      configured,
    };
  }

  async getInternal(): Promise<SystemSettings> {
    await this.ensureMigrated();
    const providerCredentials = await this.loadCredentials();
    const storedChannels = await this.loadChannelCredentials();
    const channelCredentials = {
      ...(storedChannels.volcengine
        ? {}
        : { volcengine: { ...BUILTIN_VOLC_CHANNEL } }),
      ...storedChannels,
    };
    const storedModels = await this.loadLocalModels();
    const storedIds = new Set(storedModels.map((m) => `${m.channelSlug}:${m.modelId}`));
    const localModels = [
      ...BUILTIN_VOLC_MODELS.filter((m) => !storedIds.has(`${m.channelSlug}:${m.modelId}`)),
      ...storedModels,
    ];
    const chatProvider = asProviderId(await this.getRaw('chatProvider'), 'volcengine');
    const imageProvider = asProviderId(await this.getRaw('imageProvider'), 'volcengine');
    const videoProvider = asProviderId(await this.getRaw('videoProvider'), 'volcengine');
    const fileOss = await this.getFileOssConfig();

    return {
      chatProvider,
      imageProvider,
      videoProvider,
      providerCredentials,
      channelCredentials,
      localModels,
      defaultChatModel:
        (await this.getRaw('defaultChatModel')) || BUILTIN_VOLC_MODELS[0].modelId,
      defaultImageModel:
        (await this.getRaw('defaultImageModel')) || BUILTIN_VOLC_MODELS[1].modelId,
      defaultVideoModel:
        (await this.getRaw('defaultVideoModel')) || BUILTIN_VOLC_MODELS[2].modelId,
      defaultTtsModel: (await this.getRaw('defaultTtsModel')) || DEFAULTS.defaultTtsModel,
      defaultMusicModel: (await this.getRaw('defaultMusicModel')) || DEFAULTS.defaultMusicModel,
      jobConcurrency: Number((await this.getRaw('jobConcurrency')) || DEFAULTS.jobConcurrency),
      fileOss,
    };
  }

  async get() {
    return this.getPublic();
  }

  async getPublic(): Promise<PublicSettings> {
    const s = await this.getInternal();
    const providerCredentials = {} as Record<AiProviderId, ProviderCredentialPublic>;
    for (const id of AI_PROVIDER_IDS) {
      const c = s.providerCredentials[id];
      providerCredentials[id] = {
        baseUrl: c.baseUrl,
        apiKey: '',
        apiKeyMasked: maskKey(c.apiKey),
        hasKey: !!c.apiKey,
      };
    }
    const channelCredentials: Record<string, LocalChannelPublic> = {};
    for (const [slug, c] of Object.entries(s.channelCredentials || {})) {
      channelCredentials[slug] = this.toPublicChannel(c);
    }
    return {
      chatProvider: s.chatProvider,
      imageProvider: s.imageProvider,
      videoProvider: s.videoProvider,
      providerCredentials,
      channelCredentials,
      localChannels: channelCredentials,
      localModels: s.localModels || [],
      defaultChatModel: s.defaultChatModel,
      defaultImageModel: s.defaultImageModel,
      defaultVideoModel: s.defaultVideoModel,
      defaultTtsModel: s.defaultTtsModel,
      defaultMusicModel: s.defaultMusicModel,
      jobConcurrency: s.jobConcurrency,
      fileOss: this.toPublicFileOss(s.fileOss),
    };
  }

  async removeLocalChannel(slug: string) {
    const key = String(slug || '').trim();
    if (!key) return this.getPublic();
    const creds = await this.loadChannelCredentials();
    delete creds[key];
    await this.persistChannelCredentials(creds);
    const models = (await this.loadLocalModels()).filter((m) => m.channelSlug !== key);
    await this.persistLocalModels(models);
    return this.getPublic();
  }

  async update(
    partial: Partial<{
      chatProvider: AiProviderId;
      imageProvider: AiProviderId;
      videoProvider: AiProviderId;
      providerCredentials: Partial<
        Record<AiProviderId | string, { baseUrl?: string; apiKey?: string }>
      >;
      channelCredentials: Partial<
        Record<string, Partial<LocalChannelRecord>>
      >;
      defaultChatModel: string;
      defaultImageModel: string;
      defaultVideoModel: string;
      defaultTtsModel: string;
      defaultMusicModel: string;
      jobConcurrency: number;
      fileOss: Partial<{
        baseUrl: string;
        apiEndpoint: string;
        bucket: string;
        keyPrefix: string;
        accessKeyId: string;
        accessKeySecret: string;
      }>;
    }>,
  ) {
    await this.ensureMigrated();
    const creds = await this.loadCredentials();
    const channelCreds = await this.loadChannelCredentials();

    if (partial.providerCredentials) {
      for (const [rawId, row] of Object.entries(partial.providerCredentials)) {
        const id = asProviderId(rawId, 'volcengine');
        if (!row || !creds[id]) continue;
        if (row.baseUrl !== undefined) {
          let url = row.baseUrl.replace(/\/$/, '');
          if (id === 'volcengine' && (!url || /openai-hk/i.test(url))) url = VOLCENGINE_ARK_BASE;
          creds[id].baseUrl = url || AI_PROVIDER_META.find((m) => m.id === id)!.defaultBaseUrl;
        }
        if (row.apiKey) creds[id].apiKey = row.apiKey;
      }
    }

    if (partial.channelCredentials) {
      for (const [rawSlug, row] of Object.entries(partial.channelCredentials)) {
        const slug = String(rawSlug || '').trim();
        if (!slug || !row) continue;
        const prev = channelCreds[slug] || { baseUrl: '', apiKey: '' };
        if (row.baseUrl !== undefined) {
          prev.baseUrl = String(row.baseUrl || '').replace(/\/$/, '');
        }
        if (row.apiKey) prev.apiKey = String(row.apiKey).trim();
        if (row.proxyUrl !== undefined) {
          prev.proxyUrl = String(row.proxyUrl || '').trim() || undefined;
        }
        if (row.title !== undefined) prev.title = row.title;
        if (row.coverUrl !== undefined) prev.coverUrl = row.coverUrl;
        if (row.website !== undefined) prev.website = row.website;
        if (row.endpointType !== undefined) prev.endpointType = row.endpointType;
        if (row.apiStyle !== undefined) prev.apiStyle = row.apiStyle;
        if (row.group !== undefined) prev.group = row.group;
        if (row.category !== undefined) prev.category = row.category;
        if (row.modelCount !== undefined) prev.modelCount = row.modelCount;
        if (row.sort !== undefined) prev.sort = row.sort;
        if (row.official !== undefined) prev.official = row.official;
        if (row.pulledAt !== undefined) prev.pulledAt = row.pulledAt;
        channelCreds[slug] = prev;
      }
    }

    await this.persistCredentials(creds);
    await this.persistChannelCredentials(channelCreds);

    if (partial.chatProvider !== undefined) {
      await this.setRaw('chatProvider', asProviderId(partial.chatProvider, 'volcengine'));
    }
    if (partial.imageProvider !== undefined) {
      await this.setRaw('imageProvider', asProviderId(partial.imageProvider, 'volcengine'));
    }
    if (partial.videoProvider !== undefined) {
      await this.setRaw('videoProvider', asProviderId(partial.videoProvider, 'volcengine'));
    }

    if (partial.defaultChatModel !== undefined) {
      await this.setRaw('defaultChatModel', partial.defaultChatModel);
      if (partial.chatProvider === undefined) {
        await this.setRaw(
          'chatProvider',
          inferProviderFromModel('chat', partial.defaultChatModel),
        );
      }
    }
    if (partial.defaultImageModel !== undefined) {
      await this.setRaw('defaultImageModel', partial.defaultImageModel);
      if (partial.imageProvider === undefined) {
        await this.setRaw(
          'imageProvider',
          inferProviderFromModel('image', partial.defaultImageModel),
        );
      }
    }
    if (partial.defaultVideoModel !== undefined) {
      await this.setRaw('defaultVideoModel', partial.defaultVideoModel);
      if (partial.videoProvider === undefined) {
        await this.setRaw(
          'videoProvider',
          inferProviderFromModel('video', partial.defaultVideoModel),
        );
      }
    }
    if (partial.defaultTtsModel !== undefined) {
      await this.setRaw('defaultTtsModel', partial.defaultTtsModel);
    }
    if (partial.defaultMusicModel !== undefined) {
      await this.setRaw('defaultMusicModel', partial.defaultMusicModel);
    }
    if (partial.jobConcurrency !== undefined) {
      await this.setRaw('jobConcurrency', String(partial.jobConcurrency));
      this.jobConcurrencyNotifier.notify(Number(partial.jobConcurrency));
    }

    if (partial.fileOss) {
      const f = partial.fileOss;
      if (f.baseUrl !== undefined) {
        await this.setRaw('fileOssBaseUrl', String(f.baseUrl || '').trim().replace(/\/+$/, ''));
      }
      if (f.apiEndpoint !== undefined) {
        await this.setRaw(
          'fileOssApiEndpoint',
          String(f.apiEndpoint || '').trim().replace(/\/+$/, ''),
        );
      }
      if (f.bucket !== undefined) {
        await this.setRaw('fileOssBucket', String(f.bucket || '').trim());
      }
      if (f.keyPrefix !== undefined) {
        await this.setRaw(
          'fileOssKeyPrefix',
          String(f.keyPrefix || '')
            .trim()
            .replace(/^\/+|\/+$/g, ''),
        );
      }
      if (f.accessKeyId) {
        await this.setRaw('fileOssAccessKeyId', this.encrypt(String(f.accessKeyId).trim()));
      }
      if (f.accessKeySecret) {
        await this.setRaw(
          'fileOssAccessKeySecret',
          this.encrypt(String(f.accessKeySecret).trim()),
        );
      }
    }

    return this.getPublic();
  }

  credential(vendor: AiProviderId | string, s?: SystemSettings): ProviderCredential {
    const id = asProviderId(String(vendor), normalizeProviderId(String(vendor)) || 'volcengine');
    const meta = AI_PROVIDER_META.find((m) => m.id === id);
    const defaultBase = meta?.defaultBaseUrl || VOLCENGINE_ARK_BASE;
    const from = s?.providerCredentials?.[id] || emptyCreds()[id];
    if (from?.apiKey) {
      return {
        baseUrl:
          id === 'volcengine'
            ? normalizeVolcBaseForSettings(from.baseUrl || defaultBase)
            : (from.baseUrl || defaultBase).replace(/\/$/, ''),
        apiKey: from.apiKey,
      };
    }

    // 仅精确 slug 匹配本地渠道；不扫描「像火山的渠道」做静默回退
    const channels = s?.channelCredentials || {};
    const same = channels[id];
    if (same?.apiKey) {
      return {
        baseUrl:
          id === 'volcengine'
            ? normalizeVolcBaseForSettings(same.baseUrl || defaultBase)
            : (same.baseUrl || defaultBase).replace(/\/$/, ''),
        apiKey: same.apiKey,
      };
    }

    return {
      baseUrl: (from?.baseUrl || defaultBase).replace(/\/$/, ''),
      apiKey: '',
    };
  }

  /** Hub 渠道凭证（按 slug）；无记录时返回空 key */
  channelCredential(
    slug: string,
    s?: SystemSettings,
    fallbackBaseUrl = '',
  ): ProviderCredential {
    const key = String(slug || '').trim();
    const from = (s?.channelCredentials || {})[key];
    return {
      baseUrl: String(from?.baseUrl || fallbackBaseUrl || '').replace(/\/$/, ''),
      apiKey: from?.apiKey || '',
      proxyUrl: String(from?.proxyUrl || '').trim() || undefined,
    };
  }
}
