import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import axios from 'axios';
import { AuthService } from './auth.service';

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

export function resolveAvatarDir() {
  const root = process.env.UPLOAD_DIR || join(process.cwd(), 'data', 'uploads');
  const dir = join(root, 'avatars');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(private readonly auth: AuthService) {}

  clearUserAvatarFiles(userId: number, keepFilename?: string) {
    const dir = resolveAvatarDir();
    const prefix = `user-${userId}`;
    try {
      for (const name of readdirSync(dir)) {
        if (keepFilename && name === keepFilename) continue;
        if (name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`)) {
          try {
            unlinkSync(join(dir, name));
          } catch (err) {
            this.logger.debug(`skip unlink avatar ${name}: ${String(err)}`);
          }
        }
      }
    } catch {
      // ignore
    }
  }

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

    const dir = resolveAvatarDir();
    const filename = `user-${userId}-${Date.now()}.png`;
    const filepath = join(dir, filename);

    try {
      const res = await axios.get(url, {
        responseType: 'stream',
        timeout: 20000,
        maxContentLength: AVATAR_MAX_SIZE,
        headers: { 'User-Agent': 'AI Video Studio/1.0' },
      });
      await pipeline(res.data, createWriteStream(filepath));
    } catch (err) {
      this.logger.warn(`download avatar failed, fallback to remote url: ${String(err)}`);
      // 后端无法拉取时，直接保存可访问的预览地址，保证头像库仍可用
      return this.auth.updateProfileFields(userId, { avatar: url });
    }

    this.clearUserAvatarFiles(userId, filename);
    const avatar = `/api/uploads/avatars/${filename}`;
    return this.auth.updateProfileFields(userId, { avatar });
  }
}
