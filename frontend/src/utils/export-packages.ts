import {
  createNodePack,
  createNodePackFromSelection,
  exportToComfyWorkflow,
  type AiVideoStudioNodePack,
  type WorkflowDocument,
} from '@ai-video-studio/shared';
import type { CatalogSkill } from '@/utils/skill-catalog';
import type { WorkflowRow } from '@/api/workflows';
import type { ProductionRow } from '@/api/productions';

/** 技能导出包（可发布到发现 / 本地导入） */
export function skillExportPackage(skill: CatalogSkill) {
  return {
    format: 'lumina-skill-v1',
    exportedAt: new Date().toISOString(),
    skill: {
      id: skill.id,
      name: skill.name,
      desc: skill.desc,
      prompt: skill.prompt,
      starter: skill.starter || '',
      category: skill.category,
      mode: skill.mode || 'agent',
      slash: skill.slash || '',
      official: !!skill.official,
    },
  };
}

/** 工作流模板/图导出包 */
export function workflowExportPackage(wf: WorkflowRow) {
  return {
    format: 'lumina-workflow-v1',
    exportedAt: new Date().toISOString(),
    workflow: {
      id: wf.id,
      name: wf.name,
      description: wf.description,
      graph: wf.graph,
      tags: wf.tags || [],
      thumbUrl: wf.thumbUrl || '',
      isTemplate: !!wf.isTemplate,
    },
  };
}

/** 制作单导出包（与页面导出一致） */
export function productionExportPackage(p: ProductionRow) {
  return {
    format: 'lumina-production-v1',
    exportedAt: new Date().toISOString(),
    production: {
      name: p.name,
      description: p.description,
      script: p.script,
      cast: p.cast,
      scenes: p.scenes,
      style: p.style,
      templateId: p.templateId,
      tags: p.tags,
      thumbUrl: p.thumbUrl,
      meta: p.meta,
    },
  };
}

/** 节点包子图包 */
export function nodePackExportPackage(opts: {
  name: string;
  description?: string;
  tags?: string[];
  document: WorkflowDocument;
}): AiVideoStudioNodePack {
  return createNodePack(opts);
}

/** 从选中节点导出节点包 */
export function nodePackFromSelection(
  doc: WorkflowDocument,
  nodeIds: string[],
  name?: string,
): AiVideoStudioNodePack {
  return createNodePackFromSelection(doc, nodeIds, { name });
}

/** AIGC 视频工厂 图 → ComfyUI Workflow JSON */
export function comfyExportPackage(doc: WorkflowDocument, name?: string) {
  return exportToComfyWorkflow(doc, { name });
}
