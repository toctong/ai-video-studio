import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { extname } from 'path';
import { Repository } from 'typeorm';
import { UserPrompt } from '../../entities/user-prompt.entity';
import { FileOssService } from '../storage/file-oss.service';

export type UserPromptDto = {
  id: string;
  name: string;
  desc: string;
  prompt: string;
  mode: 'image' | 'video';
  coverUrl: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class UserPromptsService {
  constructor(
    @InjectRepository(UserPrompt)
    private readonly repo: Repository<UserPrompt>,
    private readonly fileOss: FileOssService,
  ) {}

  private toDto(row: UserPrompt): UserPromptDto {
    return {
      id: row.id,
      name: row.name,
      desc: row.desc || '',
      prompt: row.prompt || '',
      mode: row.mode === 'video' ? 'video' : 'image',
      coverUrl: row.coverUrl || '',
      createdAt: row.createdAt?.toISOString?.() || String(row.createdAt || ''),
      updatedAt: row.updatedAt?.toISOString?.() || String(row.updatedAt || ''),
    };
  }

  async list(userId: number): Promise<UserPromptDto[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async getOwned(id: string, userId: number): Promise<UserPrompt> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('提示词不存在');
    if (row.userId !== userId) throw new ForbiddenException('无权操作该提示词');
    return row;
  }

  async create(
    userId: number,
    input: {
      name: string;
      desc?: string;
      prompt: string;
      mode?: string;
      coverUrl?: string;
      coverOssKey?: string;
    },
  ): Promise<UserPromptDto> {
    const name = String(input.name || '').trim();
    const prompt = String(input.prompt || '').trim();
    if (!name) throw new BadRequestException('名称不能为空');
    if (!prompt) throw new BadRequestException('提示词正文不能为空');

    const coverUrl = String(input.coverUrl || '').trim();
    if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
      throw new BadRequestException('封面须为公网 http(s) 地址，请先上传封面');
    }

    const row = this.repo.create({
      userId,
      name,
      desc: String(input.desc || '').trim() || prompt.slice(0, 80),
      prompt,
      mode: input.mode === 'video' ? 'video' : 'image',
      coverUrl,
      coverOssKey: String(input.coverOssKey || '').trim(),
    });
    const saved = await this.repo.save(row);
    return this.toDto(saved);
  }

  async update(
    id: string,
    userId: number,
    input: {
      name?: string;
      desc?: string;
      prompt?: string;
      mode?: string;
      coverUrl?: string;
      coverOssKey?: string;
    },
  ): Promise<UserPromptDto> {
    const row = await this.getOwned(id, userId);
    if (input.name !== undefined) {
      const name = String(input.name || '').trim();
      if (!name) throw new BadRequestException('名称不能为空');
      row.name = name;
    }
    if (input.desc !== undefined) row.desc = String(input.desc || '').trim();
    if (input.prompt !== undefined) {
      const prompt = String(input.prompt || '').trim();
      if (!prompt) throw new BadRequestException('提示词正文不能为空');
      row.prompt = prompt;
    }
    if (input.mode !== undefined) {
      row.mode = input.mode === 'video' ? 'video' : 'image';
    }
    if (input.coverUrl !== undefined) {
      const coverUrl = String(input.coverUrl || '').trim();
      if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
        throw new BadRequestException('封面须为公网 http(s) 地址，请先上传封面');
      }
      const nextKey =
        input.coverOssKey !== undefined
          ? String(input.coverOssKey || '').trim()
          : row.coverOssKey;
      if (!coverUrl && row.coverOssKey) {
        try {
          await this.fileOss.deleteObject(row.coverOssKey);
        } catch {
          /* ignore */
        }
        row.coverOssKey = '';
      } else if (nextKey && row.coverOssKey && nextKey !== row.coverOssKey) {
        try {
          await this.fileOss.deleteObject(row.coverOssKey);
        } catch {
          /* ignore */
        }
        row.coverOssKey = nextKey;
      } else if (input.coverOssKey !== undefined) {
        row.coverOssKey = nextKey;
      }
      row.coverUrl = coverUrl;
    } else if (input.coverOssKey !== undefined) {
      row.coverOssKey = String(input.coverOssKey || '').trim();
    }
    const saved = await this.repo.save(row);
    return this.toDto(saved);
  }

  async remove(id: string, userId: number): Promise<{ ok: true }> {
    const row = await this.getOwned(id, userId);
    if (row.coverOssKey) {
      try {
        await this.fileOss.deleteObject(row.coverOssKey);
      } catch {
        /* ignore */
      }
    }
    await this.repo.delete({ id: row.id });
    return { ok: true };
  }

  async uploadCover(
    userId: number,
    file: Express.Multer.File,
    promptId?: string,
  ): Promise<{ url: string; key: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请选择封面图片');
    }
    if (!(await this.fileOss.isConfigured())) {
      throw new BadRequestException('File OSS 未配置，无法上传封面');
    }
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('封面仅支持图片文件');
    }
    if (file.size > 12 * 1024 * 1024) {
      throw new BadRequestException('封面请小于 12MB');
    }

    const ext = extname(file.originalname || '') || '.jpg';
    const key = await this.fileOss.buildKey(
      `user-${userId}`,
      `prompt-cover${ext}`,
      'prompt-covers',
    );
    const put = await this.fileOss.putObject({
      key,
      body: file.buffer,
      contentType: mime || 'image/jpeg',
      metadata: {
        userId: String(userId),
        kind: 'prompt-cover',
      },
    });

    if (promptId) {
      const row = await this.getOwned(promptId, userId);
      if (row.coverOssKey && row.coverOssKey !== put.key) {
        try {
          await this.fileOss.deleteObject(row.coverOssKey);
        } catch {
          /* ignore */
        }
      }
      row.coverUrl = put.url;
      row.coverOssKey = put.key;
      await this.repo.save(row);
    }

    return { url: put.url, key: put.key };
  }
}
