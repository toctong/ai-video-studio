import type { Edge, Node } from '@vue-flow/core';
import type {
  NodeMode,
  PortType,
  WorkflowDocument,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowGroup,
  WorkflowNode,
  WorkflowNodeCatalogItem,
} from '@ai-video-studio/shared';
import {
  emptyWorkflowDocument,
  migrateGraphV1ToDocument,
  nodeModeOf,
  pruneStudioWorkflowDocument,
} from '@ai-video-studio/shared';
import type { WorkflowFlowNodeData } from '@/components/studio/WorkflowFlowNode.vue';
import { PORT_TYPE_COLOR } from '@/utils/workflow-connect';

export const WF_GROUP_TYPE = 'wfGroup';

/** 分组配色（工具栏色板，2×5） */
export const GROUP_COLORS = [
  '#6b6b6b',
  '#3d4f6f',
  '#3d5a45',
  '#4a3d5c',
  '#6b5a45',
  '#5c3d4a',
  '#6b3d3d',
  '#5a5c3d',
  '#3d5a5c',
  '#4a3d2e',
];

export function isWorkflowGroupNode(n: { type?: string | null }) {
  return n.type === WF_GROUP_TYPE;
}

export function catalogMap(catalog: WorkflowNodeCatalogItem[]) {
  const m = new Map<string, WorkflowNodeCatalogItem>();
  for (const c of catalog) m.set(c.type, c);
  return m;
}

function edgeStyle(type?: PortType | string) {
  const stroke = PORT_TYPE_COLOR[(type as PortType) || 'text'] || '#a1a1aa';
  return {
    stroke,
    strokeWidth: 2.25,
  };
}

