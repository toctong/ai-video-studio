import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiProviderService } from './ai-provider.service';

const SURFACE = 'agent';
const CATALOG_ID = 'https://a2ui.org/specification/v0_9/basic_catalog.json';

export type AgentA2uiEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'status'; message: string; stage?: string }
  | { type: 'delta'; text: string }
  | { type: 'a2ui'; messages: Record<string, unknown>[]; patch?: boolean }
  | {
      type: 'done';
      result?: {
        reply?: string;
        done?: boolean;
        payload?: unknown;
      };
    }
  | { type: 'error'; message: string };

export type AgentA2uiRequest = {
  sessionId?: string;
  action?: string;
  message?: string;
  system?: string;
  skillId?: string;
  skillLabel?: string;
  canvasSummary?: string;
  model?: string;
  context?: Record<string, unknown>;
  dataModel?: Record<string, unknown>;
};

type FormFieldOption = { id: string; label: string; description?: string };
type FormField = {
  id: string;
  type: 'choice' | 'text' | string;
  label: string;
  options?: FormFieldOption[];
  multiple?: boolean;
  multiline?: boolean;
  placeholder?: string;
};
type FormAction = { id: string; label: string; primary?: boolean };
type FormIntent = {
  title?: string;
  fields?: FormField[];
  actions?: FormAction[];
};
type AgentIntent = {
  reply?: string;
  form?: FormIntent | null;
  done?: boolean;
  result?: unknown;
};

type HistoryTurn = { role: 'user' | 'assistant'; content: string };

type Session = {
  id: string;
  system: string;
  skillId: string;
  skillLabel: string;
  canvasSummary: string;
  model?: string;
  history: HistoryTurn[];
  lastFormValues: Record<string, unknown>;
  touchedAt: number;
};

@Injectable()
export class AgentA2uiService {
  private readonly logger = new Logger(AgentA2uiService.name);
  private readonly sessions = new Map<string, Session>();
  private static readonly SESSION_TTL_MS = 2 * 60 * 60 * 1000;

  constructor(private readonly ai: AiProviderService) {}

  private pruneSessions() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - (s.touchedAt || 0) > AgentA2uiService.SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  private touch(session: Session) {
    session.touchedAt = Date.now();
  }

  async handle(
    body: AgentA2uiRequest,
    emit: (ev: AgentA2uiEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ) {
    const send = async (ev: AgentA2uiEvent) => {
      if (signal?.aborted) return;
      await emit(ev);
    };

    try {
      this.pruneSessions();
      const action = String(body.action || 'start').trim() || 'start';
      let session = body.sessionId ? this.sessions.get(body.sessionId) : undefined;

      if (action === 'start' || !session) {
        session = this.createSession(body);
        this.sessions.set(session.id, session);
        this.touch(session);
        await send({ type: 'session', sessionId: session.id });

        const userMsg = String(body.message || '').trim();
        if (!userMsg) {
          await send({ type: 'error', message: '请先描述任务' });
          return;
        }
        await send({ type: 'status', message: '正在理解任务…', stage: 'understand' });
        await this.runTurn(session, userMsg, send, signal);
        return;
      }

      this.touch(session);
      if (body.system) session.system = String(body.system);
      if (body.canvasSummary) session.canvasSummary = String(body.canvasSummary);
      if (body.model) session.model = String(body.model);

      const dataModel = (body.dataModel || {}) as Record<string, unknown>;
      const context = (body.context || {}) as Record<string, unknown>;
      const values = this.flattenFormValues(dataModel, context);
      session.lastFormValues = { ...session.lastFormValues, ...values };

      const actionId = String(context.actionId || body.action || 'submit').trim();
      const actionLabel = String(context.actionLabel || actionId);
      const summary = this.summarizeSubmission(actionId, actionLabel, values);
      await send({ type: 'status', message: '正在根据表单继续…', stage: 'continue' });
      await this.runTurn(session, summary, send, signal);
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED' || signal?.aborted) {
        await send({ type: 'error', message: '已取消' });
        return;
      }
      this.logger.warn(`agent/a2ui failed: ${e?.message || e}`);
      await send({
        type: 'error',
        message: String(e?.message || e?.response?.data?.message || 'Agent 失败'),
      });
    }
  }

  private createSession(body: AgentA2uiRequest): Session {
    return {
      id: randomUUID(),
      system: String(body.system || '').trim(),
      skillId: String(body.skillId || '').trim(),
      skillLabel: String(body.skillLabel || '').trim(),
      canvasSummary: String(body.canvasSummary || '').trim(),
      model: body.model ? String(body.model) : undefined,
      history: [],
      lastFormValues: {},
      touchedAt: Date.now(),
    };
  }

