export type AppLogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

export type AppLogEntry = {
  id: number;
  ts: number;
  level: AppLogLevel;
  context: string;
  message: string;
};

const MAX_ENTRIES = 3000;

/** 进程内环形日志缓冲（供 UI 终端面板拉取） */
export class AppLogBuffer {
  private entries: AppLogEntry[] = [];
  private seq = 0;
  private readonly listeners = new Set<(entry: AppLogEntry) => void>();

  push(level: AppLogLevel, message: unknown, context = 'App') {
    const text = this.stringify(message);
    if (!text) return;
    const entry: AppLogEntry = {
      id: ++this.seq,
      ts: Date.now(),
      level,
      context: String(context || 'App').trim() || 'App',
      message: text,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    for (const fn of this.listeners) {
      try {
        fn(entry);
      } catch {
        /* ignore subscriber errors */
      }
    }
  }

  list(opts?: { sinceId?: number; limit?: number }): AppLogEntry[] {
    const since = Number(opts?.sinceId) || 0;
    const limit = Math.min(2000, Math.max(1, Number(opts?.limit) || 800));
    const rows = since > 0 ? this.entries.filter((e) => e.id > since) : this.entries;
    if (rows.length <= limit) return rows.slice();
    return rows.slice(rows.length - limit);
  }

  clear() {
    this.entries = [];
  }

  subscribe(fn: (entry: AppLogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private stringify(message: unknown): string {
    if (message == null) return '';
    if (typeof message === 'string') return message;
    if (message instanceof Error) {
      return message.stack || message.message || String(message);
    }
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}

/** 全局单例：Logger 在 DI 就绪前就要能写入 */
export const appLogBuffer = new AppLogBuffer();
