/** 消费后端 SSE（data: {...}\\n\\n），凭 Cookie / Pinia 鉴权 */

import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';

export type SseHandler = (event: any) => void | Promise<void>;

export async function fetchSseJson(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    onEvent: SseHandler;
  },
) {
  const auth = useAuthStore();
  const project = useProjectStore();
  const projectId = project.current?.id;
  const res = await fetch(url.startsWith('/api') ? url : `/api${url}`, {
    method: opts.method || 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(projectId ? { 'x-project-id': projectId } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    let msg = `请求失败（${res.status}）`;
    try {
      const j = await res.json();
      msg = j?.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (!res.body) throw new Error('浏览器不支持流式读取');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  const onAbort = () => {
    try {
      reader.cancel();
    } catch {
      /* ignore */
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    while (true) {
      if (opts.signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split(/\n\n/);
      buf = chunks.pop() || '';
      for (const chunk of chunks) {
        const lines = chunk.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            await opts.onEvent(JSON.parse(payload));
          } catch (e: any) {
            // 业务 error 事件里抛的 Error 要冒泡；JSON 解析失败忽略
            if (e instanceof Error && e.name !== 'SyntaxError') throw e;
          }
        }
      }
    }

    if (buf.trim() && !opts.signal?.aborted) {
      const lines = buf.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          await opts.onEvent(JSON.parse(payload));
        } catch (e: any) {
          if (e instanceof Error && e.name !== 'SyntaxError') throw e;
        }
      }
    }
  } finally {
    if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
  }

  if (opts.signal?.aborted) {
    const err = new Error('已取消');
    err.name = 'AbortError';
    throw err;
  }
}