  private async runTurn(
    session: Session,
    userContent: string,
    send: (ev: AgentA2uiEvent) => Promise<void>,
    signal?: AbortSignal,
  ) {
    session.history.push({ role: 'user', content: userContent });

    await send({ type: 'status', message: '正在生成表单意图…', stage: 'generate' });
    let intent = await this.callIntent(session, signal);
    if (!intent) {
      intent = await this.callIntent(session, signal, true);
    }

    if (!intent) {
      const fallback =
        '抱歉，这次没能解析出结构化表单。请再描述一次需求，或换个说法试试。';
      await send({ type: 'delta', text: fallback });
      session.history.push({ role: 'assistant', content: fallback });
      await send({ type: 'done', result: { reply: fallback, done: false } });
      return;
    }

    const reply = String(intent.reply || '').trim();
    if (reply) {
      await send({ type: 'delta', text: reply });
    }

    const form = intent.form;
    const hasForm =
      !!form &&
      ((Array.isArray(form.fields) && form.fields.length > 0) ||
        (Array.isArray(form.actions) && form.actions.length > 0));

    if (hasForm && form) {
      const messages = this.compileFormIntentToA2ui(form, session.id);
      await send({ type: 'a2ui', messages });
      session.history.push({
        role: 'assistant',
        content: JSON.stringify({
          reply,
          form: { title: form.title, fields: form.fields?.map((f) => f.id), actions: form.actions?.map((a) => a.id) },
          done: false,
        }),
      });
      await send({
        type: 'done',
        result: { reply, done: false },
      });
      return;
    }

    const done = intent.done !== false;
    session.history.push({
      role: 'assistant',
      content: JSON.stringify({ reply, done, result: intent.result ?? null }),
    });
    await send({
      type: 'done',
      result: {
        reply,
        done,
        payload: intent.result ?? null,
      },
    });
  }

