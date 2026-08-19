import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { Dept } from '../../entities/dept.entity';
import { Role } from '../../entities/role.entity';
import { SysMenu, type SysMenuType } from '../../entities/sys-menu.entity';
import { User } from '../../entities/user.entity';

export type MenuTreeNode = {
  id: string;
  parentId: string;
  type: SysMenuType;
  title: string;
  path: string;
  icon: string;
  component: string;
  permission: string;
  sort: number;
  hidden: boolean;
  status: string;
  children?: MenuTreeNode[];
};

export type DeptTreeNode = {
  id: string;
  parentId: string;
  name: string;
  sort: number;
  status: string;
  description: string;
  children?: DeptTreeNode[];
};

type MenuSeed = {
  key: string;
  parentKey?: string;
  type: SysMenuType;
  title: string;
  path?: string;
  icon?: string;
  component?: string;
  permission?: string;
  sort?: number;
  hidden?: boolean;
};

const MENU_SEEDS: MenuSeed[] = [
  { key: 'overview', type: 1, title: '概览', icon: 'icon-dashboard', sort: 10 },
  {
    key: 'dashboard',
    parentKey: 'overview',
    type: 2,
    title: '工作台',
    path: '/dashboard',
    icon: 'icon-dashboard',
    component: 'dashboard/index',
    permission: 'dashboard:view',
    sort: 10,
  },

  { key: 'ops', type: 1, title: '运营中心', icon: 'icon-apps', sort: 20 },
  {
    key: 'cms',
    parentKey: 'ops',
    type: 2,
    title: '内容总览',
    path: '/cms',
    icon: 'icon-apps',
    component: 'ops/cms/index',
    permission: 'cms:view',
    sort: 10,
  },
  {
    key: 'cms-banner',
    parentKey: 'ops',
    type: 2,
    title: '轮播',
    path: '/cms/banner',
    icon: 'icon-apps',
    component: 'ops/cms/CmsTypePage',
    permission: 'cms:banner:view',
    sort: 11,
  },
  {
    key: 'cms-entry',
    parentKey: 'ops',
    type: 2,
    title: '入口卡',
    path: '/cms/entry',
    icon: 'icon-apps',
    component: 'ops/cms/CmsTypePage',
    permission: 'cms:entry:view',
    sort: 12,
  },
  {
    key: 'cms-showcase',
    parentKey: 'ops',
    type: 2,
    title: '精选作品',
    path: '/cms/showcase',
    icon: 'icon-apps',
    component: 'ops/cms/CmsTypePage',
    permission: 'cms:showcase:view',
    sort: 13,
  },
  {
    key: 'cms-discover',
    parentKey: 'ops',
    type: 2,
    title: '官方发现',
    path: '/cms/discover',
    icon: 'icon-apps',
    component: 'ops/cms/CmsTypePage',
    permission: 'cms:discover:view',
    sort: 14,
  },
  {
    key: 'cms-tool',
    parentKey: 'ops',
    type: 2,
    title: '工具箱',
    path: '/cms/tool',
    icon: 'icon-apps',
    component: 'ops/cms/CmsTypePage',
    permission: 'cms:tool:view',
    sort: 15,
  },
  {
    key: 'cms-skill',
    parentKey: 'ops',
    type: 2,
    title: '技能精选',
    path: '/cms/skill',
    icon: 'icon-apps',
    component: 'ops/cms/CmsTypePage',
    permission: 'cms:skill:view',
    sort: 16,
  },
  {
    key: 'cms-nav',
    parentKey: 'ops',
    type: 2,
    title: '侧栏导航',
    path: '/cms/nav',
    icon: 'icon-menu',
    component: 'ops/cms/CmsTypePage',
    permission: 'cms:nav:view',
    sort: 17,
  },
  {
    key: 'cms-brand',
    parentKey: 'ops',
    type: 2,
    title: '品牌 Logo',
    path: '/cms/brand',
    icon: 'icon-apps',
    component: 'ops/cms/CmsTypePage',
    permission: 'cms:brand:view',
    sort: 18,
  },
  {
    key: 'cms-notice',
    parentKey: 'ops',
    type: 2,
    title: '公告',
    path: '/cms/notice',
    icon: 'icon-apps',
    component: 'ops/cms/CmsTypePage',
    permission: 'cms:notice:view',
    sort: 19,
  },
  {
    key: 'discover',
    parentKey: 'ops',
    type: 2,
    title: '用户发布',
    path: '/discover',
    icon: 'icon-apps',
    component: 'ops/discover/index',
    permission: 'discover:view',
    sort: 30,
  },

  { key: 'resource', type: 1, title: '资源配置', icon: 'icon-storage', sort: 30 },
  {
    key: 'storage',
    parentKey: 'resource',
    type: 2,
    title: '对象存储',
    path: '/storage',
    icon: 'icon-storage',
    component: 'resource/storage/index',
    permission: 'storage:view',
    sort: 10,
  },
  {
    key: 'channels',
    parentKey: 'resource',
    type: 2,
    title: '渠道管理',
    path: '/channels',
    icon: 'icon-thunderbolt',
    component: 'resource/channels/index',
    permission: 'channels:view',
    sort: 20,
  },
  {
    key: 'models',
    parentKey: 'resource',
    type: 2,
    title: '模型管理',
    path: '/models',
    icon: 'icon-robot',
    component: 'resource/models/index',
    permission: 'models:view',
    sort: 30,
  },

  { key: 'biz', type: 1, title: '业务数据', icon: 'icon-book', sort: 40 },
  {
    key: 'projects',
    parentKey: 'biz',
    type: 2,
    title: '书库项目',
    path: '/projects',
    icon: 'icon-book',
    component: 'biz/projects/index',
    permission: 'projects:view',
    sort: 10,
  },
  {
    key: 'productions',
    parentKey: 'biz',
    type: 2,
    title: '制作项目',
    path: '/productions',
    icon: 'icon-video-camera',
    component: 'biz/productions/index',
    permission: 'productions:view',
    sort: 20,
  },
  {
    key: 'assets',
    parentKey: 'biz',
    type: 2,
    title: '资产管理',
    path: '/assets',
    icon: 'icon-folder',
    component: 'biz/assets/index',
    permission: 'assets:view',
    sort: 30,
  },
  {
    key: 'jobs',
    parentKey: 'biz',
    type: 2,
    title: '任务中心',
    path: '/jobs',
    icon: 'icon-calendar',
    component: 'biz/jobs/index',
    permission: 'jobs:view',
    sort: 40,
  },

  { key: 'system', type: 1, title: '系统管理', icon: 'icon-settings', sort: 90 },
  {
    key: 'users',
    parentKey: 'system',
    type: 2,
    title: '用户管理',
    path: '/system/users',
    icon: 'icon-user',
    component: 'system/users/index',
    permission: 'system:user:list',
    sort: 10,
  },
  {
    key: 'roles',
    parentKey: 'system',
    type: 2,
    title: '角色管理',
    path: '/system/roles',
    icon: 'icon-user-group',
    component: 'system/roles/index',
    permission: 'system:role:list',
    sort: 20,
  },
  {
    key: 'depts',
    parentKey: 'system',
    type: 2,
    title: '部门管理',
    path: '/system/depts',
    icon: 'icon-mind-mapping',
    component: 'system/depts/index',
    permission: 'system:dept:list',
    sort: 30,
  },
  {
    key: 'menus',
    parentKey: 'system',
    type: 2,
    title: '菜单管理',
    path: '/system/menus',
    icon: 'icon-menu',
    component: 'system/menus/index',
    permission: 'system:menu:list',
    sort: 40,
  },
  {
    key: 'settings',
    parentKey: 'system',
    type: 2,
    title: '系统设置',
    path: '/settings',
    icon: 'icon-settings',
    component: 'system/settings/index',
    permission: 'settings:view',
    sort: 50,
  },
];

