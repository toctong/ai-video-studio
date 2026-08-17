import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject, interval, switchMap } from 'rxjs';
import {
  emptyWorkflowDocument,
  migrateGraphV1ToDocument,
  pruneWorkflowDocument,
  sanitizeWorkflowDocumentForPersist,
  type WorkflowDocument,
  type WorkflowGraph,
  type WorkflowNodeState,
} from '@ai-video-studio/shared';
import { Workflow } from '../../entities/workflow.entity';
import { WorkflowRun } from '../../entities/workflow-run.entity';
import { WorkflowRevision } from '../../entities/workflow-revision.entity';
import { Production } from '../../entities/production.entity';
import { JobsService } from '../jobs/jobs.service';
import { NodeRegistry } from './node-registry';
import { GraphExecutor } from './graph-executor';
import { AiProviderService } from '../ai/ai-provider.service';
import { AssetsService } from '../assets/assets.service';
import { LibrariesService } from '../libraries/libraries.service';
import { isAbortLike, makeTimeoutError, formatExceptionMessage } from '../ai/runtime-errors';
import { pushAsyncJobLog } from '../app-logs/api-log.util';

/** 工作流单次运行墙钟上限（毫秒），可用 WORKFLOW_RUN_TIMEOUT_MS 覆盖 */
const DEFAULT_RUN_TIMEOUT_MS = 45 * 60 * 1000;

const PLACEHOLDER_NAMES = new Set(['', '未命名项目', '未命名制作单', '未命名工作流']);

