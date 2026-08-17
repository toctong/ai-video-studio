import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { InProcessJobQueue } from './modules/jobs/in-process-job-queue';
import { BufferingLogger } from './modules/app-logs/buffering.logger';
import { appLogBuffer } from './modules/app-logs/app-log.buffer';
import { apiLoggingMiddleware } from './modules/app-logs/api-log.middleware';
import { resolveCorsOrigin } from './config/env';

async function bootstrap() {
  const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'data', 'uploads');
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: new BufferingLogger('Bootstrap'),
  });
  // 积木拼装会上传灵感库摘要，默认 100kb 不够会直接 413/500
  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));
  // 接口日志：body 解析之后挂接，优先覆盖全部请求
  app.use(apiLoggingMiddleware);
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: resolveCorsOrigin(), credentials: true });
  app.useStaticAssets(uploadDir, { prefix: '/api/uploads/' });

  const port = Number(process.env.PORT || 47822);
  await app.listen(port);

  const log = new Logger('Bootstrap');
  log.log(`后端已监听端口 ${port}`);
  appLogBuffer.push('log', `AIGC 视频工厂 后端已就绪 · 端口 ${port}`, 'Bootstrap');
  try {
    const queue = app.get(InProcessJobQueue);
    const st = queue.getStatus();
    const ping = await queue.pingRedis();
    if (st.mode === 'bullmq' && ping) {
      log.log(`任务队列：BullMQ + Redis 正常 → ${st.redisTarget}（并发=${st.concurrency}）`);
    } else if (st.redisConfigured) {
      log.error(
        `任务队列：Redis 未连通 → ${st.redisTarget}；已使用进程内队列。${st.lastError}`,
      );
    } else {
      log.log(`任务队列：进程内模式（并发=${st.concurrency}，未设置 REDIS_URL）`);
    }
  } catch (e: any) {
    log.warn(`无法读取任务队列状态: ${e?.message || e}`);
  }
}

bootstrap();
