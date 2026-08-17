import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { apiLogBuffer } from './api-log.buffer';
import { appLogBuffer } from './app-log.buffer';

@Controller('logs')
@UseGuards(JwtAuthGuard)
export class AppLogsController {
  /** 兼容旧控制台拉取（前端日志页不再使用） */
  @Get()
  list(
    @Query('sinceId') sinceId?: string,
    @Query('limit') limit?: string,
  ) {
    const entries = appLogBuffer.list({
      sinceId: sinceId ? Number(sinceId) : 0,
      limit: limit ? Number(limit) : 800,
    });
    return {
      entries,
      latestId: entries.length ? entries[entries.length - 1].id : 0,
      count: entries.length,
    };
  }

  @Get('http')
  listHttp(
    @Query('sinceId') sinceId?: string,
    @Query('limit') limit?: string,
    @Query('method') method?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const entries = apiLogBuffer.list({
      sinceId: sinceId ? Number(sinceId) : 0,
      limit: limit ? Number(limit) : 1500,
      method,
      status,
      q,
    });
    return {
      entries,
      latestId: entries.length ? entries[entries.length - 1].id : 0,
      count: entries.length,
    };
  }

  @Get('http/stream')
  streamHttp(@Res() res: Response, @Query('sinceId') sinceId?: string) {
    this.writeSseHeaders(res);
    const write = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const since = sinceId ? Number(sinceId) : 0;
    const backlog = apiLogBuffer.list({ sinceId: since, limit: 1500 });
    write('snapshot', { entries: backlog });

    const unsub = apiLogBuffer.subscribe((entry) => {
      write('log', entry);
    });
    this.bindSseLifecycle(res, unsub);
  }

  /** 兼容旧 SSE（前端日志页不再使用） */
  @Get('stream')
  stream(@Res() res: Response, @Query('sinceId') sinceId?: string) {
    this.writeSseHeaders(res);
    const write = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const since = sinceId ? Number(sinceId) : 0;
    const backlog = appLogBuffer.list({ sinceId: since, limit: 500 });
    write('snapshot', { entries: backlog });

    const unsub = appLogBuffer.subscribe((entry) => {
      write('log', entry);
    });
    this.bindSseLifecycle(res, unsub);
  }

  private writeSseHeaders(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }
  }

  private bindSseLifecycle(res: Response, unsub: () => void) {
    const heartbeat = setInterval(() => {
      res.write(`: ping ${Date.now()}\n\n`);
    }, 15000);
    const close = () => {
      clearInterval(heartbeat);
      unsub();
    };
    res.on('close', close);
    const req = (res as any).req;
    if (req && typeof req.on === 'function') {
      req.on('aborted', close);
    }
  }
}
