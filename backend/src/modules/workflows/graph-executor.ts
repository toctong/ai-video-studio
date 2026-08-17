import { Injectable, Logger } from '@nestjs/common';
import {
  compileDocumentToPrompt,
  migrateGraphV1ToDocument,
  promptCollectAncestors,
  promptTopoLayers,
  type ExecutionPrompt,
  type WorkflowDocument,
  type WorkflowGraph,
  type WorkflowNodeState,
} from '@ai-video-studio/shared';
import { isAbortLike, makeCancelError, formatExceptionMessage } from '../ai/runtime-errors';
import { NodeRegistry } from './node-registry';
import { decideNodeRun } from './graph-run-policy';
import type { NodeExecuteContext } from './nodes/types';
import type { AiProviderService } from '../ai/ai-provider.service';
import type { AssetsService } from '../assets/assets.service';
import type { JobsService } from '../jobs/jobs.service';
import type { LibrariesService } from '../libraries/libraries.service';

export type GraphExecuteOpts = {
  projectId: string;
  workflowId: string;
  workflowName?: string;
  productionId?: string;
  workflowRunId: string;
  jobRunId: string;
  /** Document v2 或旧 Graph v1 */
  graph: WorkflowDocument | WorkflowGraph;
  /** 已编译 Prompt；缺省则现场 compile */
  prompt?: ExecutionPrompt;
  runInputs: Record<string, unknown>;
  priorStates?: Record<string, WorkflowNodeState>;
  fromNodeId?: string;
  onlyNodeId?: string;
  signal: AbortSignal;
  services: {
    ai: AiProviderService;
    assets: AssetsService;
    jobs: JobsService;
    libraries: LibrariesService;
  };
  onNodeStates: (states: Record<string, WorkflowNodeState>) => Promise<void>;
  onProgress: (message: string, pct: number) => Promise<void>;
};

@Injectable()
export class GraphExecutor {
  private readonly logger = new Logger(GraphExecutor.name);

  constructor(private readonly registry: NodeRegistry) {}

  catalogPorts() {
    return this.registry.catalog().map((c) => ({
      type: c.type,
      inputs: c.inputs,
      outputs: c.outputs,
    }));
  }

  /** 校验并编译 Document → Prompt */
  compile(graph: WorkflowDocument | WorkflowGraph): {
    document: WorkflowDocument;
    prompt: ExecutionPrompt;
  } {
    const document = migrateGraphV1ToDocument(graph);
    const prompt = compileDocumentToPrompt(document, this.catalogPorts());
    return { document, prompt };
  }

  /** @deprecated 兼容旧调用：校验 document 可编译 */
  validate(graph: WorkflowDocument | WorkflowGraph) {
    this.compile(graph);
  }

