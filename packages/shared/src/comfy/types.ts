/** ComfyUI Workflow JSON / API Prompt 轻量类型（导入导出用） */

export type ComfyLinkTuple = [number, number, number, number, number, string?];

export type ComfyUiNode = {
  id: number | string;
  type: string;
  pos?: [number, number] | { '0': number; '1': number };
  size?: [number, number] | { '0': number; '1': number };
  flags?: Record<string, unknown>;
  order?: number;
  mode?: number;
  inputs?: Array<{
    name: string;
    type?: string;
    link?: number | null;
  }>;
  outputs?: Array<{
    name: string;
    type?: string;
    links?: number[] | null;
    slot_index?: number;
  }>;
  properties?: Record<string, unknown>;
  widgets_values?: unknown[];
  title?: string;
};

export type ComfyUiGroup = {
  title?: string;
  bounding?: [number, number, number, number];
  color?: string;
};

/** ComfyUI 保存的工作流（带 nodes + links） */
export type ComfyUiWorkflow = {
  last_node_id?: number;
  last_link_id?: number;
  nodes: ComfyUiNode[];
  links?: ComfyLinkTuple[] | Array<Record<string, unknown>>;
  groups?: ComfyUiGroup[];
  version?: number;
  extra?: Record<string, unknown>;
};

/** Comfy API Prompt：`{ "3": { class_type, inputs } }` */
export type ComfyApiPromptNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
};

export type ComfyApiPrompt = Record<string, ComfyApiPromptNode>;

export type ComfyMappedItem = {
  comfyId: string;
  comfyClass: string;
  luminaType: string;
  luminaId: string;
};

export type ComfySkippedItem = {
  comfyId: string;
  comfyClass: string;
  reason: string;
};

export type ComfyImportReport = {
  mapped: ComfyMappedItem[];
  skipped: ComfySkippedItem[];
  warnings: string[];
  stats: { total: number; mapped: number; skipped: number };
};

export type ComfyImportResult = {
  document: import('../workflow').WorkflowDocument;
  report: ComfyImportReport;
  source: 'ui' | 'api';
};

/** 节点包子图包 */
export type AiVideoStudioNodePack = {
  format: 'lumina-nodepack-v1';
  exportedAt: string;
  name: string;
  description?: string;
  tags?: string[];
  document: import('../workflow').WorkflowDocument;
};
