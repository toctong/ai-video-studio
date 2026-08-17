import api from '@/api';
import { useAuthStore } from '@/stores/auth';
import type {
  WorkflowDocument,
  WorkflowGraph,
  WorkflowNodeCatalogItem,
} from '@ai-video-studio/shared';

export type WorkflowRow = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  graph: WorkflowGraph | WorkflowDocument;
  thumbUrl: string;
  tags: string[];
  isTemplate: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRunRow = {
  id: string;
  workflowId: string;
  projectId: string;
  jobRunId: string;
  status: string;
  /** 0–100，与 Job / SSE 同源 */
  progress?: number;
  message?: string;
  graphSnapshot: WorkflowGraph | WorkflowDocument;
  /** 编译后的执行图（含 params / 连线输入） */
  promptSnapshot?: {
    schemaVersion?: number;
    nodes?: Record<
      string,
      { type: string; params?: Record<string, unknown>; inputs?: Record<string, unknown> }
    >;
  };
  nodeStates: Record<string, any>;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRevisionRow = {
  id: string;
  workflowId: string;
  version: number;
  document: WorkflowDocument;
  note: string;
  createdAt: string;
};

export async function fetchNodeCatalog(
  domain?: 'studio' | 'novel',
): Promise<WorkflowNodeCatalogItem[]> {
  const { data } = await api.get('/workflows/nodes/catalog', {
    params: domain ? { domain } : {},
  });
  return data.nodes || [];
}

export async function fetchWorkflows(projectId?: string): Promise<WorkflowRow[]> {
  const { data } = await api.get('/workflows', { params: projectId ? { projectId } : {} });
  return data;
}

export async function fetchWorkflow(id: string): Promise<WorkflowRow> {
  const { data } = await api.get(`/workflows/${id}`);
  return data;
}

export async function createWorkflow(body: {
  name?: string;
  description?: string;
  projectId?: string;
  graph?: WorkflowGraph | WorkflowDocument;
  tags?: string[];
}): Promise<WorkflowRow> {
  const { data } = await api.post('/workflows', body);
  return data;
}

export async function updateWorkflow(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    graph: WorkflowGraph | WorkflowDocument;
    tags: string[];
    thumbUrl: string;
    revisionNote: string;
    saveRevision: boolean;
  }>,
): Promise<WorkflowRow> {
  const { data } = await api.patch(`/workflows/${id}`, patch);
  return data;
}

export async function deleteWorkflow(id: string) {
  const { data } = await api.delete(`/workflows/${id}`);
  return data;
}

/** 复制工作流（含图与标签） */
export async function duplicateWorkflow(id: string): Promise<WorkflowRow> {
  const src = await fetchWorkflow(id);
  return createWorkflow({
    name: `${src.name || '未命名'} 副本`,
    description: src.description || '',
    projectId: src.projectId || undefined,
    graph: src.graph,
    tags: [...(src.tags || []), 'copy'].filter((t, i, arr) => arr.indexOf(t) === i),
  });
}

export async function runWorkflow(
  id: string,
  body: {
    projectId?: string;
    inputs?: Record<string, unknown>;
    fromNodeId?: string;
    onlyNodeId?: string;
    /** 复用某次运行的 nodeStates，单节点重跑时跳过已完成上游 */
    priorRunId?: string;
    /** 幂等键：相同键的进行中运行会复用 */
    clientKey?: string;
    /** 强制新建（跳过幂等） */
    force?: boolean;
  } = {},
): Promise<{ workflowRun: WorkflowRunRow; job: any; reused?: boolean }> {
  const { data } = await api.post(`/workflows/${id}/run`, body);
  return data;
}

export async function fetchWorkflowRun(id: string): Promise<WorkflowRunRow> {
  const { data } = await api.get(`/workflow-runs/${id}`);
  return data;
}

export async function fetchWorkflowRuns(params?: {
  projectId?: string;
  workflowId?: string;
}): Promise<WorkflowRunRow[]> {
  const { data } = await api.get('/workflow-runs', { params });
  return data;
}

export async function cancelWorkflowRun(id: string): Promise<WorkflowRunRow> {
  const { data } = await api.post(`/workflow-runs/${id}/cancel`);
  return data;
}

export async function retryWorkflowRun(id: string): Promise<{ workflowRun: WorkflowRunRow; job: any }> {
  const { data } = await api.post(`/workflow-runs/${id}/retry`);
  return data;
}

export async function fetchWorkflowRevisions(id: string): Promise<WorkflowRevisionRow[]> {
  const { data } = await api.get(`/workflows/${id}/revisions`);
  return data;
}

export async function restoreWorkflowRevision(
  id: string,
  revisionId: string,
): Promise<WorkflowRow> {
  const { data } = await api.post(`/workflows/${id}/revisions/${revisionId}/restore`);
  return data;
}

/** SSE 订阅运行状态；失败时抛错，由调用方回退轮询 */
export function watchWorkflowRun(
  runId: string,
  onEvent: (payload: {
    id: string;
    status: string;
    nodeStates: Record<string, any>;
    result?: Record<string, unknown>;
    error?: string;
    progress?: number;
    message?: string;
    jobRunId?: string;
  }) => void,
  signal?: AbortSignal,
): Promise<void> {
  const auth = useAuthStore();
  const url = `/api/workflow-runs/${encodeURIComponent(runId)}/events`;
  return (async () => {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/event-stream',
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      signal,
      credentials: 'include',
    });
    if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
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
        try {
          const parsed = JSON.parse(dataLine);
          onEvent(parsed);
          if (['completed', 'failed', 'cancelled'].includes(String(parsed.status || ''))) {
            return;
          }
        } catch {
          /* ignore partial */
        }
      }
    }
  })();
}
