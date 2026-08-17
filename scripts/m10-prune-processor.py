# -*- coding: utf-8 -*-
"""M10: slim generate.processor.ts to live JobKinds only."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
proc = root / "backend/src/modules/jobs/generate.processor.ts"
text = proc.read_text(encoding="utf-8")
marker = "  private async handleShots("
idx = text.find(marker)
if idx < 0:
    raise SystemExit("handleShots marker not found")

hs = text.find("  private async handleScript(")
if hs < 0:
    raise SystemExit("handleScript not found")
methods = text[hs:idx]
methods = re.sub(
    r"\n\s*// 写章 JSON 未带出场景时[\s\S]*?this\.logger\.warn\(`章节场景补提失败: \$\{e\?\.message \|\| e\}`\);\s*\}\s*\n",
    "\n",
    methods,
    count=1,
)

# Preserve original catch/finally shape from source
catch_start = text.find("    } catch (e: any) {", text.find("async run(jobRunId: string)"))
catch_end = text.find("  private async handleScript(")
orig_tail = text[catch_start:catch_end].rstrip()

# Rebuild run() with slim switch + original error handling
run_prefix = """  async run(jobRunId: string) {
    const run = await this.jobs.get(jobRunId);
    if (!run) return;
    if (run.status === 'cancelled') return;

    const again = await this.jobs.get(jobRunId);
    if (!again || again.status === 'cancelled') return;

    const signal = this.jobs.registerAbort(run.id);
    await this.jobs.updateRun(run.id, {
      status: 'active',
      progress: 5,
      message: (() => {
        const label = String(run.payload?.label || run.payload?.name || '').trim();
        const model = String(run.payload?.model || '').trim();
        const bits = [label, model].filter(Boolean);
        return bits.length ? `执行中 · ${bits.join(' · ')}` : '执行中';
      })(),
    });
    const progress = async (msg: string, pct?: number) => {
      await this.jobs.throwIfCancelled(run.id);
      const patch: Partial<{ message: string; progress: number }> = { message: msg };
      if (typeof pct === 'number') patch.progress = pct;
      await this.jobs.updateRun(run.id, patch);
    };

    try {
      let result: Record<string, unknown> = {};
      switch (run.kind) {
        case 'script_generate':
          result = await this.handleScript(run.projectId, run.payload);
          break;
        case 'chapter_generate':
          result = await this.handleChapterGenerate(run.projectId, run.payload, progress);
          break;
        case 'chapter_deai':
          result = await this.handleChapterDeai(run.projectId, run.payload);
          break;
        case 'cover_generate':
          result = await this.handleCoverGenerate(
            run.projectId,
            run.payload,
            progress,
            signal,
            run.id,
          );
          break;
        case 'timeline_export':
          result = await this.handleExport(run.projectId, run.payload);
          break;
        case 'workflow_run':
          result = await this.workflows.executeWorkflowRun(run.id, run.payload || {});
          break;
        default:
          throw new Error(`未知或已下线任务类型: ${run.kind}`);
      }
      const latest = await this.jobs.get(run.id);
      if (latest?.status === 'cancelled') return result;
      await this.jobs.updateRun(run.id, {
        status: 'completed',
        progress: 100,
        message: '完成',
        result,
      });
      if (run.projectId && !String(run.projectId).startsWith('_')) {
        await this.projects.refreshProgress(run.projectId);
      }
      return result;
"""

new_top = """import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { JobCancelledError, JobsService } from './jobs.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { AssetsService } from '../assets/assets.service';
import { ProjectsService } from '../projects/projects.service';
import { TimelineService } from '../timeline/timeline.service';
import { CharactersService } from '../characters/characters.service';
import { ChaptersService } from '../chapters/chapters.service';
import { resolveBookPace, resolveTargetWords, sumChapterWords } from '../chapters/book-pace';
import { WorkflowsService } from '../workflows/workflows.service';
import type { JobKind } from '@ai-video-studio/shared';

function isCancelError(e: any) {
  return (
    e instanceof JobCancelledError ||
    e?.name === 'JobCancelledError' ||
    e?.name === 'AbortError' ||
    e?.name === 'CanceledError' ||
    e?.code === 'ERR_CANCELED'
  );
}

/**
 * 任务执行器（M10 主路径）。
 * - `workflow_run` → 图执行
 * - 书库写作：`script_generate` / `chapter_generate` / `chapter_deai` / `cover_generate`
 * - 制作单时间轴：`timeline_export`
 */
@Injectable()
export class GenerateRunner {
  private readonly logger = new Logger(GenerateRunner.name);

  constructor(
    @Inject(forwardRef(() => JobsService)) private readonly jobs: JobsService,
    private readonly ai: AiProviderService,
    private readonly assets: AssetsService,
    @Inject(forwardRef(() => ProjectsService)) private readonly projects: ProjectsService,
    @Inject(forwardRef(() => TimelineService)) private readonly timeline: TimelineService,
    @Inject(forwardRef(() => CharactersService)) private readonly characters: CharactersService,
    @Inject(forwardRef(() => ChaptersService)) private readonly chapters: ChaptersService,
    @Inject(forwardRef(() => WorkflowsService)) private readonly workflows: WorkflowsService,
  ) {}

  /** 工作流节点兼容入口（仅保留仍挂图的导出类能力） */
  async runCompat(
    kind: JobKind | string,
    projectId: string,
    payload: Record<string, unknown>,
    progress: (msg: string, pct?: number) => Promise<void>,
    signal: AbortSignal,
    jobRunId: string,
  ): Promise<Record<string, unknown>> {
    switch (kind) {
      case 'timeline_export':
        return this.handleExport(projectId, payload);
      case 'cover_generate':
        return this.handleCoverGenerate(projectId, payload, progress, signal, jobRunId);
      default:
        throw new Error(`已下线的任务类型（请用工作室画布）: ${kind}`);
    }
  }

"""

footer = """
  private async handleExport(projectId: string, payload: Record<string, unknown>) {
    const timelineId = String(payload.timelineId || '');
    const asset = await this.timeline.exportWithFfmpeg(projectId, timelineId);
    return { assetId: asset.id, url: asset.url };
  }
}
"""

out = new_top + run_prefix + "\n" + orig_tail + "\n\n" + methods + footer
proc.write_text(out, encoding="utf-8")
print(f"wrote {proc} ({len(out.splitlines())} lines)")
