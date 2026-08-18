import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AuthService } from './auth.service';
import { FileOssService } from '../storage/file-oss.service';

const AVATAR_MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED_HOSTS = new Set([
  'api.dicebear.com',
  'www.dicebear.com',
  'nekos.best',
  'cdn.nekos.best',
]);

const SEEDS = [
  'Felix', 'Aneka', 'Midnight', 'Luna', 'Kai', 'Nova',
  'Ori', 'Pixel', 'Quinn', 'Raven', 'Sage', 'Theo',
  'Uma', 'Vera', 'Wren', 'Xander', 'Yuki', 'Zara',
  'Aria', 'Blake', 'Cleo', 'Drew', 'Eden', 'Finn',
];

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    private readonly auth: AuthService,
    private readonly fileOss: FileOssService,
  ) {}

  listLibrary(page = 1, limit = 24, refresh = false) {
    const safePage = Math.max(1, Math.trunc(page) || 1);
    const safeLimit = Math.min(60, Math.max(1, Math.trunc(limit) || 24));
    const style = refresh ? 'adventurer' : 'adventurer';
    const salt = refresh ? Date.now().toString(36) : 'v1';
    const items = SEEDS.map((seed, idx) => {
      const id = `${style}-${seed}-${salt}`;
      const previewUrl = `https://api.dicebear.com/9.x/${style}/png?seed=${encodeURIComponent(
        `${seed}-${salt}`,
      )}&size=128`;
      return { id, title: seed, previewUrl, order: idx };
    });
    const totalItems = items.length;
    const start = (safePage - 1) * safeLimit;
    return {
      items: items.slice(start, start + safeLimit),
      page: safePage,
      pageSize: safeLimit,
      totalItems,
    };
  }

  async saveBuffer(userId: number, body: Buffer, contentType: string, fileName: string) {
    const key = await this.fileOss.buildKey(`user-${userId}`, fileName || 'avatar.png', 'avatars');
    const put = await this.fileOss.putObject({
      key,
      body,
      contentType: contentType || 'image/png',
    });
    return this.auth.updateProfileFields(userId, { avatar: put.url });
  }

  async applyFromPreview(userId: number, previewUrl: string) {
    const url = String(previewUrl || '').trim();
    if (!url.startsWith('https://')) {
      throw new BadRequestException('无效的头像地址');
    }
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      throw new BadRequestException('无效的头像地址');
    }
    if (!ALLOWED_HOSTS.has(host)) {
      throw new BadRequestException('不支持的头像来源');
    }

    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: AVATAR_MAX_SIZE,
        headers: { 'User-Agent': 'AI Video Studio/1.0' },
      });
      const body = Buffer.from(res.data);
      const contentType =
        String(res.headers['content-type'] || '').split(';')[0].trim() || 'image/png';
      return this.saveBuffer(userId, body, contentType, 'avatar.png');
    } catch (err) {
      this.logger.warn(`download avatar failed, fallback to remote url: ${String(err)}`);
      return this.auth.updateProfileFields(userId, { avatar: url });
    }
  }
}