@Injectable()
export class RbacService implements OnModuleInit {
  constructor(
    @InjectRepository(Dept) private readonly depts: Repository<Dept>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(SysMenu) private readonly menus: Repository<SysMenu>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSeed();
    } catch (e: any) {
      console.warn(`[Rbac] seed skipped: ${e?.message || e}`);
    }
  }

  private async ensureSeed() {
    let rootDept = await this.depts.findOne({ where: { name: '总公司', parentId: '' } });
    if (!rootDept) {
      rootDept = await this.depts.save(
        this.depts.create({
          parentId: '',
          name: '总公司',
          sort: 1,
          status: '1',
          description: '根部门',
        }),
      );
      await this.depts.save([
        this.depts.create({
          parentId: rootDept.id,
          name: '运营部',
          sort: 1,
          status: '1',
          description: '',
        }),
        this.depts.create({
          parentId: rootDept.id,
          name: '研发部',
          sort: 2,
          status: '1',
          description: '',
        }),
      ]);
    }

    const keyToId = new Map<string, string>();
    // 幂等：按 title(目录) / path(菜单) 补齐缺失种子，避免半途种子后无法补全
    for (const seed of MENU_SEEDS.filter((s) => !s.parentKey)) {
      let row = await this.menus.findOne({
        where: { title: seed.title, parentId: '', type: 1 },
      });
      if (!row) {
        row = await this.menus.save(
          this.menus.create({
            parentId: '',
            type: seed.type,
            title: seed.title,
            path: seed.path || '',
            icon: seed.icon || '',
            component: seed.component || '',
            permission: seed.permission || '',
            sort: seed.sort || 0,
            hidden: Boolean(seed.hidden),
            status: '1',
          }),
        );
      }
      keyToId.set(seed.key, row.id);
    }
    for (const seed of MENU_SEEDS.filter((s) => s.parentKey)) {
      const parentId = keyToId.get(seed.parentKey!) || '';
      let row: SysMenu | null = null;
      if (seed.path) {
        row = await this.menus.findOne({ where: { path: seed.path } });
      }
      if (!row && seed.permission) {
        row = await this.menus.findOne({ where: { permission: seed.permission } });
      }
      if (!row) {
        row = await this.menus.save(
          this.menus.create({
            parentId,
            type: seed.type,
            title: seed.title,
            path: seed.path || '',
            icon: seed.icon || '',
            component: seed.component || '',
            permission: seed.permission || '',
            sort: seed.sort || 0,
            hidden: Boolean(seed.hidden),
            status: '1',
          }),
        );
      } else {
        let dirty = false;
        if (parentId && row.parentId !== parentId) {
          row.parentId = parentId;
          dirty = true;
        }
        if (seed.title && row.title !== seed.title) {
          row.title = seed.title;
          dirty = true;
        }
        if (seed.icon != null && row.icon !== (seed.icon || '')) {
          row.icon = seed.icon || '';
          dirty = true;
        }
        if (seed.component != null && row.component !== (seed.component || '')) {
          row.component = seed.component || '';
          dirty = true;
        }
        if (seed.permission != null && row.permission !== (seed.permission || '')) {
          row.permission = seed.permission || '';
          dirty = true;
        }
        if (seed.sort != null && row.sort !== seed.sort) {
          row.sort = seed.sort;
          dirty = true;
        }
        if (dirty) await this.menus.save(row);
      }
      keyToId.set(seed.key, row.id);
    }

    let adminRole = await this.roles.findOne({
      where: { code: 'admin' },
      relations: ['menus'],
    });
    const allMenus = await this.menus.find();
    if (!adminRole) {
      adminRole = this.roles.create({
        name: '超级管理员',
        code: 'admin',
        sort: 1,
        status: '1',
        description: '拥有全部后台权限',
        menus: allMenus,
      });
      await this.roles.save(adminRole);
    } else if ((adminRole.menus?.length || 0) < allMenus.length) {
      adminRole.menus = allMenus;
      await this.roles.save(adminRole);
    }

    let opsRole = await this.roles.findOne({
      where: { code: 'ops' },
      relations: ['menus'],
    });
    const opsPaths = [
      '/dashboard',
      '/cms',
      '/cms/banner',
      '/cms/entry',
      '/cms/showcase',
      '/cms/discover',
      '/cms/tool',
      '/cms/skill',
      '/cms/nav',
      '/cms/brand',
      '/cms/notice',
      '/discover',
      '/projects',
      '/productions',
      '/assets',
      '/jobs',
    ];
    if (!opsRole) {
      const opsMenus = await this.menus.find({
        where: [{ path: In(opsPaths) }, { title: In(['概览', '运营中心', '业务数据']) }],
      });
      // also include parent dirs
      const parentIds = [...new Set(opsMenus.map((m) => m.parentId).filter(Boolean))];
      const parents = parentIds.length
        ? await this.menus.find({ where: { id: In(parentIds) } })
        : [];
      opsRole = this.roles.create({
        name: '运营人员',
        code: 'ops',
        sort: 2,
        status: '1',
        description: '运营与业务数据，无系统管理',
        menus: [...parents, ...opsMenus],
      });
      await this.roles.save(opsRole);
    } else {
      const opsMenus = await this.menus.find({
        where: [{ path: In(opsPaths) }, { title: In(['概览', '运营中心', '业务数据']) }],
      });
      const parentIds = [...new Set(opsMenus.map((m) => m.parentId).filter(Boolean))];
      const parents = parentIds.length
        ? await this.menus.find({ where: { id: In(parentIds) } })
        : [];
      const desired = [...parents, ...opsMenus];
      const desiredIds = new Set(desired.map((m) => m.id));
      const currentIds = new Set((opsRole.menus || []).map((m) => m.id));
      const missing = [...desiredIds].some((id) => !currentIds.has(id));
      if (missing || (opsRole.menus?.length || 0) < desired.length) {
        opsRole.menus = desired;
        await this.roles.save(opsRole);
      }
    }

    let userRole = await this.roles.findOne({ where: { code: 'user' } });
    if (!userRole) {
      userRole = await this.roles.save(
        this.roles.create({
          name: '普通用户',
          code: 'user',
          sort: 3,
          status: '1',
          description: '前台用户，默认无后台菜单',
          menus: [],
        }),
      );
    }

    // 回填已有用户 roleId / deptId
    const legacyAdmins = await this.users.find({ where: { role: 'admin' } });
    for (const u of legacyAdmins) {
      let changed = false;
      if (!u.roleId) {
        u.roleId = adminRole.id;
        changed = true;
      }
      if (!u.deptId && rootDept) {
        u.deptId = rootDept.id;
        changed = true;
      }
      if (changed) await this.users.save(u);
    }
    const legacyUsers = await this.users.find({ where: { role: 'user' } });
    for (const u of legacyUsers) {
      if (!u.roleId) {
        u.roleId = userRole.id;
        await this.users.save(u);
      }
    }

    console.log('[Rbac] seed ready');
  }

  private buildTree<T extends { id: string; parentId: string; sort: number }>(
    rows: T[],
  ): Array<T & { children?: Array<T & { children?: any[] }> }> {
    const map = new Map<string, T & { children?: any[] }>();
    for (const r of rows) map.set(r.id, { ...r, children: [] });
    const roots: Array<T & { children?: any[] }> = [];
    for (const r of rows) {
      const node = map.get(r.id)!;
      if (r.parentId && map.has(r.parentId)) {
        map.get(r.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }
    const sortRec = (list: Array<T & { children?: any[] }>) => {
      list.sort((a, b) => a.sort - b.sort);
      for (const n of list) if (n.children?.length) sortRec(n.children);
      else delete n.children;
    };
    sortRec(roots);
    return roots;
  }

  // ─── Dept ─────────────────────────────────────────────
  async listDeptTree(q?: string) {
    let rows = await this.depts.find({ order: { sort: 'ASC', createdAt: 'ASC' } });
    if (q?.trim()) {
      const kw = q.trim();
      rows = rows.filter((d) => d.name.includes(kw));
    }
    return this.buildTree(rows);
  }

  async createDept(input: Partial<Dept>) {
    const name = String(input.name || '').trim();
    if (!name) throw new BadRequestException('部门名称必填');
    const row = this.depts.create({
      parentId: String(input.parentId || '').trim(),
      name,
      sort: Number(input.sort) || 0,
      status: input.status === '0' ? '0' : '1',
      description: String(input.description || ''),
    });
    return this.depts.save(row);
  }

  async updateDept(id: string, input: Partial<Dept>) {
    const row = await this.depts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('部门不存在');
    if (input.parentId !== undefined) {
      const pid = String(input.parentId || '').trim();
      if (pid === id) throw new BadRequestException('上级部门不能是自己');
      row.parentId = pid;
    }
    if (input.name !== undefined) row.name = String(input.name || '').trim() || row.name;
    if (input.sort !== undefined) row.sort = Number(input.sort) || 0;
    if (input.status !== undefined) row.status = input.status === '0' ? '0' : '1';
    if (input.description !== undefined) row.description = String(input.description || '');
    return this.depts.save(row);
  }

  async deleteDept(id: string) {
    const children = await this.depts.count({ where: { parentId: id } });
    if (children > 0) throw new BadRequestException('请先删除子部门');
    const users = await this.users.count({ where: { deptId: id } });
    if (users > 0) throw new BadRequestException('部门下仍有用户');
    const row = await this.depts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('部门不存在');
    await this.depts.remove(row);
    return { ok: true };
  }

  // ─── Role ─────────────────────────────────────────────
  async listRoles(q?: string) {
    const where = q?.trim()
      ? [{ name: Like(`%${q.trim()}%`) }, { code: Like(`%${q.trim()}%`) }]
      : undefined;
    const list = await this.roles.find({
      where,
      order: { sort: 'ASC', createdAt: 'ASC' },
      relations: ['menus'],
    });
    return list.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      sort: r.sort,
      status: r.status,
      description: r.description,
      menuIds: (r.menus || []).map((m) => m.id),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createRole(input: {
    name: string;
    code: string;
    sort?: number;
    status?: string;
    description?: string;
    menuIds?: string[];
  }) {
    const name = String(input.name || '').trim();
    const code = String(input.code || '').trim();
    if (!name || !code) throw new BadRequestException('角色名与编码必填');
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(code)) {
      throw new BadRequestException('角色编码需字母开头，仅含字母数字_-');
    }
    const exists = await this.roles.findOne({ where: { code } });
    if (exists) throw new BadRequestException('角色编码已存在');
    const menus = input.menuIds?.length
      ? await this.menus.find({ where: { id: In(input.menuIds) } })
      : [];
    const row = this.roles.create({
      name,
      code,
      sort: Number(input.sort) || 0,
      status: input.status === '0' ? '0' : '1',
      description: String(input.description || ''),
      menus,
    });
    return this.roles.save(row);
  }

  async updateRole(
    id: string,
    input: {
      name?: string;
      code?: string;
      sort?: number;
      status?: string;
      description?: string;
      menuIds?: string[];
    },
  ) {
    const row = await this.roles.findOne({ where: { id }, relations: ['menus'] });
    if (!row) throw new NotFoundException('角色不存在');
    if (input.name !== undefined) row.name = String(input.name || '').trim() || row.name;
    if (input.code !== undefined) {
      const code = String(input.code || '').trim();
      if (code && code !== row.code) {
        const exists = await this.roles.findOne({ where: { code } });
        if (exists) throw new BadRequestException('角色编码已存在');
        row.code = code;
      }
    }
    if (input.sort !== undefined) row.sort = Number(input.sort) || 0;
    if (input.status !== undefined) row.status = input.status === '0' ? '0' : '1';
    if (input.description !== undefined) row.description = String(input.description || '');
    if (input.menuIds) {
      row.menus = input.menuIds.length
        ? await this.menus.find({ where: { id: In(input.menuIds) } })
        : [];
    }
    await this.roles.save(row);
    // 同步用户 role 字符串
    if (input.code) {
      await this.users.update({ roleId: id }, { role: row.code });
    }
    return this.listRoles().then((list) => list.find((x) => x.id === id));
  }

  async deleteRole(id: string) {
    const row = await this.roles.findOne({ where: { id } });
    if (!row) throw new NotFoundException('角色不存在');
    if (row.code === 'admin') throw new BadRequestException('不能删除超级管理员角色');
    const used = await this.users.count({ where: { roleId: id } });
    if (used > 0) throw new BadRequestException('角色下仍有用户');
    await this.roles.remove(row);
    return { ok: true };
  }

  // ─── Menu ─────────────────────────────────────────────
  async listMenuTree(q?: string) {
    let rows = await this.menus.find({ order: { sort: 'ASC', createdAt: 'ASC' } });
    if (q?.trim()) {
      const kw = q.trim();
      rows = rows.filter(
        (m) => m.title.includes(kw) || m.path.includes(kw) || m.permission.includes(kw),
      );
    }
    return this.buildTree(rows) as MenuTreeNode[];
  }

  async createMenu(input: Partial<SysMenu>) {
    const title = String(input.title || '').trim();
    if (!title) throw new BadRequestException('菜单标题必填');
    const type = ([1, 2, 3].includes(Number(input.type)) ? Number(input.type) : 2) as SysMenuType;
    const row = this.menus.create({
      parentId: String(input.parentId || '').trim(),
      type,
      title,
      path: String(input.path || '').trim(),
      icon: String(input.icon || '').trim(),
      component: String(input.component || '').trim(),
      permission: String(input.permission || '').trim(),
      sort: Number(input.sort) || 0,
      hidden: Boolean(input.hidden),
      status: input.status === '0' ? '0' : '1',
    });
    return this.menus.save(row);
  }

  async updateMenu(id: string, input: Partial<SysMenu>) {
    const row = await this.menus.findOne({ where: { id } });
    if (!row) throw new NotFoundException('菜单不存在');
    if (input.parentId !== undefined) {
      const pid = String(input.parentId || '').trim();
      if (pid === id) throw new BadRequestException('上级不能是自己');
      row.parentId = pid;
    }
    if (input.type !== undefined && [1, 2, 3].includes(Number(input.type))) {
      row.type = Number(input.type) as SysMenuType;
    }
    if (input.title !== undefined) row.title = String(input.title || '').trim() || row.title;
    if (input.path !== undefined) row.path = String(input.path || '').trim();
    if (input.icon !== undefined) row.icon = String(input.icon || '').trim();
    if (input.component !== undefined) row.component = String(input.component || '').trim();
    if (input.permission !== undefined) row.permission = String(input.permission || '').trim();
    if (input.sort !== undefined) row.sort = Number(input.sort) || 0;
    if (input.hidden !== undefined) row.hidden = Boolean(input.hidden);
    if (input.status !== undefined) row.status = input.status === '0' ? '0' : '1';
    return this.menus.save(row);
  }

  async deleteMenu(id: string) {
    const children = await this.menus.count({ where: { parentId: id } });
    if (children > 0) throw new BadRequestException('请先删除子菜单');
    const row = await this.menus.findOne({ where: { id }, relations: ['roles'] });
    if (!row) throw new NotFoundException('菜单不存在');
    row.roles = [];
    await this.menus.save(row);
    await this.menus.remove(row);
    return { ok: true };
  }

  /** 当前用户侧栏菜单 + 权限码 */
  async myAccess(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    let role: Role | null = null;
    if (user.roleId) {
      role = await this.roles.findOne({
        where: { id: user.roleId },
        relations: ['menus'],
      });
    }
    if (!role && user.role) {
      role = await this.roles.findOne({
        where: { code: user.role },
        relations: ['menus'],
      });
    }
    const isSuper = role?.code === 'admin' || user.role === 'admin';
    let menus = role?.menus || [];
    if (isSuper) {
      menus = await this.menus.find({ where: { status: '1' } });
    } else {
      menus = menus.filter((m) => m.status === '1');
    }
    const sidebar = this.buildTree(
      menus
        .filter((m) => m.type !== 3 && !m.hidden)
        .map((m) => ({
          id: m.id,
          parentId: m.parentId,
          type: m.type,
          title: m.title,
          path: m.path,
          icon: m.icon,
          component: m.component,
          permission: m.permission,
          sort: m.sort,
          hidden: m.hidden,
          status: m.status,
        })),
    );
    const permissions = [
      ...new Set(
        menus
          .map((m) => m.permission)
          .filter(Boolean)
          .concat(isSuper ? ['*:*:*'] : []),
      ),
    ];
    let deptName = '';
    if (user.deptId) {
      const d = await this.depts.findOne({ where: { id: user.deptId } });
      deptName = d?.name || '';
    }
    return {
      roleId: role?.id || user.roleId || '',
      roleCode: role?.code || user.role,
      roleName: role?.name || '',
      deptId: user.deptId || '',
      deptName,
      menus: sidebar,
      permissions,
    };
  }

  async resolveRoleCode(roleId?: string, fallbackCode?: string) {
    if (roleId) {
      const r = await this.roles.findOne({ where: { id: roleId } });
      if (r) return r;
    }
    if (fallbackCode) {
      return this.roles.findOne({ where: { code: fallbackCode } });
    }
    return null;
  }
}
