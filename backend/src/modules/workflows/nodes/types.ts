import type {
  PortType,
  WorkflowNodeCatalogItem,
  WorkflowPortDef,
} from '@ai-video-studio/shared';
import type { AiProviderService } from '../../ai/ai-provider.service';
import type { AssetsService } from '../../assets/assets.service';
import type { JobsService } from '../../jobs/jobs.service';
import type { LibrariesService } from '../../libraries/libraries.service';

export type NodeExecuteContext = {
  projectId: string;
  workflowId: string;
  workflowName?: string;
  /** 绑定制作单时写入资产 meta */
  productionId?: string;
  workflowRunId: string;
  jobRunId: string;
  nodeId: string;
  params: Record<string, unknown>;
  inputs: Record<string, unknown>;
  runInputs: Record<string, unknown>;
  signal: AbortSignal;
  progress: (message: string) => Promise<void>;
  services: {
    ai: AiProviderService;
    assets: AssetsService;
    jobs: JobsService;
    libraries: LibrariesService;
  };
};

export type WorkflowNodeDefinition = WorkflowNodeCatalogItem & {
  execute: (ctx: NodeExecuteContext) => Promise<Record<string, unknown>>;
};

export function port(
  id: string,
  label: string,
  type: PortType,
  optional?: boolean,
): WorkflowPortDef {
  return { id, label, type, optional };
}

export function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** 去掉富文本残留标签，保留段落换行（文本节点 → AI） */
export function htmlToPlainText(raw: unknown): string {
  const s = asText(raw);
  if (!s.trim()) return '';
  if (!/<\/?[a-z][\s\S]*>/i.test(s)) return s.trim();
  return s
    .replace(/\r\n/g, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, '\n')
    .replace(/<\s*(p|div|h[1-6]|li|tr|blockquote)[^>]*>/gi, '')
    .replace(/<\/?\s*(ul|ol|table|thead|tbody|tfoot|tr|td|th)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function asBool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return fallback;
}

/** 写入资产 meta：workflowId / productionId / role 为 M10 约定字段 */
export function workflowAssetMeta(
  ctx: Pick<
    NodeExecuteContext,
    'workflowId' | 'workflowName' | 'workflowRunId' | 'nodeId' | 'productionId'
  >,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const role = String(extra.role || 'output').trim() || 'output';
  const { role: _r, ...rest } = extra;
  return {
    source: 'workflow',
    workflowId: ctx.workflowId || '',
    productionId: ctx.productionId || '',
    role,
    workflowName: ctx.workflowName || '',
    workflowRunId: ctx.workflowRunId || '',
    nodeId: ctx.nodeId || '',
    ...rest,
  };
}
