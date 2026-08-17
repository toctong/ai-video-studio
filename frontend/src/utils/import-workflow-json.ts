import {
  createNodePack,
  emptyWorkflowDocument,
  exportToComfyWorkflow,
  importComfyWorkflow,
  isComfyJson,
  isAiVideoStudioNodePack,
  mergeNodePack,
  migrateGraphV1ToDocument,
  summarizeComfyReport,
  type ComfyImportReport,
  type AiVideoStudioNodePack,
  type WorkflowDocument,
} from '@ai-video-studio/shared';

export type RoutedImport =
  | {
      kind: 'production';
      body: Record<string, unknown>;
      name: string;
    }
  | {
      kind: 'workflow';
      document: WorkflowDocument;
      name: string;
      description: string;
      tags: string[];
      isTemplate?: boolean;
    }
  | {
      kind: 'nodepack';
      pack: AiVideoStudioNodePack;
      name: string;
    }
  | {
      kind: 'comfy';
      document: WorkflowDocument;
      name: string;
      report: ComfyImportReport;
      summary: string;
      source: 'ui' | 'api';
    };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 识别并路由各类 JSON：Production / 工作流 / 节点包 / Comfy */
export function routeImportedJson(raw: unknown, fallbackName = '导入'): RoutedImport {
  const o = asRecord(raw);
  const format = String(o.format || '');

  if (format === 'lumina-nodepack-v1' || isAiVideoStudioNodePack(raw)) {
    const pack = raw as AiVideoStudioNodePack;
    return {
      kind: 'nodepack',
      pack,
      name: String(pack.name || fallbackName || '节点包'),
    };
  }

  if (format === 'lumina-production-v1') {
    const body = asRecord(o.production).name != null ? asRecord(o.production) : o;
    return {
      kind: 'production',
      body,
      name: String(body.name || fallbackName || '导入项目'),
    };
  }

  if (
    format === 'lumina-workflow-v1' ||
    o.graph != null ||
    o.document != null ||
    (o.schemaVersion === 2 && Array.isArray(o.nodes) && Array.isArray(o.edges))
  ) {
    const wf = format === 'lumina-workflow-v1' ? asRecord(o.workflow) : o;
    const graphSrc = wf.graph ?? wf.document ?? wf;
    const document = migrateGraphV1ToDocument(graphSrc as any);
    return {
      kind: 'workflow',
      document,
      name: String(wf.name || fallbackName || '导入工作流'),
      description: String(wf.description || ''),
      tags: Array.isArray(wf.tags) ? (wf.tags as string[]) : ['imported'],
      isTemplate: !!wf.isTemplate,
    };
  }

  // 项目启发式（有 script/cast）
  if (o.script !== undefined || Array.isArray(o.cast)) {
    return {
      kind: 'production',
      body: o,
      name: String(o.name || fallbackName || '导入项目'),
    };
  }

  if (isComfyJson(raw)) {
    const result = importComfyWorkflow(raw);
    return {
      kind: 'comfy',
      document: result.document,
      name: fallbackName.replace(/\.json$/i, '') || 'Comfy 导入',
      report: result.report,
      summary: summarizeComfyReport(result.report),
      source: result.source,
    };
  }

  // 兜底：空图 + 警告式工作流
  return {
    kind: 'workflow',
    document: emptyWorkflowDocument(),
    name: fallbackName,
    description: '无法识别的 JSON',
    tags: ['imported', 'unknown'],
  };
}

export {
  createNodePack,
  exportToComfyWorkflow,
  importComfyWorkflow,
  isComfyJson,
  isAiVideoStudioNodePack,
  mergeNodePack,
  summarizeComfyReport,
};
