import {
  portsCompatible,
  type PortType,
  type WorkflowNodeCatalogItem,
} from '@ai-video-studio/shared';
import type { Connection, Edge, Node } from '@vue-flow/core';
import type { WorkflowFlowNodeData } from '@/components/studio/WorkflowFlowNode.vue';

export const PORT_TYPE_COLOR: Record<PortType, string> = {
  text: '#60a5fa',
  image: '#34d399',
  video: '#f472b6',
  json: '#a78bfa',
  assetRef: '#fbbf24',
  number: '#fb923c',
  bool: '#94a3b8',
};

export const PORT_TYPE_LABEL: Record<PortType, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  json: 'JSON',
  assetRef: '素材',
  number: '数值',
  bool: '开关',
};

export function portColor(type?: string) {
  return PORT_TYPE_COLOR[(type as PortType) || 'text'] || '#64748b';
}

function catalogOf(node?: Node<WorkflowFlowNodeData> | null) {
  return node?.data?.catalog as WorkflowNodeCatalogItem | null | undefined;
}

/** 可接收上游文案的图片类节点（文案连左侧 + = 把文档交给图片） */
export function acceptsTextPrompt(nodeType: string) {
  return (
    nodeType === 'ai.image' ||
    nodeType === 'ai.video' ||
    nodeType === 'ai.chat' ||
    nodeType === 'input.image' ||
    nodeType === 'output.preview'
  );
}

export function findPortType(
  node: Node<WorkflowFlowNodeData> | undefined,
  handleId: string | null | undefined,
  side: 'source' | 'target',
): PortType | null {
  if (!node || !handleId) return null;
  const cat = catalogOf(node);
  const list = side === 'source' ? cat?.outputs : cat?.inputs;
  const p = list?.find((x) => x.id === handleId);
  if (p?.type) return p.type as PortType;
  if (node.data?.nodeType === 'input.text' && handleId === 'text') return 'text';
  if (node.data?.nodeType === 'ai.chat') {
    // 画布 Agent：仅左口接参考；无右侧输出点
    if (side === 'target' && (handleId === 'image' || handleId === 'endImage' || handleId === 'text' || handleId === 'prompt')) {
      return handleId === 'text' || handleId === 'prompt' ? 'text' : 'image';
    }
    return null;
  }
  if (
    (node.data?.nodeType === 'input.image' ||
      node.data?.nodeType === 'ai.image' ||
      node.data?.nodeType === 'ai.video' ||
      node.data?.nodeType === 'output.preview') &&
    handleId === 'image'
  ) {
    return 'image';
  }
  if (
    (node.data?.nodeType === 'ai.image' ||
      node.data?.nodeType === 'ai.video' ||
      node.data?.nodeType === 'ai.chat' ||
      node.data?.nodeType === 'input.image' ||
      node.data?.nodeType === 'output.preview') &&
    handleId === 'prompt'
  ) {
    return 'text';
  }
  if (
    (node.data?.nodeType === 'ai.video' || node.data?.nodeType === 'input.video') &&
    handleId === 'video'
  ) {
    return 'video';
  }
  if (node.type === 'wfGroup' && handleId === 'image') return 'image';
  return null;
}

export type ConnectRejectReason =
  | 'missing'
  | 'self'
  | 'duplicate'
  | 'type'
  | 'no-handle';

/**
 * 画布图片左侧只有一个 +（image）。
 * 旧的 prompt 边也归一到 image，方便挂在同一锚点上。
 */
export function normalizeConnection(
  connection: Connection | null | undefined,
  nodes: Node<WorkflowFlowNodeData>[],
): Connection | null | undefined {
  if (!connection?.source || !connection?.target) return connection;
  const src = nodes.find((n) => n.id === connection.source);
  const tgt = nodes.find((n) => n.id === connection.target);
  if (!src || !tgt) return connection;

  const fromText =
    src.data?.nodeType === 'input.text' &&
    (connection.sourceHandle === 'text' || !connection.sourceHandle);
  if (!fromText) return connection;
  const tgtType = String(tgt.data?.nodeType || '');
  if (!acceptsTextPrompt(tgtType)) return connection;

  const th = String(connection.targetHandle || '');
  // Agent / 图片：文本都挂到左侧唯一 +（image）；文本节点保持 text 口
  if (!th || th === 'prompt' || th === 'endImage' || th === 'images' || th === 'text') {
    return {
      ...connection,
      sourceHandle: connection.sourceHandle || 'text',
      targetHandle: String(tgtType) === 'input.text' ? 'text' : 'image',
    };
  }
  return connection;
}

