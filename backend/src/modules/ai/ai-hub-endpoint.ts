import { BadRequestException } from '@nestjs/common';

/** Hub 模态：对应 catalog 的 paths 键 */
export type HubModality = 'text' | 'image' | 'video' | 'audio';

export function sleep(ms: number, signal?: AbortSignal) {
  if (!signal) return new Promise((r) => setTimeout(r, ms));
  if (signal.aborted) {
    const err = new Error('任务已取消');
    err.name = 'AbortError';
    return Promise.reject(err);
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const err = new Error('任务已取消');
      err.name = 'AbortError';
      reject(err);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function chatPath(baseUrl: string) {
  const b = baseUrl.replace(/\/$/, '');
  if (/\/v\d+$/i.test(b) || /\/api\/v\d+$/i.test(b) || /compatible-mode\/v1$/i.test(b)) {
    return '/chat/completions';
  }
  return '/v1/chat/completions';
}

export function imagesPath(baseUrl: string) {
  const b = baseUrl.replace(/\/$/, '');
  if (/\/v\d+$/i.test(b) || /\/api\/v\d+$/i.test(b) || /compatible-mode\/v1$/i.test(b)) {
    return '/images/generations';
  }
  return '/v1/images/generations';
}

export function imagesEditPath(baseUrl: string) {
  const b = baseUrl.replace(/\/$/, '');
  if (/\/v\d+$/i.test(b) || /\/api\/v\d+$/i.test(b) || /compatible-mode\/v1$/i.test(b)) {
    return '/images/edits';
  }
  return '/v1/images/edits';
}

export function modelsPath(baseUrl: string) {
  const b = baseUrl.replace(/\/$/, '');
  if (/\/v\d+$/i.test(b) || /\/api\/v\d+$/i.test(b) || /compatible-mode\/v1$/i.test(b)) {
    return '/models';
  }
  return '/v1/models';
}

/** 内置火山回退（无 Hub paths.video 时） */
export function contentsTasksPath(baseUrl: string) {
  const b = baseUrl.replace(/\/$/, '');
  if (/\/v\d+$/i.test(b) || /\/api\/v\d+$/i.test(b)) {
    return '/contents/generations/tasks';
  }
  return '/api/v3/contents/generations/tasks';
}

/**
 * Hub 约定：
 * endpointUrl = baseUrlHint + apiPrefix + paths[modality]
 * （或模型级 callPath / endpointUrlHint 覆盖）
 * 禁止在业务里写死厂商 path。
 */
export function resolveHubEndpointUrl(opts: {
  modality: HubModality;
  credBaseUrl?: string;
  baseUrlHint?: string;
  apiPrefix?: string;
  paths?: Record<string, string> | null;
  callPath?: string;
  endpointUrlHint?: string;
}): { baseURL: string; path: string } {
  const fullHint = String(opts.endpointUrlHint || '').trim();
  if (/^https?:\/\//i.test(fullHint)) {
    try {
      const u = new URL(fullHint);
      return {
        baseURL: `${u.protocol}//${u.host}`,
        path: `${u.pathname}${u.search}` || '/',
      };
    } catch {
      /* fall through */
    }
  }

  const call = String(opts.callPath || '').trim();
  const base = String(opts.credBaseUrl || opts.baseUrlHint || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) {
    throw new BadRequestException('渠道缺少 Base URL，请在系统设置填写本地渠道地址');
  }

  if (call.startsWith('/')) {
    return { baseURL: base, path: call };
  }
  if (/^https?:\/\//i.test(call)) {
    try {
      const u = new URL(call);
      return {
        baseURL: `${u.protocol}//${u.host}`,
        path: `${u.pathname}${u.search}` || '/',
      };
    } catch {
      /* fall through */
    }
  }

  const prefixRaw = String(opts.apiPrefix || '').trim();
  const modalityPath = String(opts.paths?.[opts.modality] || '').trim();
  if (!modalityPath) {
    throw new BadRequestException(
      `Hub 未提供 paths.${opts.modality}，请同步目录或检查渠道配置`,
    );
  }

  const prefix = prefixRaw
    ? prefixRaw.startsWith('/')
      ? prefixRaw.replace(/\/+$/, '')
      : `/${prefixRaw.replace(/\/+$/, '')}`
    : '';
  const leaf = modalityPath.startsWith('/') ? modalityPath : `/${modalityPath}`;

  // base 若已带上 apiPrefix，path 只留 leaf，避免重复
  if (prefix && (base.endsWith(prefix) || base.includes(`${prefix}/`))) {
    return { baseURL: base.replace(/\/+$/, ''), path: leaf };
  }
  return {
    baseURL: base,
    path: `${prefix}${leaf}` || leaf,
  };
}

export function dashscopeHost(baseUrl: string) {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    throw new Error('无效的 DashScope baseUrl，请在设置/Hub 中配置渠道地址');
  }
}

export function mimeFromExt(ext: string) {
  const e = ext.toLowerCase();
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  return 'image/png';
}
