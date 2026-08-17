import type { NextFunction, Request, Response } from 'express';
import { apiLogBuffer } from './api-log.buffer';
import {
  captureRequestBody,
  newRequestId,
  shouldSkipApiLog,
  summarizePayload,
} from './api-log.util';

type AuthedRequest = Request & {
  user?: { userId?: number; id?: number };
};

/**
 * Express 层采集：覆盖全部 HTTP 业务请求（含 @Res / SSE 等 Interceptor 易漏的路径）。
 * /api/logs* 与 /health 跳过，避免查询日志把自己刷进去。
 */
export function apiLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (shouldSkipApiLog(path)) {
    next();
    return;
  }

  const started = Date.now();
  const headerRid = String(req.headers['x-request-id'] || '').trim();
  const requestId = headerRid || newRequestId();
  try {
    res.setHeader('x-request-id', requestId);
  } catch {
    /* ignore */
  }

  const method = String(req.method || 'GET').toUpperCase();
  const query = summarizePayload(req.query || {});
  const requestBody = captureRequestBody(req);
  const projectId = String(req.headers['x-project-id'] || '').trim();

  let responseBody: unknown = null;
  let capturedAsObject = false;

  const capture = (body: unknown, fromJson = false) => {
    if (Buffer.isBuffer(body)) {
      if (!capturedAsObject) responseBody = `[buffer ${body.length} bytes]`;
      return;
    }
    // res.json(obj) 之后 Express 还会 res.send(string)；已拿到对象时不要被字符串覆盖/截断
    if (capturedAsObject && typeof body === 'string') return;
    if (fromJson && body !== null && typeof body === 'object') {
      responseBody = body;
      capturedAsObject = true;
      return;
    }
    responseBody = body;
  };

  const origJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    capture(body, true);
    return origJson(body);
  }) as Response['json'];

  const origSend = res.send.bind(res);
  res.send = ((body: unknown) => {
    capture(body, false);
    return origSend(body);
  }) as Response['send'];

  res.on('finish', () => {
    const authReq = req as AuthedRequest;
    const userId = Number(authReq.user?.userId || authReq.user?.id) || null;
    const statusCode = Number(res.statusCode) || 0;
    const summarized = summarizePayload(responseBody);
    apiLogBuffer.push({
      requestId,
      ts: started,
      durationMs: Math.max(0, Date.now() - started),
      method,
      path,
      statusCode,
      query,
      requestBody,
      responseBody: summarized,
      userId,
      projectId,
      errorMessage:
        statusCode >= 400 ? extractHttpErrorMessage(responseBody, statusCode) : '',
    });
  });

  next();
}

function extractHttpErrorMessage(body: unknown, statusCode: number): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const msg = o.message ?? o.error ?? o.msg;
    if (typeof msg === 'string' && msg.trim()) return msg.slice(0, 262144);
    if (Array.isArray(msg) && msg.length) return String(msg[0]).slice(0, 262144);
  }
  if (typeof body === 'string' && body.trim()) return body.slice(0, 262144);
  return `HTTP ${statusCode}`;
}