function isTextSource(node: Node<WorkflowFlowNodeData> | undefined) {
  const t = String(node?.data?.nodeType || '');
  return t === 'input.text';
}

/** 文案 → 图片左口：把文档交给图片 */
function isTextToImageDocLink(
  fromType: PortType,
  toType: PortType,
  src: Node<WorkflowFlowNodeData> | undefined,
  tgt: Node<WorkflowFlowNodeData> | undefined,
): boolean {
  return (
    fromType === 'text' &&
    toType === 'image' &&
    isTextSource(src) &&
    acceptsTextPrompt(String(tgt?.data?.nodeType || ''))
  );
}

/** 图片 → 文本左口：给文案作参考图 */
function isImageToTextRefLink(
  fromType: PortType,
  toType: PortType,
  src: Node<WorkflowFlowNodeData> | undefined,
  tgt: Node<WorkflowFlowNodeData> | undefined,
): boolean {
  return (
    fromType === 'image' &&
    toType === 'text' &&
    !!src &&
    String(tgt?.data?.nodeType || '') === 'input.text'
  );
}

export function explainConnectReject(
  connection: Connection | null | undefined,
  nodes: Node<WorkflowFlowNodeData>[],
  edges: Edge[],
): { ok: true } | { ok: false; reason: ConnectRejectReason; message: string } {
  const conn = normalizeConnection(connection, nodes) || connection;
  if (!conn?.source || !conn?.target) {
    return { ok: false, reason: 'missing', message: '连线不完整' };
  }
  if (conn.source === conn.target) {
    return { ok: false, reason: 'self', message: '不能连到自己' };
  }
  if (!conn.sourceHandle || !conn.targetHandle) {
    return {
      ok: false,
      reason: 'no-handle',
      message: '请拖到目标节点上',
    };
  }

  const src = nodes.find((n) => n.id === conn.source);
  const tgt = nodes.find((n) => n.id === conn.target);

  const selfId =
    typeof (conn as unknown as { id?: unknown }).id === 'string'
      ? String((conn as unknown as { id: string }).id)
      : '';
  const others = selfId ? edges.filter((e) => e.id !== selfId) : edges;

  const dup = others.some(
    (e) =>
      e.source === conn.source &&
      e.target === conn.target &&
      e.sourceHandle === conn.sourceHandle &&
      e.targetHandle === conn.targetHandle,
  );
  if (dup) {
    return { ok: false, reason: 'duplicate', message: '这两端口已经连过了' };
  }

  const fromType = findPortType(src, conn.sourceHandle, 'source');
  const toType = findPortType(tgt, conn.targetHandle, 'target');
  if (!fromType || !toType) {
    return { ok: false, reason: 'missing', message: '端口信息缺失' };
  }

  const textDoc = isTextToImageDocLink(fromType, toType, src, tgt);
  const imageRef = isImageToTextRefLink(fromType, toType, src, tgt);
  const videoToAgent =
    fromType === 'video' &&
    toType === 'image' &&
    String(tgt?.data?.nodeType || '') === 'ai.chat';
  const tt = String(tgt?.data?.nodeType || '');

  // 占用策略：
  // - ai.image / ai.video / ai.chat：左口可接多条参考图 + 多条文案
  // - input.text：左口可接多条文案 + 多条参考图
  // - 其它节点：同口默认只允许一条
  const onSamePort = others.filter(
    (e) => e.target === conn.target && e.targetHandle === conn.targetHandle,
  );
  const multiMediaPort =
    ((tt === 'ai.image' || tt === 'ai.video' || tt === 'ai.chat') &&
      (conn.targetHandle === 'image' || conn.targetHandle === 'endImage')) ||
    (tt === 'input.text' && conn.targetHandle === 'text');

  if (multiMediaPort) {
    // 允许多参考；图片/视频/文本最多 9 张图（不含文本）
    if (
      (tt === 'ai.image' || tt === 'ai.video' || tt === 'input.text') &&
      !isTextSource(src) &&
      (conn.targetHandle === 'image' || conn.targetHandle === 'text')
    ) {
      const mediaCount = onSamePort.filter(
        (e) => !isTextSource(nodes.find((n) => n.id === e.source)),
      ).length;
      if (mediaCount >= 9) {
        return {
          ok: false,
          reason: 'duplicate',
          message: '参考图最多连接 9 张',
        };
      }
    }
  } else if (conn.targetHandle === 'image' && acceptsTextPrompt(tt)) {
    // input.image / output.preview 等：文案可多条，参考图仍单条
    if (!isTextSource(src)) {
      const hasRef = onSamePort.some((e) => !isTextSource(nodes.find((n) => n.id === e.source)));
      if (hasRef) {
        return {
          ok: false,
          reason: 'duplicate',
          message: '该输入口已有参考图，请先删掉旧线（文案可多连）',
        };
      }
    }
  } else if (onSamePort.length) {
    return {
      ok: false,
      reason: 'duplicate',
      message: '该输入口已有连线，请先删掉旧线',
    };
  }

  if (!portsCompatible(fromType, toType) && !textDoc && !imageRef && !videoToAgent) {
    return {
      ok: false,
      reason: 'type',
      message: `不能连接：${PORT_TYPE_LABEL[fromType]} → ${PORT_TYPE_LABEL[toType]}（需同类型）`,
    };
  }
  return { ok: true };
}

