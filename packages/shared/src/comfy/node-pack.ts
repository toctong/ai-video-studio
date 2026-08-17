import {
  emptyWorkflowDocument,
  type WorkflowDocument,
  type WorkflowEdge,
  type WorkflowGroup,
  type WorkflowNode,
} from '../workflow';
import type { AiVideoStudioNodePack } from './types';

function newId(prefix: string, used: Set<string>) {
  let n = 1;
  let id = `${prefix}_${n}`;
  while (used.has(id)) {
    n += 1;
    id = `${prefix}_${n}`;
  }
  used.add(id);
  return id;
}

/** 构造节点包子图包 */
export function createNodePack(opts: {
  name: string;
  description?: string;
  tags?: string[];
  document: WorkflowDocument;
}): AiVideoStudioNodePack {
  return {
    format: 'lumina-nodepack-v1',
    exportedAt: new Date().toISOString(),
    name: String(opts.name || '节点包').trim() || '节点包',
    description: String(opts.description || '').trim(),
    tags: opts.tags || [],
    document: {
      ...emptyWorkflowDocument(),
      nodes: opts.document.nodes || [],
      edges: opts.document.edges || [],
      groups: opts.document.groups || [],
      meta: { ...(opts.document.meta || {}), pack: true },
    },
  };
}

/** 从整图按节点 id 子集导出节点包（只保留内部边） */
export function createNodePackFromSelection(
  doc: WorkflowDocument,
  nodeIds: string[],
  opts?: { name?: string; description?: string },
): AiVideoStudioNodePack {
  const idSet = new Set(nodeIds.map(String));
  const nodes = (doc.nodes || []).filter((n) => idSet.has(n.id));
  const edges = (doc.edges || []).filter((e) => idSet.has(e.source) && idSet.has(e.target));
  const groups = (doc.groups || []).filter((g) => {
    // 组内若有任意选中节点则带上（按包围盒粗略保留）
    return nodes.some(
      (n) =>
        n.position.x >= g.x &&
        n.position.y >= g.y &&
        n.position.x <= g.x + g.width &&
        n.position.y <= g.y + g.height,
    );
  });
  return createNodePack({
    name: opts?.name || `节点包·${nodes.length}`,
    description: opts?.description,
    tags: ['selection'],
    document: { ...emptyWorkflowDocument(), nodes, edges, groups },
  });
}

/**
 * 将节点包合并进目标图：重新分配 id，整体平移到 at。
 * 返回新 document 与 id 映射。
 */
export function mergeNodePack(
  base: WorkflowDocument,
  pack: AiVideoStudioNodePack | WorkflowDocument,
  at: { x: number; y: number } = { x: 80, y: 80 },
): { document: WorkflowDocument; idMap: Record<string, string> } {
  const packDoc: WorkflowDocument =
    (pack as AiVideoStudioNodePack).format === 'lumina-nodepack-v1'
      ? (pack as AiVideoStudioNodePack).document
      : (pack as WorkflowDocument);

  const used = new Set((base.nodes || []).map((n) => n.id));
  for (const g of base.groups || []) used.add(g.id);

  const srcNodes = packDoc.nodes || [];
  if (!srcNodes.length) {
    return {
      document: {
        ...base,
        nodes: [...(base.nodes || [])],
        edges: [...(base.edges || [])],
        groups: [...(base.groups || [])],
      },
      idMap: {},
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  for (const n of srcNodes) {
    minX = Math.min(minX, n.position?.x ?? 0);
    minY = Math.min(minY, n.position?.y ?? 0);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;

  const idMap: Record<string, string> = {};
  const nodes: WorkflowNode[] = srcNodes.map((n) => {
    const nid = newId('pack', used);
    idMap[n.id] = nid;
    return {
      ...n,
      id: nid,
      position: {
        x: (n.position?.x ?? 0) - minX + (at.x || 0),
        y: (n.position?.y ?? 0) - minY + (at.y || 0),
      },
    };
  });

  const edges: WorkflowEdge[] = (packDoc.edges || [])
    .filter((e) => idMap[e.source] && idMap[e.target])
    .map((e) => ({
      ...e,
      id: newId('e', used),
      source: idMap[e.source],
      target: idMap[e.target],
    }));

  const groups: WorkflowGroup[] = (packDoc.groups || []).map((g) => {
    const gid = newId('g', used);
    return {
      ...g,
      id: gid,
      x: (g.x ?? 0) - minX + (at.x || 0),
      y: (g.y ?? 0) - minY + (at.y || 0),
    };
  });

  return {
    document: {
      ...base,
      schemaVersion: 2,
      nodes: [...(base.nodes || []), ...nodes],
      edges: [...(base.edges || []), ...edges],
      groups: [...(base.groups || []), ...groups],
    },
    idMap,
  };
}

export function isAiVideoStudioNodePack(raw: unknown): raw is AiVideoStudioNodePack {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return o.format === 'lumina-nodepack-v1' && !!o.document && typeof o.document === 'object';
}
