import { Controller, Get } from '@nestjs/common';
import { SkipFileOssSetup } from './modules/storage/file-oss-setup.guard';
import { InProcessJobQueue } from './modules/jobs/in-process-job-queue';

@SkipFileOssSetup()
@Controller('health')
export class HealthController {
  constructor(private readonly jobQueue: InProcessJobQueue) {}

  @Get()
  async health() {
    const jobs = this.jobQueue.getStatus();
    const redisOk = await this.jobQueue.pingRedis();

    return {
      ok: true,
      service: 'ai-video-studio',
      ts: Date.now(),
      jobs: {
        ...jobs,
        redisConnected: redisOk,
        summary:
          jobs.mode === 'bullmq' && redisOk === true
            ? `BullMQ + Redis 正常（${jobs.redisTarget}）`
            : jobs.redisConfigured && redisOk !== true
              ? `已配置 Redis 但未连通（${jobs.redisTarget}）`
              : `进程内队列（未使用 Redis）`,
      },
    };
  }
}
