import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AssembleService, type AssembleCatalogItem, type AssemblePick } from './assemble.service';

export type AssembleA2uiScript = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
  idea: string;
  sampleSkeleton?: string;
};

export type AssembleA2uiEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'a2ui'; messages: Record<string, unknown>[]; patch?: boolean }
  | { type: 'status'; message: string; progress?: number; stage?: string }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      draft: {
        title: string;
        description: string;
        styleBrief: string;
        idea: string;
        script: AssembleA2uiScript;
        picks: Record<string, Array<{ id: string; label: string; blurb: string; preview: string; reason?: string }>>;
        source: 'ai' | 'fallback';
      };
    }
  | { type: 'error'; message: string };

export type AssembleA2uiCategoryOption = {
  label: string;
  value: string;
  description?: string;
  mark?: string;
};

export type AssembleA2uiRequest = {
  sessionId?: string;
  action?: string;
  context?: Record<string, unknown>;
  dataModel?: Record<string, unknown>;
  categories?: string[];
  /** Rich options for genre cards (label + description). */
  categoryOptions?: AssembleA2uiCategoryOption[];
  scripts?: AssembleA2uiScript[];
  catalogs?: Record<string, AssembleCatalogItem[]>;
  /** Full option metadata for confirm / create (from client libraries). */
  optionMeta?: Record<string, Record<string, { label: string; blurb: string; preview: string }>>;
};

type Session = {
  id: string;
  step: 'category' | 'script' | 'blocks' | 'confirm';
  categories: string[];
  categoryOptions: AssembleA2uiCategoryOption[];
  scripts: AssembleA2uiScript[];
  category?: string;
  script?: AssembleA2uiScript;
  catalogs: Record<string, AssembleCatalogItem[]>;
  groups: Record<string, AssemblePick[]>;
  source: 'ai' | 'fallback';
  optionMeta: Record<string, Record<string, { label: string; blurb: string; preview: string }>>;
  title?: string;
  description?: string;
  titleVariants?: string[];
  descriptionVariants?: string[];
  touchedAt: number;
};

const SURFACE = 'assemble';
const CATALOG_ID = 'https://a2ui.org/specification/v0_9/basic_catalog.json';

const KIND_ORDER = [
  'lore',
  'character',
  'pacing',
  'trope',
  'dialogue',
  'hook',
  'style',
  'title',
] as const;

const KIND_META: Record<(typeof KIND_ORDER)[number], { title: string; hint: string; min: number; max: number }> = {
  lore: { title: '世界观 / 设定', hint: '选 1 个主设定', min: 1, max: 1 },
  character: { title: '人物', hint: '选 2～5 个', min: 2, max: 5 },
  pacing: { title: '叙事节奏', hint: '选 1 个', min: 1, max: 1 },
  trope: { title: '桥段', hint: '选 1～2 个', min: 1, max: 2 },
  dialogue: { title: '台词风格', hint: '选 0～1 个', min: 0, max: 1 },
  hook: { title: '开篇钩子', hint: '选 0～1 个', min: 0, max: 1 },
  style: { title: '画面风格', hint: '选 0～1 个', min: 0, max: 1 },
  title: { title: '标题简介', hint: '选 0～1 个', min: 0, max: 1 },
};

@Injectable()
export class AssembleA2uiService {
  private readonly logger = new Logger(AssembleA2uiService.name);
  private readonly sessions = new Map<string, Session>();
  private static readonly SESSION_TTL_MS = 2 * 60 * 60 * 1000;

  constructor(private readonly assemble: AssembleService) {}

  private pruneSessions() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - (s.touchedAt || 0) > AssembleA2uiService.SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  private touch(session: Session) {
    session.touchedAt = Date.now();
  }

