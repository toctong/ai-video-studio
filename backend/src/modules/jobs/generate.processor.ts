import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { JobCancelledError, JobsService } from './jobs.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { AssetsService } from '../assets/assets.service';
import { ProjectsService } from '../projects/projects.service';
import { TimelineService } from '../timeline/timeline.service';
import { CharactersService } from '../characters/characters.service';
import { ChaptersService } from '../chapters/chapters.service';
import { resolveBookPace, resolveTargetWords, sumChapterWords } from '../chapters/book-pace';
import { WorkflowsService } from '../workflows/workflows.service';
import { GenerateService } from '../generate/generate.service';
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
    private readonly moduleRef: ModuleRef,
  ) {}

  private workflows(): WorkflowsService {
    // 惰性解析，避免 JobsModule 静态 import WorkflowsModule 形成环
    return this.moduleRef.get(WorkflowsService, { strict: false });
  }

  private generateSvc(): GenerateService {
    // 惰性解析，避免 JobsModule 静态 import GenerateModule 形成环
    return this.moduleRef.get(GenerateService, { strict: false });
  }

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

  async run(jobRunId: string) {
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
          result = await this.workflows().executeWorkflowRun(run.id, run.payload || {});
          break;
        case 'studio_generate_image':
          result = await this.generateSvc().runStudioImageJob(
            String(run.payload?.messageId || ''),
            signal,
            run.id,
          );
          break;
        case 'studio_generate_video':
          result = await this.generateSvc().runStudioVideoJob(
            String(run.payload?.messageId || ''),
            signal,
            run.id,
          );
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

    } catch (e: any) {
      if (isCancelError(e) || (await this.jobs.isCancelled(run.id))) {
        await this.jobs.updateRun(run.id, {
          status: 'cancelled',
          message: '已取消',
        });
        return;
      }
      this.logger.error(e);
      await this.jobs.updateRun(run.id, {
        status: 'failed',
        message: '失败',
        error: e?.message || String(e),
      });
      throw e;
    } finally {
      this.jobs.clearAbort(run.id);
    }
  }

  private async handleScript(projectId: string, payload: Record<string, unknown>) {
    const idea = String(payload.idea || '');
    const wordsWanRaw = Number(payload.targetWordsWan);
    const volumesRaw = Number(payload.volumeCount);
    const hasScale =
      Number.isFinite(wordsWanRaw) &&
      wordsWanRaw > 0 &&
      Number.isFinite(volumesRaw) &&
      volumesRaw > 0;
    const wordsWan = hasScale ? Math.min(500, Math.max(30, Math.round(wordsWanRaw))) : 0;
    const volumes = hasScale ? Math.min(20, Math.max(3, Math.round(volumesRaw))) : 0;
    const scaleHint = hasScale
      ? `用户指定成书目标（必须遵守）：预估成书约 ${wordsWan} 万字 · ${volumes} 卷。类型定位与分卷大纲必须按此规划，不要改成别的字数区间。`
      : '默认成书目标：长篇网文约 100～200 万字（可一直连载写到完本；可按用户说明伸缩）。禁止写成十几二十章就收束的短篇结构。';
    const volumeRule = hasScale
      ? `分卷大纲：按约 ${volumes} 卷规划（可 ±1 卷微调）；每卷写：卷名、本卷主线目标、本卷大敌/障碍、本卷爽点、卷末兑现与留下卷钩子`
      : '分卷大纲：默认 5～8 卷；每卷写：卷名、本卷主线目标、本卷大敌/障碍、本卷爽点、卷末兑现与留下卷钩子';
    const lengthLoc = hasScale
      ? `2) 类型定位（题材 / 情绪 / 目标读者 / 成书篇幅：必须写「预估成书约 ${wordsWan} 万字 · ${volumes} 卷」；这是小说成书字数，不是本大纲文档字数）`
      : '2) 类型定位（题材 / 情绪 / 目标读者 / 成书篇幅：必须写「预估成书约 XXX 万字 · N 卷」，例如「预估成书约 180 万字 · 7 卷」；这里的字数是小说成书字数，不是本大纲文档字数）';
    const volumeMinRule = hasScale
      ? `分卷不得少于 ${Math.max(3, volumes - 1)} 卷；首卷细目录不得少于 30 章（用户明确要求短篇试写时除外）。`
      : '分卷不得少于 5 卷；首卷细目录不得少于 30 章（用户明确要求短篇试写时除外）。';

    const content = await this.ai.chat(
      [
        {
          role: 'system',
          content: [
            '你是资深网文策划。根据用户创意写出「可直接开写」的长篇连载大纲（不是短剧分集、不是短篇试写压缩版）。',
            scaleHint,
            '若用户提供「积木拼装」多段素材（设定/人物/节奏/桥段/台词等），必须融合成统一主线，禁止逐条罗列、禁止互相打架。',
            '文风：大白话、用词严谨；禁止空泛 AI 腔（命运的齿轮、涌上心头、在这一刻、空气凝固等）。',
            '严格跟用户创意走，可合理补全细节，但不擅自改主线。',
            '视角约定：默认男主主视角；女主若有，作情感线/搭档/对手之一，不要写成双女主平分主视角，除非用户明确要求女主文。',
            '',
            '必须用中文 Markdown 输出，且尽量写满以下板块（缺一不可）：',
            '1) 书名（可给 2～3 个备选）',
            lengthLoc,
            '3) 一句话卖点 + 核心矛盾（男主想要什么，谁挡着，代价是什么）',
            '4) 世界观与规则（力量/制度/禁忌 5～12 条，写清边界与成长天花板，要撑得住百万字长线）',
            '5) 主要人物表：至少 8 人，建议 10～16 人，覆盖男主、女主（若有）、长期对手、阶段性对手、关键配角、功能性配角；每人写：姓名、身份、外形要点、欲望、软肋、与男主关系、绝不会做；男主放第一位',
            '6) 人物关系网（谁站谁、谁恨谁、隐藏线；标出可跨卷发酵的关系）',
            '7) 主线总纲（建置→扩张→对抗升级→收束）：按「卷」写，不要按短剧五集写',
            `8) ${volumeRule}`,
            '9) 首卷细目录：第 1 卷写 30～50 章细目；每章含标题 + 本章目标 + 章末钩子（一句话）；一律用「第 N 章」，禁止「第 N 集」',
            '10) 后续卷关键大节点：每卷列出 6～12 个大情节点（不必章章写细），保证可边写边细化、可持续日更到目标字数',
            '11) 爽点/悬念清单（至少 10 条，标注大致落在第几卷/第几章区间）',
            '12) 结局走向（可开放，但要写清收束原则与必须兑现的承诺；收束应落在全书末卷，不要暗示几十章就完本）',
            '',
            '大纲文档本身请写细（建议不少于 4500 汉字），但这只是「策划书篇幅」，绝不是小说总字数。',
            '严禁文末或文中写「全文约 6800 字」「全文约几千字」「符合长线连载大纲要求」这类把大纲文档字数当成成书字数的话。',
            volumeMinRule,
            '若用户明确说「短篇/试写/几十章内」，再改为 20～40 章细目录即可。',
          ].join('\n'),
        },
        { role: 'user', content: idea },
      ],
      payload.model as string | undefined,
    );
    const cleaned = this.scrubOutlineLengthConfusion(content);
    if (hasScale) {
      try {
        await this.projects.patchStoryState(projectId, {
          targetWordsWan: wordsWan,
          volumeCount: volumes,
        });
      } catch (e: any) {
        this.logger.warn(`写入成书篇幅失败: ${e?.message || e}`);
      }
    }
    const asset = await this.assets.createTextAsset(projectId, {
      type: 'script',
      name: '小说大纲',
      content: cleaned,
      prompt: idea,
    });
    let charactersSynced = 0;
    try {
      const synced = await this.characters.extractAndUpsert(
        projectId,
        cleaned,
        payload.model as string | undefined,
      );
      charactersSynced = synced.created + synced.updated;
    } catch (e: any) {
      this.logger.warn(`大纲角色提取失败: ${e?.message || e}`);
    }
    return { assetId: asset.id, content: cleaned, charactersSynced };
  }

  /** 去掉把「大纲文档字数」误写成「全文/成书字数」的收尾套话 */
  private scrubOutlineLengthConfusion(raw: string): string {
    let text = String(raw || '');
    const junkLine =
      /^(?:全文|本稿|本文|大纲(?:全文|文档)?)\s*约?\s*[\d,，.]+?\s*字[，。,.！!]*(?:符合[^。\n]*)?[。.]?\s*$/gm;
    text = text.replace(junkLine, '');
    text = text.replace(
      /\n*(?:以上)?(?:大纲)?(?:全文|本稿)?约\s*[\d,，.]+\s*字[，。,.]*\s*(?:符合(?:长线)?连载大纲要求)?[。.]?\s*$/g,
      '',
    );
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  private proseStyleRules() {
    return [
      '文风：大白话讲故事，用词严谨（身份、动作、器物、空间关系说准）。',
      '禁止 AI 腔套话：命运的齿轮、涌上心头、不禁、仿佛、空气凝固、在这一刻、深深感到、宛如、仿佛一切。',
      '少排比、不升华收尾、不鸡汤；对话像真人，可有潜台词但不直说破。',
      '严格跟用户大纲走向，不改主线、不注水、不新开无关支线。',
    ].join('\n');
  }

  private async handleChapterGenerate(
    projectId: string,
    payload: Record<string, unknown>,
    progress: (msg: string, pct?: number) => Promise<void>,
  ) {
    await progress('整理大纲与人物上下文…', 10);
    const outline = await this.chapters.getOutlineText(projectId);
    if (!outline.trim()) {
      throw new Error('请先生成或保存小说大纲（在「大纲」页）');
    }
    const project = await this.projects.get(projectId);
    const allChapters = await this.chapters.list(projectId);
    const rewriteId = String(payload.chapterId || '').trim();
    const nextOrder = rewriteId
      ? (allChapters.find((c) => c.id === rewriteId)?.orderIndex ?? allChapters.length + 1)
      : allChapters.length
        ? Math.max(...allChapters.map((c) => c.orderIndex)) + 1
        : 1;
    const priorChapters = allChapters.filter((c) => c.orderIndex < nextOrder);
    const laterChapters = rewriteId
      ? allChapters.filter((c) => c.orderIndex > nextOrder)
      : [];

    const chars = await this.characters.list(projectId);
    const charBlock = chars.length
      ? chars.map((c) => this.chapters.formatCharacterCard(c)).join('\n\n')
      : '（尚无角色卡，请在正文中合理引入并给出可执行外形）';

    const state = project.storyState || {};
    const hooks = Array.isArray(state.openHooks)
      ? state.openHooks
          .filter((h) => !h.chapterOrder || h.chapterOrder < nextOrder)
          .map((h) => `- ${h.text}`)
          .join('\n')
      : '';
    const timelineBlock = Array.isArray(state.timeline) && state.timeline.length
      ? state.timeline
          .filter((e) => (e.chapterOrder || 0) < nextOrder)
          .slice(-12)
          .map((e) => {
            const when = String(e.when || '').trim();
            const where = String(e.where || '').trim();
            const sum = String(e.summary || '').trim();
            const head = [
              `第${e.chapterOrder}章`,
              e.chapterTitle ? `「${e.chapterTitle}」` : '',
              when ? `· ${when}` : '',
              where ? `@${where}` : '',
            ]
              .filter(Boolean)
              .join('');
            return `- ${head}${sum ? `：${sum}` : ''}`;
          })
          .join('\n')
      : '';
    const priorBlock = this.chapters.buildPriorContextBlock(priorChapters);
    const subsequentBlock = this.chapters.buildSubsequentContextBlock(laterChapters);
    const plannedCard = rewriteId
      ? { ...(allChapters.find((c) => c.id === rewriteId)?.chapterCard || {}) }
      : {};
    const cardBlock = this.chapters.formatChapterCardBlock(plannedCard);

    const instruction = String(payload.instruction || '').trim();
    const forceFinale = /完结章|终章|收束主线|本批末章\s*=\s*完结/.test(instruction);
    const writtenWords = sumChapterWords(allChapters, nextOrder);
    const targetWords = resolveTargetWords({ storyState: state, outline });
    const pace = resolveBookPace({
      writtenWords,
      targetWords,
      forceFinale,
      hasSubsequentConstraint: !!subsequentBlock,
    });
    const isFinale = pace.phase === 'finale';
    const isWrap = pace.phase === 'wrap';
    await progress(
      laterChapters.length
        ? `重写第${nextOrder}章（桥接前后文）…`
        : isFinale
          ? `撰写第${nextOrder}章（完结收束）…`
          : isWrap
            ? `撰写第${nextOrder}章（收束期）…`
            : `撰写第${nextOrder}章（章节卡+正文）…`,
      35,
    );

    const raw = await this.ai.chat(
      [
        {
          role: 'system',
          content: [
            isFinale
              ? '你是小说作者。按用户大纲写「完结章」小说正文：收束主线，兑现承诺，消化未收束钩子。'
              : isWrap
                ? '你是小说作者。全书已接近目标字数，本章进入收束期：推进结局、兑现悬念与钩子，少埋新大坑。'
                : subsequentBlock
                  ? '你是小说作者。正在重写中间章节：必须承接前文并对接后文既定情节，尽量不让后文作废。'
                  : '你是小说作者。按用户大纲写「下一章」小说正文。',
            this.proseStyleRules(),
            '视角约定：默认以男主为主视角叙事；女主可出场、可强戏，但不要无故切成女主主视角长篇，除非大纲明确是女主文。',
            cardBlock ? '必须落实用户给出的【本章细纲】（目标、出场、关键事件、钩子）。' : '',
            subsequentBlock
              ? '结尾落点对齐下一章开篇；禁止推翻后文既成事实；continuitySummary 按接到下一章来写。'
              : '',
            ...pace.rules,
            '先构思章节卡，再写正文。严格输出一个 JSON 对象（不要 Markdown 围栏），字段：',
            'title（章标题）,',
            'chapterCard: { goal, cast, keyEvents(字符串数组), hook, mainPlotLink },',
            'synopsis（白话要点，3～6 句）,',
            'novelBody（小说正文，约 1500～3500 字，可按情节略调）,',
            'continuitySummary（给下一章用的承接摘要：人物状态、未解钩子、时间地点）,',
            'timelineNote（项目级时间线总览速记：年代/地点跨度/重要时间点，覆盖更新，60～120字）,',
            'timelineEntry: { when（故事内时间点）, where（地点）, events（字符串数组，2～4 个关键节点）, summary（一句话纪要） },',
            'openHooks: [{ id, text }]（当前仍未收束的全部钩子：已兑现的不要再列入；新埋的要列入）,',
            'characterStates: [{ name, location, condition, inventory, mood }],',
            'scenes: [{ name（短地名）, description（环境陈设光影 2～4 句，可画、少角色）, consistencyPrompt（可选）}]（本章地点，2～6 个）。',
            isFinale
              ? '若为完结章：hook 留空或极短余韵；openHooks 必须为空数组；timelineNote / timelineEntry 写收束终局。'
              : isWrap
                ? '收束期：openHooks 尽量变少；新埋钩子最多 1 条且必须短线可收；优先删掉已兑现的旧钩子。'
                : '',
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content: [
            `【目标章序】第 ${nextOrder} 章${rewriteId ? '（重写已有章）' : ''}${isFinale ? ' · 完结章' : isWrap ? ' · 收束期' : ''}`,
            `【篇幅进度】${pace.label}`,
            instruction ? `【额外指示】${instruction}` : '',
            rewriteId && laterChapters.length
              ? '【重写桥接任务】同时承接前文、对接后文；结尾状态要让已写好的下一章仍成立。'
              : '',
            cardBlock,
            '【用户大纲（最高优先，必须跟走向）】',
            outline.slice(0, 28000),
            '【人物设定卡】',
            charBlock.slice(0, 8000),
            hooks ? `【未收束钩子】\n${hooks}` : '【未收束钩子】无',
            timelineBlock ? `【分章时间线】\n${timelineBlock}` : '',
            priorBlock,
            subsequentBlock,
            state.timelineNote ? `【时间线速记】${state.timelineNote}` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      payload.model as string | undefined,
    );

    await progress('解析并写入章节…', 75);
    const data = this.parseChapterJson(raw);
    if (isFinale) data.openHooks = [];
    const chapter = await this.chapters.applyGenerated(projectId, rewriteId || undefined, {
      ...data,
      finale: isFinale,
    } as any);

    try {
      await this.characters.extractAndUpsert(
        projectId,
        `${data.novelBody || ''}\n${charBlock}`,
        payload.model as string | undefined,
      );
    } catch (e: any) {
      this.logger.warn(`章节角色提取失败: ${e?.message || e}`);
    }
    return {
      chapterId: chapter.id,
      title: chapter.title,
      orderIndex: chapter.orderIndex,
      wordCount: String(chapter.novelBody || '').length,
    };
  }

  private parseChapterJson(raw: string) {
    const cleaned = String(raw || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    const scenes = Array.isArray(parsed.scenes)
      ? parsed.scenes
          .map((x: any) => ({
            name: String(x?.name || x?.场景 || x?.地点 || '').trim(),
            description: String(x?.description || x?.描述 || x?.环境 || '').trim(),
            consistencyPrompt: String(x?.consistencyPrompt || x?.一致性 || '').trim(),
          }))
          .filter((x: { name: string }) => x.name)
      : [];
    return {
      title: String(parsed.title || '').trim(),
      chapterCard: parsed.chapterCard || {},
      synopsis: String(parsed.synopsis || '').trim(),
      novelBody: String(parsed.novelBody || parsed.body || '').trim(),
      continuitySummary: String(parsed.continuitySummary || '').trim(),
      timelineNote: String(parsed.timelineNote || '').trim(),
      timelineEntry: parsed.timelineEntry || undefined,
      openHooks: Array.isArray(parsed.openHooks) ? parsed.openHooks : [],
      characterStates: Array.isArray(parsed.characterStates) ? parsed.characterStates : [],
      scenes,
    };
  }

  private async handleChapterDeai(projectId: string, payload: Record<string, unknown>) {
    const chapterId = String(payload.chapterId || '').trim();
    if (!chapterId) throw new Error('缺少 chapterId');
    const chapter = await this.chapters.get(chapterId);
    if (chapter.projectId !== projectId) throw new Error('章节不属于该项目');
    const body = String(chapter.novelBody || '').trim();
    if (!body) throw new Error('本章尚无正文');

    const polished = await this.ai.chat(
      [
        {
          role: 'system',
          content: [
            '你是小说润色编辑。只去除 AI 腔与空泛套话，把句子改得更像人讲故事。',
            this.proseStyleRules(),
            '禁止改动情节事实、人物关系、专有名词与结局走向。',
            '只输出润色后的正文，不要解释。',
          ].join('\n'),
        },
        { role: 'user', content: body.slice(0, 20000) },
      ],
      payload.model as string | undefined,
    );
    const updated = await this.chapters.update(chapterId, {
      novelBody: polished.trim(),
      status: 'edited',
    });
    return { chapterId: updated.id, wordCount: updated.novelBody.length };
  }

  /** 仅项目封面：网文书封风，含中文书名 */
  private async handleCoverGenerate(
    projectId: string,
    payload: Record<string, unknown>,
    progress: (msg: string, pct?: number) => Promise<void>,
    signal: AbortSignal,
    jobRunId: string,
  ) {
    const project = await this.projects.get(projectId);
    const title = String(project.title || '未命名').trim() || '未命名';
    let prompt = String(payload.prompt || '').trim();

    if (!prompt) {
      await progress('根据作品信息撰写封面提示词…', 18);
      await this.jobs.throwIfCancelled(jobRunId);
      const hint = String(payload.hint || '').trim();
      try {
        const raw = await this.ai.chat(
          [
            {
              role: 'system',
              content: [
                '你是中国网络小说封面艺术指导（番茄/七猫风格）。根据作品信息写一条英文为主的文生图提示词。',
                '硬性要求：',
                '1) 竖版网文书封（约 9:16）：角色为主（单人半身特写或双人亲密/对峙），浪漫或戏剧张力，电影光影，有个性有氛围；',
                `2) 画面醒目位置必须绘制书法/手写/烫金风中文书名「${title}」（完整可读，不要错字、不要英文乱码）；书名是封面图形元素，不是正文段落；`,
                '3) 可有少量装饰（光晕、花瓣、圆环纹样），但不要水印、不要平台 Logo、不要 UI、不要小字作者简介；',
                '4) 书名用中文原文写入提示词；其余画面描述用英文。',
                '只输出提示词本身，不要解释、不要引号围栏。',
              ].join('\n'),
            },
            {
              role: 'user',
              content: [
                `书名（必须出现在画面上）：${title}`,
                project.description ? `简介：${String(project.description).slice(0, 800)}` : '',
                project.styleBrief ? `画风：${String(project.styleBrief).slice(0, 400)}` : '',
                hint ? `用户补充：${hint.slice(0, 400)}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          payload.promptModel as string | undefined,
        );
        prompt = String(raw || '').trim().replace(/^["「]|["」]$/g, '');
      } catch {
        // 对话上游 503 时封面仍可走模板出图
        await progress('对话繁忙，改用模板提示词出图…', 28);
        prompt = '';
      }
      if (!prompt) {
        prompt = [
          'Chinese web novel book cover, vertical 9:16 poster, character-focused romantic or dramatic composition,',
          'handsome/beautiful leads, cinematic rim light, high contrast, premium manhua illustration,',
          `prominent stylized Chinese calligraphy title 「${title}」 integrated into the artwork (readable, elegant brush or gilt lettering),`,
          'decorative petals or soft glow accents, no watermark, no UI, no platform logo, no author byline.',
          project.styleBrief ? `Art style: ${project.styleBrief}` : '',
          project.description ? `Story mood: ${String(project.description).slice(0, 280)}` : '',
          hint ? `Extra: ${hint}` : '',
        ]
          .filter(Boolean)
          .join(' ');
      }
      // 兜底：确保书名进最终出图提示词
      if (title && !prompt.includes(title)) {
        prompt = `${prompt} Chinese title text on cover: 「${title}」`;
      }
    }

    await this.jobs.throwIfCancelled(jobRunId);
    await progress('绘制网文书封中…', 45);
    const data = await this.ai.generateCoverImage(prompt, {
      model: payload.model as string | undefined,
      size: payload.size as string | undefined,
      signal,
    });
    await this.jobs.throwIfCancelled(jobRunId);

    const first = data?.[0];
    let asset;
    const meta = {
      purpose: 'cover',
      role: 'cover',
      workflowId: '',
      productionId: '',
      vendor: 'volcengine',
      model: this.ai.resolveCoverImageModel(
        (payload.model as string) || undefined,
      ),
    };
    const remoteUrl = String(first?.url || '').trim();
    const coverMeta = { ...meta, libraryHidden: true };
    if (remoteUrl && /^https?:\/\//i.test(remoteUrl)) {
      asset = await this.assets.createGenerationAsset(projectId, {
        type: 'cover',
        name: `封面·${title}`,
        url: remoteUrl,
        prompt,
        meta: coverMeta,
        download: (u, d) => this.ai.downloadToFile(u, d),
      });
    } else if (first?.b64_json) {
      asset = await this.assets.createFromBuffer(projectId, {
        type: 'cover',
        name: `封面·${title}`,
        buffer: Buffer.from(first.b64_json, 'base64'),
        ext: '.png',
        mimeType: 'image/png',
        prompt,
        meta: coverMeta,
      });
    } else if (remoteUrl) {
      asset = await this.assets.createGenerationAsset(projectId, {
        type: 'cover',
        name: `封面·${title}`,
        url: remoteUrl,
        prompt,
        meta: coverMeta,
        ext: '.png',
        mimeType: 'image/png',
        download: (u, d) => this.ai.downloadToFile(u, d),
      });
    } else {
      throw new Error('封面出图未返回可用结果');
    }

    await this.jobs.throwIfCancelled(jobRunId);
    await progress('写入项目封面…', 90);
    await this.projects.update(projectId, { coverAssetId: asset.id });
    return {
      assetId: asset.id,
      url: this.assets.resolveMediaUrl(asset),
      prompt,
    };
  }


  private async handleExport(projectId: string, payload: Record<string, unknown>) {
    const timelineId = String(payload.timelineId || '');
    const asset = await this.timeline.exportWithFfmpeg(projectId, timelineId);
    return { assetId: asset.id, url: asset.url };
  }
}
