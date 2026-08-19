import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities/user.entity';
import { Project } from '../../entities/project.entity';
import { Production } from '../../entities/production.entity';
import { Asset } from '../../entities/asset.entity';
import { JobRun } from '../../entities/job-run.entity';
import { DiscoverPost } from '../../entities/discover-post.entity';
import { Workflow } from '../../entities/workflow.entity';
import { GenerateSession } from '../../entities/generate-session.entity';
import { SettingsService } from '../settings/settings.service';
import { JobsService } from '../jobs/jobs.service';
import { FileOssService } from '../storage/file-oss.service';
import { CmsService } from '../cms/cms.service';
import { RbacService } from '../rbac/rbac.service';
import type { CmsItem } from '../../entities/cms-item.entity';

function pageParams(page?: number, pageSize?: number) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  return { page: p, pageSize: size, skip: (p - 1) * size, take: size };
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Production) private readonly productions: Repository<Production>,
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(JobRun) private readonly jobs: Repository<JobRun>,
    @InjectRepository(DiscoverPost) private readonly discover: Repository<DiscoverPost>,
    @InjectRepository(Workflow) private readonly workflows: Repository<Workflow>,
    @InjectRepository(GenerateSession) private readonly sessions: Repository<GenerateSession>,
    private readonly settings: SettingsService,
    private readonly jobsService: JobsService,
    private readonly fileOss: FileOssService,
    private readonly cms: CmsService,
    private readonly rbac: RbacService,
  ) {}

  async dashboard() {
    const [
      userCount,
      projectCount,
      productionCount,
      assetCount,
      jobCount,
      runningJobs,
      discoverCount,
      workflowCount,
      sessionCount,
    ] = await Promise.all([
      this.users.count(),
      this.projects.count(),
      this.productions.count(),
      this.assets.count(),
      this.jobs.count(),
      this.jobs.count({ where: { status: 'active' as any } }),
      this.discover.count(),
      this.workflows.count(),
      this.sessions.count(),
    ]);

    const recentJobs = await this.jobs.find({
      order: { createdAt: 'DESC' },
      take: 8,
    });
    const recentProjects = await this.projects.find({
      order: { updatedAt: 'DESC' },
      take: 6,
    });

    return {
      stats: {
        userCount,
        projectCount,
        productionCount,
        assetCount,
        jobCount,
        runningJobs,
        discoverCount,
        workflowCount,
        sessionCount,
      },
      recentJobs,
      recentProjects,
    };
  }

  async listUsers(q?: string, page?: number, pageSize?: number) {
    const { skip, take, page: p, pageSize: size } = pageParams(page, pageSize);
    const where = q?.trim()
      ? [{ username: Like(`%${q.trim()}%`) }, { nickname: Like(`%${q.trim()}%`) }]
      : undefined;
    const [list, total] = await this.users.findAndCount({
      where,
      order: { id: 'DESC' },
      skip,
      take,
    });
    const roleList = await this.rbac.listRoles();
    const deptTree = await this.rbac.listDeptTree();
    const flatDepts: Array<{ id: string; name: string }> = [];
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        flatDepts.push({ id: n.id, name: n.name });
        if (n.children?.length) walk(n.children);
      }
    };
    walk(deptTree as any[]);
    const roleMap = new Map(roleList.map((r) => [r.id, r]));
    const deptMap = new Map(flatDepts.map((d) => [d.id, d]));

    return {
      list: list.map((u) => ({
        id: u.id,
        username: u.username,
        nickname: u.nickname || '',
        avatar: u.avatar || '',
        role: u.role,
        roleId: u.roleId || '',
        roleName: roleMap.get(u.roleId)?.name || '',
        deptId: u.deptId || '',
        deptName: deptMap.get(u.deptId)?.name || '',
        theme: u.theme,
        totpEnabled: Boolean(u.totpEnabled),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      total,
      page: p,
      pageSize: size,
    };
  }

  async createUser(input: {
    username: string;
    password: string;
    nickname?: string;
    role?: string;
    roleId?: string;
    deptId?: string;
  }) {
    const username = String(input.username || '').trim();
    const password = String(input.password || '');
    if (!username || username.length < 2) throw new BadRequestException('用户名至少 2 位');
    if (password.length < 6) throw new BadRequestException('密码至少 6 位');
    const exists = await this.users.findOne({ where: { username } });
    if (exists) throw new BadRequestException('用户名已存在');
    const roleEntity = await this.rbac.resolveRoleCode(
      input.roleId,
      input.role || 'user',
    );
    const roleCode = roleEntity?.code || (input.role === 'admin' ? 'admin' : 'user');
    const user = this.users.create({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role: roleCode,
      roleId: roleEntity?.id || '',
      deptId: String(input.deptId || '').trim(),
      nickname: String(input.nickname || '').trim(),
      avatar: '',
      theme: 'dark',
      totpSecret: '',
      totpEnabled: false,
    });
    await this.users.save(user);
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      roleId: user.roleId,
      deptId: user.deptId,
      createdAt: user.createdAt,
    };
  }

  async updateUser(
    id: number,
    input: {
      nickname?: string;
      role?: string;
      roleId?: string;
      deptId?: string;
      password?: string;
      theme?: string;
    },
  ) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    if (input.nickname !== undefined) user.nickname = String(input.nickname || '').trim();
    if (input.deptId !== undefined) user.deptId = String(input.deptId || '').trim();
    if (input.roleId !== undefined || input.role !== undefined) {
      const roleEntity = await this.rbac.resolveRoleCode(input.roleId, input.role);
      if (roleEntity) {
        user.roleId = roleEntity.id;
        user.role = roleEntity.code;
      } else if (input.role === 'admin' || input.role === 'user') {
        user.role = input.role;
      }
    }
    if (input.theme === 'light' || input.theme === 'dark') user.theme = input.theme;
    if (input.password) {
      if (input.password.length < 6) throw new BadRequestException('密码至少 6 位');
      user.passwordHash = await bcrypt.hash(input.password, 10);
    }
    await this.users.save(user);
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      roleId: user.roleId,
      deptId: user.deptId,
      theme: user.theme,
      updatedAt: user.updatedAt,
    };
  }

  async deleteUser(id: number, operatorId: number) {
    if (id === operatorId) throw new BadRequestException('不能删除当前登录账号');
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    const adminCount = await this.users.count({ where: { role: 'admin' } });
    if (user.role === 'admin' && adminCount <= 1) {
      throw new BadRequestException('至少保留一名管理员');
    }
    await this.users.remove(user);
    return { ok: true };
  }

  async listProjects(q?: string, page?: number, pageSize?: number) {
    const { skip, take, page: p, pageSize: size } = pageParams(page, pageSize);
    const where = q?.trim() ? { title: Like(`%${q.trim()}%`) } : undefined;
    const [list, total] = await this.projects.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip,
      take,
    });
    return { list, total, page: p, pageSize: size };
  }

  async deleteProject(id: string) {
    const row = await this.projects.findOne({ where: { id } });
    if (!row) throw new NotFoundException('项目不存在');
    await this.projects.remove(row);
    return { ok: true };
  }

  async listProductions(q?: string, page?: number, pageSize?: number) {
    const { skip, take, page: p, pageSize: size } = pageParams(page, pageSize);
    const where = q?.trim() ? { name: Like(`%${q.trim()}%`) } : undefined;
    const [list, total] = await this.productions.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip,
      take,
    });
    return { list, total, page: p, pageSize: size };
  }

  async deleteProduction(id: string) {
    const row = await this.productions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('制作单不存在');
    await this.productions.remove(row);
    return { ok: true };
  }

  async listAssets(q?: string, type?: string, page?: number, pageSize?: number) {
    const { skip, take, page: p, pageSize: size } = pageParams(page, pageSize);
    const qb = this.assets.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');
    if (type?.trim()) qb.andWhere('a.type = :type', { type: type.trim() });
    if (q?.trim()) {
      qb.andWhere('(a.name LIKE :q OR a.prompt LIKE :q OR a.projectId LIKE :q)', {
        q: `%${q.trim()}%`,
      });
    }
    const [list, total] = await qb.skip(skip).take(take).getManyAndCount();
    return { list, total, page: p, pageSize: size };
  }

  async deleteAsset(id: string) {
    const row = await this.assets.findOne({ where: { id } });
    if (!row) throw new NotFoundException('资产不存在');
    await this.assets.remove(row);
    return { ok: true };
  }

  async listJobs(status?: string, page?: number, pageSize?: number) {
    const { skip, take, page: p, pageSize: size } = pageParams(page, pageSize);
    const where = status?.trim() ? { status: status.trim() as any } : undefined;
    const [list, total] = await this.jobs.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { list, total, page: p, pageSize: size };
  }

  cancelJob(id: string) {
    return this.jobsService.cancel(id);
  }

  clearFinishedJobs() {
    return this.jobsService.clearFinished();
  }

  async deleteJob(id: string) {
    return this.jobsService.remove(id);
  }

  async listDiscover(q?: string, page?: number, pageSize?: number) {
    const { skip, take, page: p, pageSize: size } = pageParams(page, pageSize);
    const where = q?.trim() ? { title: Like(`%${q.trim()}%`) } : undefined;
    const [list, total] = await this.discover.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { list, total, page: p, pageSize: size };
  }

  async deleteDiscover(id: string) {
    const row = await this.discover.findOne({ where: { id } });
    if (!row) throw new NotFoundException('内容不存在');
    await this.discover.remove(row);
    return { ok: true };
  }

  getSettings() {
    return this.settings.get();
  }

  async updateSettings(body: Record<string, unknown>) {
    const data = await this.settings.update(body as any);
    this.fileOss.invalidateCache();
    if (body?.fileOss) {
      try {
        await this.fileOss.ensureMinioReady();
      } catch {
        /* 保存成功即可；连通性由测试接口反馈 */
      }
    }
    return data;
  }

  async testFileOss() {
    this.fileOss.invalidateCache();
    try {
      await this.fileOss.ensureMinioReady();
    } catch (e: any) {
      return { ok: false, message: String(e?.message || e || 'MinIO 初始化失败') };
    }
    return this.fileOss.testConnection();
  }

  removeChannel(slug: string) {
    return this.settings.removeLocalChannel(slug);
  }

  upsertModel(body: {
    modelId: string;
    channelSlug: string;
    title?: string;
    label?: string;
    modalities?: string[];
    enabled?: boolean;
    channelTitle?: string;
  }) {
    try {
      return this.settings.upsertLocalModel(body);
    } catch (e: any) {
      throw new BadRequestException(e?.message || '模型保存失败');
    }
  }

  removeModel(modelId: string, channelSlug?: string) {
    return this.settings.removeLocalModel(modelId, channelSlug);
  }

  listCms(type?: string, q?: string) {
    return this.cms.listAdmin(type, q);
  }

  exportCms() {
    return this.cms.exportAll();
  }

  importCms(body: { items?: Array<Partial<CmsItem>>; mode?: 'merge' | 'replace' }) {
    return this.cms.importBundle(body);
  }

  createCms(body: Partial<CmsItem>) {
    return this.cms.create(body);
  }

  updateCms(id: string, body: Partial<CmsItem>) {
    return this.cms.update(id, body);
  }

  deleteCms(id: string) {
    return this.cms.remove(id);
  }

  async uploadCmsMedia(
    file: {
      buffer?: Buffer;
      mimetype?: string;
      originalname?: string;
      size?: number;
    },
    preferredName?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请选择文件');
    }
    if (!(await this.fileOss.isConfigured())) {
      throw new BadRequestException('对象存储未配置，请先在后台「对象存储」填写 MinIO');
    }
    const mime = String(file.mimetype || '').toLowerCase();
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    if (!isImage && !isVideo) {
      throw new BadRequestException('仅支持图片或视频');
    }
    const max = isVideo ? 200 * 1024 * 1024 : 20 * 1024 * 1024;
    if ((file.size || file.buffer.length) > max) {
      throw new BadRequestException(isVideo ? '视频请小于 200MB' : '图片请小于 20MB');
    }
    const srcName = String(file.originalname || '').trim();
    const fallbackExt = isVideo ? '.mp4' : '.jpg';
    const srcExt = srcName.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() || fallbackExt;
    const rawPreferred = String(preferredName || '').trim();
    let fileName = '';
    if (rawPreferred) {
      const base = rawPreferred.replace(/\\/g, '/').split('/').pop() || '';
      const cleaned = base.replace(/[^\w.\-()+]/g, '_');
      fileName = cleaned.includes('.') ? cleaned : `${cleaned || 'media'}${srcExt}`;
    } else {
      fileName = srcName ? srcName.replace(/[^\w.\-()+]/g, '_') : `media${srcExt}`;
      if (!/\.[a-z0-9]+$/i.test(fileName)) fileName = `${fileName}${srcExt}`;
    }
    const key = await this.fileOss.buildKey('cms', fileName, 'cms');
    const put = await this.fileOss.putObject({
      key,
      body: file.buffer,
      contentType: mime || (isVideo ? 'video/mp4' : 'image/jpeg'),
      metadata: { kind: 'cms-media', original: srcName.slice(0, 120) },
    });
    return { url: put.url, key: put.key, fileName };
  }
}
