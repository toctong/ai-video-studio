import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  StreamableFile,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type { ChapterCard, CharacterBibleMeta, ProjectStoryState } from '@ai-video-studio/shared';
import { Chapter } from '../../entities/chapter.entity';
import { ProjectsService } from '../projects/projects.service';
import { CharactersService } from '../characters/characters.service';
import { AssetsService } from '../assets/assets.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { Character } from '../../entities/character.entity';
import { resolveBookPace, resolveTargetWords, sumChapterWords } from './book-pace';

export type ChapterStreamEvent =
  | { type: 'start'; chapterId: string; orderIndex: number; title: string; rewrite: boolean }
  | { type: 'delta'; text: string }
  | { type: 'status'; message: string }
  | {
      type: 'meta';
      title?: string;
      synopsis?: string;
      continuitySummary?: string;
      chapterCard?: ChapterCard;
    }
  | { type: 'done'; chapter: Chapter }
  | { type: 'error'; message: string };

@Injectable()
export class ChaptersService {
  private readonly logger = new Logger(ChaptersService.name);

  constructor(
    @InjectRepository(Chapter) private readonly chapters: Repository<Chapter>,
    @Inject(forwardRef(() => ProjectsService)) private readonly projects: ProjectsService,
    @Inject(forwardRef(() => CharactersService)) private readonly characters: CharactersService,
    private readonly assets: AssetsService,
    private readonly ai: AiProviderService,
  ) {}

  list(projectId: string) {
    return this.chapters.find({
      where: { projectId },
      order: { orderIndex: 'ASC', createdAt: 'ASC' },
    });
  }

  async get(id: string) {
    const c = await this.chapters.findOne({ where: { id } });
    if (!c) throw new NotFoundException('章节不存在');
    return c;
  }

  async create(
    projectId: string,
    dto: Partial<Chapter> & { title?: string },
  ) {
    await this.projects.get(projectId);
    const existing = await this.list(projectId);
    const orderIndex =
      typeof dto.orderIndex === 'number'
        ? dto.orderIndex
        : existing.length
          ? Math.max(...existing.map((c) => c.orderIndex)) + 1
          : 1;
    return this.chapters.save(
      this.chapters.create({
        projectId,
        orderIndex,
        title: dto.title || `第${orderIndex}章`,
        chapterCard: dto.chapterCard || {},
        synopsis: dto.synopsis || '',
        novelBody: dto.novelBody || '',
        continuitySummary: dto.continuitySummary || '',
        status: dto.status || 'draft',
        meta: dto.meta || {},
      }),
    );
  }

  async update(id: string, dto: Partial<Chapter>) {
    const c = await this.get(id);
    const allowed: (keyof Chapter)[] = [
      'title',
      'orderIndex',
      'chapterCard',
      'synopsis',
      'novelBody',
      'continuitySummary',
      'status',
      'meta',
    ];
    for (const k of allowed) {
      if (dto[k] !== undefined) (c as any)[k] = dto[k];
    }
    if (dto.novelBody !== undefined || dto.synopsis !== undefined) {
      c.status = c.status === 'draft' ? 'edited' : c.status === 'generated' ? 'edited' : c.status;
    }
    return this.chapters.save(c);
  }

  async remove(id: string) {
    await this.get(id);
    await this.chapters.delete({ id });
    return { ok: true };
  }

  async getOutlineText(projectId: string): Promise<string> {
    const scripts = await this.assets.list(projectId, 'script');
    const isOutline = (name?: string | null) => {
      const n = String(name || '').trim();
      return n === '小说大纲' || n.includes('小说大纲');
    };
    for (const a of scripts) {
      if (!isOutline(a.name)) continue;
      const content = String((a.meta as any)?.content || '').trim();
      if (content) return content;
    }
    // 尚无正式大纲时，退回其它 script（灵感/积木）或项目简介
    for (const a of scripts) {
      if (isOutline(a.name)) continue;
      const content = String((a.meta as any)?.content || '').trim();
      if (content) return content;
    }
    const p = await this.projects.get(projectId);
    return String(p.description || '').trim();
  }

