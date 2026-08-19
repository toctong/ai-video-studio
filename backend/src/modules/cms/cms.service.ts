import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CmsItem, type CmsItemType } from '../../entities/cms-item.entity';

/** CMS 种子资源公网前缀：仅用环境变量，不含密钥 */
function namiUrl(rel: string) {
  const base = String(process.env.FILE_OSS_BASE_URL || process.env.CMS_ASSET_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const bucket = String(process.env.FILE_OSS_BUCKET || 'ai-video-studio').trim();
  const key = `nami/${String(rel || '').replace(/^\/+/, '').replace(/^nami\//, '')}`;
  const encoded = key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  if (!base) {
    // 未配置公网前缀时写入相对 key，前台可用 resolveMediaUrl / 后续后台改 URL
    return `nami/${String(rel || '').replace(/^\/+/, '').replace(/^nami\//, '')}`;
  }
  return `${base}/${bucket}/${encoded}`;
}

const DISCOVER_IDS = [
  '0140d0c85c9ec43f92de7286bfe118e7',
  '0W3m4eGjh0wh0EwK4eduwa',
  '15ed484273ec2687ec3bfec2b0082453',
  '2a1d4487f59d42334116e64ca4e7ef91',
  '32d658aebe695902a9cb35ad282918f1fc9eca82',
  '4lkw0hqFUrVhKdmUwTMtb0',
  '68d899943f8157bef12098da4d41101f',
  '94759bdcda3b33483a0ef46f54438e84',
  'ad2c8fece92fe5a6604fad55fbf39c18',
  'bOahCvm04wxiBV0hwvpCU6',
  'c8dd60169f96b53b73c8c732c0c1a93e',
  'e4e178e332a279da1debfe93e26ad75d',
  'fdb6317251332fe8a4298e11a455fcbb',
  'qhiwf40dn8xhwmUuVc0kTT',
  'w0kOrUh0glOZrQ0AI0hhlw',
  'wU55Yxma0hnZT9IP0we7hX',
];

function seedRows(): Array<Partial<CmsItem>> {
  const banners: Array<Partial<CmsItem>> = [
    {
      type: 'banner',
      slug: 'seedance',
      title: 'Seedance 2.5 首发上线',
      subtitle: 'NEW MODEL',
      description: '限时特惠 · 从剧本到成片一条流水线',
      linkPath: '/films?new=1',
      coverUrl: namiUrl('banners/banner-01.png'),
      sort: 10,
    },
    {
      type: 'banner',
      slug: 'seedream',
      title: 'Seedream 5.0 上线',
      subtitle: 'IMAGE',
      description: '角色与场景一致性更强，短剧广告更稳',
      linkPath: '/generate',
      coverUrl: namiUrl('banners/banner-02.png'),
      sort: 20,
    },
    {
      type: 'banner',
      slug: 'pipeline',
      title: '六步大片流水线',
      subtitle: 'PIPELINE',
      description: '剧本 · 设定 · 资产 · 分镜 · 视频 · 预览',
      linkPath: '/films?new=1',
      coverUrl: namiUrl('banners/banner-03.png'),
      sort: 30,
    },
    {
      type: 'banner',
      slug: 'studio',
      title: 'AI 视频创作工作台',
      subtitle: 'FEATURED',
      description: '参考生视频 · 图生视频 · 文生视频',
      linkPath: '/generate',
      coverUrl: namiUrl('banners/banner-04.png'),
      sort: 40,
    },
    {
      type: 'banner',
      slug: 'assets',
      title: '资产库统一管理',
      subtitle: 'LIBRARY',
      description: '图片、视频、角色与场景素材集中沉淀',
      linkPath: '/assets',
      coverUrl: namiUrl('banners/banner-05.png'),
      sort: 50,
    },
  ];

  const entries: Array<Partial<CmsItem>> = [
    {
      type: 'entry',
      slug: 'film',
      title: '制作大片',
      description: '精品短剧、短片、商业广告、文旅宣传…',
      linkPath: '/films?new=1',
      coverUrl: namiUrl('entry/film.png'),
      meta: { icon: 'plus', tone: 'tone-film' },
      sort: 10,
    },
    {
      type: 'entry',
      slug: 'ai-video',
      title: 'AI 生视频',
      description: '全能参考生视频，支持真人出镜',
      linkPath: '/generate',
      coverUrl: namiUrl('entry/aiVideo.png'),
      meta: {
        icon: 'clapperboard',
        tone: 'tone-video',
        badgeImg: namiUrl('entry/seedanceBadge.png'),
      },
      sort: 20,
    },
    {
      type: 'entry',
      slug: 'article',
      title: '文章转视频',
      description: '输入文章 / 一句话，生成完整短片',
      linkPath: '/films?new=1&from=article',
      coverUrl: namiUrl('entry/article.png'),
      meta: { icon: 'file-text', tone: 'tone-article' },
      sort: 30,
    },
    {
      type: 'entry',
      slug: 'tools',
      title: '更多工具',
      description: '剧本分集、AI 视频、AI 生图等',
      linkPath: '/tools',
      coverUrl: namiUrl('entry/tools.png'),
      meta: { icon: 'terminal', tone: 'tone-more' },
      sort: 40,
    },
  ];

  const tools: Array<Partial<CmsItem>> = [
    {
      type: 'tool',
      slug: 'tool-film',
      title: '制作大片',
      description: '六步流水线：剧本 · 设定 · 分镜 · 成片',
      linkPath: '/films?new=1',
      coverUrl: namiUrl('entry/film.png'),
      meta: { category: 'video' },
      sort: 10,
    },
    {
      type: 'tool',
      slug: 'tool-ai-video',
      title: 'AI 生视频',
      description: '全能参考生视频，支持真人出镜',
      linkPath: '/generate',
      coverUrl: namiUrl('entry/aiVideo.png'),
      meta: {
        category: 'video',
        badgeImg: namiUrl('entry/seedanceBadge.png'),
      },
      sort: 20,
    },
    {
      type: 'tool',
      slug: 'tool-article',
      title: '文章转视频',
      description: '输入文章 / 一句话，生成完整短片',
      linkPath: '/films?new=1&from=article',
      coverUrl: namiUrl('entry/article.png'),
      meta: { category: 'video' },
      sort: 30,
    },
    {
      type: 'tool',
      slug: 'tool-image',
      title: 'AI 生图',
      description: '文生图 / 参考生图，沉淀到资产库',
      linkPath: '/generate?mode=image',
      coverUrl: '',
      meta: { category: 'image' },
      sort: 40,
    },
    {
      type: 'tool',
      slug: 'tool-skills',
      title: '提示词',
      description: '可复用的创作提示词与技能广场',
      linkPath: '/skills',
      coverUrl: '',
      meta: { category: 'script' },
      sort: 50,
    },
  ];

  const showcases: Array<Partial<CmsItem>> = [
    {
      type: 'showcase',
      slug: 'demo-1',
      title: '打火机',
      subtitle: '商业广告',
      coverUrl: namiUrl('works/work-01.webp'),
      linkPath: '/generate',
      meta: { category: 'ad', mediaKind: 'cover' },
      sort: 10,
    },
    {
      type: 'showcase',
      slug: 'demo-2',
      title: 'THE CHOICE OF LUXURY',
      subtitle: '商业广告',
      coverUrl: namiUrl('works/work-02.webp'),
      linkPath: '/generate',
      meta: { category: 'ad', mediaKind: 'cover' },
      sort: 20,
    },
    {
      type: 'showcase',
      slug: 'demo-3',
      title: '霍去病 · 出塞',
      subtitle: '历史故事',
      coverUrl: namiUrl('works/work-03.webp'),
      linkPath: '/films?new=1',
      meta: { category: 'history', mediaKind: 'cover' },
      sort: 30,
    },
    {
      type: 'showcase',
      slug: 'demo-4',
      title: '珊瑚墙突破',
      subtitle: '游戏动漫',
      coverUrl: namiUrl('works/work-04.webp'),
      linkPath: '/generate',
      meta: { category: 'anime', mediaKind: 'cover' },
      sort: 40,
    },
    {
      type: 'showcase',
      slug: 'demo-5',
      title: '都市夜行',
      subtitle: '真人短剧',
      coverUrl: namiUrl('works/work-05.webp'),
      linkPath: '/films?new=1',
      meta: { category: 'drama', mediaKind: 'cover' },
      sort: 50,
    },
    {
      type: 'showcase',
      slug: 'demo-6',
      title: '静谧肖像',
      subtitle: 'AI 图片',
      coverUrl: namiUrl('works/work-06.webp'),
      linkPath: '/assets',
      meta: { category: 'image', mediaKind: 'cover' },
      sort: 60,
    },
    {
      type: 'showcase',
      slug: 'demo-7',
      title: '古风双人',
      subtitle: '真人短剧',
      coverUrl: namiUrl('works/work-07.webp'),
      linkPath: '/films?new=1',
      meta: { category: 'drama', mediaKind: 'cover' },
      sort: 70,
    },
    {
      type: 'showcase',
      slug: 'demo-8',
      title: '赛博夜市',
      subtitle: '游戏动漫',
      coverUrl: namiUrl('works/work-08.webp'),
      linkPath: '/generate',
      meta: { category: 'anime', mediaKind: 'cover' },
      sort: 80,
    },
  ];

  const discovers: Array<Partial<CmsItem>> = DISCOVER_IDS.map((id, i) => ({
    type: 'discover' as const,
    slug: id,
    title: '',
    coverUrl: namiUrl(`discover/${id}.jpg`),
    videoUrl: namiUrl(`discover/${id}.mp4`),
    linkPath: '',
    sort: (i + 1) * 10,
  }));

  return [...banners, ...entries, ...tools, ...showcases, ...discovers].map((row) => ({
    ...row,
    enabled: true,
    description: row.description ?? '',
    videoUrl: row.videoUrl ?? '',
    meta: row.meta ?? {},
  }));
}

/** 可增量补种（库非空时也会按 slug 补齐） */
function seedShellRows(): Array<Partial<CmsItem>> {
  const nav: Array<Partial<CmsItem>> = [
    { type: 'nav', slug: 'nav-home', title: '首页', linkPath: '/home', meta: { icon: 'home' }, sort: 10 },
    {
      type: 'nav',
      slug: 'nav-films',
      title: '制作大片',
      linkPath: '/films',
      meta: { icon: 'clapperboard' },
      sort: 20,
    },
    {
      type: 'nav',
      slug: 'nav-tools',
      title: '工具箱',
      linkPath: '/tools',
      meta: { icon: 'terminal' },
      sort: 30,
    },
    {
      type: 'nav',
      slug: 'nav-productions',
      title: '我的项目',
      linkPath: '/productions',
      meta: { icon: 'folder' },
      sort: 40,
    },
    {
      type: 'nav',
      slug: 'nav-assets',
      title: '资产管理',
      linkPath: '/assets',
      meta: { icon: 'images' },
      sort: 50,
    },
    {
      type: 'nav',
      slug: 'nav-models',
      title: '模型管理',
      linkPath: '/models',
      meta: { icon: 'cpu' },
      sort: 60,
    },
  ];

  const brand: Array<Partial<CmsItem>> = [
    {
      type: 'brand',
      slug: 'app-logo',
      title: 'AIGC 视频工厂',
      subtitle: 'AI Video Studio',
      coverUrl: namiUrl('logo.png'),
      linkPath: '/home',
      sort: 10,
    },
  ];

  const notices: Array<Partial<CmsItem>> = [
    {
      type: 'notice',
      slug: 'welcome',
      title: '欢迎使用 AI 视频工作室台',
      description: '对象存储、渠道与模型请在管理后台配置；运营内容走 CMS。',
      linkPath: '/settings?section=storage',
      sort: 10,
    },
  ];

  const skills: Array<Partial<CmsItem>> = [
    {
      type: 'skill',
      slug: 'cms-cinematic-portrait',
      title: '电影感人像提示词',
      subtitle: '官方精选',
      description: '柔光、浅景深、胶片颗粒，适合人物特写',
      coverUrl: namiUrl('works/work-01.webp'),
      linkPath: '/skills',
      meta: {
        prompt: 'cinematic portrait, soft key light, shallow depth of field, film grain',
        category: 'portrait',
        mode: 'image',
        official: true,
        author: '官方',
      },
      sort: 10,
    },
    {
      type: 'skill',
      slug: 'cms-drama-shot',
      title: '短剧情绪运镜',
      subtitle: '官方精选',
      description: '推镜+侧逆光，适合对白情绪段落',
      coverUrl: namiUrl('works/work-02.webp'),
      linkPath: '/skills',
      meta: {
        prompt: 'slow push-in, rim light, emotional close-up dialogue, cinematic color grade',
        category: 'drama',
        mode: 'video',
        official: true,
        author: '官方',
      },
      sort: 20,
    },
  ];

  return [...nav, ...brand, ...notices, ...skills].map((row) => ({
    ...row,
    enabled: true,
    description: row.description ?? '',
    videoUrl: row.videoUrl ?? '',
    subtitle: row.subtitle ?? '',
    meta: row.meta ?? {},
  }));
}

@Injectable()
export class CmsService implements OnModuleInit {
  constructor(@InjectRepository(CmsItem) private readonly items: Repository<CmsItem>) {}

  async onModuleInit() {
    try {
      const count = await this.items.count();
      if (count === 0) {
        const rows = [...seedRows(), ...seedShellRows()].map((r) => this.items.create(r));
        await this.items.save(rows);
        console.log(`[Cms] seeded ${rows.length} items`);
      } else {
        await this.ensureShellSeeds();
      }
    } catch (e: any) {
      console.warn(`[Cms] seed skipped: ${e?.message || e}`);
    }
  }

  /** 已有库时按 type+slug 补齐导航/品牌/公告/技能运营位 */
  private async ensureShellSeeds() {
    const extras = seedShellRows();
    let added = 0;
    for (const row of extras) {
      const slug = String(row.slug || '');
      const type = row.type as CmsItemType;
      if (!slug || !type) continue;
      const exists = await this.items.findOne({ where: { slug, type } });
      if (exists) continue;
      await this.items.save(this.items.create(row));
      added += 1;
    }
    if (added) console.log(`[Cms] shell seeded +${added}`);
  }

  async listPublic(type?: string) {
    const where: any = { enabled: true };
    if (type?.trim()) where.type = type.trim();
    return this.items.find({
      where,
      order: { sort: 'ASC', createdAt: 'ASC' },
    });
  }

  async bundlePublic() {
    const all = await this.listPublic();
    const group = (t: CmsItemType) => all.filter((x) => x.type === t);
    return {
      banners: group('banner'),
      entries: group('entry'),
      showcases: group('showcase'),
      discovers: group('discover'),
      tools: group('tool'),
      skills: group('skill'),
      nav: group('nav'),
      brand: group('brand'),
      notices: group('notice'),
    };
  }

  async listAdmin(type?: string, q?: string) {
    const qb = this.items.createQueryBuilder('c').orderBy('c.sort', 'ASC').addOrderBy('c.createdAt', 'ASC');
    if (type?.trim()) qb.andWhere('c.type = :type', { type: type.trim() });
    if (q?.trim()) {
      qb.andWhere('(c.title LIKE :q OR c.slug LIKE :q OR c.subtitle LIKE :q)', {
        q: `%${q.trim()}%`,
      });
    }
    return qb.getMany();
  }

  async create(input: Partial<CmsItem>) {
    const row = this.items.create({
      type: (input.type || 'banner') as CmsItemType,
      slug: String(input.slug || '').trim(),
      title: String(input.title || '').trim(),
      subtitle: String(input.subtitle || '').trim(),
      description: String(input.description || ''),
      coverUrl: String(input.coverUrl || '').trim(),
      videoUrl: String(input.videoUrl || '').trim(),
      linkPath: String(input.linkPath || '').trim(),
      meta: input.meta && typeof input.meta === 'object' ? input.meta : {},
      sort: Number(input.sort) || 0,
      enabled: input.enabled !== false,
    });
    return this.items.save(row);
  }

  async update(id: string, input: Partial<CmsItem>) {
    const row = await this.items.findOne({ where: { id } });
    if (!row) throw new NotFoundException('内容不存在');
    if (input.type !== undefined) row.type = input.type as CmsItemType;
    if (input.slug !== undefined) row.slug = String(input.slug || '').trim();
    if (input.title !== undefined) row.title = String(input.title || '').trim();
    if (input.subtitle !== undefined) row.subtitle = String(input.subtitle || '').trim();
    if (input.description !== undefined) row.description = String(input.description || '');
    if (input.coverUrl !== undefined) row.coverUrl = String(input.coverUrl || '').trim();
    if (input.videoUrl !== undefined) row.videoUrl = String(input.videoUrl || '').trim();
    if (input.linkPath !== undefined) row.linkPath = String(input.linkPath || '').trim();
    if (input.meta !== undefined) {
      row.meta = input.meta && typeof input.meta === 'object' ? input.meta : {};
    }
    if (input.sort !== undefined) row.sort = Number(input.sort) || 0;
    if (input.enabled !== undefined) row.enabled = Boolean(input.enabled);
    return this.items.save(row);
  }

  async remove(id: string) {
    const row = await this.items.findOne({ where: { id } });
    if (!row) throw new NotFoundException('内容不存在');
    await this.items.remove(row);
    return { ok: true };
  }

  async exportAll() {
    const items = await this.items.find({ order: { type: 'ASC', sort: 'ASC', createdAt: 'ASC' } });
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: items.map((x) => ({
        type: x.type,
        slug: x.slug,
        title: x.title,
        subtitle: x.subtitle,
        description: x.description,
        coverUrl: x.coverUrl,
        videoUrl: x.videoUrl,
        linkPath: x.linkPath,
        meta: x.meta || {},
        sort: x.sort,
        enabled: x.enabled,
      })),
    };
  }

  async importBundle(
    body: { items?: Array<Partial<CmsItem>>; mode?: 'merge' | 'replace' },
  ) {
    const mode = body?.mode === 'replace' ? 'replace' : 'merge';
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) throw new BadRequestException('导入内容为空');

    if (mode === 'replace') {
      await this.items.clear();
    }

    let created = 0;
    let updated = 0;
    for (const raw of items.slice(0, 2000)) {
      const type = String(raw.type || 'banner').trim() as CmsItemType;
      const slug = String(raw.slug || '').trim();
      const payload: Partial<CmsItem> = {
        type,
        slug,
        title: String(raw.title || '').trim(),
        subtitle: String(raw.subtitle || '').trim(),
        description: String(raw.description || ''),
        coverUrl: String(raw.coverUrl || '').trim(),
        videoUrl: String(raw.videoUrl || '').trim(),
        linkPath: String(raw.linkPath || '').trim(),
        meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
        sort: Number(raw.sort) || 0,
        enabled: raw.enabled !== false,
      };

      if (mode === 'merge' && slug) {
        const existing = await this.items.findOne({ where: { type, slug } });
        if (existing) {
          await this.update(existing.id, payload);
          updated += 1;
          continue;
        }
      }
      await this.create(payload);
      created += 1;
    }

    return { ok: true, mode, created, updated, total: created + updated };
  }
}
