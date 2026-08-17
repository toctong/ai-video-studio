import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiProviderService } from './ai-provider.service';

export type QuickDraft = {
  title: string;
  description: string;
  styleBrief: string;
};

export type QuickChatResult = {
  sessionId: string;
  reply: string;
  draft: QuickDraft;
  ready: boolean;
  source: 'ai' | 'fallback';
};

type Session = {
  id: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  draft: QuickDraft;
  updatedAt: number;
};

const TTL_MS = 2 * 60 * 60 * 1000;

const SYSTEM_PROMPT = [
  '你是网文开书助手「快速创建」向导。用自然中文对话，帮用户快速凑齐：书名、简介、画面风格。',
  '每次只输出合法 JSON（不要 Markdown）：',
  '{"reply":"对用户说的话（可含多段）","draft":{"title":"","description":"","styleBrief":""},"ready":false}',
  '核心原则：每轮要「给料」而不是「挤牙膏」。用户只说一两个词时，你也要主动补全一整套可开写的草案，再让他改。',
  'reply 要求（务必饱满，约 180～420 字）：',
  '1) 先接住用户意图，用 1～2 句肯定；',
  '2) 直接抛出实质内容：至少 2～3 个书名候选 + 1 段完整简介（90～160 字，含人设危机/金手指/对手压力/悬念）+ 一句画面风格建议；',
  '3) 可用换行分块（书名候选 / 简介草案 / 风格），读起来像一份短提案；',
  '4) 结尾只留一个轻松选择题（例如偏狠还是偏轻松），不要连环追问；',
  '5) 禁止只回一句「不错，那男主是…？」这种干问。',
  'draft 要求：',
  '1) 每轮都尽量把 title / description / styleBrief 写满可直接开写的版本（即使用户话少，也要合理脑补并写进 draft）；',
  '2) 未推翻的字段保留并润色得更大气；用户否定则改写；',
  '3) 简介要有冲突与卖点；书名有记忆点；风格 20～60 字有画面感。',
  'ready：当书名与简介都已较完整时 ready=true，并在 reply 末尾邀请「说创建或点创建按钮」；仍可继续改。',
  '禁止空泛 AI 腔；围绕长篇网文男主主视角。',
].join('\n');

@Injectable()
export class QuickCreateService {
  private readonly logger = new Logger(QuickCreateService.name);
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly ai: AiProviderService) {}

  async chat(input: {
    sessionId?: string;
    message: string;
    model?: string;
  }): Promise<QuickChatResult> {
    const message = String(input.message || '').trim();
    if (!message) {
      return {
        sessionId: input.sessionId || '',
        reply: [
          '丢一句灵感就行，比如「修仙散修轻松文」或「重生都市带系统」。',
          '我会直接给你：书名候选 + 完整简介 + 风格建议，不用一问一答。',
        ].join('\n'),
        draft: emptyDraft(),
        ready: false,
        source: 'fallback',
      };
    }

    this.gc();
    const session = this.getOrCreate(input.sessionId);
    session.messages.push({ role: 'user', content: message });
    session.updatedAt = Date.now();

    const model = await this.ai.resolveAssembleChatModel(input.model);
    try {
      const raw = await this.ai.chat(session.messages, model, {
        temperature: 0.82,
        maxTokens: 1600,
        timeoutMs: 30000,
      });
      const parsed = this.parseModelJson(raw);
      const draft = mergeDraft(session.draft, parsed.draft);
      session.draft = draft;
      const reply =
        parsed.reply ||
        heuristicReply(draft, message);
      session.messages.push({ role: 'assistant', content: reply });
      const ready = parsed.ready === true || isDraftReady(draft);
      return { sessionId: session.id, reply, draft, ready, source: 'ai' };
    } catch (e: any) {
      this.logger.warn(`quick create chat failed: ${e?.message || e}`);
      const draft = heuristicUpdate(session.draft, message);
      session.draft = draft;
      const reply = heuristicReply(draft, message);
      session.messages.push({ role: 'assistant', content: reply });
      return {
        sessionId: session.id,
        reply,
        draft,
        ready: isDraftReady(draft),
        source: 'fallback',
      };
    }
  }

  private getOrCreate(sessionId?: string): Session {
    const id = String(sessionId || '').trim();
    if (id && this.sessions.has(id)) {
      const s = this.sessions.get(id)!;
      s.updatedAt = Date.now();
      return s;
    }
    const created: Session = {
      id: randomUUID(),
      messages: [{ role: 'system', content: SYSTEM_PROMPT }],
      draft: emptyDraft(),
      updatedAt: Date.now(),
    };
    this.sessions.set(created.id, created);
    return created;
  }

  private parseModelJson(raw: string): {
    reply?: string;
    draft?: Partial<QuickDraft>;
    ready?: boolean;
  } {
    const text = String(raw || '').trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence?.[1]?.trim() || text;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    const jsonText = start >= 0 && end > start ? body.slice(start, end + 1) : body;
    try {
      const data = JSON.parse(jsonText);
      return {
        reply: String(data?.reply || '').trim() || undefined,
        draft: data?.draft && typeof data.draft === 'object' ? data.draft : undefined,
        ready: !!data?.ready,
      };
    } catch {
      return { reply: text.slice(0, 1200) };
    }
  }

  private gc() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.updatedAt > TTL_MS) this.sessions.delete(id);
    }
  }
}

