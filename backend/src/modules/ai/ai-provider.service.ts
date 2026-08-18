import { BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { spawn } from 'child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import {
  type AiCapability,
  type AiProviderId,
  defaultModelFor,
  isGptImageModel,
  isVolcengineImageModel,
} from '@ai-video-studio/shared';
import { SettingsService, type LocalModelRecord, type SystemSettings } from '../settings/settings.service';
import {
  compressVideoPromptForLimit,
  normalizePromptText,
  stripClockDurationFromPrompt,
  videoPromptMaxCharsForModel,
} from './visual-prompt';
import {
  classifyAiError,
  extractUpstreamErrorDetail,
  isAbortLike,
} from './runtime-errors';
import { cloneVendorHttpClient, createVendorHttpClient } from './vendor-http';
import { AiHubClient } from './ai-hub.client';
import {
  chatPath,
  contentsTasksPath,
  dashscopeHost,
  imagesEditPath,
  imagesPath,
  mimeFromExt,
  resolveHubEndpointUrl,
  sleep,
} from './ai-hub-endpoint';

/** gpt-image 多图 edits 网关常限 body；单张参考压缩后目标上限 */
const GPT_REF_MAX_BYTES = 700_000;
const GPT_REF_MAX_COUNT = 3;

@Injectable()
export class AiProviderService {
  constructor(
    private readonly settings: SettingsService,
    private readonly hubClient: AiHubClient,
  ) {}

  async vendorFor(capability: AiCapability, s?: SystemSettings) {
    return this.hubClient.vendorFor(capability, s);
  }

  resolveImageModel(raw?: string, fallback?: string) {
    return this.hubClient.resolveImageModel(raw, fallback);
  }

  resolveVideoModel(raw?: string, fallback?: string) {
    return this.hubClient.resolveVideoModel(raw, fallback);
  }

  listModels(vendor?: AiProviderId) {
    return this.hubClient.listModels(vendor);
  }

  testConnection() {
    return this.hubClient.testConnection();
  }

  testProvider(vendorRaw: string, capability: AiCapability = 'chat', model?: string) {
    return this.hubClient.testProvider(vendorRaw, capability, model);
  }

  /** 测试本地渠道凭证（OpenAI 兼容 / ark） */
  async testChannel(slug: string, model?: string) {
    const key = String(slug || '').trim();
    if (!key) return { ok: false, message: '缺少渠道 slug' };
    const s = await this.settings.getInternal();
    const channel = await this.settings.findLocalChannel(key);
    const hintBase = String(channel?.baseUrl || channel?.hubBaseUrlHint || '').replace(/\/$/, '');
    const cred = this.settings.channelCredential(key, s, hintBase);
    if (!cred.apiKey) return { ok: false, message: '未配置该渠道 API Key', slug: key };

    const style = String(channel?.apiStyle || 'openai').toLowerCase();
    if (style !== 'openai' && style !== 'ark') {
      return {
        ok: false,
        message: `暂不支持测试 apiStyle=${style}，请先在能力映射里用内置渠道验证`,
        slug: key,
      };
    }

    let useModel = String(model || '').trim();
    if (!useModel) {
      const first = (s.localModels || []).find(
        (m) =>
          String(m.channelSlug || '') === key &&
          (m.modalities || []).includes('text') &&
          m.enabled !== false,
      );
      useModel = String(first?.modelId || 'ping');
    }

    try {
      const hubModel: LocalModelRecord =
        (await this.settings.findLocalModel(useModel)) || {
          modelId: useModel,
          channelSlug: key,
          apiStyle: style,
          baseUrlHint: hintBase,
          apiPrefix: channel?.apiPrefix,
          paths: channel?.paths as Record<string, string> | undefined,
          callPath: undefined,
          endpointUrlHint: undefined,
        };
      await this.postHubChat(hubModel, cred, [
        { role: 'user', content: 'ping' },
      ], { maxTokens: 8 });
      return { ok: true, message: `渠道连通成功（${channel?.title || key} · ${useModel}）`, slug: key };
    } catch (e: any) {
      return {
        ok: false,
        slug: key,
        message:
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          '连接失败',
      };
    }
  }

  private resolveHubChatEndpoint(
    model: LocalModelRecord,
    credBaseUrl: string,
  ): { baseURL: string; path: string } {
    return resolveHubEndpointUrl({
      modality: 'text',
      credBaseUrl,
      baseUrlHint: model.baseUrlHint,
      apiPrefix: model.apiPrefix,
      paths: model.paths,
      callPath: model.callPath,
      endpointUrlHint: model.endpointUrlHint,
    });
  }

  private async postHubChat(
    model: LocalModelRecord,
    cred: { baseUrl: string; apiKey: string; proxyUrl?: string },
    messages: Array<{ role: string; content: string }>,
    opts?: { temperature?: number; maxTokens?: number; signal?: AbortSignal; timeoutMs?: number },
  ) {
    const { baseURL, path } = this.resolveHubChatEndpoint(model, cred.baseUrl);
    if (!baseURL) {
      throw new BadRequestException(`渠道 ${model.channelSlug} 缺少 Base URL`);
    }
    const http = createVendorHttpClient({
      baseURL,
      apiKey: cred.apiKey,
      proxyUrl: cred.proxyUrl,
      timeout: typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 300000,
    });
    const body: Record<string, unknown> = {
      model: model.modelId,
      messages,
      temperature: typeof opts?.temperature === 'number' ? opts.temperature : 0.7,
    };
    if (typeof opts?.maxTokens === 'number' && opts.maxTokens > 0) {
      body.max_tokens = opts.maxTokens;
    }
    const res = await http.post(path, body, { signal: opts?.signal });
    return res.data?.choices?.[0]?.message?.content as string;
  }

  /** 若模型来自 Hub 且渠道已配 Key，走渠道调用；否则返回 null（上层直接报错） */
  private async tryHubChat(
    requestedModel: string,
    messages: Array<{ role: string; content: string }>,
    opts: { temperature?: number; maxTokens?: number; signal?: AbortSignal; timeoutMs?: number } | undefined,
    s: SystemSettings,
  ): Promise<string | null> {
    const resolved = await this.resolveHubChatTarget(requestedModel, s);
    if (!resolved) return null;
    return this.postHubChat(resolved.model, resolved.cred, messages, opts);
  }

  private async resolveHubChatTarget(requestedModel: string, s: SystemSettings) {
    const id = String(requestedModel || '').trim();
    if (!id) return null;

    let hubModel: LocalModelRecord | null = await this.settings.findLocalModel(id);
    if (!hubModel) {
      const local = (s.localModels || []).find((m) => String(m.modelId || '') === id);
      if (local?.channelSlug) {
        hubModel = {
          modelId: id,
          channelSlug: local.channelSlug,
          baseUrlHint: local.baseUrlHint,
          apiPrefix: local.apiPrefix,
          apiStyle: local.apiStyle,
          paths: local.paths,
          callPath: local.callPath,
          endpointUrlHint: local.endpointUrlHint,
          modalities: local.modalities,
          enabled: local.enabled !== false,
        };
      }
    }
    if (!hubModel || hubModel.enabled === false) return null;
    const mods = hubModel.modalities || [];
    if (mods.length && !mods.includes('text')) return null;

    const style = String(hubModel.apiStyle || 'openai').toLowerCase();
    if (style !== 'openai' && style !== 'ark') return null;

    const channel = await this.settings.findLocalChannel(hubModel.channelSlug);
    const localChan = s.channelCredentials?.[hubModel.channelSlug];
    const cred = this.settings.channelCredential(
      hubModel.channelSlug,
      s,
      String(hubModel.baseUrlHint || channel?.baseUrl || channel?.hubBaseUrlHint || localChan?.baseUrl || ''),
    );
    if (!cred.apiKey) return null;
    return { model: hubModel, cred };
  }

  private streamChatPieces(json: unknown): { content: string; reasoning: string } {
    const choice = (json as { choices?: Array<Record<string, any>> })?.choices?.[0] || {};
    const delta = (choice.delta || {}) as Record<string, unknown>;
    const message = (choice.message || {}) as Record<string, unknown>;
    const reasoning = String(
      delta.reasoning_content ??
        delta.reasoning ??
        message.reasoning_content ??
        message.reasoning ??
        '',
    );
    const content = String(delta.content ?? message.content ?? '');
    return { content, reasoning };
  }

