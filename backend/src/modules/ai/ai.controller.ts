import { Body, Controller, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentA2uiService, type AgentA2uiRequest } from './agent-a2ui.service';
import { AiProviderService } from './ai-provider.service';
import { AssembleA2uiService, type AssembleA2uiRequest } from './assemble-a2ui.service';
import { AssembleService } from './assemble.service';
import { QuickCreateService } from './quick-create.service';

class TestProviderDto {
  @IsOptional() @IsString() capability?: string;
  @IsOptional() @IsString() model?: string;
}

class AssembleSuggestDto {
  @IsString() scriptLabel!: string;
  @IsString() scriptIdea!: string;
  @IsOptional() @IsString() scriptCategory?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() model?: string;
  @IsObject() catalogs!: Record<
    string,
    Array<{ id: string; label: string; category: string; tags?: string[]; blurb: string }>
  >;
}

class AssembleExpandDto {
  @IsString() scriptLabel!: string;
  @IsString() scriptIdea!: string;
  @IsOptional() @IsString() scriptCategory?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() model?: string;
  /** 仅 draft 接口：是否一并 AI 扩充，默认 true */
  @IsOptional() @IsBoolean() withExpand?: boolean;
  @IsObject() catalogs!: Record<
    string,
    Array<{ id: string; label: string; category: string; tags?: string[]; blurb: string }>
  >;
}

class AssembleSuggestMetaDto {
  @IsString() scriptLabel!: string;
  @IsString() scriptIdea!: string;
  @IsOptional() @IsString() scriptCategory?: string;
  @IsOptional() @IsString() picksSummary?: string;
  @IsOptional() @IsString() model?: string;
}

class AssembleA2uiDto {
  @IsOptional() @IsString() sessionId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() context?: Record<string, unknown>;
  @IsOptional() dataModel?: Record<string, unknown>;
  @IsOptional() @IsArray() categories?: string[];
  @IsOptional() @IsArray() categoryOptions?: unknown[];
  @IsOptional() @IsArray() scripts?: unknown[];
  @IsOptional() catalogs?: Record<string, unknown>;
  @IsOptional() optionMeta?: Record<string, unknown>;
}

class QuickCreateChatDto {
  @IsOptional() @IsString() sessionId?: string;
  @IsString() message!: string;
  @IsOptional() @IsString() model?: string;
}

class ChatDto {
  @IsArray()
  messages!: Array<{ role: string; content: string }>;
  @IsOptional() @IsString() model?: string;
}

