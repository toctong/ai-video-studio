import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { existsSync, readFileSync } from 'fs';
import { extname } from 'path';
import type { ProjectProgress, ProjectStage } from '@ai-video-studio/shared';
import { Project } from '../../entities/project.entity';
import { Asset } from '../../entities/asset.entity';
import { Character } from '../../entities/character.entity';
import { Chapter } from '../../entities/chapter.entity';
import { Timeline } from '../../entities/timeline.entity';
import { AssetsService } from '../assets/assets.service';
import { JobsService } from '../jobs/jobs.service';

const emptyProgress = (): ProjectProgress => ({
  script: false,
});

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(Character) private readonly characters: Repository<Character>,
    @InjectRepository(Chapter) private readonly chapters: Repository<Chapter>,
    @InjectRepository(Timeline) private readonly timelines: Repository<Timeline>,
    private readonly assetsService: AssetsService,
    @Inject(forwardRef(() => JobsService)) private readonly jobs: JobsService,
  ) {}

  async list(includeArchived = false) {
    const rows = await this.projects.find({
      where: includeArchived ? {} : { archived: false },
      order: { updatedAt: 'DESC' },
    });
    const coverIds = rows.map((p) => p.coverAssetId).filter(Boolean);
    const coverMap = new Map<string, string>();
    if (coverIds.length) {
      const covers = await this.assets.find({ where: { id: In(coverIds) } });
      for (const a of covers) coverMap.set(a.id, a.url);
    }

    const ids = rows.map((p) => p.id);
    const chapterCountMap = new Map<string, number>();
    const wordCountMap = new Map<string, number>();
    const latestChapterMap = new Map<
      string,
      { title: string; orderIndex: number; updatedAt: Date }
    >();
    const characterCountMap = new Map<string, number>();
    const characterNamesMap = new Map<string, string[]>();

    if (ids.length) {
      const chapters = await this.chapters.find({
        where: { projectId: In(ids) },
        select: ['projectId', 'title', 'orderIndex', 'novelBody', 'updatedAt'],
        order: { orderIndex: 'ASC' },
      });
      for (const c of chapters) {
        chapterCountMap.set(c.projectId, (chapterCountMap.get(c.projectId) || 0) + 1);
        wordCountMap.set(
          c.projectId,
          (wordCountMap.get(c.projectId) || 0) + (c.novelBody?.length || 0),
        );
        const prev = latestChapterMap.get(c.projectId);
        if (!prev || c.orderIndex >= prev.orderIndex) {
          latestChapterMap.set(c.projectId, {
            title: c.title || `第${c.orderIndex + 1}章`,
            orderIndex: c.orderIndex,
            updatedAt: c.updatedAt,
          });
        }
      }

      const chars = await this.characters.find({
        where: { projectId: In(ids) },
        select: ['projectId', 'name'],
      });
      for (const ch of chars) {
        characterCountMap.set(ch.projectId, (characterCountMap.get(ch.projectId) || 0) + 1);
        const names = characterNamesMap.get(ch.projectId) || [];
        if (names.length < 4) names.push(ch.name);
        characterNamesMap.set(ch.projectId, names);
      }
    }

    return rows.map((p) => {
      const latest = latestChapterMap.get(p.id);
      return {
        ...p,
        coverUrl: p.coverAssetId ? coverMap.get(p.coverAssetId) || '' : '',
        chapterCount: chapterCountMap.get(p.id) || 0,
        characterCount: characterCountMap.get(p.id) || 0,
        wordCount: wordCountMap.get(p.id) || 0,
        characterNames: characterNamesMap.get(p.id) || [],
        latestChapter: latest
          ? {
              title: latest.title,
              orderIndex: latest.orderIndex,
              updatedAt: latest.updatedAt,
            }
          : null,
      };
    });
  }

  async get(id: string) {
    const p = await this.projects.findOne({ where: { id } });
    if (!p) throw new NotFoundException('项目不存在');
    let coverUrl = '';
    if (p.coverAssetId) {
      try {
        const a = await this.assetsService.get(p.coverAssetId);
        coverUrl = a.url || '';
      } catch {
        coverUrl = '';
      }
    }
    return { ...p, coverUrl };
  }

  async create(dto: {
    title: string;
    description?: string;
    styleBrief?: string;
    targetWordsWan?: number;
    volumeCount?: number;
  }) {
    const wordsWan = Number(dto.targetWordsWan);
    const volumes = Number(dto.volumeCount);
    const storyState: import('@ai-video-studio/shared').ProjectStoryState = {};
    if (Number.isFinite(wordsWan) && wordsWan > 0) {
      storyState.targetWordsWan = Math.min(500, Math.max(30, Math.round(wordsWan)));
    }
    if (Number.isFinite(volumes) && volumes > 0) {
      storyState.volumeCount = Math.min(20, Math.max(3, Math.round(volumes)));
    }
    const project = this.projects.create({
      title: dto.title,
      description: dto.description || '',
      styleBrief: dto.styleBrief || '',
      progress: emptyProgress(),
      storyState,
      modelOverrides: {},
    });
    return this.projects.save(project);
  }

  async update(
    id: string,
    dto: Partial<{
      title: string;
      description: string;
      styleBrief: string;
      archived: boolean;
      modelOverrides: Record<string, string>;
      coverAssetId: string;
      storyState: import('@ai-video-studio/shared').ProjectStoryState;
    }>,
  ) {
    const p = await this.projects.findOne({ where: { id } });
    if (!p) throw new NotFoundException('项目不存在');
    const prevCover = String(p.coverAssetId || '').trim();
    const nextCover =
      dto.coverAssetId !== undefined ? String(dto.coverAssetId || '').trim() : undefined;

    if (dto.storyState) {
      p.storyState = { ...(p.storyState || {}), ...dto.storyState };
      const { storyState: _drop, ...rest } = dto;
      Object.assign(p, rest);
    } else {
      Object.assign(p, dto);
    }
    await this.projects.save(p);

    if (nextCover !== undefined && prevCover && prevCover !== nextCover) {
      await this.assetsService.removeQuiet(prevCover);
    }
    return this.get(id);
  }

  /** 合并写入成书篇幅等到 storyState */
  async patchStoryState(
    id: string,
    patch: Partial<import('@ai-video-studio/shared').ProjectStoryState>,
  ) {
    return this.update(id, { storyState: patch });
  }

  async setCover(projectId: string, file: Express.Multer.File) {
    await this.get(projectId);
    const asset = await this.assetsService.createFromUpload(projectId, file, {
      type: 'cover',
      name: `封面·${file.originalname || 'cover'}`,
      prompt: 'project-cover',
    });
    // update 会顺带删掉旧封面资产
    return this.update(projectId, { coverAssetId: asset.id });
  }

  async clearCover(projectId: string) {
    return this.update(projectId, { coverAssetId: '' });
  }

  async remove(id: string) {
    await this.get(id);
    try {
      await this.jobs.removeByProject(id);
    } catch {
      /* ignore */
    }
    await this.assetsService.purgeProject(id);
    await this.characters.delete({ projectId: id });
    await this.chapters.delete({ projectId: id });
    await this.timelines.delete({ projectId: id });
    await this.projects.delete({ id });
    return { ok: true };
  }

  async markStage(id: string, stage: ProjectStage, done = true) {
    const p = await this.projects.findOne({ where: { id } });
    if (!p) throw new NotFoundException('项目不存在');
    p.progress = { ...emptyProgress(), ...p.progress, [stage]: done };
    return this.projects.save(p);
  }

  async refreshProgress(id: string) {
    const p = await this.projects.findOne({ where: { id } });
    if (!p) throw new NotFoundException('项目不存在');
    const [scriptCount, chapterCount, characterCount] = await Promise.all([
      this.assets.count({ where: { projectId: id, type: 'script' } }),
      this.chapters.count({ where: { projectId: id } }),
      this.characters.count({ where: { projectId: id } }),
    ]);
    p.progress = {
      script: scriptCount > 0 || chapterCount > 0 || characterCount > 0,
    };
    return this.projects.save(p);
  }

  async overview(id: string) {
    const project = await this.refreshProgress(id);
    const [assetCount, chapters, characterCount, castRows, trueOutlineCount] = await Promise.all([
      this.assets.count({ where: { projectId: id } }),
      this.chapters.find({
        where: { projectId: id },
        order: { orderIndex: 'DESC' },
        select: ['id', 'title', 'orderIndex', 'updatedAt', 'createdAt', 'novelBody'],
      }),
      this.characters.count({ where: { projectId: id } }),
      this.characters.find({
        where: { projectId: id },
        order: { createdAt: 'ASC' },
        take: 12,
        select: ['id', 'name', 'description'],
      }),
      this.countNovelOutlineAssets(id),
    ]);
    let coverUrl = '';
    if (project.coverAssetId) {
      try {
        const a = await this.assetsService.get(project.coverAssetId);
        coverUrl = a.url || '';
      } catch {
        coverUrl = '';
      }
    }
    const chapterCount = chapters.length;
    const wordCount = chapters.reduce((sum, c) => sum + (c.novelBody?.length || 0), 0);
    const latest = chapters[0];
    const writeDateSet = new Set<string>();
    for (const c of chapters) {
      for (const raw of [c.updatedAt, c.createdAt]) {
        if (!raw) continue;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) continue;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        writeDateSet.add(`${y}-${m}-${day}`);
      }
    }
    const recentChapters = [...chapters]
      .sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 8)
      .map((c) => ({
        id: c.id,
        title: c.title,
        orderIndex: c.orderIndex,
        updatedAt: c.updatedAt,
        wordCount: c.novelBody?.length || 0,
      }));
    const outlineRaw = trueOutlineCount > 0 ? await this.outlineTextOf(id, '') : '';
    const outlinePreview = String(outlineRaw || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    return {
      project: { ...project, coverUrl },
      stats: {
        assetCount,
        chapterCount,
        characterCount,
        wordCount,
        /** 仅「小说大纲」素材算真正大纲；灵感/积木草稿不算 */
        hasOutline: trueOutlineCount > 0,
        writeDates: Array.from(writeDateSet).sort(),
        recentChapters,
        outlinePreview,
        castPreview: castRows.map((c) => ({
          id: c.id,
          name: c.name,
          blurb: String(c.description || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 36),
        })),
        latestChapter: latest
          ? {
              id: latest.id,
              title: latest.title,
              orderIndex: latest.orderIndex,
              updatedAt: latest.updatedAt,
            }
          : null,
      },
    };
  }

  /** 统计真正的长篇大纲资产（排除灵感/积木草稿） */
  private async countNovelOutlineAssets(projectId: string): Promise<number> {
    const scripts = await this.assets.find({
      where: { projectId, type: 'script' },
      select: ['id', 'name'],
    });
    return scripts.filter((a) => this.isNovelOutlineName(a.name)).length;
  }

  private isNovelOutlineName(name?: string | null) {
    const n = String(name || '').trim();
    return n === '小说大纲' || n.includes('小说大纲');
  }

  private async outlineTextOf(projectId: string, fallbackDescription = '') {
    const scripts = await this.assets.find({
      where: { projectId, type: 'script' },
      order: { createdAt: 'DESC' },
    });
    const prefer = scripts.find((a) => this.isNovelOutlineName(a.name));
    const ordered = prefer ? [prefer, ...scripts.filter((a) => a.id !== prefer.id)] : scripts;
    for (const a of ordered) {
      const content = String((a.meta as any)?.content || '').trim();
      if (content) return content;
    }
    return String(fallbackDescription || '').trim();
  }

  private roleRank(role: string) {
    const r = String(role || '').trim();
    if (/^主角$|女主角|男主角/.test(r)) return 0;
    if (/主角团/.test(r)) return 1;
    if (/重要配角/.test(r)) return 2;
    if (/对手|反派/.test(r)) return 3;
    if (/功能配角|配角/.test(r)) return 4;
    return 5;
  }

  /** 作品简介 Word：封面（若有）+ 一句话 + 角色 + 大纲摘要 + 分章目录 */
  async exportSynopsisDocxStream(projectId: string) {
    const project = await this.get(projectId);
    const [chars, chapters] = await Promise.all([
      this.characters.find({ where: { projectId }, order: { createdAt: 'ASC' } }),
      this.chapters.find({ where: { projectId }, order: { orderIndex: 'ASC' } }),
    ]);
    const outline = await this.outlineTextOf(projectId, project.description);
    const title = String(project.title || '未命名').trim();
    const blurb = String(project.description || '').trim();
    const style = String(project.styleBrief || '').trim();
    const hooks = Array.isArray(project.storyState?.openHooks)
      ? project.storyState.openHooks.map((h) => String(h?.text || '').trim()).filter(Boolean)
      : [];
    const timelineNote = String(project.storyState?.timelineNote || '').trim();

    const sortedChars = [...chars].sort((a, b) => {
      const ra = this.roleRank(String((a.meta as any)?.role || ''));
      const rb = this.roleRank(String((b.meta as any)?.role || ''));
      if (ra !== rb) return ra - rb;
      return 0;
    });

    const hasSubstance = !!(blurb || outline || chars.length || chapters.length || project.coverAssetId);
    if (!hasSubstance) {
      throw new BadRequestException('暂无可导出的简介内容，请先填写简介、大纲或章节');
    }

    const children: Paragraph[] = [];

    const cover = await this.loadCoverForDocx(project.coverAssetId);
    if (cover) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: cover.type,
              data: cover.data,
              transformation: { width: cover.width, height: cover.height },
              altText: {
                name: 'cover',
                title: '作品封面',
                description: `${title} 封面`,
              },
            }),
          ],
          spacing: { after: 280 },
        }),
      );
    }

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: title, bold: true, size: 40 })],
        spacing: { after: 120 },
      }),
    );
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '作品简介', size: 22, italics: true, color: '666666' })],
        spacing: { after: 360 },
      }),
    );

    children.push(this.headingPara('一句话简介'));
    children.push(...this.bodyParas(blurb || '（尚未填写项目简介）'));

    if (style) {
      children.push(this.headingPara('作品气质 / 画风'));
      children.push(...this.bodyParas(style));
    }

    children.push(this.headingPara('主要角色'));
    if (!sortedChars.length) {
      children.push(...this.bodyParas('（暂无角色）'));
    } else {
      for (const c of sortedChars.slice(0, 12)) {
        const m = (c.meta || {}) as Record<string, any>;
        const role = String(m.role || '').trim();
        const occupation = String(m.occupation || '').trim();
        const camp = String(m.camp || '').trim();
        const tag = [role, occupation, camp].filter(Boolean).join(' · ');
        const desc = String(c.description || '').trim() || '（暂无简介）';
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `· ${c.name}`, bold: true, size: 24 }),
              new TextRun({ text: tag ? `（${tag}）` : '', size: 22, color: '555555' }),
              new TextRun({ text: `：${desc}`, size: 24 }),
            ],
            spacing: { after: 100, line: 360 },
          }),
        );
      }
      if (sortedChars.length > 12) {
        children.push(...this.bodyParas(`· …另有 ${sortedChars.length - 12} 人`));
      }
    }

    children.push(this.headingPara('故事大纲'));
    if (!outline || outline === blurb) {
      children.push(
        ...this.bodyParas(blurb ? '（暂无独立大纲，见上方一句话简介）' : '（暂无大纲）'),
      );
    } else {
      const max = 6000;
      const text =
        outline.length > max ? `${outline.slice(0, max).trim()}\n…（大纲过长已截断）` : outline;
      children.push(...this.bodyParas(text));
    }

    children.push(this.headingPara('分章目录'));
    if (!chapters.length) {
      children.push(...this.bodyParas('（暂无章节）'));
    } else {
      for (const ch of chapters) {
        const name = ch.title || `第${ch.orderIndex}章`;
        const syn = String(ch.synopsis || ch.continuitySummary || '').trim();
        const card = ch.chapterCard || {};
        const goal = String(card.goal || '').trim();
        const hook = String(card.hook || '').trim();
        const cast = String(card.cast || '').trim();
        const events = Array.isArray(card.keyEvents)
          ? card.keyEvents.map((x) => String(x || '').trim()).filter(Boolean)
          : [];

        children.push(
          new Paragraph({
            text: name,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 80 },
          }),
        );
        children.push(...this.bodyParas(syn || goal || '（暂无章摘要）'));
        if (cast) children.push(...this.bodyParas(`出场：${cast}`));
        if (events.length) children.push(...this.bodyParas(`要点：${events.join('；')}`));
        if (hook) children.push(...this.bodyParas(`章末钩子：${hook}`));
      }
    }

    if (hooks.length || timelineNote) {
      children.push(this.headingPara('未解钩子 / 时间线'));
      for (const h of hooks) children.push(...this.bodyParas(`· ${h}`));
      if (timelineNote) children.push(...this.bodyParas(timelineNote));
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });
    const buf = await Packer.toBuffer(doc);
    const filename = encodeURIComponent(`${title}-作品简介.docx`);
    return { file: new StreamableFile(buf), filename };
  }

  private headingPara(text: string) {
    return new Paragraph({
      text,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 280, after: 120 },
    });
  }

  private bodyParas(text: string): Paragraph[] {
    const lines = String(text || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trimEnd());
    const out: Paragraph[] = [];
    for (const line of lines) {
      if (!line.trim()) {
        out.push(new Paragraph({ children: [], spacing: { after: 60 } }));
        continue;
      }
      out.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 24 })],
          spacing: { after: 100, line: 360 },
        }),
      );
    }
    if (!out.length) {
      out.push(
        new Paragraph({
          children: [new TextRun({ text: '（空）', size: 24 })],
          spacing: { after: 100 },
        }),
      );
    }
    return out;
  }

  private async loadCoverForDocx(coverAssetId?: string): Promise<{
    data: Buffer;
    type: 'jpg' | 'png' | 'gif' | 'bmp';
    width: number;
    height: number;
  } | null> {
    const id = String(coverAssetId || '').trim();
    if (!id) return null;
    try {
      const asset = await this.assetsService.get(id);
      let data: Buffer | null = null;
      if (asset.filePath && existsSync(asset.filePath)) {
        data = readFileSync(asset.filePath);
      }
      if (!data?.length) return null;

      const mime = String(asset.mimeType || '').toLowerCase();
      const ext = extname(asset.filePath || asset.url || '').toLowerCase();
      let type: 'jpg' | 'png' | 'gif' | 'bmp' | null = null;
      if (mime.includes('jpeg') || mime.includes('jpg') || ext === '.jpg' || ext === '.jpeg') {
        type = 'jpg';
      } else if (mime.includes('png') || ext === '.png') {
        type = 'png';
      } else if (mime.includes('gif') || ext === '.gif') {
        type = 'gif';
      } else if (mime.includes('bmp') || ext === '.bmp') {
        type = 'bmp';
      } else if (mime.includes('webp') || ext === '.webp') {
        // Word 不直接支持 webp，跳过封面图
        return null;
      } else {
        // 默认当 png 试；失败由上层忽略
        type = 'png';
      }

      const dims = this.probeImageSize(data) || { width: 1024, height: 1536 };
      const maxW = 320;
      const scale = Math.min(1, maxW / Math.max(1, dims.width));
      const width = Math.max(120, Math.round(dims.width * scale));
      const height = Math.max(160, Math.round(dims.height * scale));
      return { data, type, width, height };
    } catch {
      return null;
    }
  }

  /** 轻量读取 PNG/JPEG 尺寸，失败返回 null */
  private probeImageSize(buf: Buffer): { width: number; height: number } | null {
    try {
      if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
      }
      if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let i = 2;
        while (i + 9 < buf.length) {
          if (buf[i] !== 0xff) break;
          const marker = buf[i + 1];
          const len = buf.readUInt16BE(i + 2);
          if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
          }
          i += 2 + len;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}
