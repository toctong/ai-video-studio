import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JobKind } from '@ai-video-studio/shared';
import { JobRun } from '../../entities/job-run.entity';
import { InProcessJobQueue } from './in-process-job-queue';
import { appLogBuffer } from '../app-logs/app-log.buffer';

export class JobCancelledError extends Error {
  constructor(message = '任务已取消') {
    super(message);
    this.name = 'JobCancelledError';
  }
}

@Injectable()
export class JobsService {
  /** 进行中任务的 AbortController，取消时立刻打断上游请求、腾出并发槽 */
  private readonly aborts = new Map<string, AbortController>();
  /** 避免进度刷新刷屏：同一任务仅在状态变化时写日志 */
  private readonly lastLoggedStatus = new Map<string, string>();

  constructor(
    @InjectRepository(JobRun) private readonly runs: Repository<JobRun>,
    @Inject(forwardRef(() => InProcessJobQueue)) private readonly queue: InProcessJobQueue,
  ) {}

  list(projectId?: string) {
    return this.runs.find({
      where: projectId ? { projectId } : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async get(id: string) {
    const r = await this.runs.findOne({ where: { id } });
    if (!r) throw new NotFoundException('任务不存在');
    return r;
  }

  registerAbort(jobRunId: string) {
    const prev = this.aborts.get(jobRunId);
    if (prev) prev.abort();
    const c = new AbortController();
    this.aborts.set(jobRunId, c);
    return c.signal;
  }

  clearAbort(jobRunId: string) {
    this.aborts.delete(jobRunId);
  }

  /** 仅触发 AbortSignal（不改 DB）；用于运行墙钟超时等 */
  abort(jobRunId: string) {
    this.aborts.get(jobRunId)?.abort();
  }

  async isCancelled(jobRunId: string) {
    const r = await this.runs.findOne({ where: { id: jobRunId } });
    return r?.status === 'cancelled';
  }

  async throwIfCancelled(jobRunId: string) {
    if (await this.isCancelled(jobRunId)) throw new JobCancelledError();
  }

  async updateRun(
    id: string,
    patch: Partial<Pick<JobRun, 'status' | 'progress' | 'message' | 'result' | 'error'>>,
  ) {
    await this.runs.update({ id }, patch as any);
    const row = await this.get(id);
    this.emitJobLog(row);
    return row;
  }

  async enqueue(kind: JobKind, projectId: string, payload: Record<string, unknown> = {}) {
    const run = await this.runs.save(
      this.runs.create({
        projectId,
        kind,
        status: 'queued',
        progress: 0,
        message: '排队中',
        payload,
        result: {},
        error: '',
      }),
    );
    this.queue.enqueue(run.id);
    this.emitJobLog(run);
    return run;
  }

  private emitJobLog(row: JobRun) {
    const prev = this.lastLoggedStatus.get(row.id);
    if (prev === row.status) return;
    this.lastLoggedStatus.set(row.id, row.status);
    if (['completed', 'failed', 'cancelled'].includes(row.status)) {
      this.lastLoggedStatus.delete(row.id);
    }
    const label = String(row.payload?.label || row.payload?.name || row.kind || 'job').trim();
    const detail = String(row.error || row.message || '').trim();
    const level =
      row.status === 'failed' ? 'error' : row.status === 'cancelled' ? 'warn' : 'log';
    appLogBuffer.push(
      level,
      `[Job:${row.status}] ${label}${detail ? ` — ${detail}` : ''}`,
      'JobQueue',
    );
  }

  async cancel(id: string) {
    const run = await this.get(id);
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      return run;
    }
    this.queue.dropQueued(id);
    const ctrl = this.aborts.get(id);
    if (ctrl) ctrl.abort();
    return this.updateRun(id, { status: 'cancelled', message: '已取消' });
  }

  async retry(id: string, patch?: { model?: string }) {
    const old = await this.get(id);
    if (old.status !== 'failed' && old.status !== 'cancelled') {
      throw new BadRequestException('只能重试失败或已取消的任务');
    }
    const payload = { ...(old.payload || {}) };
    if (patch?.model) payload.model = patch.model;
    return this.enqueue(old.kind as JobKind, old.projectId, payload);
  }

  async remove(id: string) {
    const run = await this.get(id);
    this.queue.dropQueued(id);
    this.clearAbort(id);
    await this.runs.delete({ id: run.id });
    return { ok: true };
  }

  async removeByProject(projectId: string) {
    const rows = await this.runs.find({ where: { projectId } });
    for (const r of rows) {
      this.queue.dropQueued(r.id);
      this.clearAbort(r.id);
    }
    await this.runs.delete({ projectId });
    return { ok: true, count: rows.length };
  }

  /** 清空已结束任务（完成 / 失败 / 已取消），不影响排队与执行中 */
  async clearFinished() {
    const result = await this.runs
      .createQueryBuilder()
      .delete()
      .from(JobRun)
      .where('status IN (:...st)', { st: ['completed', 'failed', 'cancelled'] })
      .execute();
    return { ok: true, count: result.affected || 0 };
  }
}
