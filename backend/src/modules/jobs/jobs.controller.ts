import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobsService } from './jobs.service';
import { InProcessJobQueue } from './in-process-job-queue';

class RetryJobDto {
  @IsOptional() @IsString() model?: string;
}

class GenerateCoverDto {
  @IsOptional() @IsString() prompt?: string;
  @IsOptional() @IsString() hint?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() promptModel?: string;
}

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly queue: InProcessJobQueue,
  ) {}

  @Get()
  list(@Query('projectId') projectId?: string) {
    return this.jobs.list(projectId);
  }

  /** 队列状态（须在 :id 之前注册） */
  @Get('queue-status')
  async queueStatus() {
    const base = this.queue.getStatus();
    const redisConnected = await this.queue.pingRedis();
    const summary =
      base.mode === 'bullmq' && redisConnected === true
        ? `BullMQ + Redis 正常（${base.redisTarget}）`
        : base.redisConfigured && redisConnected !== true
          ? `已配置 Redis 但未连通（${base.redisTarget}）`
          : `进程内队列（未使用 Redis）`;
    return {
      ok: true,
      ts: Date.now(),
      jobs: {
        ...base,
        redisConnected,
        summary,
      },
    };
  }

  /** 清空已结束任务（须在 :id 之前） */
  @Delete('finished')
  clearFinished() {
    return this.jobs.clearFinished();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobs.get(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.jobs.cancel(id);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string, @Body() body: RetryJobDto) {
    return this.jobs.retry(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.jobs.remove(id);
  }
}

/** 封面生成挂在 JobsModule，避免 ProjectsModule ↔ JobsModule 循环依赖 */
@Controller('projects/:projectId/cover')
@UseGuards(JwtAuthGuard)
export class ProjectCoverJobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post('generate')
  generate(@Param('projectId') projectId: string, @Body() body: GenerateCoverDto) {
    return this.jobs.enqueue('cover_generate', projectId, {
      prompt: body.prompt,
      hint: body.hint,
      model: body.model,
      size: body.size,
      promptModel: body.promptModel,
      label: 'AI 生成封面',
    } as any);
  }
}
