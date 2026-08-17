import api from '@/api';

export type JobRunRow = {
  id: string;
  projectId: string;
  kind: string;
  status: string;
  progress: number;
  message: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type JobQueueHealth = {
  ok: boolean;
  service?: string;
  ts?: number;
  jobs: {
    mode: 'bullmq' | 'in-process';
    concurrency: number;
    redisConfigured: boolean;
    redisConnected: boolean | null;
    redisTarget: string;
    lastError: string;
    summary: string;
  };
};

/** 登录态下的队列状态（优先）；失败时回退公开 /health */
export async function fetchJobQueueHealth(): Promise<JobQueueHealth> {
  try {
    const { data } = await api.get('/jobs/queue-status');
    return data as JobQueueHealth;
  } catch {
    const res = await fetch('/health', { credentials: 'include' });
    if (!res.ok) throw new Error(`健康检查失败 ${res.status}`);
    return res.json();
  }
}

export async function fetchJobs(projectId?: string): Promise<JobRunRow[]> {
  const { data } = await api.get('/jobs', {
    params: projectId ? { projectId } : {},
  });
  return Array.isArray(data) ? data : [];
}

export async function cancelJob(id: string): Promise<JobRunRow> {
  const { data } = await api.post(`/jobs/${id}/cancel`);
  return data;
}

export async function clearFinishedJobs(): Promise<{ ok: boolean; count: number }> {
  const { data } = await api.delete('/jobs/finished');
  return data;
}

const JOBS_CHANGED = 'lumina:jobs-changed';

/** 生成页入队后通知顶栏任务队列立刻刷新 */
export function notifyJobsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(JOBS_CHANGED));
}

export function onJobsChanged(handler: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const fn = () => handler();
  window.addEventListener(JOBS_CHANGED, fn);
  return () => window.removeEventListener(JOBS_CHANGED, fn);
}