  async applyGenerated(
    projectId: string,
    chapterId: string | undefined,
    data: {
      title?: string;
      chapterCard?: ChapterCard;
      synopsis?: string;
      novelBody?: string;
      continuitySummary?: string;
      openHooks?: Array<{ id?: string; text: string }>;
      /** 项目级时间线速记（AI 维护） */
      timelineNote?: string;
      /** 本章时间线节点（AI 维护，按章序 upsert） */
      timelineEntry?: {
        when?: string;
        where?: string;
        events?: string[];
        summary?: string;
      };
      characterStates?: Array<{
        name: string;
        location?: string;
        condition?: string;
        inventory?: string;
        mood?: string;
      }>;
      /** 本章场景（地点）列表，写章时一并落库 */
      scenes?: Array<{
        name: string;
        description?: string;
        consistencyPrompt?: string;
      }>;
      /** 完结章：清空未收束钩子 */
      finale?: boolean;
    },
  ) {
    let chapter: Chapter;
    if (chapterId) {
      chapter = await this.get(chapterId);
      if (chapter.projectId !== projectId) throw new BadRequestException('章节不属于该项目');
    } else {
      chapter = await this.create(projectId, { title: data.title });
    }

    chapter.title = String(data.title || chapter.title || `第${chapter.orderIndex}章`).trim();
    chapter.chapterCard = data.chapterCard || chapter.chapterCard || {};
    chapter.synopsis = String(data.synopsis || '').trim();
    chapter.novelBody = String(data.novelBody || '').trim();
    chapter.continuitySummary = String(data.continuitySummary || '').trim();
    chapter.status = 'generated';
    chapter = await this.chapters.save(chapter);

    // 更新故事状态台账（全程 AI：以本章输出为当前真相）
    const project = await this.projects.get(projectId);
    const state: ProjectStoryState = { ...(project.storyState || {}) };
    if (data.finale) {
      state.openHooks = [];
    } else if (Array.isArray(data.openHooks)) {
      const incoming = data.openHooks
        .map((h, i) => ({
          id: String(h.id || `hook-${chapter.orderIndex}-${i + 1}`),
          text: String(h.text || '').trim(),
          chapterOrder: chapter.orderIndex,
        }))
        .filter((h) => h.text);
      const prevHooks = Array.isArray(state.openHooks) ? state.openHooks : [];
      // 重写中间章时，保留后面章节埋下的钩子，避免被本章输出整表覆盖
      const laterHooks = prevHooks.filter(
        (h) => (h.chapterOrder || 0) > chapter.orderIndex && String(h.text || '').trim(),
      );
      state.openHooks = [...incoming, ...laterHooks].slice(-40);
    }
    const maxOrder = (
      await this.list(projectId)
    ).reduce((m, c) => Math.max(m, c.orderIndex || 0), 0);
    const isLatestChapter = chapter.orderIndex >= maxOrder;
    if (data.timelineNote != null && (isLatestChapter || data.finale)) {
      const note = String(data.timelineNote || '').trim();
      if (note) state.timelineNote = note;
      else if (data.finale) state.timelineNote = note;
    }

    const entryIn = data.timelineEntry;
    if (entryIn && typeof entryIn === 'object') {
      const events = Array.isArray(entryIn.events)
        ? entryIn.events.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 6)
        : [];
      const summary =
        String(entryIn.summary || '').trim() ||
        String(data.continuitySummary || data.synopsis || '').trim().slice(0, 120);
      const when = String(entryIn.when || '').trim();
      const where = String(entryIn.where || '').trim();
      if (when || where || events.length || summary) {
        const prev = Array.isArray(state.timeline) ? [...state.timeline] : [];
        const nextEntry = {
          id: `tl-${chapter.id}`,
          chapterId: chapter.id,
          chapterOrder: chapter.orderIndex,
          chapterTitle: chapter.title,
          when,
          where,
          events,
          summary,
        };
        const idx = prev.findIndex(
          (e) => e.chapterId === chapter.id || e.chapterOrder === chapter.orderIndex,
        );
        if (idx >= 0) prev[idx] = { ...prev[idx], ...nextEntry };
        else prev.push(nextEntry);
        prev.sort((a, b) => (a.chapterOrder || 0) - (b.chapterOrder || 0));
        state.timeline = prev.slice(-80);
      }
    }

    await this.projects.update(projectId, { storyState: state } as any);

