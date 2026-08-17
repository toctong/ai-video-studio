import { expandShot, fetchShotExpand, type ShotExpandResult } from '@/api/libraries';
import { fetchWorkflow, type WorkflowRow } from '@/api/workflows';
import { ensureCompiledProduction } from '@/utils/compile-production';
import { resolveProductionStyle, stylePatchFromResolved } from '@/utils/production-style';

export type CompileShotOpts = {
  shotId: string;
  label: string;
  blurb?: string;
  category?: string;
  tags?: string[];
  durationSec?: number;
  preferCachedExpand?: boolean;
  projectId?: string;
};

async function loadExpand(opts: CompileShotOpts): Promise<ShotExpandResult> {
  if (opts.preferCachedExpand !== false) {
    try {
      const cached = await fetchShotExpand(opts.shotId);
      if (String(cached?.videoPrompt || '').trim()) return cached;
    } catch {
      /* 无缓存则走扩写 */
    }
  }
  return expandShot(opts.shotId, {
    durationSec: Number(opts.durationSec) === 15 ? 15 : 10,
  });
}

/** 镜头库 → 项目 + omni 短剧工作流 */
export async function compileShotToWorkflow(opts: CompileShotOpts): Promise<WorkflowRow> {
  const expand = await loadExpand(opts);
  if (!String(expand?.videoPrompt || '').trim()) {
    throw new Error('细案未返回成片提示词');
  }
  const durationSec =
    Number(expand.durationSec) === 15 ? 15 : Number(opts.durationSec) === 15 ? 15 : 10;
  const name = String(expand.label || opts.label || '镜头').slice(0, 40);
  const category = expand.category || opts.category || '';
  const sub =
    (opts.tags || []).find((t) => t && t !== '画风' && t !== '动漫风') || '';
  const styleDraft = stylePatchFromResolved(
    resolveProductionStyle({
      style: { family: category, sub },
      tags: opts.tags || [],
      meta: { category },
      templateId: '',
    }),
  );
  const { production } = await ensureCompiledProduction({
    create: {
      projectId: opts.projectId || '',
      name,
      description: opts.blurb || `镜头库 · ${category || '短剧流水线'}`,
      script: expand.storyPlot || expand.videoPrompt || '',
      cast: (expand.characters || []).map((c) => ({
        name: c.name,
        role: c.role,
        appearance: c.appearance,
        portraitPrompt: c.portraitPrompt,
        sheetPrompt: c.sheetPrompt,
      })),
      scenes: expand.scene
        ? [
            {
              name: expand.scene.name,
              description: expand.scene.description,
              imagePrompt: expand.scene.imagePrompt,
            },
          ]
        : [],
      style: styleDraft,
      shotLibraryId: opts.shotId,
      tags: ['镜头库', '全能参考', category || '镜头'].filter(Boolean),
      status: 'draft',
      meta: {
        category,
        durationSec,
        videoPrompt: expand.videoPrompt,
        storyPlot: expand.storyPlot || '',
        plotGridPrompt: expand.plotGridPrompt || '',
      },
    },
    forceRecompile: true,
  });

  if (!production.workflowId) throw new Error('项目尚未关联画布');
  return fetchWorkflow(production.workflowId);
}