  private async callIntent(
    session: Session,
    signal?: AbortSignal,
    retry = false,
  ): Promise<AgentIntent | null> {
    const system = this.buildSystemPrompt(session, retry);
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: system },
      ...session.history.map((h) => ({ role: h.role, content: h.content })),
    ];

    try {
      const raw = await this.ai.chat(messages, session.model, {
        temperature: 0.4,
        maxTokens: 4096,
        signal,
      });
      return this.parseIntent(String(raw || ''));
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') throw e;
      this.logger.warn(`intent chat failed: ${e?.message || e}`);
      return null;
    }
  }

  private buildSystemPrompt(session: Session, retry: boolean): string {
    const lines: string[] = [
      '你是工作室画布上的 Agent 智能体。根据用户任务与技能说明，返回「表单意图 JSON」，由服务端编译为交互表单。',
      '只输出一个 JSON 对象，不要 Markdown 代码块，不要其它说明文字。',
      'JSON 形状：',
      '{"reply":"简短说明","form":{"title":"...","fields":[{"id":"genre","type":"choice","label":"题材","options":[{"id":"x","label":"…"}],"multiple":false},{"id":"brief","type":"text","label":"一句话梗概","multiline":true}],"actions":[{"id":"submit","label":"继续","primary":true},{"id":"skip","label":"跳过"}]},"done":false,"result":null}',
      '规则：',
      '- fields[].type 仅用 choice 或 text；choice 必须带 options（id+label）。',
      '- 任务未完成时提供 form，并设 done=false。',
      '- 任务已完成（可交付结果）时 form 可为 null，done=true；若需要在画布落点，result 使用：',
      '{"createNodes":[{"type":"ai.video"|"ai.image","prompt":"可直接用于生成的中文提示词","durationSec":5,"label":"可选节点名"}]}',
      '- 视频类技能完成时优先 type=ai.video；图片类用 ai.image；纯问答可不带 createNodes。',
      '- reply 用中文，一两句即可；createNodes[].prompt 要具体可生成，不要只写“将为你生成”。',
      '- 表单字段服务于当前技能目标，不要无关问卷。',
    ];

    if (retry) {
      lines.push('上一轮 JSON 解析失败。请严格只输出合法 JSON，字段名用双引号。');
    }

    if (session.skillLabel || session.skillId) {
      lines.push(
        `当前技能：${session.skillLabel || session.skillId}${session.skillId ? `（id=${session.skillId}）` : ''}`,
      );
    }
    if (session.system) {
      lines.push('【技能说明 / 系统约束】', session.system);
    }
    if (session.canvasSummary) {
      lines.push('【画布摘要】', session.canvasSummary);
    }
    if (Object.keys(session.lastFormValues).length) {
      lines.push(
        '【用户已提交的表单值】',
        JSON.stringify(session.lastFormValues, null, 2),
      );
    }
    return lines.join('\n');
  }

  private parseIntent(raw: string): AgentIntent | null {
    const text = String(raw || '').trim();
    if (!text) return null;
    const candidates: string[] = [text];
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) candidates.unshift(fence[1].trim());
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace?.[0]) candidates.push(brace[0]);

    for (const c of candidates) {
      try {
        const obj = JSON.parse(c) as AgentIntent;
        if (obj && typeof obj === 'object') return obj;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  /** 通用编译：表单意图 → A2UI v0.9 消息（无产品步骤写死） */
  compileFormIntentToA2ui(form: FormIntent, sessionId: string): Record<string, unknown>[] {
    const fields = Array.isArray(form.fields) ? form.fields : [];
    const actions =
      Array.isArray(form.actions) && form.actions.length
        ? form.actions
        : [{ id: 'submit', label: '继续', primary: true }];

    const childIds: string[] = [];
    const components: Record<string, unknown>[] = [];
    const data: Record<string, unknown> = { sessionId };

    if (form.title) {
      childIds.push('title');
      components.push({
        id: 'title',
        component: 'Text',
        text: String(form.title),
        variant: 'h4',
      });
    }

    for (const field of fields) {
      const id = String(field.id || '').trim();
      if (!id) continue;
      const fid = `field_${id}`;
      childIds.push(fid);
      const type = String(field.type || 'text').toLowerCase();

      if (type === 'choice') {
        const options = (field.options || [])
          .map((o) => ({
            label: String(o.label || o.id || ''),
            value: String(o.id || o.label || ''),
            description: o.description ? String(o.description) : undefined,
          }))
          .filter((o) => o.label && o.value);
        data[id] = field.multiple ? [] : [];
        components.push({
          id: fid,
          component: 'ChoicePicker',
          variant: field.multiple ? 'multipleSelection' : 'mutuallyExclusive',
          displayStyle: options.some((o) => o.description) ? 'cards' : 'chips',
          filterable: options.length > 8,
          options,
          value: { path: `/${id}` },
          label: String(field.label || id),
        });
      } else {
        data[id] = '';
        const rawPh = field.placeholder != null ? String(field.placeholder).trim() : '';
        const placeholder =
          rawPh && !/please enter a value/i.test(rawPh)
            ? rawPh
            : field.multiline
              ? '选填，可补充额外要求…'
              : '请输入';
        components.push({
          id: fid,
          component: 'TextField',
          label: String(field.label || id),
          value: { path: `/${id}` },
          variant: field.multiline ? 'longText' : 'shortText',
          placeholder,
        });
      }
    }

    const actionChildIds: string[] = [];
    for (const act of actions) {
      const aid = String(act.id || '').trim() || 'submit';
      const btnId = `btn_${aid}`;
      const labelId = `${btnId}_label`;
      actionChildIds.push(btnId);
      components.push({
        id: btnId,
        component: 'Button',
        variant: act.primary ? 'primary' : 'default',
        child: labelId,
        action: {
          event: {
            name: 'agent_form',
            context: {
              actionId: aid,
              actionLabel: String(act.label || aid),
              sessionId,
              ...Object.fromEntries(
                fields
                  .map((f) => String(f.id || '').trim())
                  .filter(Boolean)
                  .map((fid) => [fid, { path: `/${fid}` }]),
              ),
            },
          },
        },
      });
      components.push({
        id: labelId,
        component: 'Text',
        text: String(act.label || aid),
      });
    }

    if (actionChildIds.length) {
      childIds.push('actions');
      components.push({
        id: 'actions',
        component: 'Row',
        children: actionChildIds,
      });
    }

    components.unshift({
      id: 'root',
      component: 'Column',
      children: childIds.length ? childIds : ['actions'],
    });

    return [
      {
        version: 'v0.9',
        createSurface: {
          surfaceId: SURFACE,
          catalogId: CATALOG_ID,
          sendDataModel: true,
        },
      },
      {
        version: 'v0.9',
        updateDataModel: { surfaceId: SURFACE, path: '/', value: data },
      },
      {
        version: 'v0.9',
        updateComponents: { surfaceId: SURFACE, components },
      },
    ];
  }

  private flattenFormValues(
    dataModel: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const skip = new Set(['sessionId', 'actionId', 'actionLabel']);
    for (const src of [dataModel, context]) {
      for (const [k, v] of Object.entries(src || {})) {
        if (skip.has(k)) continue;
        if (v && typeof v === 'object' && !Array.isArray(v) && 'path' in (v as object)) continue;
        out[k] = this.normalizeValue(v);
      }
    }
    return out;
  }

  private normalizeValue(v: unknown): unknown {
    if (Array.isArray(v)) {
      return v.map((x) => {
        if (x && typeof x === 'object' && 'value' in (x as object)) {
          return (x as { value: unknown }).value;
        }
        return x;
      });
    }
    if (v && typeof v === 'object' && 'value' in (v as object)) {
      return (v as { value: unknown }).value;
    }
    return v;
  }

  private summarizeSubmission(
    actionId: string,
    actionLabel: string,
    values: Record<string, unknown>,
  ): string {
    const payload = {
      action: actionId,
      actionLabel,
      values,
    };
    return `用户点击了表单操作「${actionLabel}」（${actionId}），提交值如下：\n${JSON.stringify(payload, null, 2)}\n请根据技能目标继续：若还需信息则再返回 form；若可收尾则 done=true 并给出 reply/result。`;
  }
}
