import type { WorkflowDocument } from '@ai-video-studio/shared';
import { emptyWorkflowDocument } from '@ai-video-studio/shared';
import {
  createProduction,
  updateProduction,
  type CreateProductionBody,
  type ProductionRow,
} from '@/api/productions';
import { createWorkflow, updateWorkflow } from '@/api/workflows';
import { buildScriptLayoutFragment, buildShotExpandLayoutFragment } from '@/utils/script-gen-layout';
import {
  resolveProductionStyle,
  stylePatchFromResolved,
} from '@/utils/production-style';

export type CompileProductionOpts = {
  production?: ProductionRow;
  create?: CreateProductionBody;
  forceRecompile?: boolean;
  openName?: string;
};

function hasCastOrScenes(p: ProductionRow) {
  return (p.cast?.length || 0) > 0 || (p.scenes?.length || 0) > 0;
}

/** 项目 → 工作流图（画风只经 resolveProductionStyle 注入） */
export function productionToGraph(p: ProductionRow): WorkflowDocument {
  const style = resolveProductionStyle(p);

  if (hasCastOrScenes(p)) {
    const scene = p.scenes?.[0];
    const frag = buildShotExpandLayoutFragment({
      label: p.name || '项目',
      category: style.family || String(p.meta?.category || ''),
      subStyle: style.sub,
      styleBrief: style.brief,
      styleLock: style.lock,
      tags: p.tags,
      durationSec: Number(p.meta?.durationSec) === 15 ? 15 : 10,
      videoPrompt: String(p.meta?.videoPrompt || p.script || p.name || '成片'),
      storyPlot: String(p.meta?.storyPlot || p.script || ''),
      plotGridPrompt: String(p.meta?.plotGridPrompt || ''),
      characters: (p.cast || []).map((c) => ({
        name: c.name,
        role: c.role,
        appearance: c.appearance,
        portraitPrompt: c.portraitPrompt || c.appearance,
        sheetPrompt: c.sheetPrompt,
      })),
      scene: scene
        ? {
            name: scene.name,
            description: scene.description,
            imagePrompt: scene.imagePrompt || scene.description,
          }
        : undefined,
      videoRefMode: style.videoRefMode,
    });
    return {
      schemaVersion: 2,
      nodes: frag.nodes,
      edges: frag.edges,
      groups: frag.groups,
    };
  }

  const scriptText = String(p.script || '').trim() || p.name || '新剧本';
  const frag = buildScriptLayoutFragment({
    scriptText,
    styleBrief: style.brief || style.lock,
    category: style.family,
    subStyle: style.sub,
    shotLabel: p.name,
    targetDurationSec: Number(p.meta?.durationSec) === 15 ? 15 : 10,
  });
  return {
    schemaVersion: 2,
    nodes: frag.nodes,
    edges: frag.edges,
    groups: frag.groups,
  };
}

export async function ensureCompiledProduction(
  opts: CompileProductionOpts,
): Promise<{ production: ProductionRow; createdWorkflow: boolean }> {
  let production =
    opts.production ||
    (await createProduction({
      name: opts.create?.name || opts.openName || '未命名项目',
      ...opts.create,
      status: opts.create?.status || 'draft',
    }));

  // 编译前固化画风锁句，供导出/复制与后续重编译一致
  const resolved = resolveProductionStyle(production);
  const stylePatch = stylePatchFromResolved(resolved);
  if (!String(production.style?.lock || '').trim() || production.style?.family !== stylePatch.family) {
    production = await updateProduction(production.id, { style: { ...production.style, ...stylePatch } });
  } else {
    production = { ...production, style: { ...production.style, ...stylePatch } };
  }

  const needCompile =
    opts.forceRecompile || !String(production.workflowId || '').trim();

  if (!needCompile) {
    return { production, createdWorkflow: false };
  }

  const graph = productionToGraph(production);
  const tags = Array.from(
    new Set(
      [
        ...(production.tags || []),
        '项目',
        resolved.videoRefMode === 'keyframe' ? '关键帧模板' : '全能参考',
        production.projectId ? `project:${production.projectId}` : '',
        production.id ? `production:${production.id}` : '',
      ].filter(Boolean),
    ),
  );

  let createdWorkflow = false;
  let workflowId = String(production.workflowId || '').trim();
  const projectId = String(production.projectId || '').trim() || undefined;

  if (!workflowId) {
    const w = await createWorkflow({
      name: production.name || opts.openName || '项目画布',
      description: production.description || `项目 ${production.id}`,
      projectId,
      graph,
      tags,
    });
    workflowId = w.id;
    createdWorkflow = true;
  } else {
    await updateWorkflow(workflowId, {
      name: production.name,
      description: production.description,
      graph,
      tags,
    });
  }

  production = await updateProduction(production.id, {
    workflowId,
    status: production.status === 'draft' ? 'ready' : production.status,
    tags,
    style: stylePatch,
  });

  return { production, createdWorkflow };
}

export async function importChapterAsProduction(opts: {
  projectId: string;
  chapterId: string;
  chapterTitle?: string;
  script: string;
  styleBrief?: string;
}): Promise<ProductionRow> {
  const name = `${opts.chapterTitle || '章节'} · 制作`.slice(0, 48);
  const { production } = await ensureCompiledProduction({
    create: {
      projectId: opts.projectId,
      chapterId: opts.chapterId,
      name,
      description: `由章节导入`,
      script: opts.script,
      style: opts.styleBrief ? { brief: opts.styleBrief } : {},
      tags: ['书库导入', `project:${opts.projectId}`],
      status: 'draft',
    },
    forceRecompile: true,
  });
  return production;
}

export async function createBlankProduction(opts?: {
  projectId?: string;
  folderId?: string;
  name?: string;
}): Promise<ProductionRow> {
  const { production } = await ensureCompiledProduction({
    create: {
      projectId: opts?.projectId || '',
      folderId: opts?.folderId || '',
      name: opts?.name || '未命名项目',
      script: '',
      tags: opts?.projectId ? [`project:${opts.projectId}`] : ['空白'],
    },
    forceRecompile: true,
  });
  if (!String(production.script || '').trim() && !(production.cast?.length || 0)) {
    if (production.workflowId) {
      await updateWorkflow(production.workflowId, {
        graph: emptyWorkflowDocument(),
      });
    }
  }
  return production;
}
