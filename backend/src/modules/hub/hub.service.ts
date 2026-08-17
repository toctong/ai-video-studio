import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { type AxiosInstance } from 'axios';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { Repository } from 'typeorm';
import { AppSetting } from '../../entities/app-setting.entity';
import { resolveSecret } from '../../config/env';
import {
  canToggleDevHub,
  resolveEnvHubToken,
  resolveEnvHubUrl,
} from './hub.defaults';
import { SettingsService, type LocalModelRecord } from '../settings/settings.service';

export type HubConfig = {
  enabled: boolean;
  baseUrl: string;
  token: string;
  webhookSecret: string;
  callbackUrl: string;
  syncIntervalMs: number;
  instanceName: string;
  /** 本地开发态下是否优先对接本机 Hub */
  preferDevHub: boolean;
};

export type HubConfigPublic = Omit<HubConfig, 'token'> & {
  token: '';
  tokenMasked: string;
  hasToken: boolean;
  /** 当前偏好回落用的默认 Hub 地址（未自定义时） */
  defaultBaseUrl: string;
  /** 是否展示「对接开发环境」开关（仅非 production） */
  canToggleDevHub: boolean;
};

export type HubStatus = {
  enabled: boolean;
  configured: boolean;
  catalogVersion: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastEventAt: string | null;
  instanceId: string | null;
  plazaCount: number;
  agentsCount: number;
  workflowsCount: number;
  modelsCount: number;
  channelsCount: number;
  syncIntervalMs: number;
  /** 同步分项健康状态（ok / 条目数 / 最近成功时间） */
  items: {
    plaza: HubSyncItemStatus;
    agents: HubSyncItemStatus;
    channels: HubSyncItemStatus;
    models: HubSyncItemStatus;
    workflows: HubSyncItemStatus;
  };
};

export type HubSyncItemStatus = {
  ok: boolean;
  count: number;
  updatedAt: string | null;
};

/** Hub 已发布渠道（缓存项） */
export type HubChannelItem = {
  id?: string;
  slug: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  endpointType?: string;
  baseUrlHint?: string;
  website?: string;
  apiPrefix?: string;
  apiStyle?: string;
  paths?: Record<string, string>;
  modelCount?: number;
  modelMapping?: Record<string, string>;
  hash?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

/** Hub 已发布模型（缓存项） */
export type HubModelItem = {
  id?: string;
  slug?: string;
  title?: string;
  label?: string;
  modelId: string;
  channelSlug: string;
  channelTitle?: string;
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
  capabilities?: Record<string, unknown>;
  hash?: string;
  [key: string]: unknown;
};

const DEFAULT_INTERVAL = 5 * 60 * 1000;

export function maskKey(key: string) {
  if (!key) return '';
  if (key.length > 8) return `${key.slice(0, 4)}****${key.slice(-4)}`;
  return '****';
}

/** 兼容 Hub 返回 items / channels / models / 裸数组，以及 baseUrl → baseUrlHint */
export function normalizeHubCatalogPayload(
  data: unknown,
  kind: 'channel' | 'model',
): { version?: number; kind: string; updatedAt?: string; items: any[]; [k: string]: unknown } {
  const empty = { version: 0, kind, items: [] as any[] };
  if (data == null) return empty;
  if (Array.isArray(data)) {
    return { version: 0, kind, items: data.map((x) => normalizeHubCatalogItem(x, kind)) };
  }
  if (typeof data !== 'object') return empty;
  const raw = data as Record<string, unknown>;
  const list =
    (Array.isArray(raw.items) && raw.items) ||
    (Array.isArray(raw.channels) && raw.channels) ||
    (Array.isArray(raw.models) && raw.models) ||
    (Array.isArray(raw.data) && raw.data) ||
    [];
  return {
    ...raw,
    version: Number(raw.version) || 0,
    kind: String(raw.kind || kind),
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
    items: list.map((x) => normalizeHubCatalogItem(x, kind)),
  };
}

export function normalizeHubCatalogItem(raw: unknown, kind: 'channel' | 'model'): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const x = { ...(raw as Record<string, unknown>) };
  const hint = String(
    x.baseUrlHint || x.baseUrl || x.endpoint || x.apiBase || x.apiUrl || '',
  )
    .trim()
    .replace(/\/+$/, '');
  if (hint && !x.baseUrlHint) x.baseUrlHint = hint;
  if (kind === 'model') {
    if (!x.channelSlug && x.channel != null) x.channelSlug = String(x.channel);
    if (!x.modelId && x.id != null && !String(x.id).includes('-')) {
      /* keep */
    }
  }
  return x;
}