  async handle(
    body: AssembleA2uiRequest,
    emit: (ev: AssembleA2uiEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    const send = async (ev: AssembleA2uiEvent) => {
      if (signal?.aborted) return;
      await emit(ev);
    };

    try {
      this.pruneSessions();
      const action = String(body.action || 'start').trim() || 'start';
      let session = body.sessionId ? this.sessions.get(body.sessionId) : undefined;

      if (action === 'start') {
        session = this.createSession(body);
        this.sessions.set(session.id, session);
        this.touch(session);
        await send({ type: 'session', sessionId: session.id });
        await send({ type: 'status', stage: 'category', message: '先选个题材方向', progress: 10 });
        await send({
          type: 'a2ui',
          messages: this.buildCategoryStep(session, true),
        });
        return;
      }

      if (!session) {
        throw new BadRequestException('会话已过期，请重新打开积木拼装');
      }
      this.touch(session);

      if (action === 'select_category') {
        const category = this.pickScalar(body.context?.category ?? body.dataModel?.category);
        if (!category) throw new BadRequestException('请先选择题材');
        // 按题材增量下发灵感，避免 start 时上传整库导致 413/500
        if (Array.isArray(body.scripts) && body.scripts.length) {
          const others = session.scripts.filter((s) => s.category !== category);
          session.scripts = [...others, ...body.scripts];
        }
        session.category = category;
        session.step = 'script';
        await send({ type: 'status', stage: 'script', message: `题材「${category}」· 请选灵感`, progress: 30 });
        await send({ type: 'a2ui', messages: this.buildScriptStep(session) });
        return;
      }

      if (action === 'back_category') {
        session.step = 'category';
        session.category = undefined;
        session.script = undefined;
        await send({ type: 'a2ui', messages: this.buildCategoryStep(session, false) });
        return;
      }

      if (action === 'select_script') {
        const scriptId = this.pickScalar(body.context?.scriptId ?? body.dataModel?.scriptId);
        let script = session.scripts.find((s) => s.id === scriptId);
        if (!script && Array.isArray(body.scripts)) {
          script = body.scripts.find((s) => s.id === scriptId);
          if (script) session.scripts.push(script);
        }
        if (!script) throw new BadRequestException('请先选择灵感');
        session.script = script;
        if (body.catalogs && Object.keys(body.catalogs).length) {
          session.catalogs = body.catalogs;
        }
        if (body.optionMeta) session.optionMeta = body.optionMeta;
        if (!Object.keys(session.catalogs).length) {
          throw new BadRequestException('候选积木库为空，请刷新后重试');
        }

        session.groups = {};
        session.source = 'ai';
        session.step = 'blocks';
        session.title = script.label;
        session.description = script.idea;

        await this.runProgressiveDraft(session, send, signal, { patch: false });
        return;
      }

      if (action === 'back_script') {
        if (!session.category) {
          session.step = 'category';
          await send({ type: 'a2ui', messages: this.buildCategoryStep(session) });
          return;
        }
        session.step = 'script';
        await send({ type: 'a2ui', messages: this.buildScriptStep(session) });
        return;
      }

      if (action === 'confirm_picks') {
        if (!session.script) throw new BadRequestException('缺少灵感');
        const picks = this.readPicks(body.dataModel || body.context || {});
        this.assertPicks(picks, session.groups);
        session.step = 'confirm';
        await send({
          type: 'status',
          stage: 'confirm',
          message: 'AI 正在联想书名与简介…',
          progress: 88,
        });
        await this.applyAiTitleDescription(session, picks);
        await send({ type: 'status', stage: 'confirm', message: '确认书名与简介', progress: 92 });
        await send({
          type: 'a2ui',
          messages: this.buildConfirmStep(session, picks),
        });
        return;
      }

      if (action === 'expand_blocks') {
        if (!session.script || !Object.keys(session.catalogs).length) {
          throw new BadRequestException('请先选择灵感并完成推荐');
        }
        await send({
          type: 'status',
          stage: 'expand',
          message: 'AI 正在扩写设定 / 人物 / 桥段…',
          progress: 80,
        });
        await send({
          type: 'a2ui',
          patch: true,
          messages: this.buildBlocksStep(session, { expanding: true, patch: true }),
        });
        await this.mergeAiExpandedBlocksProgressive(session, send, signal);
        session.step = 'blocks';
        await send({
          type: 'status',
          stage: 'blocks',
          message: '已追加 AI 扩充积木，可继续勾选',
          progress: 84,
        });
        await send({
          type: 'a2ui',
          patch: true,
          messages: this.buildBlocksStep(session, { patch: true }),
        });
        return;
      }

      if (action === 'refresh_draft') {
        if (!session.script || !Object.keys(session.catalogs).length) {
          throw new BadRequestException('请先选择灵感');
        }
        session.groups = {};
        await this.runProgressiveDraft(session, send, signal, { patch: true });
        return;
      }

      if (action === 'suggest_meta') {
        if (!session.script) throw new BadRequestException('缺少灵感');
        const picks = this.readPicks(body.dataModel || body.context || {});
        await send({
          type: 'status',
          stage: 'confirm',
          message: 'AI 正在重联想书名与简介…',
          progress: 90,
        });
        await this.applyAiTitleDescription(session, picks);
        session.step = 'confirm';
        await send({ type: 'a2ui', messages: this.buildConfirmStep(session, picks) });
        return;
      }

      if (action === 'back_blocks') {
        if (!session.script || !Object.keys(session.groups).length) {
          throw new BadRequestException('尚无积木推荐，请重新选择灵感');
        }
        session.step = 'blocks';
        await send({ type: 'a2ui', messages: this.buildBlocksStep(session) });
        return;
      }

      if (action === 'create_project') {
        if (!session.script) throw new BadRequestException('缺少灵感');
        const dm = body.dataModel || {};
        const picks = this.readPicks(dm);
        this.assertPicks(picks, session.groups);
        const title = String(dm.title || session.title || session.script.label).trim();
        const description = String(dm.description || session.description || session.script.idea).trim();
        if (!title) throw new BadRequestException('请填写书名');

        type DraftPick = { id: string; label: string; blurb: string; preview: string; reason?: string };
        const draftPicks: Record<string, DraftPick[]> = {};

        for (const kind of KIND_ORDER) {
          const ids = picks[kind] || [];
          draftPicks[kind] = ids.map((id) => {
            const meta = session!.optionMeta[kind]?.[id];
            const cat = (session!.catalogs[kind] || []).find((c) => c.id === id);
            const reason = (session!.groups[kind] || []).find((g) => g.id === id)?.reason;
            return {
              id,
              label: meta?.label || cat?.label || id,
              blurb: meta?.blurb || cat?.blurb || '',
              preview: meta?.preview || meta?.blurb || cat?.blurb || '',
              reason,
            };
          });
        }

        const styleBrief = (draftPicks.style?.[0]?.preview || '').trim();
        const idea = this.composeIdea(session.script, draftPicks);

        await send({ type: 'status', stage: 'create', message: '正在创建项目…', progress: 96 });
        await send({
          type: 'done',
          draft: {
            title,
            description: description || session.script.idea,
            styleBrief,
            idea,
            script: session.script,
            picks: draftPicks,
            source: session.source,
          },
        });
        this.sessions.delete(session.id);
        return;
      }

      throw new BadRequestException(`未知动作：${action}`);
    } catch (e: any) {
      if (signal?.aborted) return;
      this.logger.warn(`assemble a2ui failed: ${e?.message || e}`);
      await emit({ type: 'error', message: e?.message || '积木问答失败' });
    }
  }

  private createSession(body: AssembleA2uiRequest): Session {
    const categories = Array.isArray(body.categories) ? body.categories.filter(Boolean) : [];
    const scripts = Array.isArray(body.scripts) ? body.scripts : [];
    if (!categories.length) throw new BadRequestException('题材分类为空');
    const categoryOptions = this.normalizeCategoryOptions(body.categoryOptions, categories);
    return {
      id: randomUUID(),
      step: 'category',
      categories,
      categoryOptions,
      scripts,
      catalogs: body.catalogs || {},
      groups: {},
      source: 'fallback',
      optionMeta: body.optionMeta || {},
      touchedAt: Date.now(),
    };
  }

  private normalizeCategoryOptions(
    raw: AssembleA2uiCategoryOption[] | undefined,
    categories: string[],
  ): AssembleA2uiCategoryOption[] {
    const byValue = new Map<string, AssembleA2uiCategoryOption>();
    if (Array.isArray(raw)) {
      for (const o of raw) {
        const value = String(o?.value || o?.label || '').trim();
        if (!value) continue;
        byValue.set(value, {
          label: String(o.label || value),
          value,
          description: o.description ? String(o.description) : undefined,
          mark: o.mark ? String(o.mark) : undefined,
        });
      }
    }
    return categories.map((c) => {
      const hit = byValue.get(c);
      if (hit) return hit;
      return {
        label: c,
        value: c,
        description: `「${c}」题材方向，选中后继续挑灵感主线。`,
        mark: c.slice(0, 1),
      };
    });
  }

  private localFallback(catalogs: Record<string, AssembleCatalogItem[]>) {
    const out: Record<string, AssemblePick[]> = {};
    for (const kind of Object.keys(catalogs)) {
      out[kind] = (catalogs[kind] || []).slice(0, 5).map((x) => ({
        id: x.id,
        reason: '按标签相近推荐',
      }));
    }
    return out;
  }

  private pickScalar(v: unknown): string {
    if (Array.isArray(v)) return String(v[0] || '').trim();
    if (v == null) return '';
    return String(v).trim();
  }

  private readPicks(dm: Record<string, unknown>) {
    const raw = (dm.picks && typeof dm.picks === 'object' ? dm.picks : dm) as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const kind of KIND_ORDER) {
      const v = raw[kind];
      if (Array.isArray(v)) out[kind] = v.map((x) => String(x));
      else if (typeof v === 'string' && v) out[kind] = [v];
      else out[kind] = [];
    }
    return out;
  }

