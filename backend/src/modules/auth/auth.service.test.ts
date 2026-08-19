import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

function makeService(overrides?: {
  user?: Record<string, unknown> | null;
  saved?: unknown[];
}) {
  const saved: unknown[] = overrides?.saved || [];
  const repo = {
    findOne: async () => overrides?.user ?? null,
    save: async (u: unknown) => {
      saved.push(u);
      return u;
    },
  };
  return {
    service: new AuthService(repo as never, {} as never),
    saved,
  };
}

const baseUser = {
  id: 1,
  username: 'admin',
  passwordHash: 'hash-xxx',
  nickname: '',
  avatar: '',
  theme: 'dark',
  role: 'admin',
  totpSecret: 'secret-xxx',
  totpEnabled: false,
  notifyPrefs: null,
  createdAt: new Date(),
};

describe('AuthService.toPublic', () => {
  it('归一化主题并隐藏敏感字段', () => {
    const { service } = makeService();
    const pub = service.toPublic(baseUser as never);
    assert.equal(pub.theme, 'dark');
    assert.equal('passwordHash' in pub, false);
    assert.equal('totpSecret' in pub, false);
    assert.equal(pub.username, 'admin');
    assert.equal(pub.notifyPrefs.jobDone, true);
    assert.equal(pub.notifyPrefs.jobFail, true);
    assert.equal(pub.notifyPrefs.systemAnnounce, true);
  });

  it('非 dark 主题统一为 light', () => {
    const { service } = makeService();
    const pub = service.toPublic({ ...baseUser, theme: 'neon' } as never);
    assert.equal(pub.theme, 'light');
  });
});

describe('AuthService.updateProfileFields', () => {
  it('合法主题保存并返回公开资料', async () => {
    const { service, saved } = makeService({ user: baseUser });
    const pub = await service.updateProfileFields(1, { theme: 'light' });
    assert.equal(pub.theme, 'light');
    assert.equal(saved.length, 1);
  });

  it('非法主题抛 BadRequestException', async () => {
    const { service } = makeService({ user: baseUser });
    await assert.rejects(
      () => service.updateProfileFields(1, { theme: 'pink' }),
      BadRequestException,
    );
  });

  it('空昵称抛 BadRequestException', async () => {
    const { service } = makeService({ user: baseUser });
    await assert.rejects(
      () => service.updateProfileFields(1, { nickname: '  ' }),
      BadRequestException,
    );
  });

  it('用户不存在抛 BadRequestException', async () => {
    const { service } = makeService({ user: null });
    await assert.rejects(
      () => service.updateProfileFields(99, { nickname: 'x' }),
      BadRequestException,
    );
  });
});
