import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../entities/user.entity';
import { resolveAdminPassword, resolveAdminUsername } from '../../config/env';
import {
  generateTotpSecret,
  totpKeyUri,
  totpQrDataUrl,
  verifyTotpCode,
} from './totp.util';

export type NotifyPrefs = {
  jobDone: boolean;
  jobFail: boolean;
  systemAnnounce: boolean;
};

export type PublicUser = {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  theme: 'light' | 'dark';
  role: string;
  roleId: string;
  deptId: string;
  totpEnabled: boolean;
  notifyPrefs: NotifyPrefs;
  createdAt: Date;
};

const DEFAULT_NOTIFY: NotifyPrefs = {
  jobDone: true,
  jobFail: true,
  systemAnnounce: true,
};

function normalizeNotifyPrefs(raw: User['notifyPrefs'] | null | undefined): NotifyPrefs {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    jobDone: src.jobDone !== false ? DEFAULT_NOTIFY.jobDone : false,
    jobFail: src.jobFail !== false ? DEFAULT_NOTIFY.jobFail : false,
    systemAnnounce: src.systemAnnounce !== false ? DEFAULT_NOTIFY.systemAnnounce : false,
  };
}

@Injectable()
export class AuthService implements OnModuleInit {
  /** 绑定中的临时密钥（userId → secret），确认前不落库启用 */
  private pendingTotp = new Map<number, { secret: string; at: number }>();

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    const count = await this.users.count();
    if (count === 0) {
      const password = resolveAdminPassword();
      const user = this.users.create({
        username: resolveAdminUsername(),
        passwordHash: await bcrypt.hash(password, 10),
        role: 'admin',
        nickname: '',
        avatar: '',
        theme: 'dark',
        totpSecret: '',
        totpEnabled: false,
      });
      await this.users.save(user);
      console.log(`[Auth] default admin created (user=${user.username})`);
    } else {
      // 产品统一纳米深色：历史 light 账号一次性迁到 dark
      const legacy = await this.users.find({ where: { theme: 'light' } });
      for (const u of legacy) {
        u.theme = 'dark';
        await this.users.save(u);
      }
      if (legacy.length) {
        console.log(`[Auth] migrated ${legacy.length} user(s) theme light → dark`);
      }
    }
  }

  toPublic(user: User): PublicUser {
    const theme = user.theme === 'dark' ? 'dark' : 'light';
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      theme,
      role: user.role,
      roleId: user.roleId || '',
      deptId: user.deptId || '',
      totpEnabled: Boolean(user.totpEnabled),
      notifyPrefs: normalizeNotifyPrefs(user.notifyPrefs),
      createdAt: user.createdAt,
    };
  }

  async validate(username: string, password: string) {
    const user = await this.users.findOne({ where: { username } });
    if (!user) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  /**
   * 登录：账号密码 + 腾讯身份验证器（TOTP）动态码。
   * 尚未绑定时允许先密码登录，并返回 totpSetupRequired 引导绑定。
   */
  async login(username: string, password: string, totpCode: string) {
    const user = await this.validate(username, password);
    if (!user) return null;

    if (user.totpEnabled) {
      if (!verifyTotpCode(user.totpSecret, totpCode)) return null;
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    return {
      token,
      user: this.toPublic(user),
      totpSetupRequired: false,
    };
  }

  async profile(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) return null;
    return this.toPublic(user);
  }

  async beginTotpSetup(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');
    if (user.totpEnabled) {
      throw new BadRequestException('已绑定验证器，如需更换请先关闭后再绑定');
    }
    const secret = generateTotpSecret();
    this.pendingTotp.set(userId, { secret, at: Date.now() });
    const otpauthUrl = totpKeyUri(user.username, secret);
    const qrDataUrl = await totpQrDataUrl(otpauthUrl);
    return {
      secret,
      otpauthUrl,
      qrDataUrl,
      issuer: 'AIGC 视频工厂',
      account: user.username,
    };
  }

  async confirmTotpSetup(userId: number, code: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');
    const pending = this.pendingTotp.get(userId);
    if (!pending?.secret || Date.now() - pending.at > 15 * 60_000) {
      this.pendingTotp.delete(userId);
      throw new BadRequestException('绑定已过期，请重新获取二维码');
    }
    if (!verifyTotpCode(pending.secret, code)) {
      throw new BadRequestException('验证码错误，请确认腾讯身份验证器中的 6 位数字');
    }
    user.totpSecret = pending.secret;
    user.totpEnabled = true;
    await this.users.save(user);
    this.pendingTotp.delete(userId);
    return { ok: true, user: this.toPublic(user) };
  }

  async disableTotp(userId: number, password: string, code: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');
    if (!user.totpEnabled) throw new BadRequestException('尚未绑定验证器');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new BadRequestException('密码错误');
    if (!verifyTotpCode(user.totpSecret, code)) {
      throw new BadRequestException('验证码错误');
    }
    user.totpSecret = '';
    user.totpEnabled = false;
    await this.users.save(user);
    this.pendingTotp.delete(userId);
    return { ok: true, user: this.toPublic(user) };
  }

  async updateNotifyPrefs(userId: number, prefs: Partial<NotifyPrefs>) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');
    const cur = this.toPublic(user).notifyPrefs;
    user.notifyPrefs = {
      jobDone: prefs.jobDone !== undefined ? Boolean(prefs.jobDone) : cur.jobDone,
      jobFail: prefs.jobFail !== undefined ? Boolean(prefs.jobFail) : cur.jobFail,
      systemAnnounce:
        prefs.systemAnnounce !== undefined ? Boolean(prefs.systemAnnounce) : cur.systemAnnounce,
    };
    await this.users.save(user);
    return this.toPublic(user);
  }

  async updateProfileFields(
    userId: number,
    fields: { nickname?: string; avatar?: string; theme?: string },
  ) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');
    if (fields.nickname !== undefined) {
      const nick = String(fields.nickname || '').trim();
      if (!nick) throw new BadRequestException('昵称不能为空');
      if (nick.length > 32) throw new BadRequestException('昵称最多 32 字');
      user.nickname = nick;
    }
    if (fields.avatar !== undefined) {
      user.avatar = String(fields.avatar || '').trim();
    }
    if (fields.theme !== undefined) {
      const t = String(fields.theme || '').trim();
      if (t !== 'light' && t !== 'dark') {
        throw new BadRequestException('主题仅支持 light 或 dark');
      }
      user.theme = t;
    }
    await this.users.save(user);
    return this.toPublic(user);
  }

  async changeUsername(userId: number, newUsername: string, oldPassword: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');
    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('原密码错误');
    const next = String(newUsername || '').trim();
    if (next.length < 2 || next.length > 32) {
      throw new BadRequestException('用户名需 2–32 个字符');
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/.test(next)) {
      throw new BadRequestException('用户名仅支持中英文、数字、下划线和短横线');
    }
    if (next !== user.username) {
      const taken = await this.users.findOne({ where: { username: next } });
      if (taken) throw new BadRequestException('用户名已被占用');
      user.username = next;
      await this.users.save(user);
    }
    const token = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    return { user: this.toPublic(user), token };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('用户不存在');
    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('原密码错误');
    const next = String(newPassword || '');
    if (next.length < 6) throw new BadRequestException('新密码至少 6 位');
    user.passwordHash = await bcrypt.hash(next, 10);
    await this.users.save(user);
    return { ok: true };
  }
}