  async execute(opts: GraphExecuteOpts): Promise<{
    nodeStates: Record<string, WorkflowNodeState>;
    result: Record<string, unknown>;
    document: WorkflowDocument;
    prompt: ExecutionPrompt;
  }> {
    const { document, prompt: compiled } = this.compile(opts.graph);
    const prompt = opts.prompt || compiled;
    const layers = promptTopoLayers(prompt);
    const states: Record<string, WorkflowNodeState> = { ...(opts.priorStates || {}) };
    const outputs = new Map<string, Record<string, unknown>>();
    const onlyId = String(opts.onlyNodeId || '').trim();
    const fromId = String(opts.fromNodeId || '').trim();
    // 显式重跑的目标节点不要带着旧 outputs，否则前端会先刷回旧图
    if (onlyId && states[onlyId]) {
      const { outputs: _drop, ...rest } = states[onlyId] as WorkflowNodeState & {
        outputs?: Record<string, unknown>;
      };
      states[onlyId] = { ...rest, status: 'pending', message: '等待重跑' };
    }
    if (fromId && states[fromId]) {
      const { outputs: _drop, ...rest } = states[fromId] as WorkflowNodeState & {
        outputs?: Record<string, unknown>;
      };
      states[fromId] = { ...rest, status: 'pending', message: '等待重跑' };
    }

    for (const [id, st] of Object.entries(states)) {
      if (st.status === 'completed' && st.outputs) {
        outputs.set(id, st.outputs);
      }
    }

    // 复制/粘贴的节点有新 id，没有历史 run 状态，但 params 里往往已有图/视频。
    // 作为上游依赖时，复用节点上已有媒体，避免「明明有图却又去生图」。
    this.hydrateMediaOutputsFromParams(prompt, states, outputs, {
      skipIds: new Set([onlyId, fromId].filter(Boolean)),
    });

    if (onlyId && !prompt.nodes[onlyId]) {
      throw new Error(
        `要执行的节点不在编译图中（${onlyId}）。可能画布未保存成功，请保存后重试`,
      );
    }
    if (fromId && !prompt.nodes[fromId]) {
      throw new Error(
        `续跑起点不在编译图中（${fromId}）。可能画布未保存成功，请保存后重试`,
      );
    }

    const skipUntil = fromId ? promptCollectAncestors(prompt, fromId) : null;
    const onlyAncestors = onlyId ? promptCollectAncestors(prompt, onlyId) : null;

    const total = Object.keys(prompt.nodes).length || 1;
    let done = 0;

    for (const layer of layers) {
      if (opts.signal.aborted) throw makeCancelError();

      const runnable = layer.filter((id) => {
        const decision = decideNodeRun({
          nodeId: id,
          nodeType: prompt.nodes[id]?.type,
          onlyId,
          fromId,
          ancestorsOfOnly: onlyAncestors,
          ancestorsUntilFrom: skipUntil,
          prior: states[id],
        });
        if (decision === 'skip-out-of-scope') return false;
        if (decision === 'skip-reuse') {
          states[id] = {
            ...states[id],
            status: 'completed',
            message: '跳过 · 复用上次结果',
          };
          done += 1;
          return false;
        }
        return true;
      });

      await Promise.all(
        runnable.map(async (nodeId) => {
          const pNode = prompt.nodes[nodeId];
          const def = this.registry.require(pNode.type);
          const continueOnError = Boolean(pNode.params?.continueOnError);
          const inputs = this.gatherInputsFromPrompt(pNode, outputs);
          states[nodeId] = {
            status: 'running',
            startedAt: new Date().toISOString(),
            message: def.title,
          };
          await opts.onNodeStates({ ...states });

          try {
            const ctx: NodeExecuteContext = {
              projectId: opts.projectId,
              workflowId: opts.workflowId,
              workflowName: opts.workflowName,
              productionId: opts.productionId,
              workflowRunId: opts.workflowRunId,
              jobRunId: opts.jobRunId,
              nodeId,
              params: { ...(def.defaultParams || {}), ...(pNode.params || {}) },
              inputs,
              runInputs: opts.runInputs || {},
              signal: opts.signal,
              progress: async (message) => {
                states[nodeId] = { ...states[nodeId], message };
                await opts.onNodeStates({ ...states });
                await opts.onProgress(message, Math.round((done / total) * 90) + 5);
              },
              services: opts.services,
            };
            const out = await def.execute(ctx);
            outputs.set(nodeId, out);
            states[nodeId] = {
              status: 'completed',
              outputs: out,
              startedAt: states[nodeId].startedAt,
              finishedAt: new Date().toISOString(),
              message: '完成',
            };
          } catch (e: any) {
            if (isAbortLike(e) || opts.signal.aborted) {
              states[nodeId] = {
                status: 'failed',
                error: '任务已取消',
                startedAt: states[nodeId].startedAt,
                finishedAt: new Date().toISOString(),
                message: '已取消',
              };
              await opts.onNodeStates({ ...states });
              throw isAbortLike(e) ? e : makeCancelError();
            }
            const err = formatExceptionMessage(e, '节点执行失败');
            this.logger.warn(`节点 ${nodeId}(${pNode.type}) 失败: ${err}`);
            states[nodeId] = {
              status: 'failed',
              error: err,
              startedAt: states[nodeId].startedAt,
              finishedAt: new Date().toISOString(),
              message: err,
            };
            await opts.onNodeStates({ ...states });
            if (!continueOnError) throw e;
          } finally {
            done += 1;
            await opts.onNodeStates({ ...states });
            await opts.onProgress(
              `节点进度 ${Math.min(done, total)}/${total}`,
              Math.min(95, Math.round((done / total) * 90) + 5),
            );
          }
        }),
      );
    }

    const result = this.collectPreviewResult(prompt, outputs);
    return { nodeStates: states, result, document, prompt };
  }

