import api from '@/api';

export type JobRun = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  message?: string;
  error?: string;
  result?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

/** Poll job until terminal status. Throws on failed/cancelled/timeout. */
export async function waitJob(
  jobId: string,
  opts?: { intervalMs?: number; timeoutMs?: number; onUpdate?: (j: JobRun) => void },
): Promise<JobRun> {
  const interval = opts?.intervalMs ?? 1500;
  const timeout = opts?.timeoutMs ?? 15 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { data } = await api.get<JobRun>(`/jobs/${jobId}`);
    opts?.onUpdate?.(data);
    if (data.status === 'completed') return data;
    if (data.status === 'failed') throw new Error(data.error || data.message || '任务失败');
    if (data.status === 'cancelled') throw new Error('任务已取消');
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('等待任务超时');
}

export async function enqueueAndWait(
  request: () => Promise<{ data: { id: string } }>,
  opts?: Parameters<typeof waitJob>[1],
) {
  const { data } = await request();
  return waitJob(data.id, opts);
}
