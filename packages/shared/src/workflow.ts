/** 工作流图与节点端口类型（前后端共用） */

export const WORKFLOW_PORT_TYPES = [
  'text',
  'image',
  'video',
  'json',
  'assetRef',
  'number',
  'bool',
] as const;

export type PortType = (typeof WORKFLOW_PORT_TYPES)[number];

export type WorkflowPortDef = {
  id: string;
  label: string;
  type: PortType;
  /** 可选输入：未连线时用节点 params 或缺省 */
  optional?: boolean;
};

export type WorkflowNodePosition = { x: number; y: number };

export type NodeMode = 'active' | 'mute' | 'bypass';

export type WorkflowNode = {
  id: string;
  type: string;
  label?: string;
  position: WorkflowNodePosition;
  params?: Record<string, unknown>;
  /** @deprecated 用 mode:'mute'；读库时会迁移 */
  disabled?: boolean;
  /** Comfy 语义：active 执行 / mute 剔除 / bypass 短路 */
  mode?: NodeMode;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};

/** @deprecated schemaVersion 1；请用 WorkflowDocument + migrate */
export type WorkflowGraph = {
  schemaVersion: 1;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type WorkflowGroup = {
  id: string;
  title: string;
  /** 包围盒（画布坐标） */
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  /** 画布分组显示图片端口（如宫格切分组） */
  imagePort?: boolean;
  /** 切分组对应的源图节点 id（用于重载补线） */
  sourceImageId?: string;
};

export type WorkflowViewport = {
  x: number;
  y: number;
  zoom: number;
};

/** 编辑态文档（Comfy Workflow JSON 对标） */
export type WorkflowDocument = {
  schemaVersion: 2;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  groups?: WorkflowGroup[];
  viewport?: WorkflowViewport;
  meta?: Record<string, unknown>;
};

/** 执行态扁平图（Comfy API Prompt 对标） */
export type ExecutionPromptLink = {
  nodeId: string;
  port: string;
};

export type ExecutionPromptNode = {
  type: string;
  params: Record<string, unknown>;
  /** portId → 上游；同口多边时为数组（如 ai.image 定妆+场景、ai.video 多参考图） */
  inputs: Record<string, ExecutionPromptLink | ExecutionPromptLink[]>;
};

export type ExecutionPrompt = {
  schemaVersion: 1;
  nodes: Record<string, ExecutionPromptNode>;
};

export type WorkflowNodeRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type WorkflowNodeState = {
  status: WorkflowNodeRunStatus;
  outputs?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
};

export type WorkflowRunStatus =
  | 'queued'
  | 'active'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowParamFieldType =
  | 'string'
  | 'textarea'
  | 'number'
  | 'bool'
  | 'select'
  | 'image';

export type WorkflowParamField = {
  key: string;
  label: string;
  type: WorkflowParamFieldType;
  options?: { label: string; value: string | number | boolean }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

export type WorkflowNodeCatalogItem = {
  type: string;
  title: string;
  category: string;
  description?: string;
  inputs: WorkflowPortDef[];
  outputs: WorkflowPortDef[];
  defaultParams?: Record<string, unknown>;
  /** schema-driven inspector */
  paramSchema?: WorkflowParamField[];
  /** 可见域：缺省两边都可见；仅 novel 的节点在工作室可隐藏 */
  domains?: Array<'studio' | 'novel'>;
};

export type CatalogPortLookup = {
  type: string;
  inputs: WorkflowPortDef[];
  outputs: WorkflowPortDef[];
};

export function emptyWorkflowGraph(): WorkflowGraph {
  return { schemaVersion: 1, nodes: [], edges: [] };
}

export function emptyWorkflowDocument(): WorkflowDocument {
  return { schemaVersion: 2, nodes: [], edges: [], groups: [] };
}

/**
 * 工作室画布主路径节点（前端 palette / 客户端裁剪）。
 * 服务端持久化以 NodeRegistry 目录为准，勿在此手工扩类型。
 */
export const STUDIO_CANVAS_NODE_TYPES = [
  'input.text',
  'input.note',
  'input.image',
  'input.video',
  'ai.chat',
  'ai.image',
  'ai.video',
] as const;

export type StudioCanvasNodeType = (typeof STUDIO_CANVAS_NODE_TYPES)[number];

/** 按允许类型裁剪节点，并去掉悬空边 / 坏边 */
export function pruneWorkflowDocument(
  docIn: WorkflowDocument | WorkflowGraph | null | undefined,
  allowTypes: Iterable<string>,
): WorkflowDocument {
  const doc = migrateGraphV1ToDocument(docIn);
  const allow = new Set(allowTypes);
  const nodes = (doc.nodes || []).filter((n) => n?.id && allow.has(n.type));
  const ids = new Set(nodes.map((n) => n.id));
  const groups = (doc.groups || []).filter((g) => g?.id);
  for (const g of groups) ids.add(g.id);
  const edges = (doc.edges || [])
    .filter(
      (e) =>
        e &&
        ids.has(e.source) &&
        ids.has(e.target) &&
        String(e.sourceHandle || '').trim() &&
        String(e.targetHandle || '').trim(),
    )
    .map((e) => ({
      id: e.id || `e_${e.source}_${e.sourceHandle}_${e.target}_${e.targetHandle}`,
      source: e.source,
      sourceHandle: String(e.sourceHandle),
      target: e.target,
      targetHandle: String(e.targetHandle),
    }));
  return {
    schemaVersion: 2,
    nodes,
    edges,
    groups,
    viewport: doc.viewport,
    meta: doc.meta,
  };
}

export function pruneStudioWorkflowDocument(
  docIn: WorkflowDocument | WorkflowGraph | null | undefined,
): WorkflowDocument {
  return pruneWorkflowDocument(docIn, STUDIO_CANVAS_NODE_TYPES);
}

export class WorkflowDocumentSanitizeError extends Error {
  constructor(
    message: string,
    readonly causeMessage?: string,
  ) {
    super(message);
    this.name = 'WorkflowDocumentSanitizeError';
  }
}

/**
 * 持久化前消毒：剔除未知节点类型；图必须能成功编译。
 * 坏边不再静默丢弃——直接抛错，由调用方返回 400。
 */
export function sanitizeWorkflowDocumentForPersist(
  docIn: WorkflowDocument | WorkflowGraph | null | undefined,
  catalog: CatalogPortLookup[],
  opts?: { allowTypes?: Iterable<string> },
): WorkflowDocument {
  const known = new Set(catalog.map((c) => c.type));
  if (!known.size) {
    throw new WorkflowDocumentSanitizeError('工作流节点目录为空，无法保存');
  }
  const allow = opts?.allowTypes
    ? new Set([...opts.allowTypes].filter((t) => known.has(t)))
    : known;
  if (!allow.size) {
    throw new WorkflowDocumentSanitizeError('没有可持久化的节点类型');
  }
  const doc = pruneWorkflowDocument(docIn, allow);
  try {
    compileDocumentToPrompt(doc, catalog);
    return doc;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new WorkflowDocumentSanitizeError(
      `工作流图无法保存：${detail}。请修正连线或节点端口后重试`,
      detail,
    );
  }
}

export function nodeModeOf(n: WorkflowNode): NodeMode {
  if (n.mode === 'mute' || n.mode === 'bypass' || n.mode === 'active') return n.mode;
  if (n.disabled) return 'mute';
  return 'active';
}

/**
 * 端口类型是否可连（严格同型为主，少量明确例外）。
 * - text/image/video/number/bool/json：仅同型
 * - assetRef ↔ image/video：素材与媒体互转
 */
export function portsCompatible(from: PortType, to: PortType): boolean {
  if (from === to) return true;
  if (from === 'assetRef' && (to === 'image' || to === 'video')) return true;
  if ((from === 'image' || from === 'video') && to === 'assetRef') return true;
  return false;
}

/** 任意存库 JSON → Document v2 */
export function migrateGraphV1ToDocument(
  raw: WorkflowGraph | WorkflowDocument | null | undefined,
): WorkflowDocument {
  if (!raw || typeof raw !== 'object') return emptyWorkflowDocument();
  const any = raw as {
    schemaVersion?: number;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    groups?: WorkflowGroup[];
    viewport?: WorkflowViewport;
    meta?: Record<string, unknown>;
  };
  if (any.schemaVersion === 2) {
    return {
      schemaVersion: 2,
      nodes: (any.nodes || []).map((n) => ({
        ...n,
        mode: nodeModeOf(n),
        disabled: undefined,
      })),
      edges: any.edges || [],
      groups: any.groups || [],
      viewport: any.viewport,
      meta: any.meta,
    };
  }
  return {
    schemaVersion: 2,
    nodes: (any.nodes || []).map((n) => ({
      ...n,
      mode: nodeModeOf(n),
      disabled: undefined,
    })),
    edges: any.edges || [],
    groups: [],
  };
}

/** Document → 兼容旧前端的 Graph 形（schemaVersion 仍标 2，含 mode） */
export function documentToGraphCompat(doc: WorkflowDocument): WorkflowDocument {
  return migrateGraphV1ToDocument(doc);
}

function catalogIndex(
  catalog: CatalogPortLookup[],
): Map<string, CatalogPortLookup> {
  const m = new Map<string, CatalogPortLookup>();
  for (const c of catalog) m.set(c.type, c);
  return m;
}

const GROUP_MEDIA_SOURCE_TYPES = new Set([
  'ai.image',
  'input.image',
  'output.preview',
  'ai.video',
  'input.video',
]);

function estimatedNodeSize(type: string): { w: number; h: number } {
  if (type === 'ai.video' || type === 'input.video') return { w: 300, h: 230 };
  if (type === 'input.text') return { w: 220, h: 248 };
  if (type === 'ai.image' || type === 'input.image' || type === 'output.preview') {
    return { w: 372, h: 248 };
  }
  if (type === 'input.note') return { w: 240, h: 200 };
  return { w: 280, h: 160 };
}

/** 节点中心是否落在分组包围盒内（编译期无 dimensions，用估算尺寸） */
function nodeCenterInGroup(n: WorkflowNode, g: WorkflowGroup): boolean {
  const { w, h } = estimatedNodeSize(n.type);
  const cx = (n.position?.x ?? 0) + w / 2;
  const cy = (n.position?.y ?? 0) + h / 2;
  const pad = 24;
  return (
    cx >= g.x - pad &&
    cx <= g.x + g.width + pad &&
    cy >= g.y - pad &&
    cy <= g.y + g.height + pad
  );
}

/**
 * 分组边展开为组内媒体节点边（仅用于执行编译，不改持久化文档）。
 * - 分组 → 节点：扇出组内图片/视频源
 * - 节点 → 分组 / 分组 → 分组：执行期丢弃
 */
export function expandWorkflowGroupEdges(doc: WorkflowDocument): WorkflowEdge[] {
  const groups = (doc.groups || []).filter((g) => g?.id);
  if (!groups.length) return [...(doc.edges || [])];
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const nodes = doc.nodes || [];

  const membersOf = (g: WorkflowGroup) =>
    nodes.filter((n) => GROUP_MEDIA_SOURCE_TYPES.has(n.type) && nodeCenterInGroup(n, g));

  const next: WorkflowEdge[] = [];
  const seen = new Set<string>();
  const push = (e: WorkflowEdge) => {
    const key = `${e.source}|${e.sourceHandle}|${e.target}|${e.targetHandle}`;
    if (seen.has(key)) return;
    seen.add(key);
    next.push(e);
  };

  for (const e of doc.edges || []) {
    if (!e?.source || !e?.target) continue;
    const srcG = groupById.get(e.source);
    const tgtG = groupById.get(e.target);
    if (srcG && !tgtG) {
      const members = membersOf(srcG);
      let count = 0;
      for (const m of members) {
        if (count >= 9) break;
        push({
          id: `e_${m.id}_image_${e.target}_${e.targetHandle || 'image'}`,
          source: m.id,
          sourceHandle: 'image',
          target: e.target,
          targetHandle: String(e.targetHandle || 'image'),
        });
        count += 1;
      }
      continue;
    }
    if (srcG || tgtG) continue;
    push({
      id: e.id || `e_${e.source}_${e.sourceHandle}_${e.target}_${e.targetHandle}`,
      source: e.source,
      sourceHandle: String(e.sourceHandle || ''),
      target: e.target,
      targetHandle: String(e.targetHandle || ''),
    });
  }
  return next;
}

const VIDEO_NODE_TYPES = new Set(['ai.video', 'input.video']);

/**
 * 画布视频卡左右口统一用 image 句柄；编译时映射到真实 video 口，避免存盘被 sanitize 丢掉。
 * 文案 → 媒体仍保持 text → image（执行时再改写成 prompt）。
 */
export function normalizeCanvasMediaEdgeHandles(
  e: WorkflowEdge,
  byId: Map<string, WorkflowNode>,
): WorkflowEdge {
  const src = byId.get(e.source);
  const tgt = byId.get(e.target);
  if (!src || !tgt) return e;
  let sourceHandle = String(e.sourceHandle || '');
  let targetHandle = String(e.targetHandle || '');

  if (VIDEO_NODE_TYPES.has(src.type) && (sourceHandle === 'image' || !sourceHandle)) {
    sourceHandle = 'video';
  }
  // 视频 → 视频：挂到 video 入参（画布仍画在左侧 + 上）
  if (
    VIDEO_NODE_TYPES.has(src.type) &&
    VIDEO_NODE_TYPES.has(tgt.type) &&
    (targetHandle === 'image' || targetHandle === 'video' || !targetHandle)
  ) {
    targetHandle = 'video';
  }
  if (sourceHandle === e.sourceHandle && targetHandle === e.targetHandle) return e;
  return { ...e, sourceHandle, targetHandle };
}

/**
 * 编译编辑文档为执行 Prompt（Comfy graphToPrompt 对标）。
 * - 分组边展开为组内媒体节点边
 * - mute：节点与相关边剔除
 * - bypass：删除该节点，把入边按类型短路到出边下游
 */
export function compileDocumentToPrompt(
  docIn: WorkflowDocument | WorkflowGraph,
  catalog: CatalogPortLookup[],
): ExecutionPrompt {
  const doc = migrateGraphV1ToDocument(docIn);
  const cat = catalogIndex(catalog);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));

  for (const n of doc.nodes) {
    if (!cat.has(n.type)) throw new Error(`未知工作流节点类型: ${n.type}`);
  }

  // --- resolve bypass rewires ---
  type Edge = WorkflowEdge;
  let edges: Edge[] = expandWorkflowGroupEdges(doc).map((e) =>
    normalizeCanvasMediaEdgeHandles(e, byId),
  );
  const muted = new Set(
    doc.nodes.filter((n) => nodeModeOf(n) === 'mute').map((n) => n.id),
  );
  const bypassed = new Set(
    doc.nodes.filter((n) => nodeModeOf(n) === 'bypass').map((n) => n.id),
  );

  // Drop edges touching muted nodes
  edges = edges.filter((e) => !muted.has(e.source) && !muted.has(e.target));

  // Bypass: for each bypassed node, reconnect upstream → downstream
  for (const bid of bypassed) {
    const node = byId.get(bid);
    if (!node) continue;
    const def = cat.get(node.type)!;
    const incoming = edges.filter((e) => e.target === bid);
    const outgoing = edges.filter((e) => e.source === bid);
    edges = edges.filter((e) => e.source !== bid && e.target !== bid);

    for (const outE of outgoing) {
      const outPort = def.outputs.find((p) => p.id === outE.sourceHandle);
      if (!outPort) continue;
      // Prefer same-type input; else first incoming
      let srcEdge =
        incoming.find((ie) => {
          const srcNode = byId.get(ie.source);
          if (!srcNode) return false;
          const srcDef = cat.get(srcNode.type);
          const op = srcDef?.outputs.find((p) => p.id === ie.sourceHandle);
          return op && portsCompatible(op.type, outPort.type);
        }) || incoming[0];
      if (!srcEdge) continue;
      edges.push({
        id: `bypass_${srcEdge.source}_${srcEdge.sourceHandle}_${outE.target}_${outE.targetHandle}`,
        source: srcEdge.source,
        sourceHandle: srcEdge.sourceHandle,
        target: outE.target,
        targetHandle: outE.targetHandle,
      });
    }
  }

  const activeNodes = doc.nodes.filter((n) => {
    const m = nodeModeOf(n);
    return m === 'active';
  });
  const activeIds = new Set(activeNodes.map((n) => n.id));
  edges = edges.filter((e) => activeIds.has(e.source) && activeIds.has(e.target));

  const textDocTypes = new Set([
    'ai.image',
    'ai.video',
    'ai.chat',
    'input.image',
    'output.preview',
  ]);

  // Validate remaining edges
  for (const e of edges) {
    const src = byId.get(e.source)!;
    const tgt = byId.get(e.target)!;
    const srcDef = cat.get(src.type)!;
    const tgtDef = cat.get(tgt.type)!;
    const outPort = srcDef.outputs.find((p) => p.id === e.sourceHandle);
    if (!outPort) throw new Error(`未知输出端口 ${e.source}.${e.sourceHandle}`);
    // 画布：文案 → 图片左口(+)；执行时当作 prompt
    const textToImageDoc =
      (src.type === 'input.text' || src.type === 'text.template') &&
      (e.sourceHandle === 'text' || !e.sourceHandle) &&
      (e.targetHandle === 'image' || e.targetHandle === 'prompt') &&
      textDocTypes.has(tgt.type);
    // 画布：图片 → 文本左口(+)；执行时当作参考图
    const imageToTextRef =
      outPort.type === 'image' &&
      e.targetHandle === 'text' &&
      tgt.type === 'input.text';
    const inPort = textToImageDoc
      ? tgtDef.inputs.find((p) => p.id === 'prompt') || { id: 'prompt', type: 'text' as const }
      : imageToTextRef
        ? tgtDef.inputs.find((p) => p.id === 'image') || { id: 'image', type: 'image' as const }
        : tgtDef.inputs.find((p) => p.id === e.targetHandle);
    if (!inPort) throw new Error(`未知输入端口 ${e.target}.${e.targetHandle}`);
    if (!textToImageDoc && !imageToTextRef && !portsCompatible(outPort.type, inPort.type)) {
      throw new Error(
        `端口类型不兼容: ${e.source}.${e.sourceHandle}(${outPort.type}) → ${e.target}.${e.targetHandle}(${inPort.type})`,
      );
    }
  }

  // Cycle check via Kahn on active set
  topoCheck(activeNodes.map((n) => n.id), edges);

  const promptNodes: Record<string, ExecutionPromptNode> = {};
  for (const n of activeNodes) {
    const inputs: ExecutionPromptNode['inputs'] = {};
    for (const e of edges) {
      if (e.target !== n.id) continue;
      const src = byId.get(e.source);
      const link: ExecutionPromptLink = { nodeId: e.source, port: e.sourceHandle };
      let port = e.targetHandle;
      if (
        src &&
        (src.type === 'input.text' || src.type === 'text.template') &&
        (e.sourceHandle === 'text' || !e.sourceHandle) &&
        (e.targetHandle === 'image' || e.targetHandle === 'prompt') &&
        textDocTypes.has(n.type)
      ) {
        port = 'prompt';
      }
      // 图片 → 文本左口：执行时挂到 image
      if (n.type === 'input.text' && e.targetHandle === 'text' && e.sourceHandle === 'image') {
        const srcDef = src ? cat.get(src.type) : undefined;
        const out = srcDef?.outputs.find((p) => p.id === e.sourceHandle);
        if (out?.type === 'image') port = 'image';
      }
      // 同口多边保留全部（关键帧多参考图；图片多文案 chip；视频链）
      if (port === 'image' || port === 'endImage' || port === 'prompt' || port === 'video') {
        const prev = inputs[port];
        if (!prev) inputs[port] = link;
        else if (Array.isArray(prev)) prev.push(link);
        else inputs[port] = [prev, link];
        continue;
      }
      inputs[port] = link;
    }

    promptNodes[n.id] = {
      type: n.type,
      params: { ...(n.params || {}) },
      inputs,
    };
  }

  return { schemaVersion: 1, nodes: promptNodes };
}

