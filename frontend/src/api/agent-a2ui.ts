/** Agent 智能体 A2UI SSE 客户端 */

import { fetchSseJson } from '@/utils/fetch-sse';

export type AgentA2uiEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'status'; message: string; stage?: string }
  | { type: 'delta'; text: string }
  | { type: 'a2ui'; messages: Record<string, unknown>[]; patch?: boolean }
  | {
      type: 'done';
      result?: {
        reply?: string;
        done?: boolean;
        payload?: unknown;
      };
    }
  | { type: 'error'; message: string }
  | { type: string; [k: string]: unknown };

export type AgentA2uiBody = {
  sessionId?: string;
  action?: string;
  message?: string;
  system?: string;
  skillId?: string;
  skillLabel?: string;
  canvasSummary?: string;
  model?: string;
  context?: Record<string, unknown>;
  dataModel?: Record<string, unknown>;
};

export async function agentA2uiStream(
  body: AgentA2uiBody,
  opts: {
    signal?: AbortSignal;
    onEvent: (ev: AgentA2uiEvent) => void | Promise<void>;
  },
) {
  await fetchSseJson('/ai/agent/a2ui', {
    method: 'POST',
    body,
    signal: opts.signal,
    onEvent: (ev) => opts.onEvent(ev as AgentA2uiEvent),
  });
}
