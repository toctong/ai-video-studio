import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';

export type AssembleCatalogItem = {
  id: string;
  label: string;
  category: string;
  tags?: string[];
  blurb: string;
};

export type AssembleSuggestInput = {
  scriptLabel: string;
  scriptIdea: string;
  scriptCategory?: string;
  tags?: string[];
  model?: string;
  catalogs: Record<string, AssembleCatalogItem[]>;
};

export type AssemblePick = { id: string; reason: string };

export type AssembleSuggestEvent =
  | { type: 'status'; message: string; progress?: number; stage?: string }
  | { type: 'delta'; text: string }
  | { type: 'group'; kind: string; count: number; picks?: AssemblePick[] }
  | { type: 'done'; groups: Record<string, AssemblePick[]>; source: 'ai' | 'fallback' }
  | { type: 'error'; message: string };

const KIND_LABEL: Record<string, string> = {
  lore: '世界观/设定',
  character: '人物',
  pacing: '叙事节奏',
  trope: '桥段',
  dialogue: '台词风格',
  hook: '开篇钩子',
  style: '画面风格',
  title: '标题简介',
};

@Injectable()
export class AssembleService {
  private readonly logger = new Logger(AssembleService.name);

  constructor(private readonly ai: AiProviderService) {}

  private async assembleModel(preferred?: string) {
    return this.ai.resolveAssembleChatModel(preferred);
  }

  async suggest(input: AssembleSuggestInput) {
    const prepared = this.prepare(input);
    try {
      const raw = await this.ai.chat(
        [
          { role: 'system', content: prepared.system },
          { role: 'user', content: prepared.user },
        ],
        await this.assembleModel(input.model),
        { temperature: 0.45, maxTokens: 900 },
      );
      const fromNdjson = this.parseNdjsonGroups(raw, prepared.kinds, input.catalogs || {});
      const fromObject = this.parseGroups(raw, prepared.kinds, input.catalogs || {});
      const groups: Record<string, AssemblePick[]> = {};
      for (const kind of prepared.kinds) {
        groups[kind] =
          fromNdjson[kind]?.length
            ? fromNdjson[kind]
            : fromObject[kind] || this.fallbackPicks((input.catalogs || {})[kind] || []);
      }
      return { groups, source: 'ai' as const };
    } catch (e: any) {
      this.logger.warn(`assemble suggest AI failed: ${e?.message || e}`);
      return {
        groups: this.fallbackGroups(prepared.kinds, input.catalogs || {}),
        source: 'fallback' as const,
      };
    }
  }

