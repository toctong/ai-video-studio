import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobRun } from '../../entities/job-run.entity';
import { WorkflowRun } from '../../entities/workflow-run.entity';
import { SettingsService } from '../settings/settings.service';
import { JobConcurrencyNotifier } from '../settings/job-concurrency.notifier';
import { GenerateRunner } from './generate.processor';

export type JobQueueStatus = {
  mode: 'bullmq' | 'in-process';
  concurrency: number;
  redisConfigured: boolean;
  /** true=已 ping 通；false=配置了但连不上；null=未使用 Redis */
  redisConnected: boolean | null;
  /** 脱敏后的地址，便于对照配置 */
  redisTarget: string;
  lastError: string;
};

function redactRedisUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '(not set)';
  try {
    const u = new URL(s);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return s.replace(/:([^:@/]+)@/, ':***@');
  }
}

/**
 * 任务队列：
 * - 配置 `REDIS_URL` 时用 BullMQ
 * - 否则进程内队列
 * 并发：设置页「任务并发」
 */
@Injectable()
export class InProcessJobQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InProcessJobQueue.name);
  private concurrency = 8;
  private readonly redisUrl = String(process.env.REDIS_URL || '').trim();

  /** 内存模式 */
  private readonly pending: string[] = [];
  private readonly queued = new Set<string>();
  private active = 0;

  /** BullMQ 模式 */
  private bullQueue: import('bullmq').Queue | null = null;
  private bullWorker: import('bullmq').Worker | null = null;

  private redisConnected: boolean | null = null;
  private lastError = '';

  constructor(
    private readonly runner: GenerateRunner,
    @InjectRepository(JobRun) private readonly runs: Repository<JobRun>,
    @InjectRepository(WorkflowRun) private readonly wfRuns: Repository<WorkflowRun>,
    @Inject(forwardRef(() => SettingsService)) private readonly settings: SettingsService,
    @Inject(forwardRef(() => JobConcurrencyNotifier))
    private readonly concurrencyNotifier: JobConcurrencyNotifier,
  ) {}

  getStatus(): JobQueueStatus {
    const usingBull = Boolean(this.bullQueue);
    return {
      mode: usingBull ? 'bullmq' : 'in-process',
      concurrency: this.concurrency,
      redisConfigured: Boolean(this.redisUrl),
      redisConnected: this.redisConnected,
      redisTarget: redactRedisUrl(this.redisUrl),
      lastError: this.lastError,
    };
  }

  /** 设置页保存并发后调用 */
  setConcurrency(n: number) {
    const next = Math.max(1, Math.min(32, Math.floor(Number(n) || 1)));
    if (next === this.concurrency) return;
    this.concurrency = next;
    if (this.bullWorker) {
      (this.bullWorker as any).concurrency = next;
    }
    this.logger.log(`任务并发已更新为 ${next}`);
    this.pump();
  }

  /** 供 /health 探测；未使用 Redis 时返回 null */
  async pingRedis(): Promise<boolean | null> {
    if (!this.redisUrl) return null;
    if (!this.bullQueue) return false;
    try {
      await this.bullQueue.getJobCounts('wait', 'active');
      this.redisConnected = true;
      this.lastError = '';
      return true;
    } catch (e: any) {
      this.redisConnected = false;
      this.lastError = String(e?.message || e);
      return false;
    }
  }

  async onModuleInit() {
    this.concurrencyNotifier.onChange((n) => this.setConcurrency(n));
    try {
      const s = await this.settings.getPublic();
      this.concurrency = Math.max(1, Math.min(32, Number(s.jobConcurrency) || 8));
    } catch {
      /* keep default */
    }
    this.logger.log(
      `任务队列启动：REDIS_URL=${redactRedisUrl(this.redisUrl)} 并发=${this.concurrency}（设置页）`,
    );
    if (this.redisUrl) {
      await this.initBullMq();
    } else {
      this.redisConnected = null;
      this.logger.log(
        `任务队列：进程内模式（未配置 REDIS_URL）。画布仍可并发；刷新浏览器后任务靠数据库接回。`,
      );
    }
    this.logStatusBanner();
    await this.recoverInterruptedJobs();
  }

  async onModuleDestroy() {
    try {
      await this.bullWorker?.close();
    } catch {
      /* ignore */
    }
    try {
      await this.bullQueue?.close();
    } catch {
      /* ignore */
    }
  }

  private logStatusBanner() {
    const st = this.getStatus();
    if (st.mode === 'bullmq' && st.redisConnected) {
      this.logger.log(
        `✓ Redis 已连接 → BullMQ 队列就绪（${st.redisTarget}，并发=${st.concurrency}）`,
      );
    } else if (st.redisConfigured && !st.redisConnected) {
      this.logger.error(
        `✗ Redis 未连通（${st.redisTarget}），已回退进程内队列。${st.lastError}`,
      );
    } else {
      this.logger.log(
        `• 任务队列模式=进程内 并发=${st.concurrency}（配置 REDIS_URL 可启用 BullMQ）`,
      );
    }
  }

  private async initBullMq() {
    const { Queue, Worker } = await import('bullmq');
    // 传 URL 字符串给 BullMQ，避免 monorepo 下多份 ioredis 类型冲突
    const connection = { url: this.redisUrl, maxRetriesPerRequest: null as null };
    try {
      this.bullQueue = new Queue('ai-comic-jobs', { connection });
      this.bullWorker = new Worker(
        'ai-comic-jobs',
        async (job) => {
          const jobRunId = String(job.data?.jobRunId || job.id || '');
          if (!jobRunId) return;
          await this.runner.run(jobRunId);
        },
        {
          connection: { ...connection },
          concurrency: this.concurrency,
        },
      );
      this.bullWorker.on('ready', () => {
        this.logger.log('BullMQ 工作线程已就绪');
      });
      this.bullWorker.on('error', (err) => {
        this.lastError = String(err?.message || err);
        this.redisConnected = false;
        this.logger.error(`BullMQ 工作线程错误: ${this.lastError}`);
      });
      this.bullWorker.on('failed', (job, err) => {
        this.logger.error(`BullMQ 任务 ${job?.id} 失败: ${err?.message || err}`);
      });

      // 启动时主动探测，避免「配了 URL 但其实连不上」误判
      await this.bullQueue.waitUntilReady();
      await this.bullQueue.getJobCounts('wait', 'active');
      this.redisConnected = true;
      this.lastError = '';
      this.logger.log(`Redis 探测成功 → ${redactRedisUrl(this.redisUrl)}`);
    } catch (e: any) {
      this.lastError = String(e?.message || e);
      this.redisConnected = false;
      this.logger.error(
        `Redis 连接失败（${redactRedisUrl(this.redisUrl)}）: ${this.lastError}`,
      );
      try {
        await this.bullWorker?.close();
      } catch {
        /* ignore */
      }
      try {
        await this.bullQueue?.close();
      } catch {
        /* ignore */
      }
      this.bullWorker = null;
      this.bullQueue = null;
      this.logger.warn('Redis 不可用，已切换为进程内任务队列');
    }
  }

  /**
   * 服务重启后：把中断的 active 重新排队（可完整重跑），并恢复仍为 queued 的任务。
   * 工作流运行记录与 Job 同步，前端刷新后可继续订阅。
   */
  private async recoverInterruptedJobs() {
    const stuck = await this.runs.find({ where: { status: 'active' } });
    for (const r of stuck) {
      await this.runs.update(
        { id: r.id },
        {
          status: 'queued',
          progress: 0,
          message: '服务重启，重新排队',
          error: '',
        },
      );
      await this.wfRuns.update(
        { jobRunId: r.id },
        {
          status: 'queued',
          progress: 0,
          message: '服务重启，重新排队',
          error: '',
        },
      );
      this.enqueue(r.id);
    }
    if (stuck.length) {
      this.logger.warn(`已重新入队 ${stuck.length} 个中断的进行中任务`);
    }

    const queued = await this.runs.find({
      where: { status: 'queued' },
      order: { createdAt: 'ASC' },
      take: 500,
    });
    // stuck 已 enqueue；其余 queued 再入队（幂等）
    for (const r of queued) {
      if (stuck.some((s) => s.id === r.id)) continue;
      this.enqueue(r.id);
    }
    if (queued.length) {
      this.logger.log(`已恢复 ${queued.length} 个排队中任务`);
    }
  }

  enqueue(jobRunId: string) {
    if (this.bullQueue) {
      void this.enqueueBull(jobRunId);
      return;
    }
    this.enqueueMemory(jobRunId);
  }

  private async enqueueBull(jobRunId: string) {
    if (!this.bullQueue) return;
    const opts = {
      jobId: jobRunId,
      removeOnComplete: 200,
      removeOnFail: 400,
    };
    try {
      await this.bullQueue.add('run', { jobRunId }, opts);
    } catch (e: any) {
      const msg = String(e?.message || e);
      try {
        const existing = await this.bullQueue.getJob(jobRunId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
            await this.bullQueue.add('run', { jobRunId }, opts);
            return;
          }
          // waiting / active / delayed：已在队列中
          return;
        }
      } catch {
        /* fall through */
      }
      this.logger.error(`BullMQ 入队失败 ${jobRunId}: ${msg}`);
      this.lastError = msg;
      this.redisConnected = false;
      this.enqueueMemory(jobRunId);
    }
  }

  private enqueueMemory(jobRunId: string) {
    if (this.queued.has(jobRunId)) return;
    this.queued.add(jobRunId);
    this.pending.push(jobRunId);
    this.pump();
  }

  /** 取消仍在等待槽位的任务（已执行中的靠 AbortController） */
  dropQueued(jobRunId: string) {
    const idx = this.pending.indexOf(jobRunId);
    if (idx >= 0) this.pending.splice(idx, 1);
    this.queued.delete(jobRunId);
    if (this.bullQueue) {
      void this.bullQueue.remove(jobRunId).catch(() => undefined);
    }
  }

  private pump() {
    while (this.active < this.concurrency && this.pending.length) {
      const jobRunId = this.pending.shift()!;
      this.active += 1;
      void this.runner
        .run(jobRunId)
        .catch((e) => {
          this.logger.error(`任务 ${jobRunId} 异常退出: ${e?.message || e}`);
        })
        .finally(() => {
          this.queued.delete(jobRunId);
          this.active -= 1;
          this.pump();
        });
    }
  }
}