export function isValidWorkflowConnection(
  connection: Connection,
  nodes: Node<WorkflowFlowNodeData>[],
  edges: Edge[],
): boolean {
  return explainConnectReject(connection, nodes, edges).ok;
}

function portsOf(
  node: Node<WorkflowFlowNodeData> | undefined,
  side: 'source' | 'target',
): Array<{ id: string; type: PortType }> {
  if (!node) return [];
  if (node.type === 'wfGroup') {
    return [{ id: 'image', type: 'image' }];
  }
  if (node.data?.nodeType === 'input.text') {
    return [{ id: 'text', type: 'text' }];
  }
  if (
    node.data?.nodeType === 'ai.image' ||
    node.data?.nodeType === 'ai.video' ||
    node.data?.nodeType === 'input.image' ||
    node.data?.nodeType === 'input.video' ||
    node.data?.nodeType === 'output.preview'
  ) {
    if (node.data?.nodeType === 'input.video' || node.data?.nodeType === 'ai.video') {
      return side === 'source'
        ? [{ id: 'video', type: 'video' }]
        : [{ id: 'image', type: 'image' }];
    }
    return [{ id: 'image', type: 'image' }];
  }
  if (node.data?.nodeType === 'ai.chat') {
    // 仅左口接参考；右侧无输出连接点
    return side === 'target' ? [{ id: 'image', type: 'image' }] : [];
  }
  const cat = catalogOf(node);
  const list = side === 'source' ? cat?.outputs : cat?.inputs;
  if (list?.length) {
    return list.map((p) => ({ id: p.id, type: p.type as PortType }));
  }
  return [];
}

export type ConnectFromHandle = {
  nodeId: string;
  handleId: string | null;
  type: 'source' | 'target';
};

export function resolveNodeDropConnection(
  from: ConnectFromHandle,
  dropNodeId: string,
  nodes: Node<WorkflowFlowNodeData>[],
  edges: Edge[],
): Connection | null {
  if (!from.nodeId || !dropNodeId || from.nodeId === dropNodeId) return null;

  const candidates: Connection[] = [];
  if (from.type === 'source') {
    for (const p of portsOf(
      nodes.find((n) => n.id === dropNodeId),
      'target',
    )) {
      candidates.push({
        source: from.nodeId,
        sourceHandle: from.handleId,
        target: dropNodeId,
        targetHandle: p.id,
      });
    }
  } else {
    for (const p of portsOf(
      nodes.find((n) => n.id === dropNodeId),
      'source',
    )) {
      candidates.push({
        source: dropNodeId,
        sourceHandle: p.id,
        target: from.nodeId,
        targetHandle: from.handleId,
      });
    }
  }
  if (!candidates.length) return null;

  let fallback: Connection | null = null;
  for (const conn of candidates) {
    const verdict = explainConnectReject(conn, nodes, edges);
    if (verdict.ok) return conn;
    if (!fallback && (verdict.reason === 'duplicate' || verdict.reason === 'type')) {
      fallback = conn;
    }
  }
  return fallback || candidates[0];
}

export function findNodeIdAtClientPoint(clientX: number, clientY: number): string | null {
  if (typeof document === 'undefined') return null;
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    const node = (el as Element).closest?.('.vue-flow__node');
    if (!node) continue;
    const id = node.getAttribute('data-id');
    if (id) return id;
  }
  return null;
}