  private assertPicks(picks: Record<string, string[]>, groups: Record<string, AssemblePick[]>) {
    for (const kind of KIND_ORDER) {
      const meta = KIND_META[kind];
      const allowed = new Set((groups[kind] || []).map((g) => g.id));
      const ids = (picks[kind] || []).filter((id) => allowed.has(id));
      picks[kind] = ids;
      if (ids.length < meta.min || ids.length > meta.max) {
        throw new BadRequestException(`${meta.title}请选 ${meta.min}～${meta.max} 个`);
      }
    }
  }

  private composeIdea(
    script: AssembleA2uiScript,
    picks: Record<string, Array<{ label: string; preview: string }>>,
  ) {
    const lines = [
      '请根据以下「积木拼装」素材，整合成一部通顺完整、可长线连载的小说大纲。',
      '篇幅默认按长篇网文（预估成书约 100～200 万字、可写到完本）设计：先分卷、再给首卷细章；禁止短剧分集/短篇收束；禁止把大纲文档字数写成「全文约几千字」。',
      '',
      '【核心灵感】',
      script.idea,
    ];
    if (script.sampleSkeleton?.trim()) {
      lines.push(
        '',
        '【示例骨架参考】（仅作开篇节拍参考，请扩成「分卷总纲 + 首卷 30～50 章细目」，不要照抄成短篇五段完结）',
        script.sampleSkeleton.trim(),
      );
    }
    for (const kind of KIND_ORDER) {
      const items = picks[kind] || [];
      if (!items.length) continue;
      lines.push('', `【${KIND_META[kind].title}】`);
      for (const it of items) {
        lines.push(`- ${it.label}`);
        if (it.preview) lines.push(it.preview);
      }
    }
    lines.push(
      '',
      '【成书目标】预估成书约 150～200 万字，分 5～8 卷，可持续连载至完本。',
      '请输出可直接用于后续分章写作的完整大纲：含分卷大纲 + 首卷细目录（30章以上）+ 后续卷关键大节点。',
    );
    return lines.join('\n');
  }

  private surfaceBootstrap() {
    return [
      {
        version: 'v0.9',
        createSurface: {
          surfaceId: SURFACE,
          catalogId: CATALOG_ID,
          sendDataModel: true,
        },
      },
    ];
  }

  private replaceSurface(
    components: Record<string, unknown>[],
    data: Record<string, unknown>,
    opts?: { recreate?: boolean; patch?: boolean },
  ) {
    // 前端会把每步 remap 成新的 surfaceId 追加到聊天气泡；patch 时只更新组件/数据
    const messages: Record<string, unknown>[] = [];
    if (!opts?.patch) {
      messages.push(...this.surfaceBootstrap());
    }
    messages.push({
      version: 'v0.9',
      updateDataModel: { surfaceId: SURFACE, path: '/', value: data },
    });
    messages.push({
      version: 'v0.9',
      updateComponents: { surfaceId: SURFACE, components },
    });
    return messages;
  }

