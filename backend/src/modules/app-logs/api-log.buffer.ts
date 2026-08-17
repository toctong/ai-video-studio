export type ApiLogEntry = {
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

const MAX_ENTRIES = 1500;

export class ApiLogBuffer {
  private entries: ApiLogEntry[] = [];
  private seq = 0;
  private readonly listeners = new Set<(entry: ApiLogEntry) => void>();

  push(partial: Omit<ApiLogEntry, 'id'>) {
    const entry: ApiLogEntry = {
      id: ++this.seq,
      ...partial,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    for (const fn of this.listeners) {
      try {
        fn(entry);
      } catch {
        /* ignore */
      }
    }
    return entry;
  }

  list(opts?: {
    sinceId?: number;
    limit?: number;
    method?: string;
    status?: string;
    q?: string;
  }): ApiLogEntry[] {
    const since = Number(opts?.sinceId) || 0;
    const limit = Math.min(1500, Math.max(1, Number(opts?.limit) || 1500));
    const method = String(opts?.method || '')
      .trim()
      .toUpperCase();
    const status = String(opts?.status || '').trim();
    const q = String(opts?.q || '')
      .trim()
      .toLowerCase();

    let rows = since > 0 ? this.entries.filter((e) => e.id > since) : this.entries.slice();

    if (method) {
      rows = rows.filter((e) => e.method === method);
    }
    if (status === '2xx') {
      rows = rows.filter((e) => e.statusCode >= 200 && e.statusCode < 300);
    } else if (status === '4xx') {
      rows = rows.filter((e) => e.statusCode >= 400 && e.statusCode < 500);
    } else if (status === '5xx') {
      rows = rows.filter((e) => e.statusCode >= 500);
    } else if (/^\d{3}$/.test(status)) {
      const code = Number(status);
      rows = rows.filter((e) => e.statusCode === code);
    }
    if (q) {
      rows = rows.filter((e) => {
        const pathHit = e.path.toLowerCase().includes(q);
        const ridHit = e.requestId.toLowerCase().includes(q);
        const methodHit = e.method.toLowerCase().includes(q);
        if (pathHit || ridHit || methodHit) return true;
        try {
          const blob = JSON.stringify({
            query: e.query,
            requestBody: e.requestBody,
            responseBody: e.responseBody,
            errorMessage: e.errorMessage,
          }).toLowerCase();
          return blob.includes(q);
        } catch {
          return false;
        }
      });
    }

    if (rows.length <= limit) return rows;
    return rows.slice(rows.length - limit);
  }

  subscribe(fn: (entry: ApiLogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const apiLogBuffer = new ApiLogBuffer();