class AgentA2uiDto {
  @IsOptional() @IsString() sessionId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsString() skillId?: string;
  @IsOptional() @IsString() skillLabel?: string;
  @IsOptional() @IsString() canvasSummary?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() context?: Record<string, unknown>;
  @IsOptional() dataModel?: Record<string, unknown>;
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly ai: AiProviderService,
    private readonly assemble: AssembleService,
    private readonly assembleA2ui: AssembleA2uiService,
    private readonly agentA2ui: AgentA2uiService,
    private readonly quickCreate: QuickCreateService,
  ) {}

  @Post('providers/:id/test')
  testProvider(@Param('id') id: string, @Body() body: TestProviderDto) {
    const raw = String(body?.capability || 'chat').trim();
    const cap =
      raw === 'image' || raw === 'video' || raw === 'chat' ? raw : 'chat';
    return this.ai.testProvider(id, cap as any, body?.model);
  }

  /** 测试 Hub 渠道（按 channelSlug） */
  @Post('channels/:slug/test')
  testChannel(@Param('slug') slug: string, @Body() body: TestProviderDto) {
    return this.ai.testChannel(slug, body?.model);
  }

  /** 通用对话补全（脚本生成器等） */
  @Post('chat')
  async chat(@Body() body: ChatDto) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (!messages.length) {
      return { text: '' };
    }
    const text = await this.ai.chat(
      messages.map((m) => ({
        role: String(m?.role || 'user'),
        content: String(m?.content || ''),
      })),
      body?.model || undefined,
      { maxTokens: 4096 },
    );
    return { text: String(text || '') };
  }

  /** 流式对话（工作室 AI 对话页） */
  @Post('chat/stream')
  @HttpCode(200)
  async chatStream(@Body() body: ChatDto, @Req() req: Request, @Res() res: Response) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('close', onClose);

    const write = (ev: unknown) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    try {
      if (!messages.length) {
        write({ type: 'done', text: '' });
        return;
      }
      write({ type: 'start' });
      const text = await this.ai.chatStream(
        messages.map((m) => ({
          role: String(m?.role || 'user'),
          content: String(m?.content || ''),
        })),
        {
          model: body?.model || undefined,
          maxTokens: 4096,
          signal: ac.signal,
          onDelta: async (delta) => write({ type: 'delta', text: delta }),
        },
      );
      write({ type: 'done', text: String(text || '') });
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') {
        write({ type: 'cancelled' });
      } else {
        write({
          type: 'error',
          message: String(e?.message || e?.response?.data?.message || '对话失败'),
        });
      }
    } finally {
      req.off('close', onClose);
      if (!res.writableEnded) res.end();
    }
  }

  /** 快速创建：AI 多轮对话引导凑齐书名/简介/风格 */
  @Post('create/chat')
  quickCreateChat(@Body() body: QuickCreateChatDto) {
    return this.quickCreate.chat(body);
  }

  /** 积木拼装：根据选定剧本，从各库候选中推荐关联选项 */
  @Post('assemble/suggest')
  suggestAssemble(@Body() body: AssembleSuggestDto) {
    return this.assemble.suggest(body);
  }

  /** 本地库之外 AI 扩充积木（参考 StoryCraftr expand / pulpgen seed） */
  @Post('assemble/expand')
  expandAssemble(@Body() body: AssembleExpandDto) {
    return this.assemble.expandBlocks(body);
  }

  /** 草案优先：关联推荐 + AI 扩充一次返回 */
  @Post('assemble/draft')
  composeAssembleDraft(@Body() body: AssembleExpandDto) {
    return this.assemble.composeDraft(body);
  }

  /** AI 联想书名与简介（多候选） */
  @Post('assemble/suggest-meta')
  suggestAssembleMeta(@Body() body: AssembleSuggestMetaDto) {
    return this.assemble.suggestTitleDescription(body);
  }

  /** 积木拼装关联推荐（SSE：进度 + 流式思考） */
  @Post('assemble/suggest-stream')
  async suggestAssembleStream(
    @Body() body: AssembleSuggestDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('close', onClose);

    const write = (ev: unknown) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    try {
      await this.assemble.suggestStream(body, write, ac.signal);
    } catch {
      /* error 事件已在 service 内发出 */
    } finally {
      req.off('close', onClose);
      if (!res.writableEnded) res.end();
    }
  }

  /** 积木拼装问答式 A2UI（SSE：协议消息 + 进度 + 创建草稿） */
  @Post('assemble/a2ui')
  @HttpCode(200)
  async assembleA2uiStream(
    @Body() body: AssembleA2uiDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('close', onClose);

    const write = (ev: unknown) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    try {
      await this.assembleA2ui.handle(body as AssembleA2uiRequest, write, ac.signal);
    } catch {
      /* error 事件已在 service 内发出 */
    } finally {
      req.off('close', onClose);
      if (!res.writableEnded) res.end();
    }
  }

  /** Agent 智能体：AI 表单意图 JSON → 通用编译 A2UI（SSE） */
  @Post('agent/a2ui')
  @HttpCode(200)
  async agentA2uiStream(
    @Body() body: AgentA2uiDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('close', onClose);

    const write = (ev: unknown) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    try {
      await this.agentA2ui.handle(body as AgentA2uiRequest, write, ac.signal);
    } catch {
      /* error 事件已在 service 内发出 */
    } finally {
      req.off('close', onClose);
      if (!res.writableEnded) res.end();
    }
  }
}