  private buildCategoryStep(session: Session, first = false) {
    const options = session.categoryOptions.length
      ? session.categoryOptions
      : session.categories.map((c) => ({
          label: c,
          value: c,
          description: `「${c}」题材方向，选中后继续挑灵感主线。`,
          mark: c.slice(0, 1),
        }));
    const components: Record<string, unknown>[] = [
      { id: 'root', component: 'Column', children: ['picker', 'actions'] },
      {
        id: 'picker',
        component: 'ChoicePicker',
        variant: 'mutuallyExclusive',
        displayStyle: 'cards',
        filterable: true,
        options,
        value: { path: '/category' },
      },
      { id: 'actions', component: 'Row', children: ['btn_next_label_wrap'] },
      {
        id: 'btn_next_label_wrap',
        component: 'Button',
        variant: 'primary',
        child: 'btn_next_label',
        action: {
          event: {
            name: 'select_category',
            context: { category: { path: '/category' }, sessionId: session.id },
          },
        },
      },
      { id: 'btn_next_label', component: 'Text', text: '就选这个' },
    ];
    return this.replaceSurface(components, { category: [], sessionId: session.id }, { recreate: !first });
  }

  private buildScriptStep(session: Session) {
    const cat = session.category || '';
    const items = session.scripts.filter((s) => s.category === cat).slice(0, 40);
    const options = items.map((s) => ({
      label: s.label,
      value: s.id,
      description: s.blurb,
      mark: String(s.label || '').slice(0, 1),
    }));
    const components: Record<string, unknown>[] = [
      { id: 'root', component: 'Column', children: ['picker', 'actions'] },
      {
        id: 'picker',
        component: 'ChoicePicker',
        variant: 'mutuallyExclusive',
        displayStyle: 'cards',
        filterable: true,
        options: options.length
          ? options
          : [{ label: '（无）', value: '', description: '换个题材试试' }],
        value: { path: '/scriptId' },
      },
      { id: 'actions', component: 'Row', children: ['btn_back', 'btn_next'] },
      {
        id: 'btn_back',
        component: 'Button',
        child: 'btn_back_label',
        action: { event: { name: 'back_category', context: { sessionId: session.id } } },
      },
      { id: 'btn_back_label', component: 'Text', text: '换个题材' },
      {
        id: 'btn_next',
        component: 'Button',
        variant: 'primary',
        child: 'btn_next_label',
        action: {
          event: {
            name: 'select_script',
            context: { scriptId: { path: '/scriptId' }, sessionId: session.id },
          },
        },
      },
      { id: 'btn_next_label', component: 'Text', text: '用这条灵感' },
    ];
    return this.replaceSurface(components, {
      category: cat,
      scriptId: [],
      sessionId: session.id,
    });
  }

