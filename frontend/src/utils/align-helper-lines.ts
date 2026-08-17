import type { Node, NodePositionChange } from '@vue-flow/core';

export type AlignHelperLinesResult = {
  horizontal?: number;
  vertical?: number;
  snapPosition: { x?: number; y?: number };
};

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

function nodeSize(node: Node): { width: number; height: number } {
  const data = (node.data || {}) as { nodeType?: string; params?: Record<string, unknown> };
  const t = String(data.nodeType || node.type || '');
  const fallbackW =
    t === 'ai.video' || t === 'input.video'
      ? 280
      : t === 'input.text'
        ? 220
        : t === 'ai.image' || t === 'input.image' || t === 'output.preview'
          ? 372
          : t === 'ai.chat'
            ? 220
            : t === 'input.note'
              ? 240
              : t === 'wfGroup' || t === 'workflow-group'
                ? 240
                : 260;
  const fallbackH =
    t === 'input.text' || t === 'ai.image' || t === 'input.image' || t === 'output.preview'
      ? 248
      : t === 'ai.chat'
        ? 132
        : t === 'input.note'
          ? 200
          : t === 'ai.video' || t === 'input.video'
            ? 168
            : 120;
  const customW = Number(data.params?.cardW);
  const customH = Number(data.params?.cardH);
  const width =
    (Number.isFinite(customW) && customW > 0 ? customW : 0) ||
    Number((node as any).dimensions?.width) ||
    Number(node.width) ||
    Number.parseFloat(String((node.style as any)?.width || '')) ||
    fallbackW;
  const height =
    (Number.isFinite(customH) && customH > 0 ? customH : 0) ||
    Number((node as any).dimensions?.height) ||
    Number(node.height) ||
    Number.parseFloat(String((node.style as any)?.height || '')) ||
    fallbackH;
  return {
    width: Number.isFinite(width) ? width : fallbackW,
    height: Number.isFinite(height) ? height : fallbackH,
  };
}

function boundsOf(position: { x: number; y: number }, size: { width: number; height: number }): Bounds {
  return {
    left: position.x,
    top: position.y,
    right: position.x + size.width,
    bottom: position.y + size.height,
    width: size.width,
    height: size.height,
    centerX: position.x + size.width / 2,
    centerY: position.y + size.height / 2,
  };
}

/**
 * 拖动时计算对齐吸附与辅助线（边/中心对齐）。
 * 在 onNodesChange 的 position+dragging 变更里调用，并回写 snapPosition。
 */
export function getAlignHelperLines(
  change: NodePositionChange,
  nodes: Node[],
  distance = 6,
): AlignHelperLinesResult {
  const empty: AlignHelperLinesResult = {
    horizontal: undefined,
    vertical: undefined,
    snapPosition: {},
  };
  const nodeA = nodes.find((n) => n.id === change.id);
  if (!nodeA || !change.position) return empty;

  const sizeA = nodeSize(nodeA);
  const a = boundsOf(change.position, sizeA);
  let bestV = distance;
  let bestH = distance;
  const result: AlignHelperLinesResult = {
    horizontal: undefined,
    vertical: undefined,
    snapPosition: {},
  };

  for (const nodeB of nodes) {
    if (nodeB.id === nodeA.id) continue;
    const b = boundsOf(nodeB.position, nodeSize(nodeB));

    const verticalPairs: Array<{ delta: number; snapX: number; lineX: number }> = [
      { delta: Math.abs(a.left - b.left), snapX: b.left, lineX: b.left },
      { delta: Math.abs(a.right - b.right), snapX: b.right - a.width, lineX: b.right },
      { delta: Math.abs(a.left - b.right), snapX: b.right, lineX: b.right },
      { delta: Math.abs(a.right - b.left), snapX: b.left - a.width, lineX: b.left },
      { delta: Math.abs(a.centerX - b.centerX), snapX: b.centerX - a.width / 2, lineX: b.centerX },
    ];
    for (const p of verticalPairs) {
      if (p.delta < bestV) {
        bestV = p.delta;
        result.snapPosition.x = p.snapX;
        result.vertical = p.lineX;
      }
    }

    const horizontalPairs: Array<{ delta: number; snapY: number; lineY: number }> = [
      { delta: Math.abs(a.top - b.top), snapY: b.top, lineY: b.top },
      { delta: Math.abs(a.bottom - b.bottom), snapY: b.bottom - a.height, lineY: b.bottom },
      { delta: Math.abs(a.top - b.bottom), snapY: b.bottom, lineY: b.bottom },
      { delta: Math.abs(a.bottom - b.top), snapY: b.top - a.height, lineY: b.top },
      { delta: Math.abs(a.centerY - b.centerY), snapY: b.centerY - a.height / 2, lineY: b.centerY },
    ];
    for (const p of horizontalPairs) {
      if (p.delta < bestH) {
        bestH = p.delta;
        result.snapPosition.y = p.snapY;
        result.horizontal = p.lineY;
      }
    }
  }

  return result;
}
