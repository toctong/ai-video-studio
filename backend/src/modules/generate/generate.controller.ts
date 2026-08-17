import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GenerateService } from './generate.service';

class CreateSessionDto {
  @IsOptional()
  @IsString()
  title?: string;
}

class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

class StreamDto {
  @IsString()
  sessionId!: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  model?: string;

  /** 底栏生成偏好（比例、模型、时长等），Agent 路由到出图/出视频时使用 */
  @IsOptional()
  prefs?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  referenceImages?: string[];

  @IsOptional()
  @IsArray()
  referenceVideoUrls?: string[];

  /** 消息引用：图片 / 视频，可多项 */
  @IsOptional()
  @IsArray()
  quotes?: Array<{
    id?: string;
    kind?: string;
    url?: string;
    label?: string;
    sourceMessageId?: string;
  }>;
}

class ImageDto {
  @IsString()
  sessionId!: string;

  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  aspectRatio?: string;

  @IsOptional()
  @IsNumber()
  count?: number;

  @IsOptional()
  @IsArray()
  referenceImages?: string[];

  @IsOptional()
  prefs?: Record<string, unknown>;
}

class VideoDto {
  @IsString()
  sessionId!: string;

  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  aspectRatio?: string;

  @IsOptional()
  @IsNumber()
  durationSec?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  endImageUrl?: string;

  @IsOptional()
  @IsArray()
  referenceImageUrls?: string[];

  @IsOptional()
  @IsArray()
  referenceVideoUrls?: string[];

  @IsOptional()
  @IsBoolean()
  omniRef?: boolean;

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsOptional()
  prefs?: Record<string, unknown>;
}

@Controller('ai/generate')
@UseGuards(JwtAuthGuard)
export class GenerateController {
  constructor(private readonly generate: GenerateService) {}

  @Get('sessions')
  listSessions(@Req() req: { user: { userId: number } }) {
    return this.generate.listSessions(req.user.userId);
  }

  /** 资产页：按对话列出生成的图片/视频 */
  @Get('assets')
  listAssets(
    @Req() req: { user: { userId: number } },
    @Query('sessionId') sessionId?: string,
    @Query('kind') kind?: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.generate.listMediaAssets(req.user.userId, {
      sessionId,
      kind,
      q,
      take: take != null ? Number(take) : undefined,
      skip: skip != null ? Number(skip) : undefined,
    });
  }

  @Delete('assets/:messageId')
  removeAsset(
    @Param('messageId') messageId: string,
    @Req() req: { user: { userId: number } },
  ) {
    return this.generate.deleteMediaMessage(req.user.userId, messageId);
  }

  @Post('sessions')
  createSession(
    @Body() body: CreateSessionDto,
    @Req() req: { user: { userId: number } },
  ) {
    return this.generate.createSession(req.user.userId, body?.title);
  }

  @Patch('sessions/:id')
  updateSession(
    @Param('id') id: string,
    @Body() body: UpdateSessionDto,
    @Req() req: { user: { userId: number } },
  ) {
    return this.generate.updateSession(id, req.user.userId, body || {});
  }

  @Delete('sessions/:id')
  removeSession(@Param('id') id: string, @Req() req: { user: { userId: number } }) {
    return this.generate.deleteSession(id, req.user.userId);
  }

  @Get('sessions/:id/messages')
  listMessages(@Param('id') id: string, @Req() req: { user: { userId: number } }) {
    return this.generate.listMessages(id, req.user.userId);
  }

  @Post('sessions/:id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadRef(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user: { userId: number } },
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    return this.generate.uploadRef(req.user.userId, id, file);
  }

  @Post('stream')
  @HttpCode(200)
  async stream(
    @Body() body: StreamDto,
    @Req() req: Request & { user: { userId: number } },
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

    const ac = new AbortController();
    const onAbort = () => {
      if (!ac.signal.aborted) ac.abort();
    };
    req.on('aborted', onAbort);
    req.on('close', onAbort);

    const write = (ev: unknown) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    try {
      write({ type: 'start' });
      const result = await this.generate.streamChat({
        userId: req.user.userId,
        sessionId: String(body?.sessionId || ''),
        message: String(body?.message || ''),
        model: body?.model || undefined,
        prefs: body?.prefs && typeof body.prefs === 'object' ? body.prefs : undefined,
        referenceImages: Array.isArray(body?.referenceImages)
          ? body.referenceImages.map(String)
          : undefined,
        referenceVideoUrls: Array.isArray(body?.referenceVideoUrls)
          ? body.referenceVideoUrls.map(String)
          : undefined,
        quotes: Array.isArray(body?.quotes) ? body.quotes : undefined,
        signal: ac.signal,
        onDelta: async (delta) => write({ type: 'delta', text: delta }),
        onThink: async (delta) => write({ type: 'think', text: delta }),
        onRoute: async (route) =>
          write({
            type: 'route',
            intent: route.intent,
            prompt: route.prompt,
            understanding: route.understanding,
          }),
      });
      write({
        type: 'done',
        intent: result.intent,
        text: result.text,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
      });
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
      req.off('aborted', onAbort);
      req.off('close', onAbort);
      if (!res.writableEnded) res.end();
    }
  }

  @Post('image')
  generateImage(
    @Body() body: ImageDto,
    @Req() req: Request & { user: { userId: number } },
  ) {
    return this.generate.generateImage({
      userId: req.user.userId,
      sessionId: String(body?.sessionId || ''),
      prompt: String(body?.prompt || ''),
      model: body?.model,
      size: body?.size,
      aspectRatio: body?.aspectRatio,
      count: body?.count,
      referenceImages: Array.isArray(body?.referenceImages)
        ? body.referenceImages.map(String)
        : undefined,
      prefs: body?.prefs && typeof body.prefs === 'object' ? body.prefs : undefined,
    });
  }

  @Post('video')
  generateVideo(
    @Body() body: VideoDto,
    @Req() req: Request & { user: { userId: number } },
  ) {
    return this.generate.generateVideo({
      userId: req.user.userId,
      sessionId: String(body?.sessionId || ''),
      prompt: String(body?.prompt || ''),
      model: body?.model,
      aspectRatio: body?.aspectRatio,
      durationSec: body?.durationSec,
      imageUrl: body?.imageUrl,
      endImageUrl: body?.endImageUrl,
      referenceImageUrls: Array.isArray(body?.referenceImageUrls)
        ? body.referenceImageUrls.map(String)
        : undefined,
      referenceVideoUrls: Array.isArray(body?.referenceVideoUrls)
        ? body.referenceVideoUrls.map(String)
        : undefined,
      omniRef: body?.omniRef,
      resolution: body?.resolution,
      prefs: body?.prefs && typeof body.prefs === 'object' ? body.prefs : undefined,
    });
  }

  /** 取消排队中/进行中的图或视频生成任务 */
  @Post('messages/:id/cancel')
  @HttpCode(200)
  cancelMessage(
    @Param('id') id: string,
    @Req() req: Request & { user: { userId: number } },
  ) {
    return this.generate.cancelMessage(id, req.user.userId);
  }
}