  private buildBlocksStep(
    session: Session,
    opts?: { progressive?: boolean; revealed?: string[]; patch?: boolean; expanding?: boolean },
  ) {
    const progressive = !!opts?.progressive;
    const expanding = !!opts?.expanding;
    const revealed = new Set(
      opts?.revealed ?? (progressive ? [] : [...KIND_ORDER]),
    );
    const showActions = !progressive && !expanding;

    const childIds: string[] = ['source'];
    const components: Record<string, unknown>[] = [
      { id: 'root', component: 'Column', children: childIds },
      {
        id: 'source',
        component: 'Text',
        text: expanding
          ? 'AI 正在扩写设定 / 人物 / 桥段…（暖色闪烁骨架卡为新增位）'
          : progressive
            ? revealed.size
              ? `草案生成中（已出 ${revealed.size}/${KIND_ORDER.length} 组）…`
              : '草案生成中：各组会一张张出现，请稍候…'
            : session.source === 'ai'
              ? '拼装草案 · 青绿=本地 · 暖色=AI · 默认已预选，改不满意的即可'
              : '本地草案 · 青绿=本地 · 暖色=AI · 默认已预选，可点「AI 再扩充」',
        variant: 'caption',
      },
    ];

    const defaultPicks: Record<string, string[]> = {};
    for (const kind of KIND_ORDER) {
      const meta = KIND_META[kind];
      const catalog = session.catalogs[kind] || [];
      if (!catalog.length && !(session.groups[kind] || []).length) continue;

      const headId = `h_${kind}`;
      const pickId = `p_${kind}`;
      childIds.push(headId, pickId);

      const ready = !progressive || revealed.has(kind);
      const picks = ready ? session.groups[kind] || [] : [];
      const byId = new Map(catalog.map((c) => [c.id, c]));

      if (!ready) {
        components.push({
          id: headId,
          component: 'Text',
          text: `${meta.title} · 匹配中…`,
          variant: 'h4',
        });
        components.push({
          id: pickId,
          component: 'ChoicePicker',
          variant: 'mutuallyExclusive',
          displayStyle: 'cards',
          filterable: false,
          options: [
            {
              label: '生成中',
              value: `_loading_${kind}_a`,
              description: '正在匹配相关积木…',
              mark: '·',
              tone: 'local',
            },
            {
              label: '生成中',
              value: `_loading_${kind}_b`,
              description: '稍候片刻就会出现',
              mark: '·',
              tone: 'local',
            },
          ],
          value: { path: `/picks/${kind}` },
        });
        defaultPicks[kind] = [];
        continue;
      }

      const options = picks.map((p) => {
        const item = byId.get(p.id);
        const isAi =
          p.reason === 'AI 扩充' ||
          String(p.id).startsWith('ai-') ||
          String(item?.category || '').includes('AI');
        return {
          label: item?.label || p.id,
          value: p.id,
          description: item?.blurb || p.reason || '',
          mark: String(item?.label || p.id).slice(0, 1),
          badge: isAi ? 'AI' : '本地',
          tone: isAi ? 'ai' : 'local',
        };
      });

      if (expanding) {
        options.push(
          {
            label: '扩写中',
            value: `_loading_${kind}_x`,
            description: 'AI 正在发明新积木…',
            mark: '·',
            badge: 'AI',
            tone: 'ai',
          },
          {
            label: '扩写中',
            value: `_loading_${kind}_y`,
            description: '设定 / 人物 / 桥段…',
            mark: '·',
            badge: 'AI',
            tone: 'ai',
          },
        );
      }

      const selectable = options.filter((o) => !String(o.value).startsWith('_loading_'));
      const n = Math.min(Math.max(meta.min, meta.min ? 1 : 0), meta.max, selectable.length);
      defaultPicks[kind] = selectable.slice(0, n).map((o) => o.value);

      components.push({
        id: headId,
        component: 'Text',
        text: expanding ? `${meta.title} · AI 扩写中…` : `${meta.title} · ${meta.hint}`,
        variant: 'h4',
      });
      components.push({
        id: pickId,
        component: 'ChoicePicker',
        variant: meta.max === 1 ? 'mutuallyExclusive' : 'multipleSelection',
        displayStyle: 'cards',
        options: options.length
          ? options
          : [
              {
                label: '（无候选）',
                value: `_empty_${kind}`,
                description: '换条灵感再试',
                tone: 'local',
              },
            ],
        value: { path: `/picks/${kind}` },
      });
    }

    if (showActions) {
      childIds.push('actions');
      components.push({
        id: 'actions',
        component: 'Row',
        children: ['btn_back', 'btn_refresh', 'btn_expand', 'btn_next'],
      });
      components.push({
        id: 'btn_back',
        component: 'Button',
        child: 'btn_back_label',
        action: { event: { name: 'back_script', context: { sessionId: session.id } } },
      });
      components.push({ id: 'btn_back_label', component: 'Text', text: '换条灵感' });
      components.push({
        id: 'btn_refresh',
        component: 'Button',
        child: 'btn_refresh_label',
        action: {
          event: {
            name: 'refresh_draft',
            context: { sessionId: session.id, picks: { path: '/picks' } },
          },
        },
      });
      components.push({ id: 'btn_refresh_label', component: 'Text', text: '重出草案' });
      components.push({
        id: 'btn_expand',
        component: 'Button',
        child: 'btn_expand_label',
        action: {
          event: {
            name: 'expand_blocks',
            context: { sessionId: session.id, picks: { path: '/picks' } },
          },
        },
      });
      components.push({ id: 'btn_expand_label', component: 'Text', text: 'AI 再扩充' });
      components.push({
        id: 'btn_next',
        component: 'Button',
        variant: 'primary',
        child: 'btn_next_label',
        action: {
          event: {
            name: 'confirm_picks',
            context: { sessionId: session.id, picks: { path: '/picks' } },
          },
        },
      });
      components.push({ id: 'btn_next_label', component: 'Text', text: '草案 OK，下一步' });
    }

    const root = components.find((c) => c.id === 'root') as { children: string[] };
    root.children = childIds;

    return this.replaceSurface(
      components,
      {
        sessionId: session.id,
        category: session.category,
        scriptId: session.script?.id,
        picks: defaultPicks,
        title: session.title || session.script?.label || '',
        description: session.description || session.script?.idea || '',
      },
      { patch: !!opts?.patch },
    );
  }