  private async tryHubChatStream(
    requestedModel: string,
    messages: Array<{ role: string; content: string }>,
    opts:
      | {
          signal?: AbortSignal;
          onDelta?: (text: string) => void | Promise<void>;
          onReasoningDelta?: (text: string) => void | Promise<void>;
          temperature?: number;
          maxTokens?: number;
          timeoutMs?: number;
        }
      | undefined,
    s: SystemSettings,
  ): Promise<string | null> {
    const resolved = await this.resolveHubChatTarget(requestedModel, s);
    if (!resolved) return null;
    const { model, cred } = resolved;
    const { baseURL, path } = this.resolveHubChatEndpoint(model, cred.baseUrl);
    if (!baseURL) return null;

    const http = createVendorHttpClient({
      baseURL,
      apiKey: cred.apiKey,
      proxyUrl: cred.proxyUrl,
      timeout: typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 300000,
    });
    const body: Record<string, unknown> = {
      model: model.modelId,
      messages,
      temperature: typeof opts?.temperature === 'number' ? opts.temperature : 0.7,
      stream: true,
    };
    if (typeof opts?.maxTokens === 'number' && opts.maxTokens > 0) {
      body.max_tokens = opts.maxTokens;
    }
    const res = await http.post(path, body, {
      responseType: 'stream',
      signal: opts?.signal,
    });

    const stream = res.data as NodeJS.ReadableStream;
    let full = '';
    let lineBuf = '';
    let chain = Promise.resolve();

    const handleLine = async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const { content: piece, reasoning } = this.streamChatPieces(json);
        if (reasoning) await opts?.onReasoningDelta?.(reasoning);
        if (piece) {
          full += piece;
          await opts?.onDelta?.(piece);
        }
      } catch {
        /* ignore */
      }
    };

    await new Promise<void>((resolve, reject) => {
      const fail = (e: unknown) => {
        reject(e);
        try {
          (stream as any).destroy?.();
        } catch {
          /* ignore */
        }
      };
      stream.on('data', (chunk: Buffer | string) => {
        lineBuf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        const parts = lineBuf.split(/\r?\n/);
        lineBuf = parts.pop() || '';
        chain = chain
          .then(async () => {
            for (const line of parts) await handleLine(line);
          })
          .catch(fail);
      });
      stream.on('end', () => {
        chain
          .then(async () => {
            if (lineBuf.trim()) await handleLine(lineBuf);
            resolve();
          })
          .catch(fail);
      });
      stream.on('error', fail);
      opts?.signal?.addEventListener(
        'abort',
        () => {
          const err = new Error('任务已取消');
          err.name = 'AbortError';
          fail(err);
        },
        { once: true },
      );
    });

    return full;
  }

  /**
   * 积木创建专用：优先选轻量对话模型，避免扩充任务因重模型失败。
   */
  async resolveAssembleChatModel(preferred?: string): Promise<string> {
    if (preferred) {
      const p = preferred.toLowerCase();
      if (/turbo|flash|mini|lite|seed-2/.test(p)) return preferred.trim();
    }
    const s = await this.settings.getInternal();
    const configured = String(s.defaultChatModel || '').trim();
    const n = configured.toLowerCase();
    if (/turbo|flash|mini|lite|seed-2|deepseek-v4/.test(n)) return configured;
    if (configured) return configured;
    throw new BadRequestException('未配置对话模型：请在系统设置选择默认对话模型。');
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    model?: string,
    opts?: { temperature?: number; maxTokens?: number; signal?: AbortSignal; timeoutMs?: number },
  ) {
    const s = await this.settings.getInternal();
    const requestedModel = String(model || s.defaultChatModel || '').trim();
    if (!requestedModel) {
      throw new BadRequestException('未指定对话模型：请在系统设置选择默认对话模型。');
    }
    try {
      const hubText = await this.tryHubChat(requestedModel, messages, opts, s);
      if (hubText != null) return hubText;
      throw new BadRequestException(
        `对话模型「${requestedModel}」不可用：请确认已从 Hub 拉取该模型所属渠道并配置 API Key。`,
      );
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') throw e;
      if (e instanceof BadRequestException) throw e;
      throw this.wrapAxiosError(e, '对话失败', 'chat');
    }
  }

  /**
   * 成片/复制用提示词：保证简体中文，且由模型一次写完、不超过 maxChars。
   * 不做硬截断半句；仅在已合规时直接返回草稿。
   */
  async ensureVideoPromptZh(
    draft: string,
    opts?: { maxChars?: number; model?: string; signal?: AbortSignal },
  ): Promise<string> {
    const maxChars = Math.max(500, Number(opts?.maxChars) || 4000);
    let text = stripClockDurationFromPrompt(normalizePromptText(String(draft || '')));
    if (!text) return '';
    const zhCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const mostlyZh = zhCount >= Math.min(30, Math.floor(text.length * 0.2));
    if (text.length <= maxChars && mostlyZh) return text;

    const system = `你是图生视频提示词编辑。把用户草稿改写成可直接提交的最终提示词。
硬性要求：
1) 全文必须简体中文（角色名等专有名词可保留）；
2) 总字数（含标点与空白）必须 ≤${maxChars}；一次写完整段，宁可精炼也不要超字数；禁止用省略号截断未写完的句子；
3) 必须明确保留参考图对应：图一=本镜首帧，图二=本镜尾帧，图三=场景参考图，图四起=各出场角色定妆图（按草稿中的角色顺序）；用起势→加速→交锋/推进→高潮→收束写从首帧到尾帧的连续动作，禁止写死「约 N 秒 / 0-3s」等时钟秒数（成片时长由工具另选）；角色脸/发型/服装须对齐对应定妆图；禁止念白、禁止烧录字幕；
4) 正文用真实换行分段；禁止输出字面量 \\n；禁止把 JSON 外壳包进正文；
5) 只输出提示词正文，不要解释、不要 Markdown 标题、不要字数统计。`;

    let result = String(
      await this.chat(
        [
          { role: 'system', content: system },
          {
            role: 'user',
            content: text.length > 12000 ? `${text.slice(0, 12000)}\n…（草稿已截断供改写）` : text,
          },
        ],
        opts?.model,
        { signal: opts?.signal, temperature: 0.3, maxTokens: Math.min(8192, maxChars + 200) },
      ),
    ).trim();

    if (result.length > maxChars) {
      result = String(
        await this.chat(
          [
            {
              role: 'system',
              content: `把下列提示词压缩为完整简体中文终稿，总字数必须 ≤${maxChars}，保留图一首帧/图二尾帧/图三场景与核心动作，禁止写死秒数，一次写完，只输出正文（真实换行，禁止字面量 \\n 与 JSON 外壳）。`,
            },
            { role: 'user', content: result.length > 9000 ? result.slice(0, 9000) : result },
          ],
          opts?.model,
          { signal: opts?.signal, temperature: 0.2, maxTokens: Math.min(8192, maxChars + 200) },
        ),
      ).trim();
    }
    return stripClockDurationFromPrompt(normalizePromptText(result));
  }

  /**
   * OpenAI 兼容流式对话。通过 onDelta 推送增量文本，并返回完整拼接结果。
   */
  async chatStream(
    messages: Array<{ role: string; content: string }>,
    opts?: {
      model?: string;
      signal?: AbortSignal;
      onDelta?: (text: string) => void | Promise<void>;
      /** DeepSeek 等模型的 reasoning / thinking 增量 */
      onReasoningDelta?: (text: string) => void | Promise<void>;
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
    },
  ): Promise<string> {
    const s = await this.settings.getInternal();
    const requestedModel = String(opts?.model || s.defaultChatModel || '').trim();

    if (!requestedModel) {
      throw new BadRequestException('未指定对话模型：请在系统设置选择默认对话模型。');
    }
    try {
      const hubFull = await this.tryHubChatStream(requestedModel, messages, opts, s);
      if (hubFull != null) return hubFull;
      throw new BadRequestException(
        `对话模型「${requestedModel}」不可用：请确认已从 Hub 拉取该模型所属渠道并配置 API Key。`,
      );
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') throw e;
      if (e instanceof BadRequestException) throw e;
      throw this.wrapAxiosError(e, '对话失败', 'chat');
    }
  }

  private async chatStreamOnce(
    messages: Array<{ role: string; content: string }>,
    opts: {
      model: string;
      vendor: AiProviderId;
      s: SystemSettings;
      signal?: AbortSignal;
      onDelta?: (text: string) => void | Promise<void>;
      onReasoningDelta?: (text: string) => void | Promise<void>;
      temperature?: number;
      maxTokens?: number;
      timeoutMs?: number;
    },
  ): Promise<string> {
    const http = await this.hubClient.clientFor(opts.vendor, opts.s);
    const cred = this.settings.credential(opts.vendor, opts.s);
    const body: Record<string, unknown> = {
      model: opts.model,
      messages,
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
      stream: true,
    };
    if (typeof opts.maxTokens === 'number' && opts.maxTokens > 0) {
      body.max_tokens = opts.maxTokens;
    }
    const res = await http.post(chatPath(cred.baseUrl), body, {
      responseType: 'stream',
      signal: opts.signal,
      timeout: typeof opts.timeoutMs === 'number' ? opts.timeoutMs : undefined,
    });

    const stream = res.data as NodeJS.ReadableStream;
    let full = '';
    let lineBuf = '';
    let chain = Promise.resolve();

    const handleLine = async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const { content: piece, reasoning } = this.streamChatPieces(json);
        if (reasoning) await opts.onReasoningDelta?.(reasoning);
        if (piece) {
          full += piece;
          await opts.onDelta?.(piece);
        }
      } catch {
        /* 忽略半包或非 JSON 行 */
      }
    };

    await new Promise<void>((resolve, reject) => {
      const fail = (e: unknown) => {
        reject(e);
        try {
          (stream as any).destroy?.();
        } catch {
          /* ignore */
        }
      };

      stream.on('data', (chunk: Buffer | string) => {
        lineBuf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        const parts = lineBuf.split(/\r?\n/);
        lineBuf = parts.pop() || '';
        chain = chain
          .then(async () => {
            for (const line of parts) await handleLine(line);
          })
          .catch(fail);
      });
      stream.on('end', () => {
        chain
          .then(async () => {
            if (lineBuf.trim()) await handleLine(lineBuf);
            resolve();
          })
          .catch(fail);
      });
      stream.on('error', fail);
      opts.signal?.addEventListener(
        'abort',
        () => {
          const err = new Error('任务已取消');
          err.name = 'AbortError';
          fail(err);
        },
        { once: true },
      );
    });

    return full;
  }

  async generateImage(
    prompt: string,
    opts?: {
      model?: string;
      size?: string;
      n?: number;
      signal?: AbortSignal;
      referenceImage?: string;
      referenceImages?: string[];
      negativePrompt?: string;
    },
  ): Promise<Array<{ url?: string; b64_json?: string }>> {
    const n = Math.min(4, Math.max(1, Number(opts?.n) || 1));
    // 多数模型（含 Seedream 5.0 Pro）单次只出 1 张；张数>1 时并行多次单图，凑成候选网格
    if (n > 1) {
      const settled = await Promise.allSettled(
        Array.from({ length: n }, () =>
          this.generateImageOnce(prompt, { ...opts, n: 1 }),
        ),
      );
      const out: Array<{ url?: string; b64_json?: string }> = [];
      let firstErr: unknown = null;
      for (const item of settled) {
        if (item.status === 'fulfilled') {
          for (const row of item.value || []) {
            if (row?.url || row?.b64_json) out.push(row);
          }
        } else if (!firstErr) {
          firstErr = item.reason;
        }
      }
      if (!out.length) {
        throw firstErr instanceof Error
          ? firstErr
          : new Error(String((firstErr as any)?.message || firstErr || '生图未返回图片'));
      }
      return out;
    }
    return this.generateImageOnce(prompt, { ...opts, n: 1 });
  }

  private async generateImageOnce(
    prompt: string,
    opts?: {
      model?: string;
      size?: string;
      n?: number;
      signal?: AbortSignal;
      referenceImage?: string;
      referenceImages?: string[];
      negativePrompt?: string;
    },
  ): Promise<Array<{ url?: string; b64_json?: string }>> {
    const s = await this.settings.getInternal();
    const requested = String(
      opts?.model || s.defaultImageModel || defaultModelFor('image', s.imageProvider),
    ).trim();
    // Seedream 等无独立 negative 字段：勿把负向词并入主 prompt（易触发「input text sensitive」）
    // 约束已写在布局硬锁的中文「禁止…」里；此处仅对非火山厂商保留可选负向拼接
    const fullPrompt = isVolcengineImageModel(requested)
      ? String(prompt || '').trim()
      : [prompt, opts?.negativePrompt].filter(Boolean).join('\n');
    const refs = [
      ...(Array.isArray(opts?.referenceImages) ? opts.referenceImages : []),
      opts?.referenceImage,
    ]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((x, i, arr) => arr.indexOf(x) === i)
      .slice(0, GPT_REF_MAX_COUNT);
    const ref = refs[0] || '';
    const size = String(opts?.size || '').trim();

    // 按模型分流：Seedream → 火山；gpt-image / 其他 → Hub 渠道
    if (isVolcengineImageModel(requested)) {
      return await this.withTransientImageRetry(
        () =>
          this.generateImageVolcengine(fullPrompt, {
            model: requested,
            size: size || '2K',
            n: 1,
            signal: opts?.signal,
            s,
            referenceImage: ref || undefined,
            referenceImages: refs,
          }),
        opts?.signal,
        '出图失败',
      );
    }

    if (refs.length) {
      if (/wanx|bailian|dashscope|qwen-image/i.test(requested)) {
        return await this.withTransientImageRetry(
          () =>
            this.generateImageBailian(fullPrompt, {
              model: requested,
              size: size || '1024x1024',
              n: 1,
              signal: opts?.signal,
              s,
              referenceImage: ref,
            }),
          opts?.signal,
          '出图失败',
        );
      }
      if (isGptImageModel(requested) || /chatgpt-image/i.test(requested)) {
        return await this.withTransientImageRetry(
          () =>
            this.generateImageGptEdit(fullPrompt, {
              model: requested,
              size: size || '1024x1024',
              signal: opts?.signal,
              s,
              referenceImages: refs,
            }),
          opts?.signal,
          '出图失败',
        );
      }
      if (/flux|kolors/i.test(requested)) {
        return await this.withTransientImageRetry(
          () => this.generateImageFluxHub(fullPrompt, requested, opts?.signal, s),
          opts?.signal,
          '出图失败',
        );
      }
    }

    const model = this.resolveCoverImageModel(requested);
    // 显式 Seedream 已在上面；其余走 Hub OpenAI 兼容 Images
    if (isVolcengineImageModel(model)) {
      return await this.withTransientImageRetry(
        () =>
          this.generateImageVolcengine(fullPrompt, {
            model,
            size: size || '2K',
            n: 1,
            signal: opts?.signal,
            s,
            referenceImage: ref || undefined,
            referenceImages: refs,
          }),
        opts?.signal,
        '出图失败',
      );
    }

    return await this.withTransientImageRetry(
      () => this.postCoverImage(fullPrompt, model, opts?.size, opts?.signal, s),
      opts?.signal,
      '出图失败',
    );
  }

  /** 封面 / 文生图模型别名 → 默认火山 Seedream（空则依赖设置 / Hub） */
  resolveCoverImageModel(raw?: string) {
    const m = String(raw || '').trim();
    const map: Record<string, string> = {
      'image-openai': defaultModelFor('image', 'volcengine'),
      'image-flux': defaultModelFor('image', 'volcengine'),
      'image-mj': defaultModelFor('image', 'volcengine'),
      'dall-e': 'dall-e-3',
      'dall-e-2': 'dall-e-3',
    };
    return map[m] || m || defaultModelFor('image', 'volcengine');
  }

  async generateCoverImage(
    prompt: string,
    opts?: {
      model?: string;
      size?: string;
      signal?: AbortSignal;
    },
  ): Promise<Array<{ url?: string; b64_json?: string }>> {
    const s = await this.settings.getInternal();
    const model = this.resolveCoverImageModel(opts?.model || s.defaultImageModel);
    return await this.withTransientImageRetry(
      () => this.postCoverImage(prompt, model, opts?.size, opts?.signal, s),
      opts?.signal,
      '封面出图失败',
    );
  }

  /** 出图繁忙时同模型退避重试；不切换到其它模型 */
  private async withTransientImageRetry<T>(
    run: () => Promise<T>,
    signal: AbortSignal | undefined,
    failLabel: string,
  ): Promise<T> {
    return this.withTransientMediaRetry(run, signal, failLabel, 'image');
  }

  /** 视频提交瞬时失败重试（503/负载）；不重试审核/参数 400，也不做模式降级 */
  private async withTransientVideoRetry<T>(
    run: () => Promise<T>,
    signal: AbortSignal | undefined,
    failLabel: string,
  ): Promise<T> {
    return this.withTransientMediaRetry(run, signal, failLabel, 'video');
  }

  private async withTransientMediaRetry<T>(
    run: () => Promise<T>,
    signal: AbortSignal | undefined,
    failLabel: string,
    surface: 'image' | 'video',
  ): Promise<T> {
    let lastErr: unknown;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await run();
      } catch (e: any) {
        if (isAbortLike(e)) throw e;
        lastErr = e;
        const classified = classifyAiError(e, surface);
        if (classified.retryable && attempt < maxAttempts) {
          await sleep(1200 * attempt, signal);
          continue;
        }
        throw this.wrapAxiosError(e, failLabel, surface);
      }
    }
    throw this.wrapAxiosError(lastErr, failLabel, surface);
  }

  /** 火山方舟 Seedream 文生图 / 图生图 */
  private async generateImageVolcengine(
    prompt: string,
    opts: {
      model: string;
      size?: string;
      n?: number;
      signal?: AbortSignal;
      s: SystemSettings;
      referenceImage?: string;
      referenceImages?: string[];
    },
  ): Promise<Array<{ url?: string; b64_json?: string }>> {
    const model = String(opts.model || '').trim();
    const hub = await this.hubClient.requireHubModalityClient(model, 'image', opts.s);
    const http = hub.http;
    const imagePath = hub.path || imagesPath(String(http.defaults.baseURL || ''));
    const sizeRaw = String(opts.size || '').trim();
    // 方舟 Seedream：优先保留 WxH（控制画幅）；否则 2K / 1K
    let size = sizeRaw || '2K';
    if (/^\d+x\d+$/i.test(sizeRaw)) {
      size = sizeRaw.toLowerCase();
    } else if (/^4k$/i.test(sizeRaw)) {
      size = '4K';
    } else if (/^1k$/i.test(sizeRaw)) {
      size = '1K';
    } else if (/^2k$/i.test(sizeRaw)) {
      size = '2K';
    }
    const body: Record<string, unknown> = {
      model,
      // 字数由上游扩写自控（≤4000）；此处不硬截断，避免切断精美细节
      prompt: String(prompt || '').trim(),
      size,
      response_format: 'url',
      watermark: false,
      n: Math.min(Math.max(Number(opts.n) || 1, 1), 4),
    };
    const refs = [
      ...(Array.isArray(opts.referenceImages) ? opts.referenceImages : []),
      opts.referenceImage,
    ]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((x, i, arr) => arr.indexOf(x) === i)
      .slice(0, 10);
    // 画布产物多为 /api/uploads/...，豆包无法拉取，需转成 data URL
    const resolved: string[] = [];
    for (const r of refs) {
      resolved.push(await this.resolveImageRefForRemoteApi(r));
    }
    if (resolved.length === 1) body.image = resolved[0];
    else if (resolved.length > 1) body.image = resolved;
    const res = await http.post(imagePath, body, { signal: opts.signal });
    const data = res.data?.data;
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const out = rows
      .map((r: any) => ({
        url: String(r?.url || r?.image_url || '').trim() || undefined,
        b64_json: r?.b64_json ? String(r.b64_json) : undefined,
      }))
      .filter((r: any) => r.url || r.b64_json);
    if (out.length) return out;
    const url = this.extractUrl(res.data);
    if (url) return [{ url }];
    throw new Error(`火山出图未返回图片: ${JSON.stringify(res.data)?.slice(0, 500)}`);
  }

  private async postCoverImage(
    prompt: string,
    model: string,
    sizeRaw: string | undefined,
    signal: AbortSignal | undefined,
    s: SystemSettings,
  ) {
    const resolved = this.resolveCoverImageModel(model);
    if (isVolcengineImageModel(resolved)) {
      return this.generateImageVolcengine(prompt, {
        model: resolved,
        size: sizeRaw,
        signal,
        s,
      });
    }

    const hub = await this.hubClient.requireHubImageClient(resolved, s);
    const size = /^gpt-image|chatgpt-image/i.test(resolved)
      ? this.gptImageSize(sizeRaw)
      : String(sizeRaw || '').trim() || '1024x1024';
    const body: Record<string, unknown> = {
      model: resolved,
      prompt: String(prompt || '').trim().slice(0, 3800),
      n: 1,
      size,
      // 优先要在线 URL（与 Seedream 一致）；部分网关不支持再降级
      response_format: 'url',
    };
    if (/^dall-e/i.test(resolved)) {
      body.quality = 'standard';
    }
    const res = await this.postImagesPreferUrl(
      hub.http,
      hub.path || imagesPath(hub.baseUrl),
      body,
      signal,
    );
    const rows = await this.resolveImageRowsFromGenerationResponse(hub.http, res.data, {
      signal,
      imagePath: hub.path || imagesPath(hub.baseUrl),
    });
    if (rows.length) return rows;
    throw new Error(`出图未返回结果：${JSON.stringify(res.data)?.slice(0, 400)}`);
  }

  /** OpenAI Images：优先 response_format=url；网关拒绝时去掉再试 */
  private async postImagesPreferUrl(
    http: AxiosInstance,
    path: string,
    body: Record<string, unknown> | FormData,
    signal?: AbortSignal,
    extraConfig?: Record<string, unknown>,
  ) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    try {
      return await http.post(path, body, {
        signal,
        timeout: 300000,
        ...(extraConfig || {}),
      });
    } catch (e: any) {
      const msg = String(
        e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || '',
      );
      const rejectFormat =
        /response_format|unknown parameter|unsupported|not support|无效/i.test(msg);
      if (!rejectFormat) throw e;
      if (isForm) {
        try {
          (body as FormData).delete('response_format');
        } catch {
          /* ignore */
        }
      } else {
        delete (body as Record<string, unknown>).response_format;
      }
      return await http.post(path, body, {
        signal,
        timeout: 300000,
        ...(extraConfig || {}),
      });
    }
  }

  /** 规范化 OpenAI Images 出图结果：优先保留 https 在线链接 */
  private normalizeOpenAiImageRows(payload: any): Array<{ url?: string; b64_json?: string }> {
    const data = payload?.data;
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const mapped = rows
      .map((d: any) => {
        // 异步提交行（仅有 task_id）不当作出图结果
        if (d?.task_id || d?.taskId) {
          if (!d?.url && !d?.b64_json && !d?.image_url) return { url: undefined };
        }
        const urlRaw = d?.url ?? d?.image_url;
        const url = Array.isArray(urlRaw)
          ? String(urlRaw.find((x) => /^https?:\/\//i.test(String(x || ''))) || '').trim() ||
            undefined
          : String(urlRaw || '').trim() || undefined;
        const b64 = d?.b64_json ? String(d.b64_json) : undefined;
        return { url, b64_json: b64 };
      })
      .filter((r: { url?: string; b64_json?: string }) => r.url || r.b64_json);
    if (mapped.length) {
      // 有在线 URL 时丢掉同条 b64，避免下游优先吃 base64 落本地
      return mapped.map((r) =>
        r.url && /^https?:\/\//i.test(r.url) ? { url: r.url } : r,
      );
    }
    const url = this.extractUrl(payload);
    return url ? [{ url }] : [];
  }

  /** APIMart 等：提交后返回 task_id，需轮询 /v1/tasks/{id} */
  private extractAsyncImageTaskId(payload: any): string {
    const data = payload?.data;
    if (Array.isArray(data)) {
      for (const row of data) {
        const id = String(row?.task_id || row?.taskId || '').trim();
        if (!id) continue;
        const st = String(row?.status || '').toLowerCase();
        if (!row?.url && !row?.b64_json) return id;
        if (['submitted', 'pending', 'processing', 'queued', 'in_progress'].includes(st)) {
          return id;
        }
      }
    } else if (data && typeof data === 'object') {
      const id = String(data.task_id || data.taskId || '').trim();
      const st = String(data.status || '').toLowerCase();
      if (id && !data.url && !data.b64_json) return id;
      if (id && ['submitted', 'pending', 'processing', 'queued'].includes(st)) return id;
    }
    const top = String(payload?.task_id || payload?.taskId || '').trim();
    return top;
  }

  private imageTaskStatusPath(http: AxiosInstance, imagePath: string | undefined, taskId: string) {
    const base = String(http.defaults.baseURL || '');
    const path = String(imagePath || '');
    if (/\/v1\/?$/.test(base.replace(/\/+$/, ''))) return `/tasks/${encodeURIComponent(taskId)}`;
    if (/\/v1\//.test(path) || /\/v1/.test(base)) {
      return `/v1/tasks/${encodeURIComponent(taskId)}`;
    }
    return `/v1/tasks/${encodeURIComponent(taskId)}`;
  }

  /** 从 APIMart task.result.images 等结构抠出图片 URL */
  private extractImageRowsFromTaskPayload(
    payload: any,
  ): Array<{ url?: string; b64_json?: string }> {
    const sync = this.normalizeOpenAiImageRows(payload);
    if (sync.length) return sync;

    const root = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
    const images =
      root?.result?.images ||
      root?.images ||
      root?.result?.data ||
      (Array.isArray(root?.result) ? root.result : null) ||
      [];
    const out: Array<{ url?: string; b64_json?: string }> = [];
    const pushUrl = (u: unknown) => {
      const s = String(u || '').trim();
      if (/^https?:\/\//i.test(s)) out.push({ url: s });
    };
    if (Array.isArray(images)) {
      for (const img of images) {
        if (typeof img === 'string') {
          pushUrl(img);
          continue;
        }
        const u = img?.url ?? img?.image_url ?? img?.imageUrl;
        if (Array.isArray(u)) u.forEach(pushUrl);
        else pushUrl(u);
        if (img?.b64_json) out.push({ b64_json: String(img.b64_json) });
      }
    }
    if (!out.length) {
      const u = this.extractUrl(payload) || this.extractUrl(root) || this.extractUrl(root?.result);
      if (u) out.push({ url: u });
    }
    return out;
  }

  /**
   * 同步 OpenAI 风格结果，或 APIMart 异步 task 轮询后取图。
   */
  private async resolveImageRowsFromGenerationResponse(
    http: AxiosInstance,
    payload: any,
    opts?: { signal?: AbortSignal; imagePath?: string },
  ): Promise<Array<{ url?: string; b64_json?: string }>> {
    const immediate = this.extractImageRowsFromTaskPayload(payload);
    if (immediate.length) return immediate;

    const taskId = this.extractAsyncImageTaskId(payload);
    if (!taskId) return [];

    const taskPath = this.imageTaskStatusPath(http, opts?.imagePath, taskId);
    const maxAttempts = 100;
    const intervalMs = 3000;
    let last: any;
    for (let i = 0; i < maxAttempts; i++) {
      if (opts?.signal?.aborted) {
        const err = new Error('任务已取消');
        err.name = 'AbortError';
        throw err;
      }
      const res = await http.get(taskPath, { signal: opts?.signal, timeout: 60000 });
      last = res.data;
      const node = last?.data && !Array.isArray(last.data) ? last.data : last;
      const status = String(node?.status || last?.status || '').toLowerCase();
      const rows = this.extractImageRowsFromTaskPayload(last);
      if (rows.length && (['completed', 'succeeded', 'success', 'done'].includes(status) || !status)) {
        return rows;
      }
      if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status)) {
        const errDetail =
          node?.error?.message ||
          last?.error?.message ||
          (typeof node?.error === 'string' ? node.error : null) ||
          node?.message ||
          last?.message ||
          '异步出图失败';
        throw new Error(String(errDetail));
      }
      await sleep(intervalMs, opts?.signal);
    }
    throw new Error(
      `异步出图超时（task ${taskId}）：${JSON.stringify(last)?.slice(0, 400)}`,
    );
  }

  /** gpt-image 官方尺寸：方/横/竖 */
  private gptImageSize(sizeRaw?: string) {
    const s = String(sizeRaw || '').trim();
    if (/1280x720|1536x1024|16:?9|landscape|横/i.test(s)) return '1536x1024';
    if (/720x1280|1024x1536|9:?16|portrait|竖/i.test(s)) return '1024x1536';
    if (/1024x1024|1:?1|square/i.test(s)) return '1024x1024';
    return '1536x1024';
  }

  private dataUrlOrBase64ToBuffer(ref: string): { buffer: Buffer; mime: string; ext: string } {
    const raw = String(ref || '').trim();
    const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
    if (m) {
      const mime = m[1].toLowerCase();
      const ext = mime.includes('png')
        ? 'png'
        : mime.includes('webp')
          ? 'webp'
          : mime.includes('jpeg') || mime.includes('jpg')
            ? 'jpg'
            : 'png';
      return { buffer: Buffer.from(m[2], 'base64'), mime: mime || `image/${ext}`, ext };
    }
    return { buffer: Buffer.from(raw, 'base64'), mime: 'image/png', ext: 'png' };
  }

  private dataUrlOrBase64ToFile(ref: string, filename = 'reference.jpg'): File {
    const { buffer, mime, ext } = this.dataUrlOrBase64ToBuffer(ref);
    const base = filename.replace(/\.[^.]+$/, '') || 'reference';
    return new File([new Uint8Array(buffer)], `${base}.${ext}`, {
      type: mime || `image/${ext}`,
    });
  }

  private resolveFfmpegBin(): string {
    const env = String(process.env.FFMPEG_PATH || '').trim();
    if (env && existsSync(env)) return env;
    for (const p of ['D:\\ffmpeg\\ffmpeg.exe', 'C:\\ffmpeg\\bin\\ffmpeg.exe', 'ffmpeg']) {
      if (p === 'ffmpeg' || existsSync(p)) return p;
    }
    return 'ffmpeg';
  }

  private runFfmpeg(args: string[]): Promise<void> {
    const bin = this.resolveFfmpegBin();
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr?.on('data', (d) => {
        err += String(d || '');
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg 压缩参考图失败(${code}): ${err.slice(-300)}`));
      });
    });
  }

  /** 压缩参考图，避免 OpenResty 413（多图 edits 体积过大） */
  private async compressReferenceDataUrl(ref: string): Promise<string> {
    const raw = String(ref || '').trim();
    if (!raw) return '';
    const { buffer, ext } = this.dataUrlOrBase64ToBuffer(raw);
    if (buffer.length <= GPT_REF_MAX_BYTES && /jpe?g/i.test(ext)) {
      return raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }
    const id = randomUUID();
    const dir = join(tmpdir(), 'ai-comic-refs');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const input = join(dir, `${id}.in.${ext || 'png'}`);
    const output = join(dir, `${id}.out.jpg`);
    try {
      writeFileSync(input, buffer);
      await this.runFfmpeg([
        '-y',
        '-i',
        input,
        '-vf',
        "scale='min(1280,iw)':-2",
        '-q:v',
        '5',
        output,
      ]);
      if (!existsSync(output)) throw new Error('压缩结果不存在');
      const out = readFileSync(output);
      // 仍过大再压一轮
      if (out.length > GPT_REF_MAX_BYTES) {
        const output2 = join(dir, `${id}.out2.jpg`);
        await this.runFfmpeg([
          '-y',
          '-i',
          output,
          '-vf',
          "scale='min(960,iw)':-2",
          '-q:v',
          '8',
          output2,
        ]);
        const out2 = readFileSync(output2);
        try {
          unlinkSync(output2);
        } catch {
          /* ignore */
        }
        return `data:image/jpeg;base64,${out2.toString('base64')}`;
      }
      return `data:image/jpeg;base64,${out.toString('base64')}`;
    } catch {
      // ffmpeg 不可用时：过大则直接拒绝该张，调用方会少传几张
      if (buffer.length > GPT_REF_MAX_BYTES * 2) return '';
      return raw.startsWith('data:')
        ? raw
        : `data:image/${ext || 'png'};base64,${buffer.toString('base64')}`;
    } finally {
      for (const f of [input, output]) {
        try {
          if (existsSync(f)) unlinkSync(f);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * gpt-image / gpt-image-1.5：有参考图时走 /images/edits（支持多图 + input_fidelity）
   * 用于定妆 + 场景等多参考下的分镜出图。
   */
  private async generateImageGptEdit(
    prompt: string,
    opts: {
      model: string;
      size: string;
      signal?: AbortSignal;
      s: SystemSettings;
      referenceImages: string[];
    },
  ) {
    const model = String(opts.model || defaultModelFor('image', 'volcengine')).trim();
    const hub = await this.hubClient.requireHubImageClient(model, opts.s);
    const http = hub.http;
    const cred = { baseUrl: hub.baseUrl };
    const size = this.gptImageSize(opts.size);
    const compressed: string[] = [];
    for (const img of (opts.referenceImages || []).map((x) => String(x || '').trim()).filter(Boolean)) {
      if (compressed.length >= GPT_REF_MAX_COUNT) break;
      const c = await this.compressReferenceDataUrl(img);
      if (c) compressed.push(c);
    }
    if (!compressed.length) throw new Error('gpt-image 参考出图缺少可用参考图（可能过大被丢弃）');

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', String(prompt || '').trim().slice(0, 32000));
    form.append('size', size);
    form.append('n', '1');
    form.append('response_format', 'url');
    // gpt-image-2 强制高保真，传 input_fidelity 会报错
    if (!/^gpt-image-2/i.test(model)) {
      form.append('input_fidelity', 'high');
    }
    compressed.forEach((img, i) => {
      form.append('image', this.dataUrlOrBase64ToFile(img, `ref_${i + 1}.jpg`));
    });

    const res = await this.postImagesPreferUrl(
      http,
      /edit/i.test(hub.path || '') ? hub.path : imagesEditPath(cred.baseUrl),
      form,
      opts.signal,
      {
        maxBodyLength: 25 * 1024 * 1024,
        maxContentLength: 25 * 1024 * 1024,
        // clientFor 默认 application/json，必须清掉才能带 multipart boundary
        headers: { 'Content-Type': undefined as unknown as string },
      },
    );
    const rows = await this.resolveImageRowsFromGenerationResponse(http, res.data, {
      signal: opts.signal,
      imagePath: /edit/i.test(hub.path || '') ? hub.path : imagesEditPath(cred.baseUrl),
    });
    if (rows.length) return rows;
    throw new Error(`gpt-image 参考出图未返回结果：${JSON.stringify(res.data)?.slice(0, 400)}`);
  }

  private defaultCoverSize(model: string) {
    if (/^dall-e-3$/i.test(model)) return '1024x1792'; // 竖版书封
    if (/^gpt-image|chatgpt-image/i.test(model)) return '1024x1536';
    return '1024x1024';
  }

  private async generateImageFluxHub(
    prompt: string,
    model: string,
    signal: AbortSignal | undefined,
    s: SystemSettings,
  ) {
    const hub = await this.hubClient.requireHubImageClient(model, s);
    const http = hub.http;
    const res = await http.post(
      hub.path || '/flux/v1/images/generations',
      { prompt, model: this.resolveImageModel(model) },
      { signal },
    );
    const rows = await this.resolveImageRowsFromGenerationResponse(http, res.data, {
      signal,
      imagePath: hub.path || '/flux/v1/images/generations',
    });
    if (rows.length) return rows;
    const data = res.data?.data || res.data?.images;
    if (Array.isArray(data)) return data as Array<{ url?: string; b64_json?: string }>;
    const url = this.extractUrl(res.data);
    return url ? [{ url }] : [];
  }

  private async generateImageBailian(
    prompt: string,
    opts: {
      model: string;
      size: string;
      n?: number;
      signal?: AbortSignal;
      s: SystemSettings;
      referenceImage?: string;
    },
  ) {
    // 百炼曾挂在内置 OpenAI-HK Key 下；现需 Hub 渠道
    const hub = await this.hubClient.requireHubImageClient(opts.model, opts.s);
    const auth = String(
      (hub.http.defaults.headers as any)?.Authorization ||
        (hub.http.defaults.headers as any)?.common?.Authorization ||
        '',
    );
    const apiKey = auth.replace(/^Bearer\s+/i, '').trim();
    if (!apiKey) {
      throw new BadRequestException(
        '百炼/通义渠道未配置 API Key。请在 Hub 渠道中填写后重试。',
      );
    }
    const host = dashscopeHost(hub.baseUrl);
    const http = cloneVendorHttpClient(hub.http, {
      baseURL: host,
      apiKey,
      timeout: 300000,
      headers: { 'X-DashScope-Async': 'enable' },
    });
    const [w, h] = String(opts.size).split('x').map((x) => Number(x) || 1024);
    const input: Record<string, unknown> = { prompt };
    if (opts.referenceImage) input.ref_img = opts.referenceImage;
    const res = await http.post(
      '/api/v1/services/aigc/text2image/image-synthesis',
      {
        model: opts.model || 'wanx-v1',
        input,
        parameters: {
          size: `${w}*${h}`,
          n: opts.n || 1,
        },
      },
      { signal: opts.signal },
    );
    const taskId = res.data?.output?.task_id || res.data?.task_id || res.data?.request_id;
    const immediate =
      res.data?.output?.results?.[0]?.url || this.extractUrl(res.data?.output) || this.extractUrl(res.data);
    if (immediate) return [{ url: immediate }];
    if (!taskId) throw new Error(`百炼出图未返回任务 ID: ${JSON.stringify(res.data)?.slice(0, 400)}`);

    const polled = await this.pollUntilUrl(
      async () => {
        const r = await http.get(`/api/v1/tasks/${encodeURIComponent(String(taskId))}`, {
          signal: opts.signal,
        });
        return r.data;
      },
      { intervalMs: 2500, maxAttempts: 90, signal: opts.signal },
    );
    return [{ url: polled.url }];
  }

  async generateImageFlux(prompt: string, model = 'Kwai-Kolors/Kolors', signal?: AbortSignal) {
    return this.generateImage(prompt, {
      model: this.resolveImageModel(model, 'Kwai-Kolors/Kolors'),
      signal,
    });
  }

  private wrapAxiosError(e: any, fallback: string, kind?: 'image' | 'video' | 'chat') {
    if (e instanceof BadRequestException) throw e;
    const data = e?.response?.data;
    const status = Number(e?.response?.status || 0);
    const reqUrl = `${String(e?.config?.baseURL || '')}${String(e?.config?.url || '')}`.replace(
      /([^:]\/)\/+/g,
      '$1',
    );
    const upstream =
      extractUpstreamErrorDetail(data) ||
      String(e?.message || '').trim() ||
      '';
    let msg = this.localizeUpstreamMessage(upstream || fallback, kind);

    // 禁止只留下「出图失败」这类空壳：补上 HTTP / 地址 / 原文摘要
    const tooGeneric =
      !msg ||
      msg === fallback ||
      /^(出图失败|封面出图失败|视频生成失败|对话失败)$/.test(msg);
    if (tooGeneric) {
      const bits = [fallback];
      if (status) bits.push(`HTTP ${status}`);
      if (upstream && upstream !== fallback) bits.push(upstream.slice(0, 400));
      else if (data != null) {
        try {
          bits.push(JSON.stringify(data).slice(0, 400));
        } catch {
          /* ignore */
        }
      } else if (e?.code) {
        bits.push(String(e.code));
      } else if (!status) {
        bits.push('无上游响应体（可能是网络中断、超时或网关空响应）');
      }
      if (reqUrl) bits.push(`请求 ${reqUrl}`);
      msg = bits.filter(Boolean).join(' · ');
    }

    if (
      status === 400 ||
      /^400$/.test(msg) ||
      /status code 400/i.test(msg)
    ) {
      // 已本地化的审核类文案不要再包一层英文原文
      if (/真人|审核|敏感|违规/.test(msg) && !/status code 400/i.test(msg)) {
        /* keep localized */
      } else {
        const hint =
          kind === 'video'
            ? '常见原因：首/尾帧含真人被拒、图无法访问、或模型未开通。'
            : '请检查模型是否已开通、尺寸是否支持，以及参考图是否可被远端访问。';
        if (/status code 400/i.test(msg) || msg === '400' || msg === fallback) {
          msg = `${fallback}（400）。${hint}${upstream && upstream !== fallback ? ` 原文：${upstream.slice(0, 300)}` : ''}${reqUrl ? ` 请求：${reqUrl}` : ''}`;
        } else if (!msg.includes(fallback)) {
          msg = `${fallback}（400）：${msg}`;
        }
      }
    }
    if (status === 404 || /status code 404/i.test(msg)) {
      if (kind === 'video') {
        msg = [
          `${fallback}（404）`,
          '常见原因是当前视频模型尚未在火山方舟开通，或该 API Key 没有该模型权限。',
          '请到方舟控制台开通 Seedance（如 Doubao Seedance 2.0 / Mini），确认账户满足开通条件（余额或资源包），并核对模型 ID / 推理接入点（ep-）是否填对。',
          reqUrl ? `请求地址：${reqUrl}` : '',
        ]
          .filter(Boolean)
          .join(' ');
      } else if (kind === 'image') {
        msg = [
          `${fallback}（404）`,
          '常见原因是当前图像模型未开通，或 API Key 无权限。',
          '请确认 Hub 渠道已配置、模型已开通，并核对模型 ID。',
          reqUrl ? `请求地址：${reqUrl}` : '',
        ]
          .filter(Boolean)
          .join(' ');
      } else {
        msg = [
          `${fallback}（404：接口不存在${reqUrl ? ` · ${reqUrl}` : ''}）`,
          '请先确认模型已开通且 API Key 有权限；若地址明显不对，再检查 Hub 渠道的 baseUrlHint + apiPrefix（火山一般为主机 + /api/v3）。',
        ].join(' ');
      }
    }
    if (status === 413 || /413|request entity too large|Payload Too Large/i.test(msg)) {
      msg =
        kind === 'image'
          ? '参考图体积过大被网关拒绝（413）。已改为压缩并减少参考图数量，请重试生成。'
          : `${fallback}：请求体过大（413），请减小上传内容后重试。`;
    }
    // axios 常把空 body 的 503 收成「Request failed with status code 503」
    if (
      status === 503 ||
      /^503$/.test(msg) ||
      /status code 503|service unavailable/i.test(msg)
    ) {
      if (kind === 'image') {
        msg =
          '出图暂时繁忙（上游 503，多为瞬时过载）。已自动重试仍失败时可稍后再试，或在「写作任务」里点重试；不会自动改换模型。';
      } else if (kind === 'chat') {
        msg =
          '对话模型暂时繁忙（上游 503）。请在系统设置换用其他 Hub / 火山对话模型后重试。';
      } else {
        msg = `${fallback}：上游暂时繁忙（503），请稍后重试。`;
      }
    }
    if (/model disabled|模型.*禁用|已下线/i.test(msg)) {
      const looksVideo =
        kind === 'video' || /Wan-|I2V|T2V|Seedance|veo|视频/i.test(`${msg} ${fallback}`);
      msg = looksVideo
        ? `${msg}（该视频模型在硅基流动不可用/已下线，请改用 Wan-AI/Wan2.2-I2V-A14B 或 Wan-AI/Wan2.2-T2V-A14B）`
        : `${msg}（该图像模型在硅基流动已下线，请改用 Kwai-Kolors/Kolors 或 Qwen/Qwen-Image）`;
    }
    if (/no available channel|model_not_found/i.test(msg)) {
      msg = `${msg}（当前模型无可用通道，请在设置里换用 Hub / 火山模型后重试）`;
    }
    if (/does not exist or you do not have access/i.test(msg)) {
      msg = `${msg}（火山方舟：请先在控制台「开通」该模型；更稳妥是创建推理接入点，把 ep- 开头的接入点 ID 填到图像默认模型。并确认用的是方舟 API Key，不是通用 AK）`;
    }
    if (/api key format is incorrect|incorrect.*api.?key.?format/i.test(msg)) {
      msg =
        kind === 'chat'
          ? '火山方舟 API Key 格式不正确。请到「系统设置 → 渠道」配置火山方舟对应渠道的 API Key（不要粘贴加密串或其他中转 Key）。'
          : '火山方舟 API Key 格式不正确。请在系统设置中重新填写方舟控制台的 API Key。';
    }
    return new BadRequestException(msg);
  }

  /** 把火山等上游英文错误翻成可读中文 */
  private localizeUpstreamMessage(raw: string, kind?: 'image' | 'video' | 'chat') {
    const msg = String(raw || '').trim();
    if (!msg) return msg;

    if (/real person|contain real people|may contain real person/i.test(msg)) {
      const which = /content\[\d+\].*content\[\d+\]/i.test(msg)
        ? '首帧和尾帧'
        : /content\[2\]/i.test(msg)
          ? '尾帧'
          : /content\[1\]/i.test(msg)
            ? '首帧（或参考图）'
            : '参考图';
      return kind === 'image'
        ? `出图被内容安全拒绝：${which}疑似含真人。请改用二次元/插画风格，或去掉清晰人像后再试。`
        : `视频被内容安全拒绝：${which}疑似含真人，当前豆包视频模型不允许用真人照片做图生视频。请改成动漫/插画风格关键帧，或换不含清晰真人脸的图后再试。`;
    }
    if (/InputImageSensitiveContentDetected|sensitive.?content|OutputTextSensitiveContentDetected/i.test(msg)) {
      return '内容安全审核未通过（含敏感内容）。请修改提示词或参考图后重试。';
    }
    if (
      /InputTextSensitiveContentDetected|input text may contain sensitive|contain sensitive information/i.test(
        msg,
      )
    ) {
      return '提示词未通过内容安全审核（文本含敏感信息）。请改写提示词后重试，避免年龄敏感、暴力色情等表述。';
    }
    if (/api key format is incorrect|incorrect.*api.?key.?format/i.test(msg)) {
      return 'API Key 格式不正确';
    }
    if (/invalid.?url|InvalidImageURL|image url/i.test(msg) && /invalid|fail|error|access/i.test(msg)) {
      return '参考图地址无效或豆包无法访问。请确认首尾帧已生成，且为可访问的公网图片。';
    }
    if (/Risk|Audit|违规|审核不通过/i.test(msg) && /image|图|video|视频|content/i.test(msg)) {
      return `内容安全审核未通过：${msg.replace(/\s*Request id:.*$/i, '').trim()}`;
    }
    // 去掉冗长 Request id，界面更干净；需要时仍可在服务端日志看到
    return msg.replace(/\s*Request id:\s*\S+/i, '').trim() || msg;
  }

  private extractUrl(obj: any): string | undefined {
    if (!obj) return undefined;
    if (typeof obj === 'string' && /^https?:\/\//.test(obj)) return obj;
    // APIMart：result.images[].url 可能是字符串数组
    const amImages = obj?.result?.images || obj?.images;
    if (Array.isArray(amImages)) {
      for (const img of amImages) {
        const u = img?.url ?? img;
        if (typeof u === 'string' && /^https?:\/\//.test(u)) return u;
        if (Array.isArray(u)) {
          const hit = u.find((x) => typeof x === 'string' && /^https?:\/\//.test(x));
          if (hit) return String(hit);
        }
      }
    }
    const candidates = [
      obj.url,
      obj.imageUrl,
      obj.image_url,
      obj.video_url,
      obj.audio_url,
      obj.result,
      obj.output,
      Array.isArray(obj.imageUrl) ? obj.imageUrl[0] : undefined,
      Array.isArray(obj.url) ? obj.url[0] : undefined,
      obj.data?.url,
      obj.data?.[0]?.url,
      obj.data?.[0]?.audio_url,
      obj.songs?.[0]?.audio_url,
      obj.songs?.[0]?.url,
      obj.result?.url,
      obj.result?.imageUrl,
      obj.output?.video_url,
      obj.output?.results?.[0]?.url,
      obj.content?.video_url,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && /^https?:\/\//.test(c)) return c;
      if (Array.isArray(c) && typeof c[0] === 'string' && /^https?:\/\//.test(c[0])) return c[0];
    }
    return undefined;
  }

  private async pollUntilUrl(
    fetchOnce: () => Promise<any>,
    opts?: {
      intervalMs?: number;
      maxAttempts?: number;
      onProgress?: (msg: string) => Promise<void>;
      signal?: AbortSignal;
      successStatuses?: string[];
    },
  ) {
    const interval = opts?.intervalMs ?? 3000;
    const max = opts?.maxAttempts ?? 60;
    const okStatus = new Set(
      (opts?.successStatuses || ['succeeded', 'success', 'succeed', 'completed', 'done']).map((x) =>
        x.toLowerCase(),
      ),
    );
    const pending = new Set(['pending', 'running', 'processing', 'queued', 'submitted', 'in_progress']);
    let last: any;
    for (let i = 0; i < max; i++) {
      if (opts?.signal?.aborted) {
        const err = new Error('任务已取消');
        err.name = 'AbortError';
        throw err;
      }
      last = await fetchOnce();
      const status = String(
        last?.status || last?.output?.task_status || last?.data?.status || last?.state || '',
      ).toLowerCase();
      const url =
        this.extractUrl(last) ||
        this.extractUrl(last?.data) ||
        this.extractUrl(last?.output) ||
        last?.output?.results?.[0]?.url ||
        last?.content?.video_url;
      if (url && (!status || okStatus.has(status) || !pending.has(status))) {
        return { url, raw: last };
      }
      if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status)) {
        const errDetail =
          last?.failReason ||
          last?.error?.message ||
          (typeof last?.error === 'string' ? last.error : null) ||
          last?.output?.message ||
          last?.message ||
          (typeof last?.error === 'object' ? JSON.stringify(last.error).slice(0, 300) : null) ||
          '异步任务失败';
        throw new Error(String(errDetail));
      }
      if (opts?.onProgress) {
        await opts.onProgress(`等待生成中… ${i + 1}/${max}（${status || 'pending'}）`);
      }
      await sleep(interval, opts?.signal);
    }
    throw new Error(`异步任务超时，最后响应: ${JSON.stringify(last)?.slice(0, 500)}`);
  }

  async generateVideo(
    prompt: string,
    opts?: {
      model?: string;
      imageUrl?: string;
      endImageUrl?: string;
      /** 中景等额外参考（Seedance role=reference_image） */
      referenceImageUrls?: string[];
      /** 全能参考视频（Seedance role=reference_video，最多 3） */
      referenceVideoUrls?: string[];
      /** 全能参考：全部图用 reference_image，不用首尾帧 */
      omniRef?: boolean;
      durationSec?: number;
      imageSize?: string;
      resolution?: string;
      onProgress?: (msg: string) => Promise<void>;
      signal?: AbortSignal;
    },
  ): Promise<{ url: string; raw: any }> {
    const s = await this.settings.getInternal();
    const rawModel = String(opts?.model || s.defaultVideoModel || '').trim();
    if (!rawModel) {
      throw new BadRequestException('未指定视频模型：请在系统设置选择默认视频模型。');
    }
    const model = this.resolveVideoModel(rawModel, s.defaultVideoModel);
    const omniRef = !!opts?.omniRef;
    const imageUrl = omniRef ? '' : String(opts?.imageUrl || '').trim();
    const endImageUrl = omniRef ? '' : String(opts?.endImageUrl || '').trim();
    const referenceImageUrls = (opts?.referenceImageUrls || [])
      .map((u) => String(u || '').trim())
      .filter((u) => u && u !== imageUrl && u !== endImageUrl);
    const referenceVideoUrls = (opts?.referenceVideoUrls || [])
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    const maxChars = videoPromptMaxCharsForModel(model);
    const normalized = normalizePromptText(prompt);
    // Seedance：有首帧或全能参考时保留半秒轴；纯文生再剥时钟标记
    const forModel =
      (imageUrl || omniRef) && /seedance|doubao|volc/i.test(model)
        ? normalized
        : stripClockDurationFromPrompt(normalized);
    const preparedPrompt = compressVideoPromptForLimit(forModel, maxChars);
    if (omniRef && !referenceImageUrls.length && !referenceVideoUrls.length) {
      throw new BadRequestException('全能参考模式至少需要 1 张参考图或 1 段参考视频');
    }
    return this.withTransientVideoRetry(
      () =>
        this.generateVideoVolcengine(preparedPrompt, {
          model,
          imageUrl,
          endImageUrl,
          referenceImageUrls,
          referenceVideoUrls,
          omniRef,
          durationSec: opts?.durationSec,
          imageSize: opts?.imageSize,
          resolution: opts?.resolution,
          onProgress: opts?.onProgress,
          signal: opts?.signal,
          s,
        }),
      opts?.signal,
      '视频生成',
    );
  }

  private async generateVideoVolcengine(
    prompt: string,
    opts: {
      model: string;
      imageUrl?: string;
      endImageUrl?: string;
      referenceImageUrls?: string[];
      referenceVideoUrls?: string[];
      omniRef?: boolean;
      durationSec?: number;
      imageSize?: string;
      resolution?: string;
      onProgress?: (msg: string) => Promise<void>;
      signal?: AbortSignal;
      s: SystemSettings;
    },
  ) {
    const model = String(opts.model || '').trim();
    const hub = await this.hubClient.requireHubModalityClient(model, 'video', opts.s);
    const http = hub.http;
    const createPath = hub.path || contentsTasksPath(String(http.defaults.baseURL || ''));
    const omniRef = !!opts.omniRef;
    const image = omniRef ? '' : String(opts.imageUrl || '').trim();
    const endImage = omniRef ? '' : String(opts.endImageUrl || '').trim();
    const midRefs = (opts.referenceImageUrls || [])
      .map((u) => String(u || '').trim())
      .filter((u) => u && u !== image && u !== endImage)
      .slice(0, omniRef ? 9 : 7);
    const videoRefs = (opts.referenceVideoUrls || [])
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .slice(0, 3);
    if (endImage && !image) {
      throw new BadRequestException('使用尾帧时必须同时连接首帧（参考图）');
    }
    if (omniRef && !midRefs.length && !videoRefs.length) {
      throw new BadRequestException('全能参考模式需要至少 1 张参考图或 1 段参考视频');
    }

    const buildContent = async (includeMidRefs: boolean) => {
      const content: Array<Record<string, unknown>> = [
        {
          type: 'text',
          text: String(prompt || '').trim().slice(0, videoPromptMaxCharsForModel(opts.model)),
        },
      ];
      if (omniRef) {
        // 全能参考：图片 + 视频
        for (const ref of midRefs) {
          const resolved = await this.resolveImageRefForRemoteApi(ref);
          content.push({
            type: 'image_url',
            image_url: { url: resolved },
            role: 'reference_image',
          });
        }
        for (const ref of videoRefs) {
          const resolved = await this.resolveVideoRefForRemoteApi(ref);
          content.push({
            type: 'video_url',
            video_url: { url: resolved },
            role: 'reference_video',
          });
        }
        return content;
      }
      if (image) {
        const resolved = await this.resolveImageRefForRemoteApi(image);
        content.push({
          type: 'image_url',
          image_url: { url: resolved },
          role: 'first_frame',
        });
      }
      if (includeMidRefs) {
        for (const ref of midRefs) {
          const resolved = await this.resolveImageRefForRemoteApi(ref);
          content.push({
            type: 'image_url',
            image_url: { url: resolved },
            role: 'reference_image',
          });
        }
      }
      if (endImage) {
        const resolved = await this.resolveImageRefForRemoteApi(endImage);
        content.push({
          type: 'image_url',
          image_url: { url: resolved },
          role: 'last_frame',
        });
      }
      return content;
    };

    const duration = Math.min(30, Math.max(2, Math.round(Number(opts.durationSec) || 5)));
    const ratio = this.videoRatioFromSize(opts.imageSize);
    const resolution = this.normalizeVideoResolution(opts.resolution, opts.imageSize);
    const postTask = async (content: Array<Record<string, unknown>>) => {
      const body: Record<string, unknown> = {
        model,
        content,
        duration,
        ratio,
        resolution,
        watermark: false,
      };
      return http.post(createPath, body, { signal: opts.signal });
    };

    const useMid = midRefs.length > 0;
    await opts.onProgress?.(
      omniRef
        ? `已提交全能参考视频 ${model}（图 ${midRefs.length} · 视频 ${videoRefs.length} · ${duration}s · ${resolution}）…`
        : endImage && useMid
          ? `已提交首尾帧+动作参考视频 ${model}（${duration}s · ${resolution}）…`
          : endImage
            ? `已提交首尾帧视频 ${model}（${duration}s · ${resolution}）…`
            : `已提交火山视频 ${model}（${duration}s · ${resolution}）…`,
    );
    let res: { data: any };
    try {
      res = await postTask(await buildContent(useMid));
    } catch (e: any) {
      // 失败不自动降级模式，直接抛出上游错误，避免静默改成首帧/首尾帧
      throw this.wrapAxiosError(e, '火山视频生成失败', 'video');
    }
    const taskId = res.data?.id || res.data?.task_id || res.data?.data?.id;
    const immediate = this.extractUrl(res.data) || this.extractUrl(res.data?.data);
    if (immediate) return { url: immediate, raw: res.data };
    if (!taskId) throw new Error(`火山视频未返回任务 ID: ${JSON.stringify(res.data)?.slice(0, 400)}`);

    try {
      return await this.pollUntilUrl(
        async () => {
          // 轮询路径由创建 path 派生，不写死厂商 URL
          const getPath = `${createPath.replace(/\/+$/, '')}/${encodeURIComponent(String(taskId))}`;
          const r = await http.get(getPath, {
            signal: opts.signal,
          });
          return r.data;
        },
        {
          intervalMs: 5000,
          maxAttempts: 120,
          onProgress: opts.onProgress,
          signal: opts.signal,
          successStatuses: ['succeeded', 'success', 'completed'],
        },
      );
    } catch (e: any) {
      throw this.wrapAxiosError(e, '火山视频生成失败', 'video');
    }
  }

  private videoRatioFromSize(size?: string) {
    const s = String(size || '').toLowerCase();
    if (/480\s*[x×*]\s*854|720\s*[x×*]\s*1280|1080\s*[x×*]\s*1920|9\s*[:/]\s*16|portrait/.test(s)) {
      return '9:16';
    }
    if (/480\s*[x×*]\s*480|720\s*[x×*]\s*720|960\s*[x×*]\s*960|1080\s*[x×*]\s*1080|1\s*[:/]\s*1|square/.test(s)) {
      return '1:1';
    }
    if (/854\s*[x×*]\s*480|1280\s*[x×*]\s*720|1920\s*[x×*]\s*1080|16\s*[:/]\s*9|landscape/.test(s)) {
      return '16:9';
    }
    return '16:9';
  }

  /** Seedance：480p / 720p / 1080p；也可从 imageSize 推断 */
  private normalizeVideoResolution(resolution?: string, imageSize?: string) {
    const r = String(resolution || '').trim().toLowerCase();
    if (r === '480p' || r === '720p' || r === '1080p') return r;
    const s = String(imageSize || '').toLowerCase();
    if (/1920\s*[x×*]\s*1080|1080\s*[x×*]\s*1920|1080\s*[x×*]\s*1080/.test(s)) return '1080p';
    if (/854\s*[x×*]\s*480|480\s*[x×*]\s*854|480\s*[x×*]\s*480/.test(s)) return '480p';
    return '720p';
  }

  /** 本地文件 → data URL（硅基/百炼图生视频） */
  fileToDataUrl(filePath: string): string | undefined {
    if (!filePath || !existsSync(filePath)) return undefined;
    const buf = readFileSync(filePath);
    const mime = mimeFromExt(extname(filePath));
    return `data:${mime};base64,${buf.toString('base64')}`;
  }

  private uploadRootDir() {
    return process.env.UPLOAD_DIR || join(process.cwd(), 'data', 'uploads');
  }

  /** /api/uploads/... 或本机带该路径的 URL → 本地绝对路径 */
  private localPathFromUploadUrl(url: string): string | null {
    const raw = String(url || '').trim();
    if (!raw) return null;
    let rel = '';
    if (raw.startsWith('/api/uploads/')) {
      rel = raw.slice('/api/uploads/'.length);
    } else {
      try {
        const u = new URL(raw);
        const idx = u.pathname.indexOf('/api/uploads/');
        if (idx >= 0) rel = u.pathname.slice(idx + '/api/uploads/'.length);
      } catch {
        /* ignore */
      }
    }
    if (!rel) return null;
    const abs = join(this.uploadRootDir(), ...rel.split('/').filter(Boolean));
    return existsSync(abs) ? abs : null;
  }

  /**
   * 豆包/方舟等远端 API 的参考图：公网 https 可直传；
   * 本地 /api/uploads 需转成 data:image/...;base64,...（否则会报 invalid url）。
   */
  async resolveImageRefForRemoteApi(url: string): Promise<string> {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^data:image\//i.test(raw)) {
      // data URL 过大时压缩，避免超 Seedream 体量限制
      if (raw.length > 9_000_000) return this.compressReferenceDataUrl(raw);
      return raw;
    }
    const local = this.localPathFromUploadUrl(raw);
    if (local) {
      const dataUrl = this.fileToDataUrl(local);
      if (!dataUrl) throw new BadRequestException('参考图本地文件读取失败');
      if (dataUrl.length > 9_000_000) return this.compressReferenceDataUrl(dataUrl);
      return dataUrl;
    }
    if (/^https?:\/\//i.test(raw)) {
      if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?\//i.test(raw)) {
        throw new BadRequestException(
          '参考图是本机地址，豆包无法访问。请用画布内图片节点连线，或上传到项目资产后再试。',
        );
      }
      return raw;
    }
    throw new BadRequestException(`参考图地址无效（需公网 URL 或项目内资产）: ${raw.slice(0, 96)}`);
  }

  /** 参考视频：Seedance 需公网可访问 URL（不转 data URL） */
  async resolveVideoRefForRemoteApi(url: string): Promise<string> {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^data:video\//i.test(raw)) {
      throw new BadRequestException('参考视频过大，请上传到对象存储后使用公网地址');
    }
    if (/^https?:\/\//i.test(raw)) {
      if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?\//i.test(raw)) {
        throw new BadRequestException(
          '参考视频是本机地址，豆包无法访问。请上传到项目资产（对象存储）后再试。',
        );
      }
      return raw;
    }
    throw new BadRequestException(`参考视频地址无效（需公网 URL）: ${raw.slice(0, 96)}`);
  }

  async tts(text: string, opts?: { model?: string; voice?: string }) {
    const s = await this.settings.getInternal();
    const model = String(opts?.model || s.defaultTtsModel || '').trim();
    if (!model) {
      throw new BadRequestException('未指定 TTS 模型。');
    }
    // 无内置凭证回退：必须能从 Hub 解析到 audio 路径
    const hub = await this.hubClient.resolveHubModalityClient(model, 'audio', s);
    if (!hub) {
      throw new BadRequestException(
        `TTS 模型「${model}」不可用：请从 Hub 拉取带 audio 路径的渠道并配置 API Key（已取消内置回退）。`,
      );
    }
    const http = hub.http;
    const voice =
      opts?.voice ||
      (model.includes('CosyVoice')
        ? 'FunAudioLLM/CosyVoice2-0.5B:alex'
        : model.includes('fish-speech')
          ? 'fishaudio/fish-speech-1.5:alex'
          : 'alloy');
    const path = hub.path || '/v1/audio/speech';
    const res = await http.post(
      path,
      {
        model,
        input: text,
        voice,
        response_format: 'mp3',
        stream: false,
      },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(res.data);
  }

  async downloadToFile(url: string, destPath: string) {
    const dir = join(destPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const res = await axios.get(url, { responseType: 'stream', timeout: 300000 });
    await pipeline(res.data, createWriteStream(destPath));
    return destPath;
  }

  saveBuffer(buf: Buffer, destPath: string) {
    const dir = join(destPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(destPath, buf);
    return destPath;
  }
}
