import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileOssService } from './file-oss.service';

export type VideoPosterResult = { url: string; key: string };

@Injectable()
export class VideoPosterService {
  private readonly log = new Logger(VideoPosterService.name);
  private ffmpegOk: boolean | null = null;

  constructor(private readonly fileOss: FileOssService) {}

  /** PATH 中是否有可用 ffmpeg（结果缓存） */
  async isFfmpegAvailable(): Promise<boolean> {
    if (this.ffmpegOk != null) return this.ffmpegOk;
    this.ffmpegOk = await new Promise<boolean>((resolve) => {
      const child = spawn('ffmpeg', ['-version'], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
      setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        resolve(false);
      }, 4000);
    });
    if (!this.ffmpegOk) {
      this.log.warn('未检测到 ffmpeg，视频封面抽帧已跳过（列表将显示占位）');
    }
    return this.ffmpegOk;
  }

  /**
   * 从视频 URL 抽一帧 JPG 并上传对象存储。
   * 失败返回 null（调用方勿阻断主流程）。
   */
  async createPoster(opts: {
    videoUrl: string;
    projectId: string;
    nameHint?: string;
  }): Promise<VideoPosterResult | null> {
    const videoUrl = String(opts.videoUrl || '').trim();
    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) return null;
    if (!(await this.isFfmpegAvailable())) return null;
    if (!(await this.fileOss.isConfigured())) {
      this.log.warn('对象存储未配置，跳过视频封面');
      return null;
    }

    const workDir = join(tmpdir(), 'lumina-poster', randomBytes(8).toString('hex'));
    const outFile = join(workDir, 'poster.jpg');
    try {
      mkdirSync(workDir, { recursive: true });
      await this.runFfmpegFrame(videoUrl, outFile);
      if (!existsSync(outFile)) return null;
      const body = readFileSync(outFile);
      if (!body.length) return null;
      const hint = String(opts.nameHint || 'poster').replace(/[^\w.\-]+/g, '_').slice(0, 40);
      const key = await this.fileOss.buildKey(
        opts.projectId || 'shared',
        `${hint || 'poster'}.jpg`,
        'posters',
      );
      const put = await this.fileOss.putObject({
        key,
        body,
        contentType: 'image/jpeg',
        metadata: { kind: 'video-poster' },
      });
      return { url: put.url, key: put.key || key };
    } catch (e: any) {
      this.log.warn(`抽帧失败: ${e?.message || e}`);
      return null;
    } finally {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private runFfmpegFrame(inputUrl: string, outFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // -ss 在 -i 前：更快定位；失败时再由调用方记日志
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        '0.1',
        '-i',
        inputUrl,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        outFile,
      ];
      const child = spawn('ffmpeg', args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let err = '';
      child.stderr?.on('data', (chunk) => {
        err += String(chunk || '');
        if (err.length > 2000) err = err.slice(-2000);
      });
      child.on('error', (e) => reject(e));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.trim() || `ffmpeg exit ${code}`));
      });
      setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        reject(new Error('ffmpeg 抽帧超时'));
      }, 45_000);
    });
  }
}
