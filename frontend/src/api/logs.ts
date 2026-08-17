import api from '@/api';
import { useAuthStore } from '@/stores/auth';

export type HttpLogEntry = {
  id: number;
  requestId: string;
  ts: number;
  durationMs: number;
  method: string;
  path: string;
  statusCode: number;
  query: unknown;
  requestBody: unknown;
  responseBody: unknown;
  userId: number | null;
  projectId: string;
  errorMessage: string;
};

export type HttpLogsListResponse = {
  entries: HttpLogEntry[];
  latestId: number;
  count: number;
};

export async function fetchHttpLogs(opts?: {
  sinceId?: number;
  limit?: number;
  method?: string;
  status?: string;
  q?: string;
}) {
  const { data } = await api.get<HttpLogsListResponse>('/logs/http', {
    params: {
      sinceId: opts?.sinceId || undefined,
      limit: opts?.limit || 1500,
      method: opts?.method || undefined,
      status: opts?.status || undefined,
      q: opts?.q || undefined,
    },
  });
  return data;
}

export type HttpLogStreamHandlers = {
  onSnapshot?: (entries: HttpLogEntry[]) => void;
  onLog?: (entry: HttpLogEntry) => void;
  onError?: (err: Error) => void;
};

export function watchHttpLogs(
  handlers: HttpLogStreamHandlers,
  opts?: { sinceId?: number; signal?: AbortSignal },
): () => void {
  const auth = useAuthStore();
  const qs = new URLSearchParams();
  if (opts?.sinceId) qs.set('sinceId', String(opts.sinceId));
  const url = `/api/logs/http/stream${qs.toString() ? `?${qs}` : ''}`;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts?.signal?.addEventListener('abort', onAbort);

  void (async () => {
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'text/event-stream',
          ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        },
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`接口日志流连接失败 ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let eventName = 'message';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n');
        buf = chunks.pop() || '';
        for (const line of chunks) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith('data:')) {
            const raw = line.slice(5).trim();
            if (!raw) continue;
            try {
              const data = JSON.parse(raw);
              if (eventName === 'snapshot') {
                handlers.onSnapshot?.(Array.isArray(data?.entries) ? data.entries : []);
              } else if (eventName === 'log') {
                handlers.onLog?.(data as HttpLogEntry);
              }
            } catch {
              /* ignore */
            }
            eventName = 'message';
            continue;
          }
          if (!line.trim()) eventName = 'message';
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      handlers.onError?.(e instanceof Error ? e : new Error(String(e?.message || e)));
    } finally {
      opts?.signal?.removeEventListener('abort', onAbort);
    }
  })();

  return () => {
    ctrl.abort();
    opts?.signal?.removeEventListener('abort', onAbort);
  };
}