  private buildConfirmStep(session: Session, picks: Record<string, string[]>) {
    const summaryParts: string[] = [];
    for (const kind of KIND_ORDER) {
      const ids = picks[kind] || [];
      if (!ids.length) continue;
      const catalog = session.catalogs[kind] || [];
      const labels = ids.map(
        (id) =>
          session.optionMeta[kind]?.[id]?.label ||
          catalog.find((c) => c.id === id)?.label ||
          id,
      );
      summaryParts.push(`${KIND_META[kind].title}：${labels.join('、')}`);
    }

    const titleOptions = (session.titleVariants || [])
      .filter(Boolean)
      .slice(0, 8)
      .map((t) => ({
        label: t,
        value: t,
        description: '点选填入书名',
        mark: t.slice(0, 1),
      }));
    const descOptions = (session.descriptionVariants || [])
      .filter(Boolean)
      .slice(0, 4)
      .map((d, i) => ({
        label: `简介方案 ${i + 1}`,
        value: d,
        description: d.slice(0, 120) + (d.length > 120 ? '…' : ''),
        mark: String(i + 1),
      }));

    const children = ['summary'];
    if (titleOptions.length) children.push('title_pick_h', 'title_pick');
    children.push('field_title');
    if (descOptions.length) children.push('desc_pick_h', 'desc_pick');
    children.push('field_desc', 'actions');

    const components: Record<string, unknown>[] = [
      { id: 'root', component: 'Column', children },
      {
        id: 'summary',
        component: 'Text',
        text: summaryParts.join('\n') || '已选积木组合',
        variant: 'body',
      },
    ];

    if (titleOptions.length) {
      components.push({
        id: 'title_pick_h',
        component: 'Text',
        text: 'AI 书名联想（点选填入）',
        variant: 'h4',
      });
      components.push({
        id: 'title_pick',
        component: 'ChoicePicker',
        variant: 'mutuallyExclusive',
        displayStyle: 'cards',
        options: titleOptions,
        value: { path: '/title' },
      });
    }

    components.push({
      id: 'field_title',
      component: 'TextField',
      label: '书名',
      value: { path: '/title' },
      variant: 'shortText',
      checks: [
        {
          condition: {
            call: 'required',
            args: { value: { path: '/title' } },
            returnType: 'boolean',
          },
          message: '请填写书名',
        },
      ],
    });

    if (descOptions.length) {
      components.push({
        id: 'desc_pick_h',
        component: 'Text',
        text: 'AI 简介联想（点选填入）',
        variant: 'h4',
      });
      components.push({
        id: 'desc_pick',
        component: 'ChoicePicker',
        variant: 'mutuallyExclusive',
        displayStyle: 'cards',
        options: descOptions,
        value: { path: '/description' },
      });
    }

    components.push({
      id: 'field_desc',
      component: 'TextField',
      label: '简介',
      value: { path: '/description' },
      variant: 'longText',
    });

    components.push({
      id: 'actions',
      component: 'Row',
      children: ['btn_back', 'btn_ai_meta', 'btn_create'],
    });
    components.push({
      id: 'btn_back',
      component: 'Button',
      child: 'btn_back_label',
      action: {
        event: {
          name: 'back_blocks',
          context: { sessionId: session.id },
        },
      },
    });
    components.push({ id: 'btn_back_label', component: 'Text', text: '再改改积木' });
    components.push({
      id: 'btn_ai_meta',
      component: 'Button',
      child: 'btn_ai_meta_label',
      action: {
        event: {
          name: 'suggest_meta',
          context: {
            sessionId: session.id,
            picks: { path: '/picks' },
            title: { path: '/title' },
            description: { path: '/description' },
          },
        },
      },
    });
    components.push({ id: 'btn_ai_meta_label', component: 'Text', text: 'AI 重联想书名简介' });
    components.push({
      id: 'btn_create',
      component: 'Button',
      variant: 'primary',
      child: 'btn_create_label',
      checks: [
        {
          condition: {
            call: 'required',
            args: { value: { path: '/title' } },
            returnType: 'boolean',
          },
          message: '请填写书名',
        },
      ],
      action: {
        event: {
          name: 'create_project',
          context: {
            sessionId: session.id,
            title: { path: '/title' },
            description: { path: '/description' },
            picks: { path: '/picks' },
          },
        },
      },
    });
    components.push({ id: 'btn_create_label', component: 'Text', text: '创建项目并生成大纲' });

    return this.replaceSurface(components, {
      sessionId: session.id,
      category: session.category,
      scriptId: session.script?.id,
      picks,
      title: session.title || session.script?.label || '',
      description: session.description || session.script?.idea || '',
    });
  }