export function graphToFlow(
  graph: WorkflowGraph | WorkflowDocument | null | undefined,
  catalog: WorkflowNodeCatalogItem[],
  nodeStates?: Record<
    string,
    { status?: string; message?: string; outputs?: Record<string, unknown> }
  >,
): { nodes: Node<WorkflowFlowNodeData>[]; edges: Edge[] } {
  const map = catalogMap(catalog);
  const g = migrateGraphV1ToDocument(graph as any);
  // 分组可作连线端点（如源图 → 切分组），需一并纳入合法 ID
  const nodeIds = new Set([
    ...(g.nodes || []).map((n) => n.id),
    ...(g.groups || []).map((gr) => gr.id).filter(Boolean),
  ]);

  const nodes: Node<WorkflowFlowNodeData>[] = (g.nodes || []).map((n) => {
    const outs = nodeStates?.[n.id]?.outputs || {};
    const catalogTitle = map.get(n.type)?.title || n.type;
    const isMedia =
      n.type === 'ai.image' ||
      n.type === 'ai.video' ||
      n.type === 'input.image' ||
      n.type === 'input.video' ||
      n.type === 'output.preview';
    const isVideoType = n.type === 'ai.video' || n.type === 'input.video';
    const rawLabel = String(n.label || '').trim();
    const generic =
      !rawLabel ||
      rawLabel === catalogTitle ||
      /^(生图|图生视频|预览|AI 生图|AI 视频|文本输入|图片输入|视频输入)$/.test(rawLabel);
    const mode = nodeModeOf(n);
    const params = { ...(n.params || {}) };
    const imagePreview = String(
      outs.image || params.lastImage || (!isVideoType ? params.url : '') || '',
    ).trim();
    const videoPreview = String(
      outs.video || params.lastVideo || (isVideoType ? params.url : '') || '',
    ).trim();
    // 把运行产物写回 params，便于保存进工作流后下次打开仍能回显
    if (imagePreview && !isVideoType) params.lastImage = imagePreview;
    if (videoPreview) params.lastVideo = videoPreview;
    return {
      id: n.id,
      type: 'workflow',
      position: n.position || { x: 0, y: 0 },
      data: {
        label: isMedia && generic ? String(outs.name || params.name || '') : rawLabel || catalogTitle,
        nodeType: n.type,
        params,
        mode,
        catalog: map.get(n.type) || null,
        status: nodeStates?.[n.id]?.status,
        statusMessage:
          nodeStates?.[n.id]?.status === 'running' ||
          nodeStates?.[n.id]?.status === 'active' ||
          nodeStates?.[n.id]?.status === 'queued'
            ? String(nodeStates?.[n.id]?.message || '')
            : undefined,
        previewImage: imagePreview || undefined,
        previewVideo: videoPreview || undefined,
        previewText: outs.text ? String(outs.text) : undefined,
      },
      class: mode !== 'active' ? `wf-mode-${mode}` : undefined,
    };
  });

  const edges: Edge[] = [];
  const pushEdge = (e: {
    id?: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }) => {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return;
    if (!e.sourceHandle || !e.targetHandle) return;
    const dup = edges.some(
      (x) =>
        x.source === e.source &&
        x.target === e.target &&
        x.sourceHandle === e.sourceHandle &&
        x.targetHandle === e.targetHandle,
    );
    if (dup) return;
    const srcType = g.nodes.find((n) => n.id === e.source)?.type || '';
    const outType = map.get(srcType)?.outputs.find((p) => p.id === e.sourceHandle)?.type;
    const isGroupSrc = (g.groups || []).some((gr) => gr.id === e.source);
    const fallbackType =
      outType ||
      (isGroupSrc || e.sourceHandle === 'image' || e.sourceHandle === 'endImage'
        ? 'image'
        : e.sourceHandle === 'text' || e.sourceHandle === 'prompt'
          ? 'text'
          : 'text');
    edges.push({
      id: e.id || `e_${e.source}_${e.sourceHandle}_${e.target}_${e.targetHandle}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: 'default',
      animated: false,
      style: edgeStyle(fallbackType),
      class: 'wf-edge',
    });
  };
  for (const e of g.edges || []) {
    let sourceHandle = String(e.sourceHandle || '');
    let targetHandle = String(e.targetHandle || '');
    const srcType = g.nodes.find((n) => n.id === e.source)?.type || '';
    const tgtType = g.nodes.find((n) => n.id === e.target)?.type || '';
    // 画布视频卡只有 image 句柄；库里的 video 口映射回来才能挂上
    if (
      (srcType === 'ai.video' || srcType === 'input.video') &&
      (sourceHandle === 'video' || !sourceHandle)
    ) {
      sourceHandle = 'image';
    }
    if (
      (tgtType === 'ai.video' || tgtType === 'input.video') &&
      (targetHandle === 'video' || !targetHandle)
    ) {
      targetHandle = 'image';
    }
    pushEdge({
      ...e,
      sourceHandle,
      targetHandle,
    });
  }

  // 细案布局：若定妆/场景→关键帧参考线被旧校验清掉，打开画布时补回
  const portraitIds = (g.nodes || [])
    .filter((n) => n.type === 'ai.image' && /^定妆图/.test(String(n.label || '')))
    .map((n) => n.id);
  const sceneIds = (g.nodes || [])
    .filter(
      (n) =>
        n.type === 'ai.image' &&
        (String(n.label || '') === '场景' || /^场景图?$/.test(String(n.label || ''))),
    )
    .map((n) => n.id);
  const keyframeIds = (g.nodes || [])
    .filter((n) => n.type === 'ai.image' && /^关键帧[·・]/.test(String(n.label || '')))
    .map((n) => n.id);
  if (keyframeIds.length && (portraitIds.length || sceneIds.length)) {
    for (const kid of keyframeIds) {
      for (const pid of portraitIds) {
        pushEdge({
          source: pid,
          sourceHandle: 'image',
          target: kid,
          targetHandle: 'image',
        });
      }
      for (const sid of sceneIds) {
        pushEdge({
          source: sid,
          sourceHandle: 'image',
          target: kid,
          targetHandle: 'image',
        });
      }
    }
  }

  const byKfLabel = (re: RegExp) =>
    (g.nodes || []).find((n) => n.type === 'ai.image' && re.test(String(n.label || '')))?.id || '';
  const openKfId = byKfLabel(/关键帧[·・].*(开场|首帧)/);
  const peakKfId = byKfLabel(/关键帧[·・].*(中景|动作)/);
  const closeKfId = byKfLabel(/关键帧[·・].*(收束|尾帧|结尾)/);

  // 中景/收束参考开场关键帧；收束再参考中景
  if (openKfId && peakKfId && peakKfId !== openKfId) {
    pushEdge({
      source: openKfId,
      sourceHandle: 'image',
      target: peakKfId,
      targetHandle: 'image',
    });
  }
  if (openKfId && closeKfId && closeKfId !== openKfId) {
    pushEdge({
      source: openKfId,
      sourceHandle: 'image',
      target: closeKfId,
      targetHandle: 'image',
    });
  }
  if (peakKfId && closeKfId && closeKfId !== peakKfId) {
    pushEdge({
      source: peakKfId,
      sourceHandle: 'image',
      target: closeKfId,
      targetHandle: 'image',
    });
  }

  // 细案成片：开场→首帧、中景→参考口、收束→尾帧
  const videoIds = (g.nodes || []).filter((n) => n.type === 'ai.video').map((n) => n.id);
  if (videoIds.length === 1 && keyframeIds.length) {
    const vid = videoIds[0];
    if (openKfId) {
      pushEdge({ source: openKfId, sourceHandle: 'image', target: vid, targetHandle: 'image' });
    }
    if (peakKfId && peakKfId !== openKfId) {
      pushEdge({ source: peakKfId, sourceHandle: 'image', target: vid, targetHandle: 'image' });
    }
    if (closeKfId && closeKfId !== openKfId) {
      pushEdge({ source: closeKfId, sourceHandle: 'image', target: vid, targetHandle: 'endImage' });
    }
  }

  const groupNodes: Node[] = (g.groups || []).map((gr: WorkflowGroup) => {
    const title = gr.title || '分组';
    const imagePort = Boolean(gr.imagePort) || /切分组/.test(title);
    const sourceImageId = String(gr.sourceImageId || '').trim();
    return {
      id: gr.id || `g_${Math.random().toString(36).slice(2, 9)}`,
      type: WF_GROUP_TYPE,
      position: { x: gr.x || 0, y: gr.y || 0 },
      data: {
        title,
        color: gr.color || GROUP_COLORS[0],
        imagePort,
        ...(sourceImageId ? { sourceImageId } : {}),
      },
      style: {
        width: `${Math.max(120, gr.width || 240)}px`,
        height: `${Math.max(80, gr.height || 160)}px`,
      },
      zIndex: -10,
      selectable: true,
      draggable: true,
      connectable: true,
    };
  });

  // 切分组：若缺源图→分组边则按 sourceImageId 补回
  for (const gr of g.groups || []) {
    const gid = String(gr.id || '');
    const sid = String(gr.sourceImageId || '').trim();
    if (!gid || !sid) continue;
    if (!nodeIds.has(sid) || !nodeIds.has(gid)) continue;
    const imagePort = Boolean(gr.imagePort) || /切分组/.test(String(gr.title || ''));
    if (!imagePort) continue;
    pushEdge({
      source: sid,
      sourceHandle: 'image',
      target: gid,
      targetHandle: 'image',
    });
  }

  return { nodes: [...groupNodes, ...nodes], edges };
}

export function styleEdgeFromNodes(
  edge: { source: string; sourceHandle?: string | null },
  nodes: Node<WorkflowFlowNodeData>[],
): Partial<Edge> {
  const src = nodes.find((n) => n.id === edge.source);
  const out = src?.data?.catalog?.outputs?.find((p) => p.id === edge.sourceHandle);
  const handle = String(edge.sourceHandle || '');
  const fallback =
    src?.type === WF_GROUP_TYPE || handle === 'image' || handle === 'endImage'
      ? 'image'
      : handle === 'text' || handle === 'prompt'
        ? 'text'
        : 'text';
  return {
    type: 'default',
    style: edgeStyle(out?.type || fallback),
    class: 'wf-edge',
  };
}

export function flowToGraph(
  nodes: Node<WorkflowFlowNodeData>[],
  edges: Edge[],
  viewport?: { x: number; y: number; zoom: number } | null,
): WorkflowDocument {
  const groups: WorkflowGroup[] = [];
  const wNodes: WorkflowNode[] = [];
  for (const n of nodes) {
    if (isWorkflowGroupNode(n)) {
      const style = (n.style || {}) as Record<string, unknown>;
      const width = Number.parseFloat(String(style.width ?? (n as any).dimensions?.width ?? 240));
      const height = Number.parseFloat(String(style.height ?? (n as any).dimensions?.height ?? 160));
      const data = (n.data || {}) as {
        title?: string;
        color?: string;
        imagePort?: boolean;
        sourceImageId?: string;
      };
      const sourceImageId = String(data.sourceImageId || '').trim();
      groups.push({
        id: n.id,
        title: data.title || '分组',
        x: n.position.x,
        y: n.position.y,
        width: Number.isFinite(width) ? width : 240,
        height: Number.isFinite(height) ? height : 160,
        color: data.color,
        // 分组始终可连线；切分组额外保留 imagePort 标记供补线
        imagePort: true,
        ...(sourceImageId ? { sourceImageId } : {}),
      });
      continue;
    }
    const data = (n.data || {}) as WorkflowFlowNodeData;
    const mode = (data.mode as NodeMode) || 'active';
    wNodes.push({
      id: n.id,
      type: data.nodeType,
      label: data.label,
      position: { x: n.position.x, y: n.position.y },
      params: data.params || {},
      mode,
    });
  }
  const nodeTypeById = new Map(wNodes.map((n) => [n.id, n.type]));
  const groupIds = new Set(groups.map((g) => g.id));
  const mediaTypes = new Set(['ai.image', 'ai.video', 'input.image', 'input.video']);
  const videoTypes = new Set(['ai.video', 'input.video']);
  const wEdges: WorkflowEdge[] = edges
    .filter((e) => e.source && e.target)
    .map((e) => {
      let sourceHandle = String(e.sourceHandle || '').trim();
      let targetHandle = String(e.targetHandle || '').trim();
      const srcType = nodeTypeById.get(e.source) || '';
      const tgtType = nodeTypeById.get(e.target) || '';
      if (!sourceHandle && srcType === 'input.text') sourceHandle = 'text';
      if (!sourceHandle && (mediaTypes.has(srcType) || groupIds.has(e.source))) sourceHandle = 'image';
      if (!targetHandle && (mediaTypes.has(tgtType) || groupIds.has(e.target))) targetHandle = 'image';
      if (!targetHandle && tgtType === 'input.text') targetHandle = 'text';
      // 视频→视频：存成真实 video 口，避免重进画布/消毒时被当成坏图边丢掉
      if (videoTypes.has(srcType) && videoTypes.has(tgtType)) {
        if (sourceHandle === 'image' || !sourceHandle) sourceHandle = 'video';
        if (targetHandle === 'image' || targetHandle === 'video' || !targetHandle) {
          targetHandle = 'video';
        }
      }
      return {
        id: e.id || `e_${e.source}_${sourceHandle}_${e.target}_${targetHandle}`,
        source: e.source,
        sourceHandle,
        target: e.target,
        targetHandle,
      };
    })
    .filter((e) => e.sourceHandle && e.targetHandle);
  const vp =
    viewport &&
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.zoom) &&
    viewport.zoom > 0
      ? { x: Number(viewport.x), y: Number(viewport.y), zoom: Number(viewport.zoom) }
      : undefined;
  return pruneStudioWorkflowDocument({
    schemaVersion: 2,
    nodes: wNodes,
    edges: wEdges,
    groups,
    ...(vp ? { viewport: vp } : {}),
  });
}

export function newNodeId(prefix = 'n') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 规范化媒体管线：
 * - 文案→图片边：保留连线（弹层 chip）；不把正文灌进提示词框
 * - 去掉预览节点
 * - 仅「1 图 + 1 视频」时补生图→视频首帧（兼容旧默认管线）
 *   多视频场景绝不自动乱连，否则重进画布会把图接到无关视频节点
 */
export function ensureMediaPipelineEdges(
  graph: WorkflowGraph | WorkflowDocument,
): WorkflowDocument {
  const base = pruneStudioWorkflowDocument(graph as any);
  let nodes = [...(base.nodes || [])];
  let edges = [...(base.edges || [])];

  const previewIds = new Set(nodes.filter((n) => n.type === 'output.preview').map((n) => n.id));
  if (previewIds.size) {
    nodes = nodes.filter((n) => !previewIds.has(n.id));
    edges = edges.filter((e) => !previewIds.has(e.source) && !previewIds.has(e.target));
  }

  nodes = nodes.map((n) => {
    // 空的「图片输入」不会调 AI：升级为 ai.image，避免运行完成却无图
    if (n.type === 'input.image') {
      const url = String(n.params?.url || '').trim();
      const assetId = String(n.params?.assetId || '').trim();
      const lastImage = String(n.params?.lastImage || '').trim();
      if (!url && !assetId && !lastImage) {
        n = {
          ...n,
          type: 'ai.image',
          params: {
            model: '',
            name: String(n.params?.name || n.label || ''),
            prompt: String(n.params?.prompt || ''),
            referenceImage: '',
            aspect: String(n.params?.aspect || '16:9'),
            size: String(n.params?.size || '1K'),
            imageGrid: String(n.params?.imageGrid || '1'),
            assetType: String(n.params?.assetType || ''),
            ...(n.params || {}),
          },
        };
      }
    }
    if (n.type === 'input.video') {
      const url = String(n.params?.url || '').trim();
      const assetId = String(n.params?.assetId || '').trim();
      const lastVideo = String(n.params?.lastVideo || '').trim();
      if (!url && !assetId && !lastVideo) {
        n = {
          ...n,
          type: 'ai.video',
          params: {
            model: '',
            name: String(n.params?.name || n.label || ''),
            prompt: String(n.params?.prompt || ''),
            referenceImage: '',
            durationSec: Number(n.params?.durationSec) || 5,
            aspect: String(n.params?.aspect || '16:9'),
            ...(n.params || {}),
          },
        };
      }
    }
    const raw = String(n.label || '').trim();
    if (
      (n.type === 'ai.image' ||
        n.type === 'ai.video' ||
        n.type === 'input.image' ||
        n.type === 'input.video') &&
      (!raw || /^(生图|图生视频|预览|AI 生图|AI 视频|图片输入|视频输入)$/.test(raw))
    ) {
      return { ...n, label: String(n.params?.name || '') };
    }
    return n;
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  // 画布图片左侧只有一个 +：文案→prompt 统一落到 image 口展示
  edges = edges.map((e) => {
    const src = nodeById.get(e.source);
    const tgt = nodeById.get(e.target);
    if (!src || !tgt) return e;
    if (src.type !== 'input.text' && src.type !== 'text.template') return e;
    if (
      (tgt.type === 'ai.image' ||
        tgt.type === 'ai.video' ||
        tgt.type === 'ai.chat' ||
        tgt.type === 'input.image' ||
        tgt.type === 'output.preview') &&
      (e.targetHandle === 'prompt' || e.targetHandle === 'image')
    ) {
      return {
        ...e,
        sourceHandle: e.sourceHandle || 'text',
        targetHandle: 'image',
      };
    }
    return e;
  });

  // 文案→图片边：保留提示词（连线文本会在运行时作为 prompt）；不再清空镜像正文
  // （旧逻辑会清掉 params.prompt，若编译 remap 偶发失败就会报「需要提示词」）

  const key = (e: { source: string; sourceHandle: string; target: string; targetHandle: string }) =>
    `${e.source}|${e.sourceHandle}|${e.target}|${e.targetHandle}`;
  const have = () => new Set(edges.map(key));
  const pushEdge = (e: {
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  }) => {
    if (!have().has(key(e))) edges.push(e);
  };

  const ids = new Set(nodes.map((n) => n.id));
  const byType = (t: string) => nodes.filter((n) => n.type === t).map((n) => n.id);
  const imgIds = byType('ai.image');
  const vidIds = byType('ai.video');

  // 仅单图单视频补默认首帧边；多视频时由用户自行连线，重进不得改拓扑
  if (imgIds.length === 1 && vidIds.length === 1) {
    const imgId = imgIds[0];
    const vidId = vidIds[0];
    const hasMediaIn = edges.some((e) => {
      if (e.target !== vidId) return false;
      const th = String(e.targetHandle || '');
      return th === 'image' || th === 'endImage' || th === 'video';
    });
    if (!hasMediaIn && ids.has(imgId)) {
      pushEdge({
        id: `e_auto_${imgId}_${vidId}_image`,
        source: imgId,
        sourceHandle: 'image',
        target: vidId,
        targetHandle: 'image',
      });
    }
  }

  return pruneStudioWorkflowDocument({
    schemaVersion: 2,
    nodes,
    edges,
    groups: base.groups || [],
    viewport: base.viewport,
    meta: base.meta,
  });
}