  private gatherInputsFromPrompt(
    pNode: ExecutionPrompt['nodes'][string],
    outputs: Map<string, Record<string, unknown>>,
  ) {
    const inputs: Record<string, unknown> = {};
    const multiImages: unknown[] = [];
    const multiVideos: unknown[] = [];
    for (const [port, linkOrArr] of Object.entries(pNode.inputs || {})) {
      const links = Array.isArray(linkOrArr) ? linkOrArr : linkOrArr ? [linkOrArr] : [];
      if ((port === 'image' || port === 'endImage') && links.length > 1) {
        const values: unknown[] = [];
        for (const l of links) {
          const src = outputs.get(l.nodeId);
          if (!src) continue;
          const value = src[l.port];
          if (value == null) continue;
          values.push(value);
          if (port === 'image') multiImages.push(value);
        }
        if (!values.length) continue;
        inputs[port] = values[0];
        if (port === 'image') inputs.images = multiImages.length ? multiImages : values;
        else if (values.length > 1) inputs.endImages = values;
        continue;
      }
      if (port === 'video' && links.length > 1) {
        const values: unknown[] = [];
        for (const l of links) {
          const src = outputs.get(l.nodeId);
          if (!src) continue;
          const value = src[l.port];
          if (value == null) continue;
          values.push(value);
          multiVideos.push(value);
        }
        if (!values.length) continue;
        inputs.video = values[0];
        inputs.videos = values;
        continue;
      }
      // 多文案汇入：拼成一段 prompt
      if (port === 'prompt' && links.length > 1) {
        const parts: string[] = [];
        for (const l of links) {
          const src = outputs.get(l.nodeId);
          if (!src) continue;
          const value = src[l.port];
          if (value == null) continue;
          const t = String(value).trim();
          if (t) parts.push(t);
        }
        if (parts.length) inputs.prompt = parts.join('\n');
        continue;
      }
      const l = links[0];
      if (!l) continue;
      const src = outputs.get(l.nodeId);
      if (!src) continue;
      const value = src[l.port];
      if (value == null) continue;
      inputs[port] = value;
      if (port === 'image') multiImages.push(value);
      if (port === 'video') multiVideos.push(value);
    }
    if (multiImages.length) inputs.images = multiImages;
    if (multiVideos.length) inputs.videos = multiVideos;
    return inputs;
  }

  private collectPreviewResult(
    prompt: ExecutionPrompt,
    outputs: Map<string, Record<string, unknown>>,
  ) {
    const previews = Object.entries(prompt.nodes).filter(([, n]) => n.type === 'output.preview');
    if (previews.length) {
      const merged: Record<string, unknown> = {};
      for (const [id] of previews) {
        Object.assign(merged, outputs.get(id) || {});
      }
      return merged;
    }
    const merged: Record<string, unknown> = {};
    for (const [id, n] of Object.entries(prompt.nodes)) {
      if (
        n.type !== 'ai.image' &&
        n.type !== 'ai.video' &&
        n.type !== 'input.image' &&
        n.type !== 'input.video'
      ) {
        continue;
      }
      Object.assign(merged, outputs.get(id) || {});
    }
    if (Object.keys(merged).length) return merged;
    const last = [...outputs.entries()].pop();
    return last ? { outputs: last[1] } : {};
  }

  /**
   * 从节点 params 回填已有媒体到 outputs（复制粘贴后无历史 run 状态时用）。
   * skipIds：当前显式要重跑的节点，不要回填以免跳过。
   */
  private hydrateMediaOutputsFromParams(
    prompt: ExecutionPrompt,
    states: Record<string, WorkflowNodeState>,
    outputs: Map<string, Record<string, unknown>>,
    opts?: { skipIds?: Set<string> },
  ) {
    const skip = opts?.skipIds || new Set<string>();
    for (const [id, pNode] of Object.entries(prompt.nodes || {})) {
      if (skip.has(id)) continue;
      const t = String(pNode.type || '');
      const params = (pNode.params || {}) as Record<string, unknown>;
      const cur = outputs.get(id) || states[id]?.outputs || {};

      if (t === 'ai.image' || t === 'input.image') {
        if (String(cur.image || '').trim()) continue;
        const url = String(params.lastImage || params.url || '').trim();
        if (!url) continue;
        const next = { ...cur, image: url };
        outputs.set(id, next);
        states[id] = {
          ...(states[id] || { status: 'completed' }),
          status: 'completed',
          outputs: next,
          message: states[id]?.message || '复用节点已有图片',
        };
        continue;
      }

      if (t === 'ai.video' || t === 'input.video') {
        if (String(cur.video || '').trim()) continue;
        const url = String(params.lastVideo || params.url || '').trim();
        if (!url) continue;
        const poster = String(params.posterUrl || params.lastImage || '').trim();
        const next = {
          ...cur,
          video: url,
          ...(poster && !/\.(mp4|webm|mov)(\?|$)/i.test(poster)
            ? { poster, image: poster }
            : {}),
        };
        outputs.set(id, next);
        states[id] = {
          ...(states[id] || { status: 'completed' }),
          status: 'completed',
          outputs: next,
          message: states[id]?.message || '复用节点已有视频',
        };
      }
    }
  }
}