  /**
   * 草案流式：关联推荐按组出卡，扩充在后台并行；各组就绪即 patch，避免整段空等。
   */
  private async runProgressiveDraft(
    session: Session,
    send: (ev: AssembleA2uiEvent) => void | Promise<void>,
    signal?: AbortSignal,
    opts?: { patch?: boolean },
  ) {
    if (!session.script) return;
    const script = session.script;
    const revealed: string[] = [];

    await send({
      type: 'status',
      stage: 'draft',
      message: '正在生成拼装草案：各组会陆续出现…',
      progress: 40,
    });
    await send({
      type: 'a2ui',
      patch: !!opts?.patch,
      messages: this.buildBlocksStep(session, {
        progressive: true,
        revealed: [],
        patch: !!opts?.patch,
      }),
    });

    if (signal?.aborted) return;

    // 关联与扩充并行：扩充用更长墙钟（从启动算），出一组就并入暖色卡，避免「生成中全程只有本地」
    const expandedBuffer: Record<
      string,
      Array<{ id: string; label: string; category: string; tags?: string[]; blurb: string; preview?: string }>
    > = {};
    let expandedCount = 0;
    let draftUnlocked = false;

    const paintBlocks = async (progressive: boolean) => {
      await send({
        type: 'a2ui',
        patch: true,
        messages: this.buildBlocksStep(
          session,
          progressive
            ? { progressive: true, revealed: [...revealed], patch: true }
            : { patch: true },
        ),
      });
    };

    const mergeExpandKind = async (
      kind: string,
      items: Array<{ id: string; label: string; category: string; tags?: string[]; blurb: string; preview?: string }>,
    ) => {
      if (signal?.aborted || !items?.length) return;
      expandedBuffer[kind] = items;
      this.applyExpandedItems(session, { [kind]: items });
      expandedCount += items.length;
      if (!revealed.includes(kind) && !draftUnlocked) return;
      await send({
        type: 'status',
        stage: 'expand',
        message: `已追加 AI「${KIND_META[kind as keyof typeof KIND_META]?.title || kind}」${items.length} 条`,
        progress: Math.min(92, (draftUnlocked ? 84 : 50) + expandedCount),
      });
      await paintBlocks(!draftUnlocked);
    };

    const expandPromise = this.assemble.expandBlocks(
      {
        scriptLabel: script.label,
        scriptIdea: script.idea,
        scriptCategory: script.category,
        tags: script.tags || [],
        catalogs: session.catalogs,
      },
      {
        signal,
        timeoutMs: 42000,
        onKind: (kind, items) => mergeExpandKind(kind, items),
      },
    );

    let source: 'ai' | 'fallback' = 'fallback';
    let finalGroups: Record<string, AssemblePick[]> = {};

    try {
      await this.assemble.suggestStream(
        {
          scriptLabel: script.label,
          scriptIdea: script.idea,
          scriptCategory: script.category,
          tags: script.tags || [],
          catalogs: session.catalogs,
        },
        async (ev) => {
          if (signal?.aborted) return;
          if (ev.type === 'status') {
            await send({
              type: 'status',
              stage: 'draft',
              message: String(ev.message || '正在匹配积木…'),
              progress: Math.min(78, Math.max(42, Number(ev.progress) || 42)),
            });
          } else if (ev.type === 'group' && ev.kind) {
            const kind = String(ev.kind);
            const picks = Array.isArray(ev.picks) ? ev.picks : [];
            const keepAi = (session.groups[kind] || []).filter((g) => g.reason === 'AI 扩充');
            session.groups[kind] = [
              ...picks,
              ...keepAi.filter((a) => !picks.some((p) => p.id === a.id)),
            ];
            if (expandedBuffer[kind]?.length) {
              this.applyExpandedItems(session, { [kind]: expandedBuffer[kind] });
            }
            if (!revealed.includes(kind)) revealed.push(kind);
            await send({
              type: 'status',
              stage: 'draft',
              message: `已出「${KIND_META[kind as keyof typeof KIND_META]?.title || kind}」${(session.groups[kind] || []).length} 条`,
              progress: Math.min(78, 42 + revealed.length * 4),
            });
            await paintBlocks(true);
          } else if (ev.type === 'done') {
            finalGroups = ev.groups || {};
            source = ev.source === 'fallback' ? 'fallback' : 'ai';
          } else if (ev.type === 'error') {
            throw new Error(String(ev.message || '关联推荐失败'));
          }
        },
        signal,
      );
    } catch (e: any) {
      if (signal?.aborted || e?.name === 'AbortError') return;
      this.logger.warn(`progressive draft suggest failed: ${e?.message || e}`);
      finalGroups = this.localFallback(session.catalogs);
      source = 'fallback';
      await send({
        type: 'status',
        stage: 'fallback',
        message: 'AI 暂不可用，已用本地标签相近出草案',
        progress: 70,
      });
    }

    if (signal?.aborted) return;

    // 合并最终关联结果时，务必保留已并入的 AI 扩充卡
    const preserveAi = (kind: string, base: AssemblePick[]) => {
      const ai = (session.groups[kind] || []).filter((g) => g.reason === 'AI 扩充');
      const buffered = expandedBuffer[kind] || [];
      const merged = [...base];
      for (const a of ai) {
        if (!merged.some((p) => p.id === a.id)) merged.push(a);
      }
      session.groups[kind] = merged;
      if (buffered.length) this.applyExpandedItems(session, { [kind]: buffered });
    };

    if (Object.keys(finalGroups).length) {
      for (const kind of KIND_ORDER) {
        preserveAi(kind, finalGroups[kind] || []);
      }
    } else if (!Object.keys(session.groups).length) {
      session.groups = this.localFallback(session.catalogs);
      source = 'fallback';
    }
    session.source = source;

    for (const kind of KIND_ORDER) {
      if (signal?.aborted) return;
      if (!(session.groups[kind] || []).length || revealed.includes(kind)) continue;
      revealed.push(kind);
      await send({
        type: 'status',
        stage: 'draft',
        message: `已出「${KIND_META[kind]?.title || kind}」`,
        progress: Math.min(78, 42 + revealed.length * 4),
      });
      await paintBlocks(true);
      await new Promise((r) => setTimeout(r, 60));
    }

    draftUnlocked = true;
    session.step = 'blocks';
    await send({
      type: 'status',
      stage: 'blocks',
      message: expandedCount
        ? `草案已就绪（已并入 ${expandedCount} 条 AI），正在收尾…`
        : '草案已就绪，正在并入 AI 暖色卡…',
      progress: 86,
    });
    await paintBlocks(false);

    try {
      const exp = await expandPromise;
      if (signal?.aborted) return;
      for (const kind of KIND_ORDER) {
        const rows = exp.items[kind] || [];
        if (!rows.length) continue;
        const already = (session.groups[kind] || []).some(
          (g) => g.reason === 'AI 扩充' && rows.some((r) => r.label === (session.optionMeta[kind]?.[g.id]?.label || '')),
        );
        if (already || expandedBuffer[kind]) {
          // onKind 可能已并入；再补一次防漏
          this.applyExpandedItems(session, { [kind]: rows });
          continue;
        }
        await mergeExpandKind(kind, rows);
      }
    } catch (e: any) {
      if (!(signal?.aborted || e?.name === 'AbortError')) {
        this.logger.warn(`progressive draft expand failed: ${e?.message || e}`);
      }
    }

    if (signal?.aborted) return;
    const aiTotal = KIND_ORDER.reduce(
      (n, kind) => n + (session.groups[kind] || []).filter((g) => g.reason === 'AI 扩充').length,
      0,
    );
    await send({
      type: 'status',
      stage: 'blocks',
      message: aiTotal
        ? `拼装草案已就绪（含 ${aiTotal} 条 AI 扩充）——青绿本地 / 暖色 AI`
        : source === 'fallback'
          ? '本地草案已就绪——可点「AI 再扩充」补暖色卡'
          : '拼装草案已就绪——暖色卡未生成，可点「AI 再扩充」',
      progress: 100,
    });
    await paintBlocks(false);
  }