function emptyDraft(): QuickDraft {
  return { title: '', description: '', styleBrief: '' };
}

function mergeDraft(prev: QuickDraft, next?: Partial<QuickDraft>): QuickDraft {
  if (!next) return { ...prev };
  const title = String(next.title ?? '').trim();
  const description = String(next.description ?? '').trim();
  const styleBrief = String(next.styleBrief ?? '').trim();
  return {
    title: title || prev.title || '',
    description: description || prev.description || '',
    styleBrief: styleBrief || prev.styleBrief || '',
  };
}

function isDraftReady(d: QuickDraft) {
  return d.title.trim().length >= 2 && d.description.trim().length >= 40;
}

function heuristicUpdate(prev: QuickDraft, message: string): QuickDraft {
  const draft = { ...prev };
  const t = message.trim();
  if (!draft.title) {
    if (/修仙|玄幻|散修/.test(t)) draft.title = '散修大佬的日常';
    else if (/都市|重生/.test(t)) draft.title = '重生之我在都市翻盘';
    else draft.title = t.length <= 16 ? t : t.slice(0, 12);
  }
  if (!draft.description || draft.description.length < 40) {
    draft.description = [
      `男主以「${t.slice(0, 24) || '非常规身份'}」开局，看似底层却握着别人看不见的底牌。`,
      '每一次危机都逼他亮出更大手段，仇家与时代压力轮番加码。',
      '金手指不是无脑开挂，而是越用越险、越险越强——读者追的是翻盘节奏与信息差。',
      '卷末必有一次格局抬升，让故事从「能活」变成「要争天下」。',
    ].join('');
  }
  if (!draft.styleBrief) {
    draft.styleBrief = '国风写实偏漫画镜头感，人物表情利落，场景干净有张力，色调清爽带一点戏谑。';
  }
  return draft;
}

function heuristicReply(draft: QuickDraft, message: string) {
  if (/创建|开写|确认|就这样/.test(message) && isDraftReady(draft)) {
    return [
      '可以开写了。',
      '',
      `书名：${draft.title}`,
      `简介：${draft.description}`,
      `风格：${draft.styleBrief || '（可后补）'}`,
      '',
      '点下方「创建项目并开写」，或直接回「创建」。想改哪一段直接说。',
    ].join('\n');
  }
  return [
    `收到「${message.slice(0, 24)}」，我先给你一版可开写的草案：`,
    '',
    '书名候选：',
    `1）${draft.title}`,
    `2）${draft.title}·变奏`,
    `3）从零翻盘`,
    '',
    '简介草案：',
    draft.description,
    '',
    `风格：${draft.styleBrief}`,
    '',
    '偏狠一点还是更轻松幽默？回我一句我改一版；满意就说「创建」。',
  ].join('\n');
}
