import { BadRequestException, Injectable } from '@nestjs/common';
import type { AxiosInstance } from 'axios';
import {
  type AiCapability,
  type AiProviderId,
  AI_PROVIDER_IDS,
  AI_PROVIDER_META,
  defaultModelFor,
} from '@ai-video-studio/shared';
import { SettingsService, type SystemSettings } from '../settings/settings.service';
import { HubService } from '../hub/hub.service';
import { createVendorHttpClient } from './vendor-http';
import {
  type HubModality,
  chatPath,
  modelsPath,
  resolveHubEndpointUrl,
} from './ai-hub-endpoint';

export type HubModalityClient = {
  http: AxiosInstance;
  path: string;
  apiStyle: string;
};

export type HubImageClient = {
  http: AxiosInstance;
  baseUrl: string;
  path: string;
};

/**
 * Hub / 本地渠道解析：厂商 HTTP 客户端、模态端点、连通测试。
 * 聊天/出图/视频业务仍在 AiProviderService，经此类取连接。
 */
@Injectable()
export class AiHubClient {
  constructor(
    private readonly settings: SettingsService,
    private readonly hub: HubService,
  ) {}

  assertVendor(id: string): AiProviderId {
    if (!(AI_PROVIDER_IDS as readonly string[]).includes(id)) {
      throw new BadRequestException(`未知厂商：${id}`);
    }
    return id as AiProviderId;
  }

  async vendorFor(capability: AiCapability, s?: SystemSettings): Promise<AiProviderId> {
    const settings = s || (await this.settings.getInternal());
    if (capability === 'chat') return settings.chatProvider || '';
    if (capability === 'image') return settings.imageProvider || '';
    return settings.videoProvider || '';
  }

  async clientFor(vendor: AiProviderId | string, s?: SystemSettings): Promise<AxiosInstance> {
    const settings = s || (await this.settings.getInternal());
    const raw = String(vendor || '').trim();
    if (!(AI_PROVIDER_IDS as readonly string[]).includes(raw)) {
      throw new BadRequestException(
        `未知厂商「${raw || '(空)'}」。请使用 Hub 渠道模型，勿依赖内置厂商回退。`,
      );
    }
    const id = this.assertVendor(raw);
    const cred = this.settings.credential(id, settings);
    if (!cred.apiKey) {
      const label = AI_PROVIDER_META.find((m) => m.id === id)?.label || id;
      throw new BadRequestException(
        `请先在系统设置 → 渠道（本地）中配置「${label}」对应渠道的 API Key`,
      );
    }
    return createVendorHttpClient({
      baseURL: String(cred.baseUrl || '').replace(/\/$/, ''),
      apiKey: cred.apiKey,
      proxyUrl: cred.proxyUrl,
      timeout: 300000,
    });
  }

  /**
   * 按 Hub / 本地模型快照解析调用端点。
   * 无完整元数据或未配 Key 时返回 null（由 require* 抛错，不做内置回退）。
   */
  async resolveHubModalityClient(
    modelId: string,
    modality: HubModality,
    s: SystemSettings,
  ): Promise<HubModalityClient | null> {
    const id = String(modelId || '').trim();
    if (!id) return null;

    const hubModel = await this.hub.findHubModel(id);
    const localModel =
      (s.localModels || []).find((m) => String(m.modelId || '') === id) || undefined;
    const channelSlug = String(
      hubModel?.channelSlug || localModel?.channelSlug || '',
    ).trim();
    if (!channelSlug) return null;

    const channel = await this.hub.findHubChannel(channelSlug);
    const local = s.channelCredentials?.[channelSlug];
    const hintBase = String(
      hubModel?.baseUrlHint ||
        localModel?.baseUrlHint ||
        channel?.baseUrlHint ||
        local?.baseUrl ||
        '',
    );
    const cred = this.settings.channelCredential(channelSlug, s, hintBase);
    if (!cred.apiKey) return null;

    const apiPrefix =
      hubModel?.apiPrefix ||
      localModel?.apiPrefix ||
      channel?.apiPrefix ||
      local?.apiPrefix;
    const paths =
      hubModel?.paths ||
      localModel?.paths ||
      channel?.paths ||
      local?.paths ||
      null;
    const callPath = hubModel?.callPath || localModel?.callPath;
    const endpointUrlHint = hubModel?.endpointUrlHint || localModel?.endpointUrlHint;

    if (
      !String(endpointUrlHint || '').trim() &&
      !String(callPath || '').trim() &&
      !String(paths?.[modality] || '').trim()
    ) {
      return null;
    }

    let baseURL: string;
    let path: string;
    try {
      ({ baseURL, path } = resolveHubEndpointUrl({
        modality,
        credBaseUrl: cred.baseUrl,
        baseUrlHint: hintBase,
        apiPrefix,
        paths,
        callPath,
        endpointUrlHint,
      }));
    } catch {
      return null;
    }

    return {
      http: createVendorHttpClient({
        baseURL,
        apiKey: cred.apiKey,
        proxyUrl: cred.proxyUrl,
        timeout: 300000,
      }),
      path,
      apiStyle: String(
        hubModel?.apiStyle ||
          localModel?.apiStyle ||
          channel?.apiStyle ||
          local?.apiStyle ||
          '',
      ),
    };
  }

