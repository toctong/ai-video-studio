import { randomUUID } from 'crypto';
import { apiLogBuffer } from './api-log.buffer';

const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|api[_-]?key|password|passwd|secret|token|access[_-]?token|refresh[_-]?token|private[_-]?key)$/i;

/** 日志 body 上限（过大则结构化截断，绝不产出残缺 JSON 字符串） */
const BODY_MAX = 512 * 1024;
/** 错误文案上限 */
const ERROR_MAX = 256 * 1024;

export function newRequestId(): string {
  try {
    return randomUUID().replace(/-/g, '').slice(0, 16);
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** 异步任务（工作流运行等）失败/结束时写入日志表，便于和 HTTP 一起排查 */
export function pushAsyncJobLog(opts: {
  kind: string;
  path: string;
  ok: boolean;
  durationMs?: number;
  errorMessage?: string;
  detail?: unknown;
  projectId?: string;
  userId?: number | null;
  requestId?: string;
}) {
  const durationMs = Math.max(0, Number(opts.durationMs) || 0);
  const errorMessage = String(opts.errorMessage || '').slice(0, ERROR_MAX);
  apiLogBuffer.push({
    requestId: opts.requestId || newRequestId(),
    ts: Date.now() - durationMs,
    durationMs,
    method: 'RUN',
    path: opts.path,
    statusCode: opts.ok ? 200 : 500,
    query: null,
    requestBody: { kind: opts.kind },
    responseBody: summarizePayload(
      opts.detail ??
        (errorMessage ? { error: errorMessage, ok: opts.ok } : { ok: opts.ok }),
      ERROR_MAX,
    ),
    userId: opts.userId ?? null,
    projectId: String(opts.projectId || ''),
    errorMessage,
  });
}

export function shouldSkipApiLog(path: string): boolean {
  const p = String(path || '').split('?')[0];
  if (p === '/health' || p === '/api/health') return true;
  if (p === '/api/logs' || p.startsWith('/api/logs/')) return true;
  return false;
}

export function redactValue(value: unknown, depth = 0, maxLen = BODY_MAX): unknown {
  if (depth > 10) return '[…]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > maxLen) {
      return {
        _truncated: true,
        _originalChars: value.length,
        preview: value.slice(0, Math.min(maxLen, 8192)),
      };
    }
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const maxItems = 200;
    const sliced = value.slice(0, maxItems).map((v) => redactValue(v, depth + 1, maxLen));
    if (value.length > maxItems) {
      sliced.push({ _truncated: true, _omittedItems: value.length - maxItems });
    }
    return sliced;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = '***';
      continue;
    }
    const fieldMax = /^(error|message|errorMessage|stack|detail|raw)$/i.test(k)
      ? Math.max(maxLen, ERROR_MAX)
      : maxLen;
    out[k] = redactValue(v, depth + 1, fieldMax);
  }
  return out;
}

/**
 * 规范化并限制体积。保证返回值始终是合法 JSON 可序列化结构，
 * 绝不以「截断到一半的 JSON 字符串」作为结果（会导致编辑器 Unterminated string）。
 */
export function summarizePayload(value: unknown, maxLen = BODY_MAX): unknown {
  if (value == null || value === '') return null;

  // 若是 JSON 字符串，优先 parse 成对象再处理
  let data: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        // 可能是已被截断的残缺 JSON：不要当 text 原样塞进编辑器
        return {
          _truncated: true,
          _invalidJson: true,
          _originalChars: value.length,
          preview: value.slice(0, Math.min(maxLen, 8192)),
          note: '响应体疑似被截断，无法解析为完整 JSON',
        };
      }
    }
  }

  try {
    const redacted = redactValue(data, 0, maxLen);
    const text = typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
    if (text.length <= maxLen) return redacted;

    // 过大：保留合法结构 + 预览，而不是砍断 JSON 文本
    return {
      _truncated: true,
      _originalChars: text.length,
      preview: text.slice(0, Math.min(8192, maxLen)),
      note: `内容过大（${text.length} chars），已截断预览`,
    };
  } catch {
    return {
      _truncated: true,
      _originalChars: String(value).length,
      preview: String(value).slice(0, 8192),
    };
  }
}

export function captureRequestBody(req: {
  body?: unknown;
  is?: (type: string) => unknown;
  headers?: Record<string, unknown>;
}): unknown {
  const ct = String(req.headers?.['content-type'] || '');
  if (/multipart\/form-data/i.test(ct)) return '[multipart omitted]';
  if (typeof req.is === 'function' && req.is('multipart/form-data')) {
    return '[multipart omitted]';
  }
  if (req.body == null || req.body === '') return null;
  return summarizePayload(req.body);
}
