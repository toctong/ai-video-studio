import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileOssService } from './file-oss.service';

function safeFilename(raw: string, fallback: string) {
  const name = String(raw || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\.+/g, '.')
    .trim();
  return name || fallback;
}

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly fileOss: FileOssService) {}

  /**
   * 同源下载代理：浏览器直连 MinIO 常因 CORS 只能新开页。
   * 仅允许本站对象存储 URL，流式转发并带 Content-Disposition: attachment。
   */
  @Get('download')
  async download(
    @Query('url') urlRaw: string,
    @Query('filename') filenameRaw: string | undefined,
    @Res() res: Response,
  ) {
    const url = String(urlRaw || '').trim();
    if (!url) throw new BadRequestException('缺少 url');
    await this.fileOss.getConfig();
    if (!this.fileOss.isOurUrl(url)) {
      throw new BadRequestException('仅支持本站对象存储文件');
    }
    const key = this.fileOss.keyFromOurUrl(url);
    if (!key) throw new BadRequestException('无法解析对象路径');

    const fromQuery = String(filenameRaw || '').trim();
    const fromKey = key.split('/').pop() || 'download';
    const filename = safeFilename(fromQuery || fromKey, 'download');

    try {
      const obj = await this.fileOss.getObject(key);
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      if (obj.contentLength != null) {
        res.setHeader('Content-Length', String(obj.contentLength));
      }
      res.setHeader('Cache-Control', 'private, no-store');
      obj.body.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      obj.body.pipe(res);
    } catch (e: any) {
      throw new BadRequestException(String(e?.message || '下载失败'));
    }
  }
}
