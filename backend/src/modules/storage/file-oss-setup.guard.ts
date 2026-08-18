import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { FileOssService } from './file-oss.service';

export const SKIP_FILE_OSS_SETUP = 'skipFileOssSetup';
export const SkipFileOssSetup = () => SetMetadata(SKIP_FILE_OSS_SETUP, true);

/** 未配置对象存储时仍允许访问的路径前缀（含登录） */
const OPEN_PREFIXES = ['/api/auth', '/api/settings', '/health', '/api/health'];

@Injectable()
export class FileOssSetupGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly fileOss: FileOssService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_FILE_OSS_SETUP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const path = String(req?.originalUrl || req?.url || '').split('?')[0];
    if (OPEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      return true;
    }

    try {
      if (await this.fileOss.isConfigured()) return true;
    } catch {
      // 读配置失败时不阻断登录链路，当作未配置
    }

    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'FILE_OSS_REQUIRED',
      message: '对象存储不可用：请确认 MinIO 已启动且后端写死配置可连通',
    });
  }
}