  async requireHubModalityClient(
    modelId: string,
    modality: HubModality,
    s: SystemSettings,
  ): Promise<HubModalityClient> {
    const id = String(modelId || '').trim();
    if (!id) {
      throw new BadRequestException(
        '未指定模型：请先在系统设置选择默认模型，或在本次请求中传入 model。',
      );
    }
    const hubModel = await this.hub.findHubModel(id);
    const localModel =
      (s.localModels || []).find((m) => String(m.modelId || '') === id) || undefined;
    const channelSlug = String(
      hubModel?.channelSlug || localModel?.channelSlug || '',
    ).trim();
    if (!channelSlug) {
      throw new BadRequestException(
        `模型「${id}」不在已拉取的 Hub / 本地目录中。请到系统设置从 Hub 拉取渠道与模型。`,
      );
    }
    const cred = this.settings.channelCredential(channelSlug, s);
    if (!cred.apiKey) {
      throw new BadRequestException(
        `渠道「${channelSlug}」未配置 API Key。请到系统设置 → 本地渠道填写后重试。`,
      );
    }
    const hub = await this.resolveHubModalityClient(id, modality, s);
    if (!hub) {
      throw new BadRequestException(
        `模型「${id}」缺少 ${modality} 调用路径元数据（paths / callPath）。请重新从 Hub 拉取该渠道。`,
      );
    }
    return hub;
  }

  async requireHubImageClient(modelId: string, s: SystemSettings): Promise<HubImageClient> {
    const hub = await this.requireHubModalityClient(modelId, 'image', s);
    return {
      http: hub.http,
      baseUrl: String(hub.http.defaults.baseURL || ''),
      path: hub.path,
    };
  }

  /** 旧别名 / 已下线 FLUX → 硅基可用模型 */
  resolveImageModel(raw?: string, fallback?: string) {
    const m = String(raw || fallback || '').trim();
    const map: Record<string, string> = {
      'image-openai': 'Kwai-Kolors/Kolors',
      'image-flux': 'Kwai-Kolors/Kolors',
      'image-mj': 'Qwen/Qwen-Image',
      'dall-e-3': 'Kwai-Kolors/Kolors',
      'flux-pro': 'Kwai-Kolors/Kolors',
      flux: 'Kwai-Kolors/Kolors',
      'black-forest-labs/FLUX.1-schnell': 'Kwai-Kolors/Kolors',
      'Pro/black-forest-labs/FLUX.1-schnell': 'Kwai-Kolors/Kolors',
      'black-forest-labs/FLUX.1-dev': 'Kwai-Kolors/Kolors',
      'black-forest-labs/FLUX.1-pro': 'Kwai-Kolors/Kolors',
    };
    return map[m] || m;
  }

  resolveVideoModel(raw?: string, fallback?: string) {
    return String(raw || fallback || '').trim();
  }

  async listModels(vendor?: AiProviderId) {
    const s = await this.settings.getInternal();
    const id = vendor || s.chatProvider;
    const http = await this.clientFor(id, s);
    const cred = this.settings.credential(id, s);
    const res = await http.get(modelsPath(cred.baseUrl));
    const data = Array.isArray(res.data?.data) ? res.data.data : [];
    return data.map((m: any) => m.id).filter(Boolean) as string[];
  }

  async testConnection() {
    const s = await this.settings.getInternal();
    return this.testProvider(s.chatProvider, 'chat');
  }

  async testProvider(vendorRaw: string, capability: AiCapability = 'chat', model?: string) {
    const vendor = this.assertVendor(vendorRaw);
    const s = await this.settings.getInternal();
    const cred = this.settings.credential(vendor, s);
    if (!cred.apiKey) return { ok: false, message: '未配置 API Key', vendor };
    try {
      if (capability === 'chat') {
        const http = await this.clientFor(vendor, s);
        const useModel = model || s.defaultChatModel || defaultModelFor('chat', vendor);
        await http.post(chatPath(cred.baseUrl), {
          model: useModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
        });
        return { ok: true, message: `对话连通成功（${vendor} · ${useModel}）`, vendor };
      }
      try {
        const models = await this.listModels(vendor);
        return {
          ok: true,
          message: `连通成功，可见模型 ${models.length} 个`,
          vendor,
          modelCount: models.length,
          models: models.slice(0, 40),
        };
      } catch {
        return { ok: true, message: `API Key 已配置（${vendor}），厂商未提供 models 列表`, vendor };
      }
    } catch (e: any) {
      return {
        ok: false,
        vendor,
        message:
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          '连接失败',
      };
    }
  }
}