function isPlaceholderName(name: string) {
  return PLACEHOLDER_NAMES.has(String(name || '').trim());
}

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);
  /** runId → 订阅者 */
  private readonly runBus = new Map<string, Subject<MessageEvent>>();

  constructor(
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    @InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>,
    @InjectRepository(WorkflowRevision)
    private readonly revisions: Repository<WorkflowRevision>,
    @InjectRepository(Production) private readonly productions: Repository<Production>,
    @Inject(forwardRef(() => JobsService)) private readonly jobs: JobsService,
    private readonly registry: NodeRegistry,
    private readonly executor: GraphExecutor,
    private readonly ai: AiProviderService,
    private readonly assets: AssetsService,
    private readonly libraries: LibrariesService,
  ) {}

  catalog(domain?: 'studio' | 'novel') {
    const all = this.registry.catalog();
    if (!domain) return all;
    return all.filter((n) => {
      const d = (n as { domains?: string[] }).domains;
      if (!d?.length) return true;
      return d.includes(domain);
    });
  }

  private normalizeWorkflow(w: Workflow): Workflow {
    const known = new Set(this.registry.catalog().map((c) => c.type));
    // 读库时去掉已删除的旧节点类型，避免前端加载后整图无法保存
    w.graph = pruneWorkflowDocument(w.graph as any, known);
    return w;
  }

  private persistableGraph(raw: WorkflowGraph | WorkflowDocument): WorkflowDocument {
    // 单一来源：NodeRegistry 目录；未知/已删类型剔除，坏边显式报错
    return sanitizeWorkflowDocumentForPersist(raw, this.executor.catalogPorts());
  }

  list(opts?: { projectId?: string }) {
    const q = opts?.projectId
      ? this.workflows.find({
          where: { projectId: opts.projectId, isTemplate: false },
          order: { updatedAt: 'DESC' },
        })
      : this.workflows.find({
          where: { isTemplate: false },
          order: { updatedAt: 'DESC' },
          take: 200,
        });
    return q.then((rows) => rows.map((w) => this.normalizeWorkflow(w)));
  }

  async get(id: string) {
    const w = await this.workflows.findOne({ where: { id } });
    if (!w) throw new NotFoundException('工作流不存在');
    return this.normalizeWorkflow(w);
  }

  async create(body: {
    name?: string;
    description?: string;
    projectId?: string;
    graph?: WorkflowGraph | WorkflowDocument;
    tags?: string[];
    isTemplate?: boolean;
    thumbUrl?: string;
  }) {
    let graph: WorkflowDocument;
    try {
      graph = this.persistableGraph(body.graph || emptyWorkflowDocument());
      if ((graph.nodes?.length || 0) > 0) this.executor.validate(graph);
    } catch (e: any) {
      throw new BadRequestException(e?.message || String(e));
    }
    const saved = await this.workflows.save(
      this.workflows.create({
        name: body.name || '未命名工作流',
        description: body.description || '',
        projectId: body.projectId || '',
        graph,
        tags: body.tags || [],
        isTemplate: Boolean(body.isTemplate),
        thumbUrl: body.thumbUrl || '',
        version: 1,
      }),
    );
    await this.saveRevision(saved.id, 1, graph, '创建');
    return saved;
  }

  async update(
    id: string,
    patch: Partial<{
      name: string;
      description: string;
      graph: WorkflowGraph | WorkflowDocument;
      tags: string[];
      thumbUrl: string;
      isTemplate: boolean;
      revisionNote: string;
      saveRevision: boolean;
    }>,
  ) {
    const w = await this.get(id);
    if (patch.graph) {
      let graph: WorkflowDocument;
      try {
        graph = this.persistableGraph(patch.graph);
        this.executor.validate(graph);
      } catch (e: any) {
        throw new BadRequestException(e?.message || e);
      }
      w.graph = graph;
      w.version = (w.version || 1) + 1;
      if (patch.saveRevision !== false) {
        await this.saveRevision(
          w.id,
          w.version,
          graph,
          patch.revisionNote || '自动保存',
        );
      }
    }
    if (patch.name != null) w.name = patch.name;
    if (patch.description != null) w.description = patch.description;
    if (patch.tags != null) w.tags = patch.tags;
    if (patch.thumbUrl != null) w.thumbUrl = patch.thumbUrl;
    if (patch.isTemplate != null) w.isTemplate = patch.isTemplate;
    if (!w.thumbUrl) {
      const fromGraph = this.pickThumbFromGraph(w.graph);
      if (fromGraph) w.thumbUrl = fromGraph;
    }
    const saved = await this.workflows.save(w);
    await this.syncLinkedProductions(saved.id, {
      name: patch.name != null ? saved.name : undefined,
      thumbUrl: saved.thumbUrl || undefined,
    });
    return saved;
  }

  /** 画布卡片列表读的是 Production，名称/封面需与工作流保持同步 */
  private async syncLinkedProductions(
    workflowId: string,
    patch: { name?: string; thumbUrl?: string },
  ) {
    if (!workflowId) return;
    const name = patch.name != null ? String(patch.name).trim() : undefined;
    const thumbUrl = patch.thumbUrl != null ? String(patch.thumbUrl).trim() : undefined;
    if (!name && !thumbUrl) return;
    const prods = await this.productions.find({ where: { workflowId } });
    for (const p of prods) {
      let dirty = false;
      if (
        name &&
        p.name !== name &&
        !(isPlaceholderName(name) && !isPlaceholderName(p.name))
      ) {
        p.name = name;
        dirty = true;
      }
      if (thumbUrl && p.thumbUrl !== thumbUrl) {
        p.thumbUrl = thumbUrl;
        dirty = true;
      }
      if (dirty) await this.productions.save(p);
    }
  }

  private pickThumbFromGraph(graph: WorkflowDocument | WorkflowGraph | null | undefined) {
    const nodes = Array.isArray(graph?.nodes) ? graph!.nodes : [];
    let fallback = '';
    for (const n of nodes) {
      const p = (n as { params?: Record<string, unknown> })?.params || {};
      const lastImage = String(p.lastImage || '').trim();
      if (lastImage) return lastImage;
      const image = String(p.image || '').trim();
      if (image) return image;
      const url = String(p.url || '').trim();
      if (url && !/\.(mp4|webm|mov)(\?|$)/i.test(url)) return url;
      if (!fallback) {
        fallback = String(p.lastVideo || p.video || '').trim();
      }
    }
    return fallback;
  }

  private async saveRevision(
    workflowId: string,
    version: number,
    document: WorkflowDocument,
    note: string,
  ) {
    await this.revisions.save(
      this.revisions.create({
        workflowId,
        version,
        document,
        note: note || '',
      }),
    );
  }

  listRevisions(workflowId: string) {
    return this.revisions.find({
      where: { workflowId },
      order: { version: 'DESC' },
      take: 50,
    });
  }

  async restoreRevision(workflowId: string, revisionId: string) {
    const rev = await this.revisions.findOne({ where: { id: revisionId, workflowId } });
    if (!rev) throw new NotFoundException('版本不存在');
    return this.update(workflowId, {
      graph: rev.document,
      revisionNote: `恢复自 v${rev.version}`,
      saveRevision: true,
    });
  }

  async remove(id: string) {
    await this.get(id);
    // 级联：版本、运行记录、工作流产出资产
    await this.revisions.delete({ workflowId: id });
    await this.runs.delete({ workflowId: id });
    try {
      await this.assets.removeByWorkflowId(id);
    } catch (e: any) {
      this.logger.warn(`删除工作流资产失败 ${id}: ${e?.message || e}`);
    }
    await this.workflows.delete({ id });
    return { ok: true };
  }

  async run(
    workflowId: string,
    opts: {
      projectId?: string;
      inputs?: Record<string, unknown>;
      fromNodeId?: string;
      onlyNodeId?: string;
      priorRunId?: string;
      clientKey?: string;
      force?: boolean;
    },
  ) {
    const wf = await this.get(workflowId);
    // 优先工作流绑定的真实项目；仅无项目时回退平台遗留桶
    const projectId = String(opts.projectId || wf.projectId || '').trim() || '_studio';

    let priorStates: Record<string, WorkflowNodeState> = {};
    let graph = structuredClone(wf.graph);
    let priorRunId = String(opts.priorRunId || '').trim();
    const onlyNodeId = String(opts.onlyNodeId || '').trim();
    const fromNodeId = String(opts.fromNodeId || '').trim();
    const clientKey = String(opts.clientKey || '').trim();
    const partial = Boolean(onlyNodeId || fromNodeId);

    // 轻量幂等：同工作流 + 同范围（或 clientKey）的 queued/active 运行直接复用
    if (!opts.force) {
      const reused = await this.findReusableRun(wf.id, {
        onlyNodeId,
        fromNodeId,
        clientKey,
        partial,
      });
      if (reused) {
        let job: Awaited<ReturnType<JobsService['get']>> | null = null;
        if (reused.jobRunId) {
          try {
            job = await this.jobs.get(reused.jobRunId);
          } catch {
            job = null;
          }
        }
        this.logger.log(`复用进行中运行 ${reused.id}（workflow=${wf.id}）`);
        return { workflowRun: reused, job, reused: true };
      }
    }

    // 单节点 / 从某节点续跑：合并最近多次运行里「已完成」的节点输出，避免只跑视频时又去重生首尾帧
    if (partial) {
      priorStates = await this.mergeRecentCompletedStates(wf.id, priorRunId || undefined);
    } else if (priorRunId) {
      const prior = await this.getRun(priorRunId);
      priorStates = prior.nodeStates || {};
    }

    // 即将重跑的目标节点去掉旧产物，前端不会先显示上一张图
    for (const targetId of [onlyNodeId, fromNodeId]) {
      if (!targetId || !priorStates[targetId]) continue;
      const { outputs: _drop, finishedAt: _f, error: _e, ...rest } = priorStates[targetId];
      priorStates[targetId] = { ...rest, status: 'pending', message: '等待重跑' };
    }

    let prompt;
    try {
      const compiled = this.executor.compile(graph);
      graph = compiled.document;
      prompt = compiled.prompt;
    } catch (e: any) {
      throw new BadRequestException(e?.message || e);
    }

    if (onlyNodeId && !prompt?.nodes?.[onlyNodeId]) {
      throw new BadRequestException(
        `要执行的节点不在工作流图中（${onlyNodeId}）。请确认画布已保存，且该节点仍在图上后重试`,
      );
    }
    if (fromNodeId && !prompt?.nodes?.[fromNodeId]) {
      throw new BadRequestException(
        `续跑起点不在工作流图中（${fromNodeId}）。请确认画布已保存后重试`,
      );
    }

    const runInputs: Record<string, unknown> = {
      ...(opts.inputs || {}),
      ...(clientKey ? { _clientKey: clientKey } : {}),
      _runScope: { onlyNodeId, fromNodeId },
    };

    const wfRun = await this.runs.save(
      this.runs.create({
        workflowId: wf.id,
        projectId,
        status: 'queued',
        progress: 0,
        message: '排队中',
        graphSnapshot: graph,
        promptSnapshot: prompt,
        nodeStates: priorStates,
        inputs: runInputs,
        result: {},
        error: '',
        jobRunId: '',
      }),
    );

    const job = await this.jobs.enqueue('workflow_run', projectId, {
      workflowRunId: wfRun.id,
      workflowId: wf.id,
      fromNodeId,
      onlyNodeId,
      label: wf.name,
      clientKey,
    });

    wfRun.jobRunId = job.id;
    await this.runs.save(wfRun);
    this.emitRun(wfRun.id, wfRun);
    return { workflowRun: wfRun, job, reused: false };
  }

  /** 查找可复用的 queued/active 运行 */
  private async findReusableRun(
    workflowId: string,
    scope: {
      onlyNodeId: string;
      fromNodeId: string;
      clientKey: string;
      partial: boolean;
    },
  ): Promise<WorkflowRun | null> {
    const recent = await this.runs.find({
      where: { workflowId },
      order: { createdAt: 'DESC' },
      take: 24,
    });
    const active = recent.filter((r) => r.status === 'queued' || r.status === 'active');
    if (!active.length) return null;

    if (scope.clientKey) {
      return (
        active.find((r) => String((r.inputs as any)?._clientKey || '') === scope.clientKey) || null
      );
    }

    return (
      active.find((r) => {
        const s = (r.inputs as any)?._runScope || {};
        const only = String(s.onlyNodeId || '');
        const from = String(s.fromNodeId || '');
        if (scope.partial) {
          return only === scope.onlyNodeId && from === scope.fromNodeId;
        }
        // 全图运行：范围也为空
        return !only && !from;
      }) || null
    );
  }

  async getRun(id: string) {
    const r = await this.runs.findOne({ where: { id } });
    if (!r) throw new NotFoundException('工作流运行不存在');
    if (!r.promptSnapshot) {
      r.promptSnapshot = { schemaVersion: 1, nodes: {} };
    }
    r.graphSnapshot = migrateGraphV1ToDocument(r.graphSnapshot as any);
    return r;
  }

  listRuns(opts?: { projectId?: string; workflowId?: string }) {
    const where: any = {};
    if (opts?.projectId) where.projectId = opts.projectId;
    if (opts?.workflowId) where.workflowId = opts.workflowId;
    return this.runs.find({
      where: Object.keys(where).length ? where : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async cancelRun(id: string) {
    const r = await this.getRun(id);
    if (r.jobRunId) await this.jobs.cancel(r.jobRunId);
    r.status = 'cancelled';
    r.message = '已取消';
    // 同步把进行中的节点态改成 cancelled，避免前端 applyNodeStates 又盖回 running
    const states = { ...(r.nodeStates || {}) };
    let changed = false;
    for (const [nid, st] of Object.entries(states)) {
      const status = String(st?.status || '');
      if (!['running', 'active', 'queued', 'pending'].includes(status)) continue;
      states[nid] = {
        ...st,
        status: 'cancelled',
        message: '已取消',
        error: '',
        finishedAt: new Date().toISOString(),
      };
      changed = true;
    }
    if (changed) r.nodeStates = states;
    await this.runs.save(r);
    this.emitRun(r.id, r);
    return r;
  }

  async retryRun(id: string, fromFailed = true) {
    const r = await this.getRun(id);
    let fromNodeId = '';
    if (fromFailed) {
      const failed = Object.entries(r.nodeStates || {}).find(([, s]) => s.status === 'failed');
      if (failed) fromNodeId = failed[0];
    }
    return this.run(r.workflowId, {
      projectId: r.projectId,
      inputs: r.inputs,
      fromNodeId: fromNodeId || undefined,
      priorRunId: fromNodeId ? r.id : undefined,
    });
  }

  /** SSE：推送运行状态；结束或 30min 后停 */
  watchRun(id: string): Observable<MessageEvent> {
    const bus = this.ensureBus(id);
    return new Observable<MessageEvent>((subscriber) => {
      const sub = bus.subscribe(subscriber);
      void this.getRun(id)
        .then((r) => {
          subscriber.next(this.toEvent(r));
        })
        .catch((e) => subscriber.error(e));
      // heartbeat + DB poll fallback every 2s
      const tick = interval(2000)
        .pipe(
          switchMap(() =>
            this.runs.findOne({ where: { id } }).then((r) => r || null),
          ),
        )
        .subscribe((r) => {
          if (!r) return;
          subscriber.next(this.toEvent(r));
          if (['completed', 'failed', 'cancelled'].includes(r.status)) {
            subscriber.complete();
          }
        });
      return () => {
        sub.unsubscribe();
        tick.unsubscribe();
      };
    });
  }

  private ensureBus(runId: string) {
    let s = this.runBus.get(runId);
    if (!s) {
      s = new Subject<MessageEvent>();
      this.runBus.set(runId, s);
    }
    return s;
  }

  private toEvent(r: WorkflowRun): MessageEvent {
    return {
      data: {
        id: r.id,
        status: r.status,
        nodeStates: r.nodeStates,
        result: r.result,
        error: r.error,
        progress: Number(r.progress) || 0,
        message: String(r.message || ''),
        jobRunId: r.jobRunId || '',
        updatedAt: r.updatedAt,
      },
    } as MessageEvent;
  }

  private emitRun(runId: string, r: WorkflowRun) {
    const bus = this.runBus.get(runId);
    if (bus) bus.next(this.toEvent(r));
  }

  /** 合并最近运行里各节点最新的「已完成」输出，优先采纳 preferredRunId */
  private async mergeRecentCompletedStates(workflowId: string, preferredRunId?: string) {
    const recent = await this.runs.find({
      where: { workflowId },
      order: { createdAt: 'DESC' },
      take: 16,
    });
    const merged: Record<string, WorkflowNodeState> = {};
    // 旧 → 新，后者覆盖前者
    for (const r of [...recent].reverse()) {
      for (const [id, st] of Object.entries(r.nodeStates || {})) {
        if (st?.status === 'completed' && st.outputs && Object.keys(st.outputs).length) {
          merged[id] = { ...st };
        }
      }
    }
    if (preferredRunId) {
      const preferred = recent.find((r) => r.id === preferredRunId);
      if (preferred) {
        for (const [id, st] of Object.entries(preferred.nodeStates || {})) {
          if (st?.status === 'completed' && st.outputs && Object.keys(st.outputs).length) {
            merged[id] = { ...st };
          }
        }
      }
    }
    return merged;
  }

  private pickThumb(result: Record<string, unknown>, states: Record<string, WorkflowNodeState>) {
    const fromResult =
      String(result?.image || result?.video || result?.url || '').trim() ||
      '';
    if (fromResult) return fromResult;
    for (const st of Object.values(states || {})) {
      const o = st.outputs || {};
      const u = String(o.image || o.video || '').trim();
      if (u) return u;
    }
    return '';
  }

  /** Job 队列入口 */
  async executeWorkflowRun(jobRunId: string, payload: Record<string, unknown>) {
    const workflowRunId = String(payload.workflowRunId || '');
    if (!workflowRunId) throw new Error('workflow_run 缺少 workflowRunId');
    const wfRun = await this.getRun(workflowRunId);
    const signal = this.jobs.registerAbort(jobRunId);

    const timeoutMs = Math.max(
      60_000,
      Number(process.env.WORKFLOW_RUN_TIMEOUT_MS) || DEFAULT_RUN_TIMEOUT_MS,
    );
    let timedOut = false;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      this.logger.warn(`工作流运行超时 ${wfRun.id}（${timeoutMs}ms）`);
      this.jobs.abort(jobRunId);
    }, timeoutMs);

    wfRun.status = 'active';
    wfRun.progress = 5;
    wfRun.message = '执行工作流';
    await this.runs.save(wfRun);
    this.emitRun(wfRun.id, wfRun);
    await this.jobs.updateRun(jobRunId, { status: 'active', progress: 5, message: '执行工作流' });

    try {
      const wf = await this.workflows.findOne({ where: { id: wfRun.workflowId } });
      let productionId = String(
        (wfRun.inputs as any)?.productionId || payload.productionId || '',
      ).trim();
      if (!productionId) {
        const prods = await this.productions.find({
          where: { workflowId: wfRun.workflowId },
          order: { updatedAt: 'DESC' },
          take: 1,
        });
        productionId = String(prods[0]?.id || '').trim();
      }
      const { nodeStates, result, document, prompt } = await this.executor.execute({
        projectId: wfRun.projectId,
        workflowId: wfRun.workflowId,
        workflowName: wf?.name || String(payload.label || ''),
        productionId: productionId || undefined,
        workflowRunId: wfRun.id,
        jobRunId,
        graph: wfRun.graphSnapshot,
        prompt: wfRun.promptSnapshot,
        runInputs: wfRun.inputs || {},
        priorStates: wfRun.nodeStates,
        fromNodeId: String(payload.fromNodeId || '') || undefined,
        onlyNodeId: String(payload.onlyNodeId || '') || undefined,
        signal,
        services: {
          ai: this.ai,
          assets: this.assets,
          jobs: this.jobs,
          libraries: this.libraries,
        },
        onNodeStates: async (states) => {
          wfRun.nodeStates = states;
          await this.runs.save(wfRun);
          this.emitRun(wfRun.id, wfRun);
        },
        onProgress: async (message, pct) => {
          await this.jobs.throwIfCancelled(jobRunId);
          wfRun.progress = pct;
          wfRun.message = message;
          await this.runs.save(wfRun);
          this.emitRun(wfRun.id, wfRun);
          await this.jobs.updateRun(jobRunId, { message, progress: pct });
        },
      });

      wfRun.nodeStates = nodeStates;
      wfRun.result = result;
      wfRun.graphSnapshot = document;
      wfRun.promptSnapshot = prompt;
      wfRun.status = 'completed';
      wfRun.progress = 100;
      wfRun.message = '完成';
      wfRun.error = '';
      await this.runs.save(wfRun);
      this.emitRun(wfRun.id, wfRun);

      const thumb = this.pickThumb(result, nodeStates);
      if (thumb && wf) {
        wf.thumbUrl = thumb;
        await this.workflows.save(wf);
        if (productionId) {
          await this.productions.update(productionId, { thumbUrl: thumb });
        } else {
          await this.syncLinkedProductions(wf.id, { thumbUrl: thumb });
        }
      }

      return { workflowRunId: wfRun.id, result, nodeStates };
    } catch (e: any) {
      if (timedOut) {
        const te = makeTimeoutError();
        wfRun.status = 'failed';
        wfRun.error = te.message;
        wfRun.message = te.message;
        await this.runs.save(wfRun);
        this.emitRun(wfRun.id, wfRun);
        this.logWorkflowRunOutcome(wfRun, false, te.message);
        throw te;
      }
      const cancelled = isAbortLike(e) || signal.aborted;
      const msg = cancelled ? '任务已取消' : formatExceptionMessage(e, '运行失败');
      wfRun.status = cancelled ? 'cancelled' : 'failed';
      wfRun.error = msg;
      wfRun.message = msg;
      await this.runs.save(wfRun);
      this.emitRun(wfRun.id, wfRun);
      this.logWorkflowRunOutcome(wfRun, false, msg);
      throw e;
    } finally {
      clearTimeout(timeoutTimer);
      this.jobs.clearAbort(jobRunId);
    }
  }

  private logWorkflowRunOutcome(wfRun: WorkflowRun, ok: boolean, errorMessage = '') {
    const started = Date.parse(String(wfRun.createdAt || '')) || Date.now();
    const failedNodes = Object.entries(wfRun.nodeStates || {})
      .filter(([, st]) => st?.status === 'failed')
      .map(([id, st]) => ({
        nodeId: id,
        error: st?.error || st?.message || '',
      }));
    pushAsyncJobLog({
      kind: 'workflow_run',
      path: `/api/workflow-runs/${wfRun.id}`,
      ok,
      durationMs: Math.max(0, Date.now() - started),
      errorMessage: errorMessage || wfRun.error || '',
      projectId: wfRun.projectId,
      detail: {
        workflowId: wfRun.workflowId,
        workflowRunId: wfRun.id,
        jobRunId: wfRun.jobRunId || '',
        status: wfRun.status,
        error: errorMessage || wfRun.error || '',
        failedNodes,
      },
    });
  }
}