  private async mergeAiExpandedBlocksProgressive(
    session: Session,
    send: (ev: AssembleA2uiEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    if (!session.script || signal?.aborted) return;
    await send({
      type: 'status',
      stage: 'expand',
      message: 'AI 再扩充中（约十余秒）…',
      progress: 72,
    });
    let count = 0;
    const { items, source } = await this.assemble.expandBlocks(
      {
        scriptLabel: session.script.label,
        scriptIdea: session.script.idea,
        scriptCategory: session.script.category,
        tags: session.script.tags || [],
        catalogs: session.catalogs,
      },
      {
        signal,
        timeoutMs: 18000,
        onKind: async (kind, rows) => {
          if (signal?.aborted || !rows?.length) return;
          this.applyExpandedItems(session, { [kind]: rows });
          count += rows.length;
          await send({
            type: 'status',
            stage: 'expand',
            message: `已追加 AI「${KIND_META[kind as keyof typeof KIND_META]?.title || kind}」${rows.length} 条`,
            progress: Math.min(90, 74 + count * 2),
          });
          await send({
            type: 'a2ui',
            patch: true,
            messages: this.buildBlocksStep(session, { patch: true }),
          });
        },
      },
    );
    if (signal?.aborted) return;
    if (!count && source === 'ai' && Object.keys(items || {}).length) {
      await this.applyExpandedItemsProgressive(session, items, send, signal);
      count = Object.values(items).reduce((n, rows) => n + (rows?.length || 0), 0);
    }
    await send({
      type: 'status',
      stage: 'blocks',
      message: count
        ? `已追加 ${count} 条 AI 扩充`
        : 'AI 扩充超时或暂不可用，可稍后再试',
      progress: 92,
    });
  }

  private async applyExpandedItemsProgressive(
    session: Session,
    items: Record<string, Array<{ id: string; label: string; category: string; tags?: string[]; blurb: string; preview?: string }>>,
    send: (ev: AssembleA2uiEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    for (const kind of KIND_ORDER) {
      if (signal?.aborted) return;
      const rows = items[kind] || [];
      if (!rows.length) continue;
      this.applyExpandedItems(session, { [kind]: rows });
      await send({
        type: 'status',
        stage: 'expand',
        message: `已追加 AI「${KIND_META[kind].title}」${rows.length} 条`,
        progress: Math.min(88, 80 + KIND_ORDER.indexOf(kind)),
      });
      await send({
        type: 'a2ui',
        patch: true,
        messages: this.buildBlocksStep(session, { expanding: true, patch: true }),
      });
      await new Promise((r) => setTimeout(r, 110));
    }
  }

  private async mergeAiExpandedBlocks(session: Session, signal?: AbortSignal) {
    if (!session.script || signal?.aborted) return;
    const { items, source } = await this.assemble.expandBlocks({
      scriptLabel: session.script.label,
      scriptIdea: session.script.idea,
      scriptCategory: session.script.category,
      tags: session.script.tags || [],
      catalogs: session.catalogs,
    });
    if (source !== 'ai' || !Object.keys(items).length) return;
    this.applyExpandedItems(session, items);
  }

  private applyExpandedItems(
    session: Session,
    items: Record<string, Array<{ id: string; label: string; category: string; tags?: string[]; blurb: string; preview?: string }>>,
  ) {
    for (const kind of KIND_ORDER) {
      const rows = items[kind] || [];
      if (!rows.length) continue;
      if (!session.catalogs[kind]) session.catalogs[kind] = [];
      if (!session.optionMeta[kind]) session.optionMeta[kind] = {};
      if (!session.groups[kind]) session.groups[kind] = [];

      for (const row of rows) {
        if (session.catalogs[kind].some((c) => c.label === row.label)) continue;
        session.catalogs[kind].push({
          id: row.id,
          label: row.label,
          category: row.category,
          tags: row.tags,
          blurb: row.blurb,
        });
        session.optionMeta[kind][row.id] = {
          label: row.label,
          blurb: row.blurb,
          preview: row.preview || row.blurb,
        };
        if (!session.groups[kind].some((g) => g.id === row.id)) {
          session.groups[kind].push({ id: row.id, reason: 'AI 扩充' });
        }
      }
      if (session.groups[kind].length > 14) {
        const aiFirst = [
          ...session.groups[kind].filter((g) => g.reason === 'AI 扩充'),
          ...session.groups[kind].filter((g) => g.reason !== 'AI 扩充'),
        ];
        session.groups[kind] = aiFirst.slice(0, 14);
      }
    }
  }

  private picksSummaryText(session: Session, picks: Record<string, string[]>) {
    const lines: string[] = [];
    for (const kind of KIND_ORDER) {
      const ids = picks[kind] || [];
      if (!ids.length) continue;
      const labels = ids.map(
        (id) =>
          session.optionMeta[kind]?.[id]?.label ||
          session.catalogs[kind]?.find((c) => c.id === id)?.label ||
          id,
      );
      lines.push(`${KIND_META[kind].title}：${labels.join('、')}`);
    }
    return lines.join('\n');
  }

  private async applyAiTitleDescription(session: Session, picks: Record<string, string[]>) {
    if (!session.script) return;
    const meta = await this.assemble.suggestTitleDescription({
      scriptLabel: session.script.label,
      scriptIdea: session.script.idea,
      scriptCategory: session.script.category,
      picksSummary: this.picksSummaryText(session, picks),
    });
    session.titleVariants = meta.titles;
    session.descriptionVariants = meta.descriptions;
    if (meta.titles[0]) session.title = meta.titles[0];
    if (meta.descriptions[0]) session.description = meta.descriptions[0];
  }
}
