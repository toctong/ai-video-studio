import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import type { Request, Response } from 'express';
import type { ChapterCard } from '@ai-video-studio/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChaptersService } from './chapters.service';
import { JobsService } from '../jobs/jobs.service';
import { AssetsService } from '../assets/assets.service';

class ChapterDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsNumber() orderIndex?: number;
  @IsOptional() @IsObject() chapterCard?: ChapterCard;
  @IsOptional() @IsString() synopsis?: string;
  @IsOptional() @IsString() novelBody?: string;
  @IsOptional() @IsString() continuitySummary?: string;
  @IsOptional() @IsString() status?: string;
}

class GenerateChapterDto {
  @IsOptional() @IsString() chapterId?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() instruction?: string;
  @IsOptional() force?: boolean;
}

class DeaiDto {
  @IsOptional() @IsString() model?: string;
}

@Controller('projects/:projectId/chapters')
@UseGuards(JwtAuthGuard)
export class ChaptersController {
  constructor(
    private readonly chapters: ChaptersService,
    private readonly jobs: JobsService,
    private readonly assets: AssetsService,
  ) {}

  @Get()
  async list(@Param('projectId') projectId: string) {
    const rows = await this.chapters.list(projectId);
    return Promise.all(
      rows.map(async (c) => {
        const meta =
          c.meta && typeof c.meta === 'object' ? (c.meta as Record<string, unknown>) : {};
        const plotGridAssetId = String(meta.plotGridAssetId || '').trim();
        let plotGridUrl = '';
        if (plotGridAssetId) {
          try {
            const a = await this.assets.get(plotGridAssetId);
            plotGridUrl = a.url || '';
          } catch {
            /* ignore */
          }
        }
        return {
          ...c,
          plotGridUrl,
          plotGridLayout: String(meta.plotGridLayout || '') || undefined,
        };
      }),
    );
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() body: ChapterDto) {
    return this.chapters.create(projectId, body as any);
  }

  @Post('generate')
  generate(@Param('projectId') projectId: string, @Body() body: GenerateChapterDto) {
    return this.jobs.enqueue('chapter_generate', projectId, {
      ...body,
      label: body.chapterId ? '重写章节' : '生成下一章',
    } as any);
  }

  /** 流式生成/重写下一章（SSE），正文增量推送到写作页 */
  @Post('generate-stream')
  async generateStream(
    @Param('projectId') projectId: string,
    @Body() body: GenerateChapterDto,
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
    };

    try {
      await this.chapters.streamGenerate(
        projectId,
        {
          chapterId: body.chapterId,
          model: body.model,
          instruction: body.instruction,
          signal: ac.signal,
        },
        write,
      );
    } catch {
      /* error 事件已在 service 内发出 */
    } finally {
      req.off('close', onClose);
      if (!res.writableEnded) res.end();
    }
  }

  @Get('export/character-bible')
  async exportBible(@Param('projectId') projectId: string, @Res({ passthrough: true }) res: Response) {
    const { file, filename } = await this.chapters.exportBibleDocxStream(projectId);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    });
    return file;
  }

  @Get('export/novel')
  async exportNovel(@Param('projectId') projectId: string, @Res({ passthrough: true }) res: Response) {
    const { file, filename } = await this.chapters.exportNovelDocxStream(projectId);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    });
    return file;
  }

  @Get('export/novel-txt')
  async exportNovelTxt(@Param('projectId') projectId: string, @Res({ passthrough: true }) res: Response) {
    const { file, filename } = await this.chapters.exportNovelTxtStream(projectId);
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    });
    return file;
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.chapters.get(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: ChapterDto) {
    return this.chapters.update(id, body as any);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.chapters.remove(id);
  }

  @Post(':id/de-ai')
  deAi(@Param('projectId') projectId: string, @Param('id') id: string, @Body() body: DeaiDto) {
    return this.jobs.enqueue('chapter_deai', projectId, {
      chapterId: id,
      model: body.model,
      label: '去味润色',
    } as any);
  }

  @Get(':id/export-docx')
  async exportDocx(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, filename } = await this.chapters.exportChapterDocxStream(projectId, id);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    });
    return file;
  }

  @Get(':id/export-txt')
  async exportChapterTxt(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, filename } = await this.chapters.exportChapterTxtStream(projectId, id);
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    });
    return file;
  }
}