function topoCheck(ids: string[], edges: WorkflowEdge[]) {
  const idSet = new Set(ids);
  const indeg = new Map<string, number>();
  const outs = new Map<string, string[]>();
  for (const id of ids) {
    indeg.set(id, 0);
    outs.set(id, []);
  }
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
    outs.get(e.source)!.push(e.target);
  }
  let frontier = ids.filter((id) => (indeg.get(id) || 0) === 0);
  let visited = 0;
  while (frontier.length) {
    visited += frontier.length;
    const next: string[] = [];
    for (const id of frontier) {
      for (const t of outs.get(id) || []) {
        const d = (indeg.get(t) || 0) - 1;
        indeg.set(t, d);
        if (d === 0) next.push(t);
      }
    }
    frontier = next;
  }
  if (visited !== ids.length) throw new Error('工作流图存在环路，无法执行');
}

/** Prompt 拓扑分层（并行层） */
export function promptTopoLayers(prompt: ExecutionPrompt): string[][] {
  const ids = Object.keys(prompt.nodes);
  const indeg = new Map<string, number>();
  const outs = new Map<string, string[]>();
  for (const id of ids) {
    indeg.set(id, 0);
    outs.set(id, []);
  }
  for (const [id, node] of Object.entries(prompt.nodes)) {
    const deps = new Set<string>();
    for (const v of Object.values(node.inputs)) {
      const links = Array.isArray(v) ? v : v ? [v] : [];
      for (const l of links) deps.add(l.nodeId);
    }
    for (const d of deps) {
      if (!prompt.nodes[d]) continue;
      indeg.set(id, (indeg.get(id) || 0) + 1);
      outs.get(d)!.push(id);
    }
  }
  const layers: string[][] = [];
  let frontier = ids.filter((id) => (indeg.get(id) || 0) === 0);
  let visited = 0;
  while (frontier.length) {
    layers.push(frontier);
    visited += frontier.length;
    const next: string[] = [];
    for (const id of frontier) {
      for (const t of outs.get(id) || []) {
        const d = (indeg.get(t) || 0) - 1;
        indeg.set(t, d);
        if (d === 0) next.push(t);
      }
    }
    frontier = next;
  }
  if (visited !== ids.length) throw new Error('ExecutionPrompt 存在环路');
  return layers;
}

export function promptCollectAncestors(prompt: ExecutionPrompt, nodeId: string): Set<string> {
  const parents = new Map<string, string[]>();
  for (const [id, node] of Object.entries(prompt.nodes)) {
    const deps: string[] = [];
    for (const v of Object.values(node.inputs)) {
      const links = Array.isArray(v) ? v : v ? [v] : [];
      for (const l of links) deps.push(l.nodeId);
    }
    parents.set(id, deps);
  }
  const set = new Set<string>();
  const stack = [...(parents.get(nodeId) || [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (set.has(id)) continue;
    set.add(id);
    for (const p of parents.get(id) || []) stack.push(p);
  }
  return set;
}
