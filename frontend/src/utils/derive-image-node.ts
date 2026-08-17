import type { Edge, Node } from '@vue-flow/core';
import type { WorkflowNodeCatalogItem } from '@ai-video-studio/shared';
import type { WorkflowFlowNodeData } from '@/components/studio/WorkflowFlowNode.vue';
import { newNodeId } from '@/utils/workflow-flow';

export type DeriveImageOpts = {
  label: string;
  /** 合并进新节点 params */
  params?: Record<string, string>;
  nodeType?: 'ai.image' | 'input.image';
  offsetX?: number;
  offsetY?: number;
  /** 把源图写入 referenceImage，并靠边 image→image 传递 */
  referenceFromSource?: boolean;
};

function sourceImageUrl(data?: WorkflowFlowNodeData | null) {
  if (!data) return '';
  return String(
    data.previewImage || data.params?.url || data.params?.lastImage || data.params?.referenceImage || '',
  ).trim();
}

function nextImageLabel(nodes: Node[], prefix: string) {
  const n =
    nodes.filter((x: any) => ['input.image', 'ai.image'].includes(String(x.data?.nodeType))).length +
    1;
  return `${prefix || '图片'}${n}`;
}

/** 从源图片节点派生一个新节点 + image→image 边 */
export function buildDerivedImageNode(
  from: Node<WorkflowFlowNodeData>,
  catalogItem: WorkflowNodeCatalogItem | undefined,
  nodes: Node[],
  opts: DeriveImageOpts,
): { node: Node<WorkflowFlowNodeData>; edge: Edge } {
  const type = opts.nodeType || 'ai.image';
  const id = newNodeId('n');
  const srcData = (from.data || {}) as WorkflowFlowNodeData;
  const srcUrl = sourceImageUrl(srcData);
  const params: Record<string, string> = {
    ...(opts.params || {}),
  };
  if (opts.referenceFromSource !== false && srcUrl) {
    params.referenceImage = srcUrl;
  }
  if (!params.prompt && srcData.params?.prompt) {
    params.prompt = String(srcData.params.prompt);
  }
  if (type === 'input.image' && srcUrl && !params.url) {
    params.url = srcUrl;
  }
  if (type === 'ai.image') {
    // 派生卡默认沿用源节点模型，保证工具栏操作走同一套生图 API
    if (!params.model && srcData.params?.model) {
      params.model = String(srcData.params.model);
    }
    if (!params.aspect) params.aspect = String(srcData.params?.aspect || '16:9');
    if (!params.size) params.size = String(srcData.params?.size || '1K');
  }

  const fromDimensions = (from as { dimensions?: { width?: number } | null }).dimensions;
  const w = Number(fromDimensions?.width) || Number(srcData.params?.cardW) || 240;
  const node: Node<WorkflowFlowNodeData> = {
    id,
    type: 'workflow',
    position: {
      x: from.position.x + (opts.offsetX ?? w + 80),
      y: from.position.y + (opts.offsetY ?? 0),
    },
    data: {
      label: opts.label || nextImageLabel(nodes, '图片'),
      nodeType: type,
      params,
      catalog: catalogItem,
      previewImage: type === 'input.image' ? srcUrl || undefined : undefined,
    },
  };

  const edge: Edge = {
    id: `e_${from.id}_image_${id}_image`,
    source: from.id,
    sourceHandle: 'image',
    target: id,
    targetHandle: 'image',
  };

  return { node, edge };
}

export function mediaUrlOfNode(node?: Node<WorkflowFlowNodeData> | null) {
  return sourceImageUrl(node?.data);
}