@Injectable()
export class HubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HubService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;
  private readonly secret = createHash('sha256')
    .update(resolveSecret('SETTINGS_SECRET'))
    .digest();

  constructor(
    @InjectRepository(AppSetting) private readonly repo: Repository<AppSetting>,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    void this.bootstrap();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async bootstrap() {
    try {
      await this.migrateEnv();
      await this.restartTimer();
      const cfg = await this.getConfig();
      if (!cfg.baseUrl || !cfg.token) {
        this.logger.log(
          'Hub 未配置：请设置 LUMINA_HUB_URL / LUMINA_HUB_TOKEN，或在设置页填写',
        );
      } else {
        this.logger.log(
          `Hub target: ${cfg.baseUrl} (${cfg.preferDevHub ? 'dev Hub' : 'primary Hub'})`,
        );
      }
      if (cfg.enabled && cfg.baseUrl && cfg.token) {
        void this.syncAll('startup');
      }
    } catch (err) {
      this.logger.warn(
        `Hub bootstrap failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async migrateEnv() {
    if (await this.getRaw('hub.migratedFromEnv')) return;
    const base = resolveEnvHubUrl(false);
    const token = resolveEnvHubToken(false);
    const secret = String(process.env.LUMINA_HUB_WEBHOOK_SECRET || '').trim();
    const callback = String(process.env.LUMINA_HUB_CALLBACK_URL || '').trim();
    if (base) await this.setRaw('hub.baseUrl', base);
    if (token) await this.setRaw('hub.token', this.encrypt(token));
    if (secret) await this.setRaw('hub.webhookSecret', secret);
    if (callback) await this.setRaw('hub.callbackUrl', callback);
    if (base && token) await this.setRaw('hub.enabled', '1');
    else await this.setRaw('hub.enabled', '0');
    await this.setRaw('hub.migratedFromEnv', '1');
  }

  /** 仅当配置了 LUMINA_HUB_DEV_URL 时可切开发环境 */
  private async resolvePreferDevHub(): Promise<boolean> {
    if (!canToggleDevHub()) return false;
    return (await this.getRaw('hub.preferDevHub')) === '1';
  }

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
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.secret,
        Buffer.from(ivB64, 'base64'),
      );
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

  async getConfig(): Promise<HubConfig> {
    const interval = Number(await this.getRaw('hub.syncIntervalMs')) || DEFAULT_INTERVAL;
    const enabledRaw = await this.getRaw('hub.enabled');
    const preferDevHub = await this.resolvePreferDevHub();
    const storedUrl = ((await this.getRaw('hub.baseUrl')) || '').replace(/\/+$/, '');
    const storedToken = this.decrypt(await this.getRaw('hub.token'));
    const envUrl = resolveEnvHubUrl(preferDevHub);
    const envToken = resolveEnvHubToken(preferDevHub);
    const baseUrl = storedUrl || envUrl;
    const token = storedToken || envToken;
    const enabled =
      enabledRaw === ''
        ? Boolean(baseUrl && token)
        : enabledRaw === '1';
    return {
      enabled,
      baseUrl,
      token,
      webhookSecret:
        (await this.getRaw('hub.webhookSecret')) ||
        String(process.env.LUMINA_HUB_WEBHOOK_SECRET || '').trim(),
      callbackUrl:
        (await this.getRaw('hub.callbackUrl')) ||
        String(process.env.LUMINA_HUB_CALLBACK_URL || '').trim(),
      syncIntervalMs: Math.max(60_000, interval),
      instanceName:
        (await this.getRaw('hub.instanceName')) ||
        `AIGC 视频工厂-${process.env.COMPUTERNAME || process.env.HOSTNAME || 'local'}`,
      preferDevHub,
    };
  }

  async getPublicConfig(): Promise<HubConfigPublic> {
    const c = await this.getConfig();
    const storedToken = this.decrypt(await this.getRaw('hub.token'));
    return {
      enabled: c.enabled,
      // 设置页留空表示回落环境变量，不把 env URL 回写成「已自定义」
      baseUrl: ((await this.getRaw('hub.baseUrl')) || '').replace(/\/+$/, ''),
      token: '',
      tokenMasked: maskKey(storedToken || c.token),
      hasToken: !!(storedToken || c.token),
      webhookSecret: c.webhookSecret,
      callbackUrl: c.callbackUrl,
      syncIntervalMs: c.syncIntervalMs,
      instanceName: c.instanceName,
      preferDevHub: c.preferDevHub,
      defaultBaseUrl: resolveEnvHubUrl(c.preferDevHub),
      canToggleDevHub: canToggleDevHub(),
    };
  }

  async updateConfig(
    partial: Partial<{
      enabled: boolean;
      baseUrl: string;
      token: string;
      webhookSecret: string;
      callbackUrl: string;
      syncIntervalMs: number;
      instanceName: string;
      preferDevHub: boolean;
    }>,
  ) {
    if (partial.enabled !== undefined) {
      await this.setRaw('hub.enabled', partial.enabled ? '1' : '0');
    }
    if (partial.preferDevHub !== undefined && canToggleDevHub()) {
      await this.setRaw('hub.preferDevHub', partial.preferDevHub ? '1' : '0');
      // 切换目标时清空页面覆盖，回落到对应环境变量
      await this.setRaw('hub.baseUrl', '');
      await this.setRaw('hub.token', '');
    }
    if (partial.baseUrl !== undefined) {
      await this.setRaw('hub.baseUrl', String(partial.baseUrl || '').replace(/\/+$/, ''));
    }
    if (partial.token !== undefined && String(partial.token).trim()) {
      await this.setRaw('hub.token', this.encrypt(String(partial.token).trim()));
    }
    if (partial.webhookSecret !== undefined) {
      await this.setRaw('hub.webhookSecret', String(partial.webhookSecret || ''));
    }
    if (partial.callbackUrl !== undefined) {
      await this.setRaw('hub.callbackUrl', String(partial.callbackUrl || '').trim());
    }
    if (partial.syncIntervalMs !== undefined) {
      await this.setRaw(
        'hub.syncIntervalMs',
        String(Math.max(60_000, Number(partial.syncIntervalMs) || DEFAULT_INTERVAL)),
      );
    }
    if (partial.instanceName !== undefined) {
      await this.setRaw('hub.instanceName', String(partial.instanceName || '').trim());
    }
    await this.restartTimer();
    return this.getPublicConfig();
  }

  private async restartTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const cfg = await this.getConfig();
    if (!cfg.enabled || !cfg.baseUrl || !cfg.token) return;
    this.timer = setInterval(() => {
      void this.syncAll('interval');
    }, cfg.syncIntervalMs);
  }

  private client(cfg: HubConfig): AxiosInstance {
    return axios.create({
      baseURL: `${cfg.baseUrl.replace(/\/+$/, '')}/api/v1`,
      timeout: 20000,
      headers: {
        'X-AIGC 视频工厂-Token': cfg.token,
        Authorization: `Bearer ${cfg.token}`,
      },
      validateStatus: () => true,
    });
  }

  async getStatus(): Promise<HubStatus> {
    const cfg = await this.getConfig();
    const plaza = await this.getCachedPlaza();
    const agentsPlaza = await this.getCachedAgentsPlaza();
    const workflowsPlaza = await this.getCachedWorkflowsPlaza();
    const models = await this.getCachedModels();
    const channels = await this.getCachedChannels();
    const [plazaAt, agentsAt, channelsAt, modelsAt, workflowsAt] =
      await Promise.all([
        this.getRaw('hub.cache.plaza.at'),
        this.getRaw('hub.cache.agentsPlaza.at'),
        this.getRaw('hub.cache.channels.at'),
        this.getRaw('hub.cache.models.at'),
        this.getRaw('hub.cache.workflowsPlaza.at'),
      ]);
    const plazaCount = Array.isArray(plaza?.skills) ? plaza.skills.length : 0;
    const agentsCount = Array.isArray(agentsPlaza?.items)
      ? agentsPlaza.items.length
      : Array.isArray(agentsPlaza?.agents)
        ? agentsPlaza.agents.length
        : Array.isArray(agentsPlaza?.skills)
          ? agentsPlaza.skills.length
          : 0;
    const workflowsCount = Array.isArray(workflowsPlaza?.items)
      ? workflowsPlaza.items.length
      : Array.isArray(workflowsPlaza?.workflows)
        ? workflowsPlaza.workflows.length
        : 0;
    const modelsCount = Array.isArray(models?.items) ? models.items.length : 0;
    const channelsCount = Array.isArray(channels?.items) ? channels.items.length : 0;
    return {
      enabled: cfg.enabled,
      configured: !!(cfg.baseUrl && cfg.token),
      catalogVersion: Number(await this.getRaw('hub.catalogVersion')) || 0,
      lastSyncAt: (await this.getRaw('hub.lastSyncAt')) || null,
      lastSyncError: (await this.getRaw('hub.lastSyncError')) || null,
      lastEventAt: (await this.getRaw('hub.lastEventAt')) || null,
      instanceId: (await this.getRaw('hub.instanceId')) || null,
      plazaCount,
      agentsCount,
      workflowsCount,
      modelsCount,
      channelsCount,
      syncIntervalMs: cfg.syncIntervalMs,
      items: {
        plaza: { ok: !!plaza, count: plazaCount, updatedAt: plazaAt || null },
        agents: { ok: !!agentsPlaza, count: agentsCount, updatedAt: agentsAt || null },
        channels: { ok: !!channels, count: channelsCount, updatedAt: channelsAt || null },
        models: { ok: !!models, count: modelsCount, updatedAt: modelsAt || null },
        workflows: { ok: !!workflowsPlaza, count: workflowsCount, updatedAt: workflowsAt || null },
      },
    };
  }

  async getCachedPlaza() {
    const raw = await this.getRaw('hub.cache.plaza');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async getCachedChannels(): Promise<{
    version?: number;
    kind?: string;
    updatedAt?: string;
    items: HubChannelItem[];
  } | null> {
    const raw = await this.getRaw('hub.cache.channels');
    if (!raw) return null;
    try {
      const parsed = normalizeHubCatalogPayload(JSON.parse(raw), 'channel');
      return {
        ...parsed,
        items: parsed.items as HubChannelItem[],
      };
    } catch {
      return null;
    }
  }

  async getCachedModels(): Promise<{
    version?: number;
    kind?: string;
    updatedAt?: string;
    items: HubModelItem[];
  } | null> {
    const raw = await this.getRaw('hub.cache.models');
    if (!raw) return null;
    try {
      const parsed = normalizeHubCatalogPayload(JSON.parse(raw), 'model');
      return {
        ...parsed,
        items: parsed.items as HubModelItem[],
      };
    } catch {
      return null;
    }
  }

  /** 按 modelId / slug 查找已缓存的 Hub 模型 */
  async findHubModel(modelIdOrSlug: string): Promise<HubModelItem | null> {
    const key = String(modelIdOrSlug || '').trim();
    if (!key) return null;
    const catalog = await this.getCachedModels();
    const items = catalog?.items || [];
    return (
      items.find(
        (m) =>
          String(m.modelId || '') === key ||
          String(m.slug || '') === key ||
          String(m.id || '') === key,
      ) || null
    );
  }

  async findHubChannel(slug: string): Promise<HubChannelItem | null> {
    const key = String(slug || '').trim();
    if (!key) return null;
    const catalog = await this.getCachedChannels();
    return (catalog?.items || []).find((c) => String(c.slug || '') === key) || null;
  }

  /**
   * 将 Hub 缓存中的渠道 + 其模型快照落库到本端（Settings）。
   */
  async pullChannelToLocal(slug: string) {
    const key = String(slug || '').trim();
    if (!key) throw new BadRequestException('渠道 slug 无效');
    const channel = await this.findHubChannel(key);
    if (!channel) {
      throw new BadRequestException('Hub 缓存中未找到该渠道，请先同步目录');
    }
    const catalog = await this.getCachedModels();
    const models: LocalModelRecord[] = (catalog?.items || [])
      .filter((m) => {
        const slug = String(
          m.channelSlug || (m as { channel?: string }).channel || '',
        ).trim();
        return slug === key && m.modelId;
      })
      .map((m) => ({
        modelId: String(m.modelId),
        channelSlug: key,
        slug: m.slug != null ? String(m.slug) : undefined,
        title: m.title != null ? String(m.title) : undefined,
        label: m.label != null ? String(m.label) : undefined,
        channelTitle: m.channelTitle ? String(m.channelTitle) : channel.title,
        channelLogo:
          m.channelLogo != null
            ? String(m.channelLogo)
            : channel.coverUrl != null
              ? String(channel.coverUrl)
              : null,
        coverUrl: m.coverUrl != null ? String(m.coverUrl) : null,
        category: m.category != null ? String(m.category) : undefined,
        endpointType: m.endpointType || channel.endpointType,
        baseUrlHint: m.baseUrlHint || channel.baseUrlHint,
        apiPrefix: m.apiPrefix != null ? String(m.apiPrefix) : channel.apiPrefix,
        apiStyle: m.apiStyle || channel.apiStyle,
        paths: (m.paths || channel.paths) as Record<string, string> | undefined,
        callPath: m.callPath != null ? String(m.callPath) : undefined,
        endpointUrlHint:
          m.endpointUrlHint != null ? String(m.endpointUrlHint) : undefined,
        modalities: Array.isArray(m.modalities) ? m.modalities.map(String) : [],
        enabled: m.enabled !== false,
        recommended: !!m.recommended,
        contextWindow:
          m.contextWindow != null ? (m.contextWindow as number | string) : null,
        updatedAt: m.updatedAt != null ? String(m.updatedAt) : undefined,
      }));

    // 以 Hub 目录为准：匹配结果为空则清空该渠道本端快照（不再保留已下架模型）
    if (!models.length) {
      this.logger.log(
        `pull ${key}: hub models empty, clear local snapshot for channel`,
      );
    }

    return this.settings.pullHubChannel(
      {
        slug: key,
        title: channel.title,
        coverUrl: channel.coverUrl ?? null,
        website: channel.website,
        endpointType: channel.endpointType,
        apiStyle: channel.apiStyle,
        apiPrefix: channel.apiPrefix != null ? String(channel.apiPrefix) : undefined,
        paths: channel.paths,
        group: channel.group != null ? String(channel.group) : undefined,
        category: channel.category != null ? String(channel.category) : undefined,
        modelCount: Number(channel.modelCount ?? models.length) || 0,
        sort: Number(channel.sort) || 0,
        official: !!channel.official,
        baseUrlHint: channel.baseUrlHint,
      },
      models,
    );
  }

  async removeLocalChannel(slug: string) {
    return this.settings.removeLocalChannel(slug);
  }

  /**
   * 用最新 Hub 模型缓存，刷新本端已拉取渠道的模型快照；
   * Hub 已下架的本地渠道会移除（不再静默保留旧快照）。
   */
  async refreshPulledLocalModels() {
    const internal = await this.settings.getInternal();
    const slugs = Object.keys(internal.channelCredentials || {}).filter(Boolean);
    const catalog = await this.getCachedChannels();
    const hubSlugs = new Set(
      (catalog?.items || [])
        .map((c) => String(c.slug || '').trim())
        .filter(Boolean),
    );
    if (!slugs.length) return { refreshed: 0, pruned: 0 };
    let refreshed = 0;
    let pruned = 0;
    for (const slug of slugs) {
      if (hubSlugs.size > 0 && !hubSlugs.has(slug)) {
        try {
          await this.settings.removeLocalChannel(slug);
          pruned += 1;
          this.logger.log(`pruned local channel missing from Hub: ${slug}`);
        } catch (err) {
          this.logger.warn(
            `prune local channel ${slug} failed: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
        continue;
      }
      try {
        await this.pullChannelToLocal(slug);
        refreshed += 1;
      } catch (err) {
        this.logger.warn(
          `refresh local models for ${slug} failed: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return { refreshed, pruned };
  }

  async getPublicSettingsAfterRefresh() {
    return this.settings.getPublic();
  }

  async getCachedLibraries() {
    const raw = await this.getRaw('hub.cache.libraries');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async getCachedAgentsPlaza() {
    const raw = await this.getRaw('hub.cache.agentsPlaza');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async getCachedWorkflowsPlaza() {
    const raw = await this.getRaw('hub.cache.workflowsPlaza');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async registerInstance() {
    const cfg = await this.getConfig();
    if (!cfg.baseUrl || !cfg.token) {
      throw new UnauthorizedException('请先配置 Hub URL 与 Token');
    }
    const http = this.client(cfg);
    const body: Record<string, unknown> = {
      name: cfg.instanceName,
    };
    if (cfg.callbackUrl) body.callbackUrl = cfg.callbackUrl;
    if (cfg.webhookSecret) body.webhookSecret = cfg.webhookSecret;
    const res = await http.post('/instances/register', body);
    if (res.status >= 300) {
      throw new UnauthorizedException(
        res.data?.message || `注册失败 HTTP ${res.status}`,
      );
    }
    if (res.data?.id) await this.setRaw('hub.instanceId', String(res.data.id));
    return res.data;
  }

  async heartbeat() {
    const cfg = await this.getConfig();
    if (!cfg.enabled || !cfg.baseUrl || !cfg.token) return null;
    const http = this.client(cfg);
    const res = await http.post('/instances/heartbeat', {
      meta: { name: cfg.instanceName },
    });
    return res.status < 300 ? res.data : null;
  }

  /**
   * 投稿提示词到 Hub 社区。
   * kind=skill + mode=image|video，才能进提示词广场（非 agent Skill 广场）。
   */
  async submitCommunityPrompt(input: {
    slug?: string;
    title: string;
    description?: string;
    coverUrl?: string;
    prompt: string;
    category?: string;
    mode?: string;
    tags?: string[];
    authorName?: string;
    userId: string;
  }) {
    const cfg = await this.getConfig();
    if (!cfg.enabled) {
      throw new UnauthorizedException('Hub 未启用');
    }
    if (!cfg.baseUrl || !cfg.token) {
      throw new UnauthorizedException('请先配置 Hub URL 与 Token');
    }

    const mode = input.mode === 'video' ? 'video' : 'image';
    const category =
      String(input.category || '').trim() ||
      (mode === 'video' ? 'video' : 'image');
    const tagLabel = mode === 'video' ? '视频' : '图片';
    const tags = Array.from(
      new Set([
        ...(Array.isArray(input.tags) ? input.tags.map(String) : []),
        tagLabel,
      ]),
    );

    const slugBase = String(input.slug || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const slug =
      slugBase ||
      `u${input.userId}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;

    const coverRaw = String(input.coverUrl || '').trim();
    const coverUrl = /^https?:\/\//i.test(coverRaw) ? coverRaw : undefined;

    const payload = JSON.stringify({
      id: slug,
      name: input.title.trim(),
      desc: String(input.description || '').trim(),
      prompt: input.prompt.trim(),
      starter: input.prompt.trim(),
      category,
      mode,
      author: input.authorName || '',
      coverUrl,
      tags,
    });

    const http = this.client(cfg);
    const instanceId = (await this.getRaw('hub.instanceId')) || undefined;
    const res = await http.post('/resources/submit', {
      slug,
      kind: 'skill',
      title: input.title.trim(),
      description: String(input.description || '').trim() || undefined,
      coverUrl,
      payload,
      category,
      tags,
      mode,
      authorName: input.authorName || undefined,
      instanceId,
      userId: input.userId,
    });

    if (res.status >= 300) {
      const msg =
        (typeof res.data?.message === 'string' && res.data.message) ||
        (Array.isArray(res.data?.message)
          ? res.data.message.join('; ')
          : null) ||
        `投稿失败 HTTP ${res.status}`;
      throw new BadRequestException(msg);
    }

    return {
      ok: true,
      slug,
      status: res.data?.status || 'pending_review',
      id: res.data?.id || null,
      coverOmitted: !!coverRaw && !coverUrl,
      autoApproved: res.data?.status === 'published',
      resource: res.data,
    };
  }

  /**
   * 代理 Hub POST /resources/:id/use — 点击「使用」时 downloadCount/uses +1（非幂等）。
   * :id 可为 UUID 或广场 slug。
   */
  async recordResourceUse(input: {
    id: string;
    userId: string;
    kind?: string;
  }) {
    const cfg = await this.getConfig();
    if (!cfg.enabled) {
      throw new UnauthorizedException('Hub 未启用');
    }
    if (!cfg.baseUrl || !cfg.token) {
      throw new UnauthorizedException('请先配置 Hub URL 与 Token');
    }

    const resourceId = String(input.id || '').trim();
    if (!resourceId) {
      throw new BadRequestException('资源 id 不能为空');
    }

    let instanceId = (await this.getRaw('hub.instanceId')) || '';
    if (!instanceId) {
      try {
        await this.registerInstance();
        instanceId = (await this.getRaw('hub.instanceId')) || '';
      } catch {
        /* register 失败则下面仍会报缺少 instanceId */
      }
    }
    if (!instanceId) {
      throw new BadRequestException(
        '尚未注册 Hub 实例，请先在设置中同步/注册 Hub',
      );
    }

    const http = this.client(cfg);
    const body: Record<string, string> = {
      instanceId,
      userId: String(input.userId),
    };
    const kind = String(input.kind || '').trim();
    if (kind) body.kind = kind;

    const res = await http.post(
      `/resources/${encodeURIComponent(resourceId)}/use`,
      body,
    );
    if (res.status >= 300) {
      const msg =
        (typeof res.data?.message === 'string' && res.data.message) ||
        (Array.isArray(res.data?.message)
          ? res.data.message.join('; ')
          : null) ||
        `上报使用失败 HTTP ${res.status}`;
      throw new BadRequestException(msg);
    }
    return {
      ok: true,
      id: res.data?.id || resourceId,
      slug: res.data?.slug || null,
      uses: res.data?.uses ?? res.data?.downloadCount ?? null,
      downloadCount: res.data?.downloadCount ?? res.data?.uses ?? null,
    };
  }

  async syncAll(reason = 'manual') {
    if (this.syncing) return { ok: false, message: '同步进行中' };
    const cfg = await this.getConfig();
    if (!cfg.enabled) return { ok: false, message: 'Hub 同步未启用' };
    if (!cfg.baseUrl || !cfg.token) {
      return { ok: false, message: '请先配置 Hub URL 与 Token' };
    }

    this.syncing = true;
    try {
      const http = this.client(cfg);
      const manifestRes = await http.get('/sync/manifest');
      if (manifestRes.status >= 300) {
        throw new Error(
          manifestRes.data?.message || `manifest HTTP ${manifestRes.status}`,
        );
      }
      const remoteVersion = Number(manifestRes.data?.version) || 0;
      const localVersion = Number(await this.getRaw('hub.catalogVersion')) || 0;

      const [
        plazaRes,
        skillsRes,
        channelsRes,
        modelsRes,
        workflowsRes,
      ] = await Promise.all([
        // 提示词广场（非 agent）
        http.get('/prompts/plaza').then(async (r) => {
          if (r.status < 300 && r.data) return r;
          // 旧 Hub：skills/prompts 过渡别名
          return http.get('/skills/prompts');
        }),
        // Agent Skill 广场（mode=agent）
        http.get('/skills/plaza'),
        http.get('/channels/catalog'),
        http.get('/models/catalog'),
        // Workflow 广场 Hub 侧待补；404 忽略
        http.get('/workflows/plaza'),
      ]);

      if (plazaRes.status < 300 && plazaRes.data) {
        await this.setRaw('hub.cache.plaza', JSON.stringify(plazaRes.data));
        await this.setRaw('hub.cache.plaza.at', new Date().toISOString());
      }
      if (skillsRes.status < 300 && skillsRes.data) {
        // 统一成 items，兼容前端 agents/plaza
        const raw = skillsRes.data;
        const skills = Array.isArray(raw?.skills)
          ? raw.skills
          : Array.isArray(raw?.items)
            ? raw.items
            : [];
        await this.setRaw(
          'hub.cache.agentsPlaza',
          JSON.stringify({
            version: raw?.version || 0,
            source: raw?.source || 'lumina-hub',
            updatedAt: raw?.updatedAt || null,
            filters: Array.isArray(raw?.filters) ? raw.filters : [],
            skills,
            items: skills,
          }),
        );
        await this.setRaw('hub.cache.agentsPlaza.at', new Date().toISOString());
      }
      if (channelsRes.status < 300 && channelsRes.data) {
        const normalized = normalizeHubCatalogPayload(channelsRes.data, 'channel');
        await this.setRaw('hub.cache.channels', JSON.stringify(normalized));
        await this.setRaw('hub.cache.channels.at', new Date().toISOString());
        this.logger.log(
          `Hub channels catalog cached: ${normalized.items.length} item(s)`,
        );
      } else {
        this.logger.warn(
          `Hub channels catalog skipped (${reason}): status=${channelsRes.status}`,
        );
      }
      let localModelsRefreshed = 0;
      let localChannelsPruned = 0;
      if (modelsRes.status < 300 && modelsRes.data) {
        const normalized = normalizeHubCatalogPayload(modelsRes.data, 'model');
        await this.setRaw('hub.cache.models', JSON.stringify(normalized));
        await this.setRaw('hub.cache.models.at', new Date().toISOString());
        // 仅在模型目录拉取成功后刷新本端快照，避免用旧缓存「复活」已下架模型
        try {
          const r = await this.refreshPulledLocalModels();
          localModelsRefreshed = Number(r?.refreshed) || 0;
          localChannelsPruned = Number(r?.pruned) || 0;
        } catch (err) {
          this.logger.warn(
            `refresh pulled local models failed: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      } else {
        this.logger.warn(
          `Hub models catalog skipped (${reason}): status=${modelsRes.status}`,
        );
      }
      if (workflowsRes.status < 300 && workflowsRes.data) {
        await this.setRaw(
          'hub.cache.workflowsPlaza',
          JSON.stringify(workflowsRes.data),
        );
        await this.setRaw('hub.cache.workflowsPlaza.at', new Date().toISOString());
      }

      await this.setRaw('hub.catalogVersion', String(remoteVersion || localVersion));
      await this.setRaw('hub.lastSyncAt', new Date().toISOString());
      await this.setRaw('hub.lastSyncError', '');
      void this.heartbeat();

      const agentsLen = Array.isArray(skillsRes.data?.skills)
        ? skillsRes.data.skills.length
        : Array.isArray(skillsRes.data?.items)
          ? skillsRes.data.items.length
          : 0;
      this.logger.log(
        `Hub sync ok (${reason}) version=${remoteVersion} plaza=${
          Array.isArray(plazaRes.data?.skills) ? plazaRes.data.skills.length : 0
        } agents=${agentsLen} channels=${
          normalizeHubCatalogPayload(channelsRes.data, 'channel').items.length
        } models=${
          normalizeHubCatalogPayload(modelsRes.data, 'model').items.length
        } workflows=${
          Array.isArray(workflowsRes.data?.items)
            ? workflowsRes.data.items.length
            : 0
        } localRefreshed=${localModelsRefreshed} pruned=${localChannelsPruned}`,
      );
      return {
        ok: true,
        version: remoteVersion,
        changed: remoteVersion !== localVersion,
        reason,
        localModelsRefreshed,
        localChannelsPruned,
        settings: await this.settings.getPublic(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.setRaw('hub.lastSyncError', message);
      this.logger.warn(`Hub sync failed (${reason}): ${message}`);
      return { ok: false, message };
    } finally {
      this.syncing = false;
    }
  }

  async handleWebhook(
    rawBody: string,
    headers: {
      event?: string;
      timestamp?: string;
      signature?: string;
    },
  ) {
    const cfg = await this.getConfig();
    if (!cfg.webhookSecret) {
      throw new UnauthorizedException(
        '未配置 Hub Webhook Secret（LUMINA_HUB_WEBHOOK_SECRET 或设置页）',
      );
    }
    const ts = headers.timestamp || '';
    const sig = headers.signature || '';
    const expected = createHmac('sha256', cfg.webhookSecret)
      .update(`${ts}.${rawBody}`)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (!ts || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Webhook 签名无效');
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody || '{}');
    } catch {
      payload = {};
    }
    await this.setRaw('hub.lastEventAt', new Date().toISOString());
    this.logger.log(
      `Hub webhook: ${headers.event || payload.event || 'unknown'}`,
    );
    const result = await this.syncAll('webhook');
    return { ok: true, sync: result };
  }
}
