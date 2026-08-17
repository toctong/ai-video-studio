import { emptyWorkflowDocument, type WorkflowDocument, type WorkflowEdge, type WorkflowNode } from '../workflow';
import { isComfyApiPrompt, isComfyUiWorkflow } from './detect';
import { COMFY_SKIP_CLASSES, resolveComfyMapping } from './mapping-table';
import type {
  ComfyApiPrompt,
  ComfyImportReport,
  ComfyImportResult,
  ComfyLinkTuple,
  ComfySkippedItem,
  ComfyUiNode,
  ComfyUiWorkflow,
} from './types';

function posOf(node: ComfyUiNode): { x: number; y: number } {
  const p = node.pos;
  if (Array.isArray(p)) return { x: Number(p[0]) || 0, y: Number(p[1]) || 0 };
  if (p && typeof p === 'object') {
    return { x: Number((p as any)[0] ?? (p as any).x) || 0, y: Number((p as any)[1] ?? (p as any).y) || 0 };
  }
  return { x: 80 + (Number(node.order) || 0) * 40, y: 80 + (Number(node.order) || 0) * 28 };
}

function luminaIdFor(comfyId: string | number) {
  return `comfy_${String(comfyId).replace(/[^\w-]+/g, '_')}`;
}

function normalizeLinks(raw: ComfyUiWorkflow['links']): ComfyLinkTuple[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => {
      if (Array.isArray(l)) return l as ComfyLinkTuple;
      const o = l as Record<string, unknown>;
      return [
        Number(o.id ?? o[0]),
        Number(o.origin_id ?? o[1]),
        Number(o.origin_slot ?? o[2]),
        Number(o.target_id ?? o[3]),
        Number(o.target_slot ?? o[4]),
        String(o.type ?? o[5] ?? ''),
      ] as ComfyLinkTuple;
    })
    .filter((l) => Number.isFinite(l[1]) && Number.isFinite(l[3]));
}

function skipReason(classType: string): string {
  if (COMFY_SKIP_CLASSES.has(classType)) {
    return 'AIGC 视频工厂 无本地扩散运行时，采样/Checkpoint/LoRA/ControlNet 类节点跳过';
  }
  return `未配置映射表：${classType}`;
}