  /** SSE：分阶段进度 + AI 流式输出，便于前端展示走到哪一步 */
  async suggestStream(
    input: AssembleSuggestInput,
    emit: (ev: AssembleSuggestEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    const send = async (ev: AssembleSuggestEvent) => {
      if (signal?.aborted) return;
      await emit(ev);
    };

    try {
      await send({ type: 'status', stage: 'idea', message: '正在读取灵感与标签…', progress: 8 });
      const prepared = this.prepare(input);
      await send({
        type: 'status',
        stage: 'catalog',
        message: `正在汇总 ${prepared.kinds.length} 组候选积木…`,
        progress: 18,
      });
      await send({
        type: 'status',
        stage: 'prompt',
        message: '正在组织关联推荐提示词…',
        progress: 28,
      });
      await send({
        type: 'status',
        stage: 'ai',
        message: 'AI 正在匹配设定 / 人物 / 节奏 / 桥段…',
        progress: 36,
      });

      let raw = '';
      let progress = 36;
      let lastStatusAt = 0;
      let lineScanFrom = 0;
      const emittedKinds = new Set<string>();
      const partialGroups: Record<string, AssemblePick[]> = {};
      try {
        raw = await this.ai.chatStream(
          [
            { role: 'system', content: prepared.system },
            { role: 'user', content: prepared.user },
          ],
          {
            model: await this.assembleModel(input.model),
            signal,
            temperature: 0.45,
            maxTokens: 900,
            onDelta: async (text) => {
              raw += text;
              void send({ type: 'delta', text });
              progress = Math.min(82, progress + Math.max(0.15, text.length * 0.04));
              const now = Date.now();
              if (now - lastStatusAt > 450) {
                lastStatusAt = now;
                void send({
                  type: 'status',
                  stage: 'ai',
                  message: 'AI 正在匹配积木组合…',
                  progress: Math.floor(progress),
                });
              }

              // 优先：逐行 NDJSON（一组一行，可真正流式出卡）
              const lineHits = this.consumeNdjsonKindLines(
                raw,
                lineScanFrom,
                prepared.kinds,
                input.catalogs || {},
                emittedKinds,
              );
              lineScanFrom = lineHits.nextFrom;
              for (const hit of lineHits.items) {
                partialGroups[hit.kind] = hit.picks;
                emittedKinds.add(hit.kind);
                await send({
                  type: 'group',
                  kind: hit.kind,
                  count: hit.picks.length,
                  picks: hit.picks,
                });
                await send({
                  type: 'status',
                  stage: 'ai',
                  message: `已匹配「${KIND_LABEL[hit.kind] || hit.kind}」${hit.picks.length} 条`,
                  progress: Math.min(82, 40 + emittedKinds.size * 5),
                });
              }

              // 兼容：模型仍吐大 JSON 时，按键闭合解析
              for (const kind of prepared.kinds) {
                if (emittedKinds.has(kind)) continue;
                const picks = this.tryParseKindFromPartial(raw, kind, input.catalogs || {});
                if (!picks?.length) continue;
                partialGroups[kind] = picks;
                emittedKinds.add(kind);
                await send({
                  type: 'group',
                  kind,
                  count: picks.length,
                  picks,
                });
                await send({
                  type: 'status',
                  stage: 'ai',
                  message: `已匹配「${KIND_LABEL[kind] || kind}」${picks.length} 条`,
                  progress: Math.min(82, 40 + emittedKinds.size * 5),
                });
              }
            },
          },
        );
      } catch (e: any) {
        if (signal?.aborted || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') {
          await send({ type: 'error', message: '已取消关联推荐' });
          return;
        }
        this.logger.warn(`assemble suggestStream AI failed: ${e?.message || e}`);
        const groups = this.fallbackGroups(prepared.kinds, input.catalogs || {});
        await send({
          type: 'status',
          stage: 'fallback',
          message: 'AI 暂不可用，改用本地标签相近推荐…',
          progress: 90,
        });
        for (const kind of prepared.kinds) {
          await send({
            type: 'group',
            kind,
            count: groups[kind]?.length || 0,
            picks: groups[kind],
          });
        }
        await send({ type: 'done', groups, source: 'fallback' });
        return;
      }

      await send({
        type: 'status',
        stage: 'parse',
        message: '正在校验推荐结果…',
        progress: 88,
      });
      const fromNdjson = this.parseNdjsonGroups(raw, prepared.kinds, input.catalogs || {});
      const fromObject = this.parseGroups(raw, prepared.kinds, input.catalogs || {});
      const parsed: Record<string, AssemblePick[]> = {};
      for (const kind of prepared.kinds) {
        parsed[kind] =
          partialGroups[kind]?.length
            ? partialGroups[kind]
            : fromNdjson[kind]?.length
              ? fromNdjson[kind]
              : fromObject[kind] || this.fallbackPicks((input.catalogs || {})[kind] || []);
      }
      for (const kind of prepared.kinds) {
        const picks = parsed[kind] || [];
        if (!emittedKinds.has(kind)) {
          await send({ type: 'group', kind, count: picks.length, picks });
          await send({
            type: 'status',
            stage: 'parse',
            message: `已确认「${KIND_LABEL[kind] || kind}」${picks.length} 条`,
            progress: Math.min(98, 88 + prepared.kinds.indexOf(kind) + 1),
          });
        }
      }
      await send({
        type: 'status',
        stage: 'done',
        message: '关联推荐完成',
        progress: 100,
      });
      await send({ type: 'done', groups: parsed, source: 'ai' });
    } catch (e: any) {
      if (signal?.aborted) {
        await send({ type: 'error', message: '已取消关联推荐' });
        return;
      }
      this.logger.warn(`assemble suggestStream failed: ${e?.message || e}`);
      await send({
        type: 'error',
        message: e?.message || '关联推荐失败',
      });
    }
  }

  private prepare(input: AssembleSuggestInput) {
    const catalogs = input.catalogs || {};
    const preferred = ['lore', 'character', 'pacing', 'trope', 'dialogue', 'hook', 'style', 'title'];
    const kinds = [
      ...preferred.filter((k) => (catalogs[k] || []).length > 0),
      ...Object.keys(catalogs).filter((k) => !preferred.includes(k) && (catalogs[k] || []).length > 0),
    ];
    if (!kinds.length) {
      throw new BadRequestException('候选库为空');
    }
    if (!String(input.scriptIdea || '').trim()) {
      throw new BadRequestException('请先选择灵感');
    }

    const catalogText = kinds
      .map((kind) => {
        // 每组最多 6 条、短 blurb：上下文过大时首 token 极慢
        const rows = (catalogs[kind] || []).slice(0, 6);
        const lines = rows
          .map(
            (r) =>
              `- ${r.id}|${r.label}|${(r.tags || []).slice(0, 2).join(',') || '-'}|${String(r.blurb || '').slice(0, 22)}`,
          )
          .join('\n');
        return `### ${kind}\n${lines}`;
      })
      .join('\n\n');

    const system = [
      '网文策划。从候选 id 挑最搭积木（男主视角）。禁止编造 id。',
      '必须按给定顺序，逐行输出：每行一个完整 JSON，不要包成大对象，不要 Markdown。',
      '行格式：{"kind":"lore","picks":[{"id":"...","reason":"..."}]}',
      '每组 picks 2～3 个，reason≤12字。',
      `顺序（一行一种）：${kinds.join(' → ')}`,
    ].join('\n');

    const user = [
      `灵感：${input.scriptLabel}`,
      `题材：${input.scriptCategory || '未标注'}`,
      `标签：${(input.tags || []).slice(0, 8).join('、') || '无'}`,
      `创意：\n${String(input.scriptIdea).slice(0, 600)}`,
      '',
      '候选：',
      catalogText,
      '',
      `请按 ${kinds.join(' → ')} 逐行输出，先完成一行再写下一行。`,
    ].join('\n');

    return { kinds, system, user };
  }

  private consumeNdjsonKindLines(
    raw: string,
    from: number,
    kinds: string[],
    catalogs: Record<string, AssembleCatalogItem[]>,
    emitted: Set<string>,
  ): { nextFrom: number; items: Array<{ kind: string; picks: AssemblePick[] }> } {
    const kindSet = new Set(kinds);
    const items: Array<{ kind: string; picks: AssemblePick[] }> = [];
    const text = String(raw || '');
    const slice = text.slice(from);
    const lastNl = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('\r'));
    if (lastNl < 0) return { nextFrom: from, items };
    const completeRegion = slice.slice(0, lastNl + 1);
    const nextFrom = from + lastNl + 1;
    for (const line of completeRegion.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('```')) continue;
      const obj = this.tryParseNdjsonKindLine(trimmed, kindSet, catalogs);
      if (!obj || emitted.has(obj.kind) || items.some((x) => x.kind === obj.kind)) continue;
      items.push(obj);
    }
    return { nextFrom, items };
  }

  private tryParseNdjsonKindLine(
    line: string,
    kindSet: Set<string>,
    catalogs: Record<string, AssembleCatalogItem[]>,
  ): { kind: string; picks: AssemblePick[] } | null {
    let text = line.trim();
    if (text.startsWith('```')) return null;
    // 容忍行首杂音：…{"kind":...
    const brace = text.indexOf('{');
    if (brace > 0) text = text.slice(brace);
    if (!text.startsWith('{')) return null;
    try {
      const data = JSON.parse(text);
      const kind = String(data?.kind || '').trim();
      if (!kind || !kindSet.has(kind)) return null;
      const rows = Array.isArray(data?.picks)
        ? data.picks
        : Array.isArray(data?.items)
          ? data.items
          : [];
      const allowed = new Set((catalogs[kind] || []).map((x) => x.id));
      const picks: AssemblePick[] = [];
      for (const row of rows) {
        const id = String(row?.id || '').trim();
        if (!id || !allowed.has(id)) continue;
        if (picks.some((p) => p.id === id)) continue;
        picks.push({
          id,
          reason: String(row?.reason || '题材相关').slice(0, 40),
        });
        if (picks.length >= 6) break;
      }
      return picks.length ? { kind, picks } : null;
    } catch {
      return null;
    }
  }

  private parseNdjsonGroups(
    raw: string,
    kinds: string[],
    catalogs: Record<string, AssembleCatalogItem[]>,
  ): Record<string, AssemblePick[]> {
    const kindSet = new Set(kinds);
    const out: Record<string, AssemblePick[]> = {};
    for (const line of String(raw || '').split(/\r?\n/)) {
      const hit = this.tryParseNdjsonKindLine(line, kindSet, catalogs);
      if (!hit || out[hit.kind]?.length) continue;
      out[hit.kind] = hit.picks;
    }
    return out;
  }

  private tryParseKindFromPartial(
    raw: string,
    kind: string,
    catalogs: Record<string, AssembleCatalogItem[]>,
  ): AssemblePick[] | null {
    const key = `"${kind}"`;
    const idx = String(raw || '').indexOf(key);
    if (idx < 0) return null;
    const colon = raw.indexOf(':', idx + key.length);
    if (colon < 0) return null;
    let i = colon + 1;
    while (i < raw.length && /\s/.test(raw[i]!)) i++;
    if (raw[i] !== '[') return null;
    const start = i;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (; i < raw.length; i++) {
      const ch = raw[i]!;
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          try {
            const rows = JSON.parse(raw.slice(start, i + 1));
            if (!Array.isArray(rows) || !rows.length) return null;
            const allowed = new Set((catalogs[kind] || []).map((x) => x.id));
            const picks: AssemblePick[] = [];
            for (const row of rows) {
              const id = String(row?.id || '').trim();
              if (!id || !allowed.has(id)) continue;
              if (picks.some((p) => p.id === id)) continue;
              picks.push({
                id,
                reason: String(row?.reason || '题材相关').slice(0, 40),
              });
              if (picks.length >= 6) break;
            }
            return picks.length ? picks : null;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  private parseGroups(
    raw: string,
    kinds: string[],
    catalogs: Record<string, AssembleCatalogItem[]>,
  ): Record<string, AssemblePick[]> {
    const jsonText = this.extractJson(raw);
    let data: any;
    try {
      data = JSON.parse(jsonText);
    } catch {
      return this.fallbackGroups(kinds, catalogs);
    }
    const groupsIn = data?.groups || data || {};
    const out: Record<string, AssemblePick[]> = {};
    for (const kind of kinds) {
      const allowed = new Set((catalogs[kind] || []).map((x) => x.id));
      const rows = Array.isArray(groupsIn[kind]) ? groupsIn[kind] : [];
      const picks: AssemblePick[] = [];
      for (const row of rows) {
        const id = String(row?.id || '').trim();
        if (!id || !allowed.has(id)) continue;
        if (picks.some((p) => p.id === id)) continue;
        picks.push({
          id,
          reason: String(row?.reason || '题材相关').slice(0, 40),
        });
        if (picks.length >= 6) break;
      }
      out[kind] = picks.length ? picks : this.fallbackPicks(catalogs[kind] || []);
    }
    return out;
  }

  private extractJson(raw: string) {
    const text = String(raw || '').trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) return fence[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return text.slice(start, end + 1);
    return text;
  }

  private fallbackGroups(
    kinds: string[],
    catalogs: Record<string, AssembleCatalogItem[]>,
  ): Record<string, AssemblePick[]> {
    const out: Record<string, AssemblePick[]> = {};
    for (const kind of kinds) {
      out[kind] = this.fallbackPicks(catalogs[kind] || []);
    }
    return out;
  }

  private fallbackPicks(items: AssembleCatalogItem[]): AssemblePick[] {
    return items.slice(0, 5).map((x) => ({
      id: x.id,
      reason: '按标签相近推荐',
    }));
  }

  /**
   * AI 在本地候选之外再发明一批积木。
   * 各组并行短请求：避免「只出到设定就超时」，人物/节奏/桥段也能拿到暖色卡。
   */
  async expandBlocks(
    input: {
      scriptLabel: string;
      scriptIdea: string;
      scriptCategory?: string;
      tags?: string[];
      catalogs: Record<string, AssembleCatalogItem[]>;
      model?: string;
    },
    opts?: {
      signal?: AbortSignal;
      timeoutMs?: number;
      onKind?: (
        kind: string,
        items: Array<AssembleCatalogItem & { preview?: string }>,
      ) => void | Promise<void>;
    },
  ): Promise<{
    items: Record<string, Array<AssembleCatalogItem & { preview?: string }>>;
    source: 'ai' | 'fallback';
  }> {
    if (!String(input.scriptIdea || '').trim()) {
      return { items: {}, source: 'fallback' };
    }

    const expandKinds = ['lore', 'character', 'pacing', 'trope', 'hook'];
    const wallMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : 28000;
    const perKindMs = Math.min(12000, Math.max(8000, Math.floor(wallMs / 2)));
    const model = await this.assembleModel(input.model);
    const out: Record<string, Array<AssembleCatalogItem & { preview?: string }>> = {};

    const wallAc = new AbortController();
    const onParentAbort = () => wallAc.abort();
    opts?.signal?.addEventListener('abort', onParentAbort, { once: true });
    const wallTimer = setTimeout(() => wallAc.abort(), wallMs);

    const runKind = async (kind: string) => {
      if (wallAc.signal.aborted || opts?.signal?.aborted) return;
      try {
        const items = await this.expandOneKind(kind, input, model, perKindMs, wallAc.signal);
        if (!items.length || wallAc.signal.aborted) return;
        out[kind] = items;
        await opts?.onKind?.(kind, items);
      } catch (e: any) {
        if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
        this.logger.warn(`assemble expand ${kind} failed: ${e?.message || e}`);
      }
    };

    try {
      // 每次 2 组，降低网关限流导致「全军覆没」
      for (let i = 0; i < expandKinds.length; i += 2) {
        if (wallAc.signal.aborted || opts?.signal?.aborted) break;
        await Promise.all(expandKinds.slice(i, i + 2).map((kind) => runKind(kind)));
      }
      if (Object.keys(out).length) {
        return { items: out, source: 'ai' };
      }
      // 模型不通时仍给暖色卡，避免界面「只有本地」
      const invented = this.inventHeuristicExpand(input, expandKinds);
      for (const kind of expandKinds) {
        if (!invented[kind]?.length) continue;
        out[kind] = invented[kind];
        await opts?.onKind?.(kind, invented[kind]);
      }
      return { items: out, source: Object.keys(out).length ? 'ai' : 'fallback' };
    } finally {
      clearTimeout(wallTimer);
      opts?.signal?.removeEventListener('abort', onParentAbort);
    }
  }

  /** 模型失败时的保底暖色卡（按灵感衍生，仍标 AI 扩充） */
  private inventHeuristicExpand(
    input: {
      scriptLabel: string;
      scriptIdea: string;
      scriptCategory?: string;
      catalogs: Record<string, AssembleCatalogItem[]>;
    },
    kinds: string[],
  ): Record<string, Array<AssembleCatalogItem & { preview?: string }>> {
    const seed = String(input.scriptLabel || '本故事').trim().slice(0, 10) || '本故事';
    const tip = String(input.scriptIdea || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 36);
    const cat = String(input.scriptCategory || '网文').trim() || '网文';
    const catalogs = input.catalogs || {};
    const templates: Record<string, Array<{ label: string; blurb: string; preview: string }>> = {
      lore: [
        { label: `${seed}·隐藏规则`, blurb: '世界观暗线约束', preview: tip || `${cat}向长线设定` },
        { label: `${seed}·资源循环`, blurb: '可升级的核心资源', preview: tip || '支撑连载升级感' },
      ],
      character: [
        { label: `${seed}搭档`, blurb: '互补型重要配角', preview: tip || '推动主线的关键人物' },
        { label: `${seed}对手`, blurb: '阶段性强压对手', preview: tip || '制造冲突与打脸点' },
      ],
      pacing: [
        { label: '小高潮快切', blurb: '短节拍连打', preview: '章节内快速兑现爽点' },
        { label: '卷末翻盘', blurb: '长线压后爆', preview: '卷末信息差集中爆发' },
      ],
      trope: [
        { label: '身份反转', blurb: '认知颠覆桥段', preview: tip || '读者预期被当场改写' },
        { label: '当众打脸', blurb: '高光冲突桥段', preview: tip || '围观压力下翻盘' },
      ],
      hook: [
        { label: '开局绝境', blurb: '三章内立危机', preview: tip || '立刻抓住追读欲' },
        { label: '金手指预告', blurb: '能力轮廓先露', preview: tip || '暗示成长上限' },
      ],
    };
    const out: Record<string, Array<AssembleCatalogItem & { preview?: string }>> = {};
    for (const kind of kinds) {
      const rows = templates[kind] || [
        { label: `${seed}·新想法`, blurb: '灵感衍生积木', preview: tip || cat },
        { label: `${seed}·变奏`, blurb: '同题材变体', preview: tip || cat },
      ];
      const existing = new Set((catalogs[kind] || []).map((x) => x.label));
      const list: Array<AssembleCatalogItem & { preview?: string }> = [];
      for (let i = 0; i < rows.length && list.length < 2; i++) {
        const row = rows[i]!;
        if (existing.has(row.label)) continue;
        list.push({
          id: `ai-${kind}-local-${Date.now().toString(36)}-${i}`,
          label: row.label,
          category: 'AI扩充',
          tags: ['AI扩充', '衍生'],
          blurb: row.blurb,
          preview: row.preview,
        });
      }
      if (list.length) out[kind] = list;
    }
    return out;
  }

  private async expandOneKind(
    kind: string,
    input: {
      scriptLabel: string;
      scriptIdea: string;
      scriptCategory?: string;
      tags?: string[];
      catalogs: Record<string, AssembleCatalogItem[]>;
    },
    model: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Array<AssembleCatalogItem & { preview?: string }>> {
    const catalogs = input.catalogs || {};
    const existing = (catalogs[kind] || [])
      .slice(0, 5)
      .map((x) => x.label)
      .join('、');
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const raw = await this.ai.chat(
        [
          {
            role: 'system',
            content: [
              `网文策划。只为「${KIND_LABEL[kind] || kind}」发明 2 条可勾选积木。`,
              '勿与已有重名。只输出 JSON 数组：[{"label":"...","blurb":"...","preview":"..."}]',
              'blurb≤20字，preview≤32字。不要 Markdown。',
            ].join(''),
          },
          {
            role: 'user',
            content: [
              `灵感：${input.scriptLabel}`,
              `题材：${input.scriptCategory || '未标注'}`,
              `标签：${(input.tags || []).slice(0, 6).join('、') || '无'}`,
              `创意：${String(input.scriptIdea).slice(0, 220)}`,
              `已有${KIND_LABEL[kind] || kind}：${existing || '空'}`,
              '输出 2 条。',
            ].join('\n'),
          },
        ],
        model,
        { temperature: 0.7, maxTokens: 220, signal: ac.signal, timeoutMs },
      );
      return this.parseExpandKindArray(raw, kind);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private parseExpandKindArray(
    raw: string,
    kind: string,
  ): Array<AssembleCatalogItem & { preview?: string }> {
    const list: Array<AssembleCatalogItem & { preview?: string }> = [];
    try {
      let text = this.extractJson(raw);
      // 容忍模型包成 {"items":[...]} / {"picks":[...]}
      let data: any = JSON.parse(text);
      if (!Array.isArray(data)) {
        data = data?.items || data?.picks || data?.[kind] || [];
      }
      if (!Array.isArray(data)) return list;
      for (let i = 0; i < data.length && list.length < 2; i++) {
        const row = data[i];
        const label = String(row?.label || '').trim();
        if (!label) continue;
        list.push({
          id: `ai-${kind}-${Date.now().toString(36)}-${i}`,
          label,
          category: 'AI扩充',
          tags: Array.isArray(row?.tags)
            ? row.tags.map((t: unknown) => String(t)).filter(Boolean).slice(0, 3)
            : ['AI扩充'],
          blurb: String(row?.blurb || label).trim().slice(0, 28),
          preview: String(row?.preview || row?.blurb || '').trim().slice(0, 48),
        });
      }
    } catch {
      /* ignore */
    }
    return list;
  }

  /**
   * 草案优先：本地/AI 关联 +（可选）AI 扩充，一次返回可预选拼装包。
   */
  async composeDraft(
    input: AssembleSuggestInput & { withExpand?: boolean },
  ): Promise<{
    groups: Record<string, AssemblePick[]>;
    expanded: Record<string, Array<AssembleCatalogItem & { preview?: string }>>;
    source: 'ai' | 'fallback';
    expandSource: 'ai' | 'fallback';
  }> {
    const withExpand = input.withExpand !== false;
    const suggestPromise = this.suggest(input);
    const expandPromise =
      withExpand && String(input.scriptIdea || '').trim()
        ? this.expandBlocks({
            scriptLabel: input.scriptLabel,
            scriptIdea: input.scriptIdea,
            scriptCategory: input.scriptCategory,
            tags: input.tags,
            catalogs: input.catalogs,
            model: input.model,
          })
        : Promise.resolve({ items: {}, source: 'fallback' as const });

    const [suggest, exp] = await Promise.all([suggestPromise, expandPromise]);
    return {
      groups: suggest.groups,
      expanded: exp.items || {},
      source: suggest.source,
      expandSource: exp.source,
    };
  }

  /**
   * AI 联想书名与简介（多候选）。
   * 参考 Fiction /naming、AI-Book-Generator variants、七猫/番茄卖点句式。
   */
  async suggestTitleDescription(input: {
    scriptLabel: string;
    scriptIdea: string;
    scriptCategory?: string;
    picksSummary?: string;
    model?: string;
  }): Promise<{ titles: string[]; descriptions: string[]; source: 'ai' | 'fallback' }> {
    const fallback = {
      titles: [String(input.scriptLabel || '未命名').trim() || '未命名'].filter(Boolean),
      descriptions: [String(input.scriptIdea || '').trim().slice(0, 280)].filter(Boolean),
      source: 'fallback' as const,
    };
    if (!String(input.scriptIdea || input.scriptLabel || '').trim()) return fallback;

    const system = [
      '你是番茄/起点头部书城的书名与简介操盘手，专写「一眼想点进去」的长篇网文包装。',
      '只输出合法 JSON：{"titles":["..."],"descriptions":["..."]}，不要 Markdown。',
      '书名 4 条：4～16 字；要有气势与记忆点（身份反差、数字悬念、狠词、格局感）；禁书名号与堆砌标点；风格拉开（狠/悬/爽/格局各有）。',
      '简介 4 条：每条 90～160 字。结构必须完整大气：',
      '①开场立住男主是谁+当下危局；②金手指/手段一亮；③对手或时代压力抬高；④一句悬念钩子收尾。',
      '文风：平台爆款感、镜头感、冲突感；口语有力但不水；禁止「在这个世界」「开启了新的篇章」等空泛 AI 腔。',
      '要把已选积木融进同一条卖点线，不要罗列名词。',
    ].join('\n');

    const user = [
      `题材：${input.scriptCategory || '未标注'}`,
      `灵感：${input.scriptLabel}`,
      `创意：\n${String(input.scriptIdea).slice(0, 900)}`,
      input.picksSummary ? `已选积木：\n${String(input.picksSummary).slice(0, 800)}` : '',
      '请给可直接上架的书名与简介候选，格局要大、冲突要硬。',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const raw = await this.ai.chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        await this.assembleModel(input.model),
        { temperature: 0.85, maxTokens: 1400, timeoutMs: 25000 },
      );
      const data = JSON.parse(this.extractJson(raw));
      const titles = (Array.isArray(data?.titles) ? data.titles : [])
        .map((x: unknown) => String(x || '').trim().replace(/[《》「」""']/g, ''))
        .filter(Boolean)
        .slice(0, 4);
      const descriptions = (Array.isArray(data?.descriptions) ? data.descriptions : [])
        .map((x: unknown) => String(x || '').trim())
        .filter(Boolean)
        .slice(0, 4);
      if (!titles.length && !descriptions.length) return fallback;
      return {
        titles: titles.length ? titles : fallback.titles,
        descriptions: descriptions.length ? descriptions : fallback.descriptions,
        source: 'ai',
      };
    } catch (e: any) {
      this.logger.warn(`assemble suggest-meta failed: ${e?.message || e}`);
      return fallback;
    }
  }
}
