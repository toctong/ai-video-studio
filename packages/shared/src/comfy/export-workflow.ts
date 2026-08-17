import type { WorkflowDocument, WorkflowNode } from '../workflow';
import type { ComfyUiWorkflow } from './types';

/** AIGC 视频工厂 → Comfy 的反向 class（仅覆盖已导入映射的子集） */
const LUMINA_TO_COMFY: Record<
  string,
  {
    classType: string;
    widgets: (n: WorkflowNode) => unknown[];
    inputs?: string[];
    outputs?: string[];
  }
> = {
  'input.text': {
    classType: 'CLIPTextEncode',
    widgets: (n) => [String(n.params?.value ?? n.params?.text ?? '')],
    outputs: ['CONDITIONING'],
  },
  'input.note': {
    classType: 'Note',
    widgets: (n) => [String(n.params?.value ?? n.label ?? '')],
  },
  'input.image': {
    classType: 'LoadImage',
    widgets: (n) => [String(n.params?.name || n.params?.url || 'image.png'), 'image'],
    outputs: ['IMAGE', 'MASK'],
  },
  'input.video': {
    classType: 'VHS_LoadVideo',
    widgets: (n) => [String(n.params?.name || n.params?.url || 'video.mp4')],
    outputs: ['IMAGE'],
  },
  'output.preview': {
    classType: 'PreviewImage',
    widgets: () => [],
    inputs: ['images'],
  },
  'ai.image': {
    classType: 'SaveImage',
    widgets: (n) => [String(n.params?.name || 'lumina')],
    inputs: ['images'],
    outputs: [],
  },
  'ai.video': {
    classType: 'VHS_VideoCombine',
    widgets: (n) => [String(n.params?.name || 'lumina-video')],
    inputs: ['images'],
  },
  'ai.chat': {
    classType: 'CLIPTextEncode',
    widgets: (n) => [String(n.params?.prompt || n.params?.system || '')],
    outputs: ['CONDITIONING'],
  },
  'text.template': {
    classType: 'StringConstant',
    widgets: (n) => [String(n.params?.template || n.params?.value || '')],
    outputs: ['STRING'],
  },
  'asset.load': {
    classType: 'LoadImage',
    widgets: (n) => [String(n.params?.url || n.params?.assetId || 'asset.png'), 'image'],
    outputs: ['IMAGE', 'MASK'],
  },
  'library.renderPortrait': {
    classType: 'Note',
    widgets: (n) => [`[AIGC 视频工厂 portrait] ${n.params?.prompt || n.label || ''}`],
  },
  'library.renderScene': {
    classType: 'Note',
    widgets: (n) => [`[AIGC 视频工厂 scene] ${n.params?.prompt || n.label || ''}`],
  },
  'library.renderCharacterSheet': {
    classType: 'Note',
    widgets: (n) => [`[AIGC 视频工厂 sheet] ${n.params?.prompt || n.label || ''}`],
  },
  'library.renderPlotGrid': {
    classType: 'Note',
    widgets: (n) => [`[AIGC 视频工厂 grid] ${n.params?.prompt || n.label || ''}`],
  },
};

function numericId(id: string, fallback: number) {
  const m = String(id).match(/(\d+)/);
  if (m) return Number(m[1]);
  return fallback;
}

/**
 * 将 AIGC 视频工厂 图导出为 ComfyUI Workflow JSON（尽力而为）。
 * 未映射类型导出为 Note，并在 extra.luminaUnmapped 记录。
 */
export function exportToComfyWorkflow(
  doc: WorkflowDocument,
  opts?: { name?: string },
): ComfyUiWorkflow {
  const unmapped: string[] = [];
  const idToNum = new Map<string, number>();
  let nextId = 1;
  for (const n of doc.nodes || []) {
    let num = numericId(n.id, nextId);
    while ([...idToNum.values()].includes(num)) num = nextId++;
    idToNum.set(n.id, num);
    nextId = Math.max(nextId, num + 1);
  }

  const nodes = (doc.nodes || []).map((n) => {
    const map = LUMINA_TO_COMFY[n.type];
    const classType = map?.classType || 'Note';
    if (!map) unmapped.push(`${n.id}:${n.type}`);
    const numId = idToNum.get(n.id) || 0;
    const widgets = map ? map.widgets(n) : [`AIGC 视频工厂 ${n.type}: ${n.label || n.id}`];
    return {
      id: numId,
      type: classType,
      pos: [n.position?.x || 0, n.position?.y || 0] as [number, number],
      size: [240, 80] as [number, number],
      flags: {},
      order: numId,
      mode: n.mode === 'mute' ? 2 : 0,
      inputs: (map?.inputs || []).map((name) => ({ name, type: '*', link: null as number | null })),
      outputs: (map?.outputs || ['*']).map((name, i) => ({
        name,
        type: '*',
        links: [] as number[],
        slot_index: i,
      })),
      properties: { 'Node name for S&R': classType },
      widgets_values: widgets,
      title: n.label || classType,
    };
  });

  // 建边：简化为单输入槽 0
  let linkId = 1;
  const links: Array<[number, number, number, number, number, string]> = [];
  const nodeByAiVideoStudio = new Map(nodes.map((n) => [n.id, n]));

  for (const e of doc.edges || []) {
    const srcNum = idToNum.get(e.source);
    const dstNum = idToNum.get(e.target);
    if (srcNum == null || dstNum == null) continue;
    const srcNode = nodeByAiVideoStudio.get(srcNum);
    const dstNode = nodeByAiVideoStudio.get(dstNum);
    if (!srcNode || !dstNode) continue;
    const originSlot = 0;
    let targetSlot = 0;
    if (dstNode.inputs?.length) {
      const want =
        /image/i.test(e.targetHandle) ? 'images' : /prompt|text/i.test(e.targetHandle) ? 'text' : '';
      const idx = dstNode.inputs.findIndex((i) => i.name === want || i.name === e.targetHandle);
      targetSlot = idx >= 0 ? idx : 0;
      // 若无输入定义，补一个
      if (!dstNode.inputs.length) {
        dstNode.inputs.push({ name: e.targetHandle || 'in', type: '*', link: null });
      }
    } else {
      dstNode.inputs = [{ name: e.targetHandle || 'in', type: '*', link: null }];
    }
    if (!srcNode.outputs?.length) {
      srcNode.outputs = [{ name: e.sourceHandle || 'out', type: '*', links: [], slot_index: 0 }];
    }
    const lid = linkId++;
    links.push([lid, srcNum, originSlot, dstNum, targetSlot, e.sourceHandle || '*']);
    if (dstNode.inputs[targetSlot]) dstNode.inputs[targetSlot].link = lid;
    const out = srcNode.outputs[originSlot];
    if (out) {
      out.links = out.links || [];
      out.links.push(lid);
    }
  }

  const groups = (doc.groups || []).map((g) => ({
    title: g.title,
    bounding: [g.x, g.y, g.width, g.height] as [number, number, number, number],
    color: g.color,
  }));

  return {
    last_node_id: nextId,
    last_link_id: linkId,
    nodes,
    links,
    groups,
    version: 0.4,
    extra: {
      lumina: {
        name: opts?.name || '',
        exportedAt: new Date().toISOString(),
        format: 'lumina-comfy-export-v1',
        unmapped,
      },
    },
  };
}
