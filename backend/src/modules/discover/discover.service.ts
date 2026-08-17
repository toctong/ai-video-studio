import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import {
  DiscoverPost,
  type DiscoverPostKind,
} from '../../entities/discover-post.entity';
import { User } from '../../entities/user.entity';

export type PublishDiscoverInput = {
  kind: DiscoverPostKind;
  title: string;
  description?: string;
  thumbUrl?: string;
  payload: Record<string, unknown>;
  sourceId?: string;
  authorUserId: number;
};

@Injectable()
export class DiscoverService {
  constructor(
    @InjectRepository(DiscoverPost)
    private readonly posts: Repository<DiscoverPost>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async feed(opts?: { kind?: string; q?: string; take?: number }) {
    const take = Math.min(100, Math.max(1, Number(opts?.take) || 40));
    const rows = await this.posts.find({
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: 120,
    });
    const kind = String(opts?.kind || '').trim().toLowerCase();
    const q = String(opts?.q || '').trim().toLowerCase();
    return rows
      .filter((r) => !kind || r.kind === kind)
      .filter((r) => {
        if (!q) return true;
        const blob = `${r.title} ${r.description} ${r.authorName} ${r.kind}`.toLowerCase();
        return blob.includes(q);
      })
      .slice(0, take)
      .map((r) => this.toPublic(r));
  }

  async get(id: string) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('发现内容不存在');
    return this.toPublic(row, true);
  }

  async getByToken(token: string) {
    const row = await this.posts.findOne({ where: { shareToken: String(token || '').trim() } });
    if (!row) throw new NotFoundException('分享链接无效');
    return this.toPublic(row, true);
  }

  async publish(input: PublishDiscoverInput) {
    const user = await this.users.findOne({ where: { id: input.authorUserId } });
    const authorName = String(user?.nickname || user?.username || '创作者').trim();
    const kind = (String(input.kind || 'workflow').trim() || 'workflow') as DiscoverPostKind;
    const sourceId = String(input.sourceId || '').trim();

    // 同源再发布：更新同一条
    let row =
      sourceId
        ? await this.posts.findOne({
            where: { kind, sourceId, authorUserId: input.authorUserId },
          })
        : null;

    if (!row) {
      row = this.posts.create({
        kind,
        shareToken: randomBytes(12).toString('hex'),
        authorUserId: input.authorUserId,
        likeCount: 0,
      });
    }

    row.title = String(input.title || '未命名').trim() || '未命名';
    row.description = String(input.description || '').trim();
    row.thumbUrl = String(input.thumbUrl || '').trim();
    row.payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
    row.sourceId = sourceId;
    row.authorName = authorName;
    row.publishedAt = new Date();
    if (!row.shareToken) row.shareToken = randomBytes(12).toString('hex');

    const saved = await this.posts.save(row);
    return this.toPublic(saved, true);
  }

  async unpublish(id: string, userId: number) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('发现内容不存在');
    if (row.authorUserId && row.authorUserId !== userId) {
      throw new NotFoundException('发现内容不存在');
    }
    await this.posts.remove(row);
    return { ok: true };
  }

  async like(id: string) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('发现内容不存在');
    row.likeCount = (Number(row.likeCount) || 0) + 1;
    await this.posts.save(row);
    return { id: row.id, likeCount: row.likeCount };
  }

  private toPublic(row: DiscoverPost, withPayload = false) {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      thumbUrl: row.thumbUrl,
      sourceId: row.sourceId,
      authorUserId: row.authorUserId,
      authorName: row.authorName,
      shareToken: row.shareToken,
      likeCount: row.likeCount,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(withPayload ? { payload: row.payload } : {}),
    };
  }
}
