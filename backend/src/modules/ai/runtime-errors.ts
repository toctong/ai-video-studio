/**
 * AI Runtime 错误分类：供重试策略与前端一键重试判断。
 */

export type AiErrorKind =
  | 'transient'
  | 'auth'
  | 'content_policy'
  | 'invalid_input'
  | 'cancelled'
  | 'timeout'
  | 'unknown';

export type ClassifiedAiError = {
  kind: AiErrorKind;
  retryable: boolean;
  message: string;
  status?: number;
};

export function isAbortLike(e: unknown): boolean {
  const err = e as any;
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'CanceledError' || err.name === 'JobCancelledError') {
    return true;
  }
  if (err.code === 'ERR_CANCELED' || err.code === 'ABORT_ERR') return true;
  const msg = String(err.message || '');
  return /任务已取消|aborted|canceled|cancelled/i.test(msg);
}

/** 从 Nest HttpException / Axios / Error 中抽出可读文案（避免只剩「出图失败」） */
export function formatExceptionMessage(e: unknown, fallback = '未知错误'): string {
  if (e == null) return fallback;
  if (typeof e === 'string') {
    const t = e.trim();
    return t || fallback;
  }

  const err = e as any;

  // NestJS HttpException：优先 getResponse()
  if (typeof err?.getResponse === 'function') {
    const resp = err.getResponse();
    if (typeof resp === 'string' && resp.trim()) return resp.trim();
    if (resp && typeof resp === 'object') {
      const m = resp.message;
      if (typeof m === 'string' && m.trim()) return m.trim();
      if (Array.isArray(m) && m.length) {
        return m.map((x) => String(x || '').trim()).filter(Boolean).join('；') || fallback;
      }
      if (typeof resp.error === 'string' && resp.error.trim() && resp.error !== 'Bad Request') {
        return resp.error.trim();
      }
    }
  }

  const axiosDetail = extractUpstreamErrorDetail(err?.response?.data);
  if (axiosDetail) {
    const status = Number(err?.response?.status || 0);
    return status ? `${axiosDetail}（HTTP ${status}）` : axiosDetail;
  }

  const msg = String(err?.message || '').trim();
  if (msg && !/^Bad Request Exception$/i.test(msg) && !/^Http Exception$/i.test(msg)) {
    return msg;
  }

  try {
    const s = String(e);
    if (s && s !== '[object Object]') return s;
  } catch {
    /* ignore */
  }
  return fallback;
}

/** 尽量从上游 JSON / 文本里抠出 error.message */
export function extractUpstreamErrorDetail(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') {
    const t = data.trim();
    if (!t) return '';
    // HTML / 过长响应只留摘要
    if (/^</.test(t)) return t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    return t.slice(0, 800);
  }
  if (typeof data !== 'object') return String(data).slice(0, 400);

  const obj = data as Record<string, any>;
  const candidates = [
    obj.error?.message,
    obj.error?.msg,
    obj.error?.detail,
    typeof obj.error === 'string' ? obj.error : null,
    obj.message,
    obj.msg,
    obj.detail,
    obj.title,
    obj.reason,
    Array.isArray(obj.error?.message) ? obj.error.message.join('；') : null,
    Array.isArray(obj.message) ? obj.message.join('；') : null,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 800);
  }

  // 有些网关只给 code
  const code = obj.error?.code || obj.code;
  if (code != null && String(code).trim()) {
    return `错误码 ${String(code).trim()}`;
  }

  try {
    return JSON.stringify(obj).slice(0, 500);
  } catch {
    return '';
  }
}

export function classifyAiError(
  e: unknown,
  _surface?: 'chat' | 'image' | 'video',
): ClassifiedAiError {
  if (isAbortLike(e)) {
    return { kind: 'cancelled', retryable: false, message: '任务已取消' };
  }

  const err = e as any;
  const status = Number(err?.response?.status || err?.status || 0) || undefined;
  const raw =
    extractUpstreamErrorDetail(err?.response?.data) ||
    String(err?.message || e || '').trim();

  if (/timeout|ETIMEDOUT|ECONNABORTED|timed?\s*out|超时/i.test(raw) || status === 408 || status === 504) {
    return { kind: 'timeout', retryable: true, message: raw || '请求超时', status };
  }

  if (
    status === 401 ||
    status === 403 ||
    /api[_ ]?key|unauthorized|forbidden|鉴权|未授权|密钥/i.test(raw)
  ) {
    return { kind: 'auth', retryable: false, message: raw || '鉴权失败', status };
  }

  if (
    status === 400 &&
    /content|policy|safety|敏感|违规|审核|moderation|ResponsibleAI/i.test(raw)
  ) {
    return { kind: 'content_policy', retryable: false, message: raw || '内容审核未通过', status };
  }

  if (status === 400 || status === 422) {
    return { kind: 'invalid_input', retryable: false, message: raw || '参数无效', status };
  }

  const transient =
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 500 ||
    /status code 503|service unavailable|负载|过载|busy|rate limit|try again|暂时|繁忙/i.test(raw);

  if (transient) {
    return { kind: 'transient', retryable: true, message: raw || '服务繁忙', status };
  }

  return { kind: 'unknown', retryable: false, message: raw || '未知错误', status };
}

/** 构造带 AbortError 名的取消错误，便于上游 isCancelError 识别 */
export function makeCancelError(message = '任务已取消'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

export function makeTimeoutError(message = '运行超时，可重试'): Error {
  const err = new Error(message);
  (err as any).code = 'RUN_TIMEOUT';
  (err as any).retryable = true;
  return err;
}
