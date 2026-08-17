import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

/** 规范化代理 URL；空则表示直连 */
export function normalizeProxyUrl(raw?: string | null): string {
  const t = String(raw || '').trim();
  if (!t) return '';
  // 允许用户只填 host:port
  if (/^[\w.-]+:\d+$/.test(t)) return `http://${t}`;
  if (!/^https?:\/\//i.test(t) && !/^socks/i.test(t)) {
    return `http://${t.replace(/^\/+/, '')}`;
  }
  return t;
}

export type VendorHttpOpts = {
  baseURL: string;
  apiKey: string;
  /** 渠道级代理，仅该渠道生效 */
  proxyUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
};

/**
 * 按渠道创建 Axios：配了 proxyUrl 则走代理，否则直连。
 * 注意：axios 内置 proxy 对 HTTPS 目标不稳定，统一用 https-proxy-agent。
 */
export function createVendorHttpClient(opts: VendorHttpOpts): AxiosInstance {
  const baseURL = String(opts.baseURL || '').replace(/\/$/, '');
  const proxyUrl = normalizeProxyUrl(opts.proxyUrl);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };

  const defaults: CreateAxiosDefaults = {
    baseURL,
    headers,
    timeout: typeof opts.timeout === 'number' ? opts.timeout : 300000,
  };

  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    defaults.httpAgent = agent;
    defaults.httpsAgent = agent;
    // 禁用 axios 环境变量 / 内置 proxy，避免和 agent 打架
    defaults.proxy = false;
  }

  return axios.create(defaults);
}

/** 从已有 client 复制代理 agent（二次派生客户端时用） */
export function cloneVendorHttpClient(
  source: AxiosInstance,
  opts: { baseURL: string; apiKey?: string; timeout?: number; headers?: Record<string, string> },
): AxiosInstance {
  const auth =
    opts.apiKey != null
      ? `Bearer ${opts.apiKey}`
      : String(
          (source.defaults.headers as any)?.Authorization ||
            (source.defaults.headers as any)?.common?.Authorization ||
            '',
        );
  const defaults: CreateAxiosDefaults = {
    baseURL: String(opts.baseURL || '').replace(/\/$/, ''),
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    timeout: typeof opts.timeout === 'number' ? opts.timeout : source.defaults.timeout || 300000,
    proxy: false,
  };
  if (source.defaults.httpAgent) defaults.httpAgent = source.defaults.httpAgent;
  if (source.defaults.httpsAgent) defaults.httpsAgent = source.defaults.httpsAgent;
  return axios.create(defaults);
}
