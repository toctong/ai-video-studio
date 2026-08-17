/** 创建项目后：概览页轮询大纲生成状态 */
const PREFIX = 'lumina:outline-pending:';

export function markOutlinePending(projectId: string, jobId?: string) {
  const id = String(projectId || '').trim();
  if (!id) return;
  try {
    const prev = readOutlinePending(id);
    sessionStorage.setItem(
      `${PREFIX}${id}`,
      JSON.stringify({
        at: prev?.at || Date.now(),
        jobId: String(jobId || prev?.jobId || ''),
      }),
    );
  } catch {
    /* ignore */
  }
}

export function readOutlinePending(projectId: string): { at: number; jobId: string } | null {
  const id = String(projectId || '').trim();
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { at: Number(parsed?.at) || Date.now(), jobId: String(parsed?.jobId || '') };
  } catch {
    return null;
  }
}

export function clearOutlinePending(projectId: string) {
  const id = String(projectId || '').trim();
  if (!id) return;
  try {
    sessionStorage.removeItem(`${PREFIX}${id}`);
  } catch {
    /* ignore */
  }
}