function importUiWorkflow(wf: ComfyUiWorkflow): ComfyImportResult {
  const report: ComfyImportReport = {
    mapped: [],
    skipped: [],
    warnings: [],
    stats: { total: 0, mapped: 0, skipped: 0 },
  };
  const nodes: WorkflowNode[] = [];
  const idMap = new Map<string, { luminaId: string; outPorts: Record<string, string>; inPorts: Record<string, string> }>();
  const byId = new Map<string, ComfyUiNode>();

  for (const n of wf.nodes || []) {
    const cid = String(n.id);
    byId.set(cid, n);
  }
  report.stats.total = byId.size;

  for (const [cid, n] of byId) {
    const classType = String(n.type || (n as any).class_type || '').trim();
    if (!classType) {
      report.skipped.push({ comfyId: cid, comfyClass: '(empty)', reason: '节点无 type' });
      continue;
    }
    if (classType === 'Reroute') {
      // Reroute：不建节点，边稍后直连
      report.skipped.push({ comfyId: cid, comfyClass: classType, reason: 'Reroute 省略，边尽量直连' });
      continue;
    }
    if (COMFY_SKIP_CLASSES.has(classType)) {
      report.skipped.push({ comfyId: cid, comfyClass: classType, reason: skipReason(classType) });
      continue;
    }
    const mapping = resolveComfyMapping(classType);
    if (!mapping) {
      report.skipped.push({ comfyId: cid, comfyClass: classType, reason: skipReason(classType) });
      continue;
    }

    const widgets = Array.isArray(n.widgets_values) ? n.widgets_values : [];
    const inputsObj: Record<string, unknown> = {};
    const lid = luminaIdFor(cid);
    const params = mapping.mapParams({ widgets, inputs: inputsObj, title: n.title });
    const label =
      typeof mapping.label === 'function'
        ? mapping.label({ title: n.title, widgets })
        : mapping.label || n.title || classType;

    // mute: Comfy mode 2/4 often means mute/bypass
    const modeNum = Number(n.mode);
    const mode = modeNum === 2 || modeNum === 4 ? 'mute' : 'active';

    nodes.push({
      id: lid,
      type: mapping.luminaType,
      label: String(label).slice(0, 48),
      position: posOf(n),
      params,
      mode: mode as any,
    });

    const outPorts: Record<string, string> = { ...(mapping.ports?.outputs || {}) };
    const inPorts: Record<string, string> = { ...(mapping.ports?.inputs || {}) };
    // 按输出槽位名补全
    (n.outputs || []).forEach((o, i) => {
      const name = String(o?.name || i);
      if (!outPorts[name]) {
        if (/IMAGE|image/i.test(name)) outPorts[name] = 'image';
        else if (/VIDEO|video/i.test(name)) outPorts[name] = 'video';
        else if (/TEXT|STRING|CONDITIONING/i.test(name)) outPorts[name] = 'text';
        else outPorts[name] = 'text';
        outPorts[String(i)] = outPorts[name];
      } else {
        outPorts[String(i)] = outPorts[name];
      }
    });
    (n.inputs || []).forEach((inp, i) => {
      const name = String(inp?.name || i);
      if (!inPorts[name]) {
        if (/IMAGE|image|images/i.test(name)) inPorts[name] = 'image';
        else if (/VIDEO|video/i.test(name)) inPorts[name] = 'video';
        else if (/text|prompt|STRING/i.test(name)) inPorts[name] = mapping.luminaType === 'ai.video' ? 'prompt' : 'text';
        else inPorts[name] = 'text';
        inPorts[String(i)] = inPorts[name];
      } else {
        inPorts[String(i)] = inPorts[name];
      }
    });

    idMap.set(cid, { luminaId: lid, outPorts, inPorts });
    report.mapped.push({
      comfyId: cid,
      comfyClass: classType,
      luminaType: mapping.luminaType,
      luminaId: lid,
    });
  }

  // 边：links 优先；否则用 inputs.link
  const edges: WorkflowEdge[] = [];
  const links = normalizeLinks(wf.links);
  const linkById = new Map<number, ComfyLinkTuple>();
  for (const l of links) linkById.set(Number(l[0]), l);

  const addEdge = (originId: string, originSlot: number, targetId: string, targetSlot: number) => {
    // 穿透 Reroute
    let oId = originId;
    let oSlot = originSlot;
    let guard = 0;
    while (guard++ < 8) {
      const on = byId.get(oId);
      if (!on || String(on.type) !== 'Reroute') break;
      const inLink = on.inputs?.[0]?.link;
      if (inLink == null) return;
      const lt = linkById.get(Number(inLink));
      if (!lt) return;
      oId = String(lt[1]);
      oSlot = Number(lt[2]);
    }
    const src = idMap.get(oId);
    const dst = idMap.get(targetId);
    if (!src || !dst) return;
    const sourceHandle = src.outPorts[String(oSlot)] || src.outPorts['0'] || 'text';
    const targetHandle = dst.inPorts[String(targetSlot)] || dst.inPorts['0'] || 'text';
    edges.push({
      id: `e_${oId}_${oSlot}_${targetId}_${targetSlot}`,
      source: src.luminaId,
      sourceHandle,
      target: dst.luminaId,
      targetHandle,
    });
  };

  if (links.length) {
    for (const l of links) {
      addEdge(String(l[1]), Number(l[2]), String(l[3]), Number(l[4]));
    }
  } else {
    for (const [tid, n] of byId) {
      (n.inputs || []).forEach((inp, slot) => {
        if (inp.link == null) return;
        const lt = linkById.get(Number(inp.link));
        if (lt) addEdge(String(lt[1]), Number(lt[2]), tid, slot);
      });
    }
  }

  // 去重边
  const seen = new Set<string>();
  const uniqEdges = edges.filter((e) => {
    const k = `${e.source}|${e.sourceHandle}|${e.target}|${e.targetHandle}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const groups =
    (wf.groups || [])
      .map((g, i) => {
        const b = g.bounding || [0, 0, 200, 120];
        return {
          id: `comfy_g_${i}`,
          title: String(g.title || `组${i + 1}`),
          x: Number(b[0]) || 0,
          y: Number(b[1]) || 0,
          width: Number(b[2]) || 200,
          height: Number(b[3]) || 120,
          color: g.color,
        };
      })
      .filter((g) => g.width > 0 && g.height > 0) || [];

  report.stats.mapped = report.mapped.length;
  report.stats.skipped = report.skipped.length;
  if (!nodes.length) {
    report.warnings.push('没有可映射节点；请查看跳过清单。常见原因：纯采样图无可运行的文本/图片节点。');
  } else if (report.skipped.length) {
    report.warnings.push(
      `已映射 ${report.stats.mapped}/${report.stats.total} 个节点；${report.stats.skipped} 个跳过（多为采样器/模型加载）。`,
    );
  }

  const document: WorkflowDocument = {
    ...emptyWorkflowDocument(),
    nodes,
    edges: uniqEdges,
    groups,
    meta: {
      importedFrom: 'comfy-ui',
      comfyVersion: wf.version,
    },
  };

  return { document, report, source: 'ui' };
}

function importApiPrompt(prompt: ComfyApiPrompt): ComfyImportResult {
  const report: ComfyImportReport = {
    mapped: [],
    skipped: [],
    warnings: ['API Prompt 无布局，节点将按网格排列'],
    stats: { total: 0, mapped: 0, skipped: 0 },
  };
  const keys = Object.keys(prompt);
  report.stats.total = keys.length;
  const nodes: WorkflowNode[] = [];
  const idMap = new Map<string, { luminaId: string; outDefault: string; inPorts: Record<string, string> }>();

  let col = 0;
  let row = 0;
  for (const cid of keys) {
    const n = prompt[cid];
    const classType = String(n?.class_type || '').trim();
    if (!classType) {
      report.skipped.push({ comfyId: cid, comfyClass: '(empty)', reason: '无 class_type' });
      continue;
    }
    if (COMFY_SKIP_CLASSES.has(classType)) {
      report.skipped.push({ comfyId: cid, comfyClass: classType, reason: skipReason(classType) });
      continue;
    }
    const mapping = resolveComfyMapping(classType);
    if (!mapping) {
      report.skipped.push({ comfyId: cid, comfyClass: classType, reason: skipReason(classType) });
      continue;
    }
    const inputs = { ...(n.inputs || {}) };
    // 去掉连线元组，留给边
    const scalarInputs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(inputs)) {
      if (Array.isArray(v) && v.length === 2 && (typeof v[0] === 'string' || typeof v[0] === 'number')) {
        continue;
      }
      scalarInputs[k] = v;
    }
    const params = mapping.mapParams({ widgets: [], inputs: scalarInputs, title: n._meta?.title });
    const lid = luminaIdFor(cid);
    const label =
      typeof mapping.label === 'function'
        ? mapping.label({ title: n._meta?.title, widgets: [] })
        : mapping.label || n._meta?.title || classType;

    nodes.push({
      id: lid,
      type: mapping.luminaType,
      label: String(label).slice(0, 48),
      position: { x: 80 + col * 280, y: 80 + row * 160 },
      params,
    });
    col += 1;
    if (col >= 4) {
      col = 0;
      row += 1;
    }

    const outDefault =
      mapping.luminaType === 'input.image' || mapping.luminaType === 'ai.image'
        ? 'image'
        : mapping.luminaType === 'ai.video' || mapping.luminaType === 'input.video'
          ? 'video'
          : 'text';
    idMap.set(cid, {
      luminaId: lid,
      outDefault,
      inPorts: { ...(mapping.ports?.inputs || {}) },
    });
    report.mapped.push({
      comfyId: cid,
      comfyClass: classType,
      luminaType: mapping.luminaType,
      luminaId: lid,
    });
  }

  const edges: WorkflowEdge[] = [];
  for (const cid of keys) {
    const n = prompt[cid];
    const dst = idMap.get(cid);
    if (!dst || !n?.inputs) continue;
    for (const [port, v] of Object.entries(n.inputs)) {
      if (!Array.isArray(v) || v.length < 2) continue;
      const srcId = String(v[0]);
      const src = idMap.get(srcId);
      if (!src) continue;
      const targetHandle = dst.inPorts[port] || (/image/i.test(port) ? 'image' : /prompt|text/i.test(port) ? 'prompt' : 'text');
      edges.push({
        id: `e_${srcId}_${cid}_${port}`,
        source: src.luminaId,
        sourceHandle: src.outDefault,
        target: dst.luminaId,
        targetHandle: targetHandle === 'prompt' && dst.luminaId ? targetHandle : targetHandle,
      });
    }
  }

  report.stats.mapped = report.mapped.length;
  report.stats.skipped = report.skipped.length;

  return {
    document: {
      ...emptyWorkflowDocument(),
      nodes,
      edges,
      meta: { importedFrom: 'comfy-api-prompt' },
    },
    report,
    source: 'api',
  };
}

/** Comfy JSON → AIGC 视频工厂 WorkflowDocument；能映射多少算多少，失败进 report */
export function importComfyWorkflow(raw: unknown): ComfyImportResult {
  if (isComfyUiWorkflow(raw)) return importUiWorkflow(raw);
  if (isComfyApiPrompt(raw)) return importApiPrompt(raw);
  const emptyReport: ComfyImportReport = {
    mapped: [],
    skipped: [],
    warnings: ['不是可识别的 ComfyUI Workflow / API Prompt JSON'],
    stats: { total: 0, mapped: 0, skipped: 0 },
  };
  return { document: emptyWorkflowDocument(), report: emptyReport, source: 'ui' };
}

export function summarizeComfyReport(report: ComfyImportReport): string {
  const lines = [
    `映射 ${report.stats.mapped}/${report.stats.total}，跳过 ${report.stats.skipped}`,
  ];
  for (const w of report.warnings) lines.push(w);
  const topSkip = new Map<string, number>();
  for (const s of report.skipped) {
    topSkip.set(s.comfyClass, (topSkip.get(s.comfyClass) || 0) + 1);
  }
  const skipList = [...topSkip.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, n]) => `${k}×${n}`);
  if (skipList.length) lines.push(`跳过类型：${skipList.join('、')}`);
  return lines.join('\n');
}

export type { ComfySkippedItem };
