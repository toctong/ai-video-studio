import api from '@/api';
import { useAuthStore } from '@/stores/auth';

export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  model?: string,
) {
  const { data } = await api.post<{ text: string }>('/ai/chat', {
    messages,
    model: model || undefined,
  });
  return String(data?.text || '');
}

export type ChatStreamEvent =
  | { type: 'start' }
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

/** SSE 流式对话；返回完整文本（取消时返回已收到的部分） */
export async function chatCompletionStream(
  messages: Array<{ role: string; content: string }>,
  opts?: {
    model?: string;
    signal?: AbortSignal;
    onEvent?: (ev: ChatStreamEvent) => void;
  },
): Promise<string> {
  const auth = useAuthStore();
  const res = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    credentials: 'include',
    signal: opts?.signal,
    body: JSON.stringify({
      messages,
      model: opts?.model || undefined,
    }),
  });
  if (!res.ok) {
    let msg = `对话失败 (${res.status})`;
    try {
      const j = await res.json();
      msg = String(j?.message || msg);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (!res.body) throw new Error('无流式响应');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let cancelled = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const chunk of parts) {
      const dataLine = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (!dataLine) continue;
      let ev: ChatStreamEvent;
      try {
        ev = JSON.parse(dataLine) as ChatStreamEvent;
      } catch {
        continue;
      }
      opts?.onEvent?.(ev);
      if (ev.type === 'delta' && ev.text) full += ev.text;
      if (ev.type === 'done' && typeof ev.text === 'string') full = ev.text || full;
      if (ev.type === 'cancelled') cancelled = true;
      if (ev.type === 'error') throw new Error(ev.message || '对话失败');
    }
  }
  if (cancelled && !full) throw new DOMException('任务已取消', 'AbortError');
  return full;
}
