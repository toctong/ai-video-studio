import api from '@/api';
import { useAuthStore } from '@/stores/auth';

export type GenerateSession = {
  id: string;
  title: string;
  pinned: boolean;
  /** 最近一条已完成媒体封面 */
  coverUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerateMessageKind = 'chat' | 'image' | 'video';
export type GenerateMessageRole = 'user' | 'assistant';
export type GenerateMessageStatus = 'pending' | 'streaming' | 'done' | 'error';

export type GenerateMessage = {
  id: string;
  sessionId: string;
  role: GenerateMessageRole;
  kind: GenerateMessageKind;
  content: string;
  mediaUrl: string;
  mediaOssKey: string;
  aspectRatio: string;
  prefs: Record<string, unknown>;
  status: GenerateMessageStatus;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerateAgentIntent = 'chat' | 'image' | 'video';

export type GenerateStreamEvent =
  | { type: 'start' }
  | {
      type: 'route';
      intent: GenerateAgentIntent;
      prompt?: string;
      understanding?: string;
    }
  /** 思考过程增量（规划步骤 / 模型 reasoning） */
  | { type: 'think'; text: string }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      intent?: GenerateAgentIntent;
      text: string;
      userMessage?: GenerateMessage;
      assistantMessage?: GenerateMessage;
    }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export async function listGenerateSessions() {
  const { data } = await api.get<GenerateSession[]>('/ai/generate/sessions');
  return Array.isArray(data) ? data : [];
}

export async function createGenerateSession(title?: string) {
  const { data } = await api.post<GenerateSession>('/ai/generate/sessions', {
    title: title || undefined,
  });
  return data;
}

export async function updateGenerateSession(
  id: string,
  patch: { title?: string; pinned?: boolean },
) {
  const { data } = await api.patch<GenerateSession>(`/ai/generate/sessions/${id}`, patch);
  return data;
}

export async function deleteGenerateSession(id: string) {
  const { data } = await api.delete<{ ok: boolean }>(`/ai/generate/sessions/${id}`);
  return data;
}

export async function listGenerateMessages(sessionId: string) {
  const { data } = await api.get<GenerateMessage[]>(
    `/ai/generate/sessions/${sessionId}/messages`,
  );
  return Array.isArray(data) ? data : [];
}

export type GenerateAssetItem = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  kind: 'image' | 'video';
  name: string;
  url: string;
  mediaOssKey: string;
  aspectRatio: string;
  createdAt: string;
};

export async function listGenerateAssets(params?: {
  sessionId?: string;
  kind?: string;
  q?: string;
  take?: number;
  skip?: number;
}) {
  const { data } = await api.get<{
    items: GenerateAssetItem[];
    total: number;
    hasMore: boolean;
    facets: { totalWithMedia: number; bySessionId: Record<string, number> };
  }>('/ai/generate/assets', { params });
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total) || 0,
    hasMore: Boolean(data?.hasMore),
    facets: data?.facets || { totalWithMedia: 0, bySessionId: {} },
  };
}

export async function deleteGenerateAsset(messageId: string) {
  const { data } = await api.delete<{ ok: boolean }>(`/ai/generate/assets/${messageId}`);
  return data;
}

export async function uploadGenerateRef(sessionId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post<{ url: string; key: string }>(
    `/ai/generate/sessions/${sessionId}/upload`,
    fd,
  );
  return data;
}

export async function generateImage(
  body: {
    sessionId: string;
    prompt: string;
    model?: string;
    size?: string;
    aspectRatio?: string;
    count?: number;
    referenceImages?: string[];
    prefs?: Record<string, unknown>;
  },
  _opts?: { signal?: AbortSignal },
) {
  // 入队即返回；不设客户端超时，避免长排队/慢确认弹出 timeout 提示
  const { data } = await api.post<{
    userMessage: GenerateMessage;
    assistantMessage: GenerateMessage;
  }>('/ai/generate/image', body, { timeout: 0 });
  return data;
}

export async function generateVideo(
  body: {
    sessionId: string;
    prompt: string;
    model?: string;
    aspectRatio?: string;
    durationSec?: number;
    imageUrl?: string;
    endImageUrl?: string;
    referenceImageUrls?: string[];
    referenceVideoUrls?: string[];
    omniRef?: boolean;
    resolution?: string;
    prefs?: Record<string, unknown>;
  },
  _opts?: { signal?: AbortSignal },
) {
  const { data } = await api.post<{
    userMessage: GenerateMessage;
    assistantMessage: GenerateMessage;
  }>('/ai/generate/video', body, { timeout: 0 });
  return data;
}

/** 取消排队中/进行中的图或视频生成 */
export async function cancelGenerateMessage(messageId: string) {
  const { data } = await api.post<GenerateMessage>(
    `/ai/generate/messages/${encodeURIComponent(messageId)}/cancel`,
    {},
    { timeout: 0 },
  );
  return data;
}

/** 优化提示词（不落会话） */
export async function enhanceGeneratePrompt(prompt: string, kind: 'image' | 'video' | 'chat' = 'image') {
  const goal =
    kind === 'video'
      ? '视频生成提示词：补全主体、动作、运镜、光影与时长感，保持中文，不要解释。'
      : kind === 'chat'
        ? '创作提示：把用户意图改写成更清晰的一句创作指令，保持中文，不要解释。'
        : '图片生成提示词：补全主体、构图、光影、材质与画风约束，保持中文，不要解释。不要加「提示词：」前缀。';
  const { data } = await api.post<{ text?: string } | string>('/ai/chat', {
    messages: [
      {
        role: 'system',
        content: `你是提示词优化助手。${goal}只输出优化后的提示词正文。`,
      },
      { role: 'user', content: String(prompt || '').trim() },
    ],
  });
  if (typeof data === 'string') return data.trim();
  return String((data as any)?.text || (data as any)?.content || data || '').trim();
}

export type GenerateQuotePayload = {
  id?: string;
  kind: 'image' | 'video';
  url?: string;
  label?: string;
  sourceMessageId?: string;
};

export async function generateChatStream(
  body: {
    sessionId: string;
    message: string;
    model?: string;
    prefs?: Record<string, unknown>;
    referenceImages?: string[];
    referenceVideoUrls?: string[];
    quotes?: GenerateQuotePayload[];
  },
  opts?: {
    signal?: AbortSignal;
    onEvent?: (ev: GenerateStreamEvent) => void;
  },
): Promise<string> {
  const auth = useAuthStore();
  const res = await fetch('/api/ai/generate/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    credentials: 'include',
    signal: opts?.signal,
    body: JSON.stringify(body),
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
      let ev: GenerateStreamEvent;
      try {
        ev = JSON.parse(dataLine) as GenerateStreamEvent;
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