    // 更新角色当前态
    if (data.characterStates?.length) {
      const chars = await this.characters.list(projectId);
      const byName = new Map(chars.map((c) => [c.name.trim(), c]));
      for (const st of data.characterStates) {
        const name = String(st.name || '').trim();
        const ch = byName.get(name);
        if (!ch) continue;
        const meta = { ...(ch.meta || {}) } as CharacterBibleMeta & Record<string, unknown>;
        meta.currentState = {
          ...(meta.currentState || {}),
          location: st.location ?? meta.currentState?.location,
          condition: st.condition ?? meta.currentState?.condition,
          inventory: st.inventory ?? meta.currentState?.inventory,
          mood: st.mood ?? meta.currentState?.mood,
        };
        await this.characters.update(ch.id, { meta } as any);
      }
    }

    return chapter;
  }

  private proseStyleRules() {
    return [
      '禁止 AI 腔套话：命运的齿轮、涌上心头、不禁、仿佛、空气凝固、在这一刻、深深感到、宛如、仿佛一切。',
      '少排比、不升华收尾、不鸡汤；对话像真人，可有潜台词但不直说破。',
      '严格跟用户大纲走向，不改主线、不注水、不新开无关支线。',
    ].join('\n');
  }

  private chapterCardHasContent(card?: ChapterCard | null) {
    if (!card || typeof card !== 'object') return false;
    const events = Array.isArray(card.keyEvents)
      ? card.keyEvents.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    return !!(
      String(card.goal || '').trim() ||
      String(card.cast || '').trim() ||
      events.length ||
      String(card.hook || '').trim() ||
      String(card.mainPlotLink || '').trim()
    );
  }

  private async autoPlanChapterCard(opts: {
    nextOrder: number;
    outline: string;
    charBlock: string;
    priorBlock: string;
    subsequentBlock?: string;
    hooks: string;
    timelineNote: string;
    instruction: string;
    isFinale: boolean;
    isWrap?: boolean;
    paceRules?: string[];
    paceLabel?: string;
    model?: string;
  }): Promise<ChapterCard> {
    const raw = await this.ai.chat(
      [
        {
          role: 'system',
          content: [
            '你是小说章节策划。根据大纲与前后文，只输出本章细纲 JSON（不要 Markdown 围栏）。',
            '字段：goal, cast, keyEvents(字符串数组), hook, mainPlotLink。',
            '要求：可执行、贴大纲、不注水；keyEvents 3～6 条；cast 用角色名顿号分隔。',
            opts.subsequentBlock
              ? '若有【后文约束】：本章细纲必须能承接前文并通向后文既定情节；hook 要接到下一章开篇，禁止设计会推翻后文的转折。'
              : '',
            opts.isFinale
              ? '本章是完结章：goal 写收束；hook 留空或极短余韵；不要新开大悬念；keyEvents 侧重兑现旧钩子与收束主线。'
              : opts.isWrap
                ? '本章进入全书收束期：goal / keyEvents 至少消化 1～2 条未收钩子或旧悬念；hook 以推进收束为主，少埋新大坑。'
                : '',
            ...(opts.paceRules || []),
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          role: 'user',
          content: [
            `【目标章序】第 ${opts.nextOrder} 章${opts.isFinale ? ' · 完结章' : opts.isWrap ? ' · 收束期' : ''}`,
            opts.paceLabel ? `【篇幅进度】${opts.paceLabel}` : '',
            opts.instruction ? `【额外指示】${opts.instruction}` : '',
            '【用户大纲】',
            opts.outline.slice(0, 24000),
            '【人物】',
            opts.charBlock.slice(0, 6000),
            opts.hooks ? `【未收束钩子】\n${opts.hooks}` : '【未收束钩子】无',
            opts.priorBlock,
            opts.subsequentBlock || '',
            opts.timelineNote ? `【时间线】${opts.timelineNote}` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      opts.model,
    );
    const cleaned = String(raw || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    try {
      const parsed = JSON.parse(match ? match[0] : cleaned);
      const keyEvents = Array.isArray(parsed?.keyEvents)
        ? parsed.keyEvents.map((x: unknown) => String(x || '').trim()).filter(Boolean)
        : [];
      return {
        goal: String(parsed?.goal || '').trim(),
        cast: String(parsed?.cast || '').trim(),
        keyEvents,
        hook: String(parsed?.hook || '').trim(),
        mainPlotLink: String(parsed?.mainPlotLink || '').trim(),
      };
    } catch {
      return {};
    }
  }

  formatChapterCardBlock(card?: ChapterCard | null, label = '本章细纲') {
    if (!card || typeof card !== 'object') return '';
    const events = Array.isArray(card.keyEvents)
      ? card.keyEvents.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const lines = [
      card.goal ? `目标：${String(card.goal).trim()}` : '',
      card.cast ? `出场：${String(card.cast).trim()}` : '',
      events.length ? `关键事件：${events.join('；')}` : '',
      card.hook ? `章末钩子：${String(card.hook).trim()}` : '',
      card.mainPlotLink ? `主线关联：${String(card.mainPlotLink).trim()}` : '',
    ].filter(Boolean);
    if (!lines.length) return '';
    return `【${label}（必须落实）】\n${lines.join('\n')}`;
  }

  buildPriorContextBlock(chapters: Chapter[]) {
    if (!chapters.length) return '【前章摘要】这是第一章或无前章';
    const recent = chapters.slice(-6);
    const earlier = chapters.slice(0, Math.max(0, chapters.length - 6));
    const parts: string[] = [];
    if (earlier.length) {
      parts.push(
        [
          '【更早章节速览】',
          ...earlier.map((c) => {
            const tip = String(c.continuitySummary || c.synopsis || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 72);
            return `- ${c.title || `第${c.orderIndex}章`}：${tip || '（无摘要）'}`;
          }),
        ].join('\n'),
      );
    }
    parts.push(
      [
        '【近章摘要】',
        ...recent.map(
          (c) =>
            `【${c.title || `第${c.orderIndex}章`}】摘要：${c.continuitySummary || c.synopsis || '（无）'}`,
        ),
      ].join('\n'),
    );
    return parts.join('\n\n');
  }

  /** 重写中间章时：把后文当成硬约束，避免改完本章后后面整段作废 */
  buildSubsequentContextBlock(chapters: Chapter[]) {
    if (!chapters.length) return '';
    const nextFew = chapters.slice(0, 5);
    const blocks = nextFew.map((c, i) => {
      const card = c.chapterCard || {};
      const events = Array.isArray(card.keyEvents)
        ? card.keyEvents.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const body = String(c.novelBody || '').trim();
      const lines = [
        `【后文·${c.title || `第${c.orderIndex}章`}】`,
        String(c.synopsis || '').trim()
          ? `要点：${String(c.synopsis).trim().slice(0, 280)}`
          : '',
        String(c.continuitySummary || '').trim()
          ? `该章承接摘要：${String(c.continuitySummary).trim().slice(0, 280)}`
          : '',
        String(card.goal || '').trim() ? `细纲目标：${String(card.goal).trim()}` : '',
        String(card.cast || '').trim() ? `出场：${String(card.cast).trim()}` : '',
        events.length ? `关键事件：${events.join('；')}` : '',
        String(card.hook || '').trim() ? `章末钩子：${String(card.hook).trim()}` : '',
      ];
      if (i === 0 && body) {
        lines.push(
          `开篇摘录（本章结尾必须能自然接到这里，勿矛盾）：\n${body.slice(0, 700)}`,
        );
      }
      return lines.filter(Boolean).join('\n');
    });
    return [
      '【后文约束（已写死的后续章节；重写本章必须前后都能接上）】',
      '硬性要求：',
      '1. 承接前文人物状态、地点、时间，勿穿帮。',
      '2. 本章结尾状态必须能自然接到「下一章开篇摘录」已发生之事；禁止推翻后文既成事实。',
      '3. 后文依赖的信息、人物在场、物品与动机，本章要埋好或保留；不要逼读者大改后面章节。',
      '4. continuitySummary / openHooks 要按「接到下一章」来写，而不是按「故事写到这里为止的自由续写」。',
      '',
      ...blocks,
    ].join('\n');
  }

  /**
   * 流式生成/重写章节：先落草稿 → 流式写正文 → 再补元数据。
   * emit 推送 SSE 事件；signal 用于客户端断开取消。
   */
  async streamGenerate(
    projectId: string,
    opts: {
      chapterId?: string;
      model?: string;
      instruction?: string;
      signal?: AbortSignal;
    },
    emit: (ev: ChapterStreamEvent) => void | Promise<void>,
  ) {
    const send = async (ev: ChapterStreamEvent) => {
      await emit(ev);
    };

    try {
      const outline = await this.getOutlineText(projectId);
      if (!outline.trim()) {
        throw new BadRequestException('请先生成或保存小说大纲');
      }

      await send({ type: 'status', message: '整理大纲与人物上下文…' });
      const project = await this.projects.get(projectId);
      const allChapters = await this.list(projectId);
      const rewriteId = String(opts.chapterId || '').trim();
      const nextOrder = rewriteId
        ? (allChapters.find((c) => c.id === rewriteId)?.orderIndex ?? allChapters.length + 1)
        : allChapters.length
          ? Math.max(...allChapters.map((c) => c.orderIndex)) + 1
          : 1;
      // 重写：前文承接 + 后文约束；新章：只吃前文
      const priorChapters = allChapters.filter((c) => c.orderIndex < nextOrder);
      const laterChapters = rewriteId
        ? allChapters.filter((c) => c.orderIndex > nextOrder)
        : [];

      const chars = await this.characters.list(projectId);
      const charBlock = chars.length
        ? chars.map((c) => this.formatCharacterCard(c, project.styleBrief || '')).join('\n\n')
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
      const priorBlock = this.buildPriorContextBlock(priorChapters);
      const subsequentBlock = this.buildSubsequentContextBlock(laterChapters);
      const instruction = String(opts.instruction || '').trim();
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

      let plannedCard: ChapterCard = {};
      if (rewriteId) {
        await send({
          type: 'status',
          message: laterChapters.length
            ? '正在按前文+后文约束重新规划本章…'
            : isFinale
              ? '正在规划完结章细纲…'
              : isWrap
                ? '正在规划收束期细纲…'
                : '正在按前文重新规划本章细纲…',
        });
        plannedCard = await this.autoPlanChapterCard({
          nextOrder,
          outline,
          charBlock,
          priorBlock,
          subsequentBlock,
          hooks,
          timelineNote: String(state.timelineNote || ''),
          instruction,
          isFinale,
          isWrap,
          paceRules: pace.rules,
          paceLabel: pace.label,
          model: opts.model,
        });
      } else if (!this.chapterCardHasContent(plannedCard)) {
        await send({
          type: 'status',
          message: isFinale
            ? '正在规划完结章细纲…'
            : isWrap
              ? '正在规划收束期细纲…'
              : '正在自动规划本章细纲…',
        });
        plannedCard = await this.autoPlanChapterCard({
          nextOrder,
          outline,
          charBlock,
          priorBlock,
          hooks,
          timelineNote: String(state.timelineNote || ''),
          instruction,
          isFinale,
          isWrap,
          paceRules: pace.rules,
          paceLabel: pace.label,
          model: opts.model,
        });
      }

      const cardBlock = this.formatChapterCardBlock(plannedCard);

      const contextBlock = [
        `【目标章序】第 ${nextOrder} 章${rewriteId ? '（重写已有章）' : ''}${isFinale ? ' · 完结章' : isWrap ? ' · 收束期' : ''}`,
        `【篇幅进度】${pace.label}`,
        instruction ? `【额外指示】${instruction}` : '',
        rewriteId && laterChapters.length
          ? '【重写桥接任务】本章是中间章重写：必须同时承接前文、对接后文；结尾状态要让已写好的下一章仍成立，尽量让读者不必大改后面章节。'
          : '',
        ...pace.rules,
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
        .join('\n\n');

      let chapter: Chapter;
      if (rewriteId) {
        chapter = await this.get(rewriteId);
        if (chapter.projectId !== projectId) throw new BadRequestException('章节不属于该项目');
        chapter.novelBody = '';
        chapter.chapterCard = plannedCard;
        chapter.status = 'draft';
        chapter = await this.chapters.save(chapter);
      } else {
        chapter = await this.create(projectId, {
          title: `第${nextOrder}章`,
          status: 'draft',
          novelBody: '',
          chapterCard: plannedCard,
        });
      }

      await send({
        type: 'start',
        chapterId: chapter.id,
        orderIndex: chapter.orderIndex,
        title: chapter.title,
        rewrite: !!rewriteId,
      });
      if (this.chapterCardHasContent(plannedCard)) {
        await send({ type: 'meta', chapterCard: plannedCard });
      }
      await send({
        type: 'status',
        message: isFinale
          ? `正在撰写第${nextOrder}章（完结）…`
          : isWrap
            ? `正在撰写第${nextOrder}章（收束期）…`
            : `正在撰写第${nextOrder}章正文…`,
      });

      let streamed = '';
      let lastPersist = 0;
      const fullBody = await this.ai.chatStream(
        [
          {
            role: 'system',
            content: [
              isFinale
                ? '你是小说作者。按用户大纲写「完结章」小说正文：收束主线，兑现承诺，消化未收束钩子。'
                : isWrap
                  ? '你是小说作者。全书已接近目标字数，本章进入收束期：推进结局、兑现悬念与钩子，少埋新大坑。'
                  : subsequentBlock
                    ? '你是小说作者。正在重写中间章节：正文必须承接前文，并平滑接到【后文约束】里已写好的下一章，尽量不让后文作废。'
                    : '你是小说作者。按用户大纲写「这一章」的小说正文。',
              this.proseStyleRules(),
              cardBlock ? '必须落实【本章细纲】中的目标、出场、关键事件与钩子。' : '',
              subsequentBlock
                ? '结尾落点要对齐下一章开篇摘录：人物位置、时间、已知信息勿与后文矛盾；需要的话把过渡写在本章，而不是假设读者会改后文。'
                : '',
              ...pace.rules,
              isFinale
                ? '完结章禁止新开无关大支线或新反派；可留一句余韵，不要吊胃口式悬念结尾。'
                : '',
              '只输出小说正文，不要章标题、不要要点列表、不要 JSON、不要 Markdown 围栏、不要解说。',
              '篇幅约 1500～3500 字，可按情节略调。',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          { role: 'user', content: contextBlock },
        ],
        {
          model: opts.model,
          signal: opts.signal,
          onDelta: async (piece) => {
            streamed += piece;
            await send({ type: 'delta', text: piece });
            // 每隔一段落盘，避免中断丢稿
            if (streamed.length - lastPersist > 400) {
              lastPersist = streamed.length;
              await this.chapters.update(chapter.id, {
                novelBody: streamed,
                status: 'draft',
              } as any);
            }
          },
        },
      );
      const body = String(fullBody || streamed || '').trim();
      if (!body) throw new BadRequestException('模型未返回正文');

      await this.chapters.update(chapter.id, {
        novelBody: body,
        status: 'draft',
      } as any);

      await send({ type: 'status', message: '正在整理章标题与要点…' });
      const metaRaw = await this.ai.chat(
        [
          {
            role: 'system',
            content: [
              '根据刚写好的章节正文，补全章节元数据。严格输出一个 JSON 对象（不要 Markdown 围栏），字段：',
              'title（章标题）,',
              'chapterCard: { goal, cast, keyEvents(字符串数组), hook, mainPlotLink },',
              'synopsis（白话要点，3～6 句）,',
              'continuitySummary（给下一章用的承接摘要：人物状态、未解钩子、时间地点）,',
              'timelineNote（项目级时间线总览速记：年代/地点跨度/重要时间点，覆盖更新，60～120字）,',
              'timelineEntry: { when（故事内时间点）, where（地点）, events（字符串数组，2～4 个关键节点）, summary（一句话纪要） },',
              'openHooks: [{ id, text }]（当前仍未收束的全部钩子：已兑现的不要再列入；新埋的要列入）,',
              'characterStates: [{ name, location, condition, inventory, mood }],',
              'scenes: [{ name（短地名）, description（环境陈设光影 2～4 句，可画、少角色）, consistencyPrompt（可选，视觉关键词）}]（本章实际出现地点，2～6 个）。',
              subsequentBlock
                ? '若存在后文约束：continuitySummary 必须按「接到已写好的下一章」来写；openHooks 勿列入会被下一章立刻否定的假钩子。'
                : '',
              isFinale
                ? '若为完结章：title 可含「终章/完结」意味；hook 留空或极短余韵；openHooks 必须为空数组；continuitySummary 写收束后状态；timelineNote / timelineEntry 写收束终局，勿留待续悬念。'
                : isWrap
                  ? '收束期：openHooks 尽量变少；新埋钩子最多 1 条且短线可收；已兑现的旧钩子不要再列入。'
                  : '',
              ...pace.rules,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          {
            role: 'user',
            content: [
              contextBlock,
              '【本章正文】',
              body.slice(0, 12000),
            ].join('\n\n'),
          },
        ],
        opts.model,
      );

      const cleaned = String(metaRaw || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      let meta: any = {};
      try {
        meta = JSON.parse(match ? match[0] : cleaned);
      } catch {
        meta = { title: chapter.title, synopsis: '', continuitySummary: '' };
      }

      await send({
        type: 'meta',
        title: String(meta.title || chapter.title || '').trim(),
        synopsis: String(meta.synopsis || '').trim(),
        continuitySummary: String(meta.continuitySummary || '').trim(),
        chapterCard: meta.chapterCard || {},
      });

      chapter = await this.applyGenerated(projectId, chapter.id, {
        title: String(meta.title || chapter.title || '').trim(),
        chapterCard: meta.chapterCard || {},
        synopsis: String(meta.synopsis || '').trim(),
        novelBody: body,
        continuitySummary: String(meta.continuitySummary || '').trim(),
        timelineNote: String(meta.timelineNote || '').trim(),
        timelineEntry: meta.timelineEntry || undefined,
        openHooks: isFinale ? [] : Array.isArray(meta.openHooks) ? meta.openHooks : [],
        characterStates: Array.isArray(meta.characterStates) ? meta.characterStates : [],
        scenes: Array.isArray(meta.scenes) ? meta.scenes : [],
        finale: isFinale,
      });

      try {
        await this.characters.extractAndUpsert(
          projectId,
          `${body}\n${charBlock}`,
          opts.model,
        );
      } catch (e: any) {
        this.logger.warn(`章节角色提取失败: ${e?.message || e}`);
      }

      await send({ type: 'done', chapter });
      return chapter;
    } catch (e: any) {
      if (e?.name === 'AbortError' || opts.signal?.aborted) {
        await send({ type: 'error', message: '已取消' });
        throw e;
      }
      const message = e?.message || String(e);
      await send({ type: 'error', message });
      throw e;
    }
  }

  private bibleOf(c: Character): CharacterBibleMeta {
    return (c.meta || {}) as CharacterBibleMeta;
  }

  formatCharacterCard(c: Character, styleBrief = '') {
    const m = this.bibleOf(c);
    const app = m.appearance || {};
    const style = String(styleBrief || '').trim();

    const lines = [
      `【${c.name}】`,
      m.role ? `身份站位：${m.role}` : '',
      m.occupation ? `职务：${m.occupation}` : '',
      m.camp ? `阵营：${m.camp}` : '',
      style ? `项目画风：${style}` : '项目画风：未设置',
      c.description ? `简介：${c.description}` : '',
      app.morphology ? `形态：${app.morphology}` : '',
      app.face ? `面容发型：${app.face}` : '',
      app.body ? `体型：${app.body}` : '',
      app.costume ? `服装装备：${app.costume}` : '',
      app.colors ? `配色：${app.colors}` : '',
      app.marks ? `标志锚点：${app.marks}` : '',
      m.voiceStyle ? `声线口癖：${m.voiceStyle}` : '',
      m.oocNever ? `绝不会做：${m.oocNever}` : '',
      c.consistencyPrompt ? `一致关键词：${c.consistencyPrompt}` : '',
      m.currentState
        ? `当前状态：位置 ${m.currentState.location || '—'}；状况 ${m.currentState.condition || '—'}；持有 ${m.currentState.inventory || '—'}；情绪 ${m.currentState.mood || '—'}`
        : '',
    ].filter(Boolean);
    return lines.join('\n');
  }

  private parasFromText(text: string, opts?: { firstHeading?: string }): Paragraph[] {
    const out: Paragraph[] = [];
    if (opts?.firstHeading) {
      out.push(
        new Paragraph({
          text: opts.firstHeading,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        }),
      );
    }
    const blocks = String(text || '')
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/);
    for (const block of blocks) {
      const t = block.trim();
      if (!t) continue;
      if (/^#{1,3}\s+/.test(t) || /^第.+章/.test(t)) {
        out.push(
          new Paragraph({
            text: t.replace(/^#{1,3}\s+/, ''),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
          }),
        );
        continue;
      }
      for (const line of t.split('\n')) {
        const L = line.trim();
        if (!L) continue;
        out.push(
          new Paragraph({
            children: [new TextRun({ text: L, size: 24 })],
            spacing: { after: 120, line: 360 },
          }),
        );
      }
    }
    return out;
  }

  async buildChapterDocx(projectId: string, chapterId: string): Promise<Buffer> {
    const project = await this.projects.get(projectId);
    const chapter = await this.get(chapterId);
    if (chapter.projectId !== projectId) throw new BadRequestException('章节不属于该项目');

    const chars = await this.characters.list(projectId);
    const castNames = String(chapter.chapterCard?.cast || '')
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const appearing =
      castNames.length > 0
        ? chars.filter((c) => castNames.some((n) => c.name.includes(n) || n.includes(c.name)))
        : chars;

    const children: Paragraph[] = [];

    children.push(...this.parasFromText(chapter.novelBody || '（暂无正文）'));

    if (appearing.length) {
      children.push(
        new Paragraph({
          text: '本集出场人物设定',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280 },
        }),
      );
      for (const c of appearing) {
        children.push(
          new Paragraph({
            text: c.name,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 160 },
          }),
        );
        children.push(...this.parasFromText(this.formatCharacterCard(c, project.styleBrief || '')));
      }
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });
    return Packer.toBuffer(doc);
  }

  async buildCharacterBibleDocx(projectId: string): Promise<Buffer> {
    const project = await this.projects.get(projectId);
    const chars = await this.characters.list(projectId);
    const children: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${project.title || '项目'} · 人物设定圣经`,
            bold: true,
            size: 36,
          }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: project.styleBrief
              ? `项目画风：${project.styleBrief}`
              : '建议先设置项目画风以保持视觉一致性。',
            size: 22,
            italics: true,
          }),
        ],
        spacing: { after: 360 },
      }),
    ];

    if (!chars.length) {
      children.push(new Paragraph({ text: '（暂无角色，写章后会自动带出，也可手动新建）' }));
    }

    for (const c of chars) {
      children.push(
        new Paragraph({
          text: c.name,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240 },
        }),
      );
      children.push(...this.parasFromText(this.formatCharacterCard(c, project.styleBrief || '')));
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });
    return Packer.toBuffer(doc);
  }

  async buildNovelDocx(projectId: string): Promise<Buffer> {
    const chapters = await this.list(projectId);
    if (!chapters.length) throw new BadRequestException('暂无章节可导出');

    const children: Paragraph[] = [];

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      if (i > 0) {
        children.push(
          new Paragraph({
            children: [],
            spacing: { before: 480, after: 240 },
          }),
        );
      }
      children.push(...this.parasFromText(chapter.novelBody || '（暂无正文）'));
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });
    return Packer.toBuffer(doc);
  }

  async exportChapterDocxStream(projectId: string, chapterId: string) {
    const buf = await this.buildChapterDocx(projectId, chapterId);
    const chapter = await this.get(chapterId);
    const filename = encodeURIComponent(
      `${chapter.title || `第${chapter.orderIndex}章`}.docx`,
    );
    return {
      file: new StreamableFile(buf),
      filename,
    };
  }

  async exportChapterTxtStream(projectId: string, chapterId: string) {
    const project = await this.projects.get(projectId);
    const chapter = await this.get(chapterId);
    if (chapter.projectId !== projectId) throw new BadRequestException('章节不属于该项目');
    const text = `${String(chapter.novelBody || '（暂无正文）').trim()}\n`;
    const buf = Buffer.from(`\uFEFF${text}`, 'utf8');
    const filename = encodeURIComponent(
      `${project.title || '项目'}-${chapter.title || `第${chapter.orderIndex}章`}.txt`,
    );
    return { file: new StreamableFile(buf), filename };
  }

  async exportNovelDocxStream(projectId: string) {
    const buf = await this.buildNovelDocx(projectId);
    const project = await this.projects.get(projectId);
    const filename = encodeURIComponent(`${project.title || '项目'}-全部章节.docx`);
    return { file: new StreamableFile(buf), filename };
  }

  async exportNovelTxtStream(projectId: string) {
    const project = await this.projects.get(projectId);
    const chapters = await this.list(projectId);
    if (!chapters.length) throw new BadRequestException('暂无章节可导出');

    const parts = chapters.map((chapter) =>
      String(chapter.novelBody || '（暂无正文）').trim(),
    );
    const text = `${parts.join('\n\n\n')}\n`;
    const buf = Buffer.from(`\uFEFF${text}`, 'utf8');
    const filename = encodeURIComponent(`${project.title || '项目'}-全部章节.txt`);
    return { file: new StreamableFile(buf), filename };
  }

  async exportBibleDocxStream(projectId: string) {
    const buf = await this.buildCharacterBibleDocx(projectId);
    const project = await this.projects.get(projectId);
    const filename = encodeURIComponent(`${project.title || '项目'}-人物设定.docx`);
    return { file: new StreamableFile(buf), filename };
  }

}
