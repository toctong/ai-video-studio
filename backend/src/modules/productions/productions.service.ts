import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  Production,
  type ProductionCastMember,
  type ProductionScene,
  type ProductionStyle,
} from '../../entities/production.entity';
import { Workflow } from '../../entities/workflow.entity';

/** 项目封面等直链：旧前缀 → 当前 FILE_OSS_BASE_URL（需配置 LEGACY_OSS_PUBLIC_PREFIX） */
function rewriteOssPublicUrl(url: string): string {
  const u = String(url || '').trim();
  const oldPrefix = String(process.env.LEGACY_OSS_PUBLIC_PREFIX || '').trim();
  const newBase = String(process.env.FILE_OSS_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!u || !oldPrefix || !newBase || !u.includes(oldPrefix)) return u;
  const newPrefix = `${newBase}/`;
  return u.split(oldPrefix).join(newPrefix);
}
export type CreateProductionInput = {
  projectId?: string;
  folderId?: string;
  chapterId?: string;
  workflowId?: string;
  name?: string;
  description?: string;
  script?: string;
  cast?: ProductionCastMember[];
  scenes?: ProductionScene[];
  style?: ProductionStyle;
  assetIds?: string[];
  templateId?: string;
  shotLibraryId?: string;
  status?: string;
  tags?: string[];
  thumbUrl?: string;
  meta?: Record<string, unknown>;
};

export type UpdateProductionInput = Partial<CreateProductionInput>;

const PLACEHOLDER_NAMES = new Set(['', '未命名项目', '未命名制作单', '未命名工作流']);

function isPlaceholderName(name: string) {
  return PLACEHOLDER_NAMES.has(String(name || '').trim());
}

function pickThumbFromGraph(graph: unknown): string {
  const nodes = (graph as { nodes?: unknown[] })?.nodes;
  if (!Array.isArray(nodes)) return '';
  let fallback = '';
  for (const n of nodes) {
    const p = (n as { params?: Record<string, unknown> })?.params || {};
    const lastImage = String(p.lastImage || '').trim();
    if (lastImage) return lastImage;
    const image = String(p.image || '').trim();
    if (image) return image;
    const url = String(p.url || '').trim();
    if (url && !/\.(mp4|webm|mov)(\?|$)/i.test(url)) return url;
    if (!fallback) fallback = String(p.lastVideo || p.video || '').trim();
  }
  return fallback;
}

@Injectable()
export class ProductionsService {
  constructor(
    @InjectRepository(Production)
    private readonly productions: Repository<Production>,
    @InjectRepository(Workflow)
    private readonly workflows: Repository<Workflow>,
  ) {}

  async list(opts?: { projectId?: string; chapterId?: string; folderId?: string }) {
    const where: Record<string, string> = {};
    if (opts?.projectId) where.projectId = opts.projectId;
    if (opts?.chapterId) where.chapterId = opts.chapterId;
    if (opts?.folderId !== undefined) where.folderId = opts.folderId;
    const rows = await this.productions.find({
      where: Object.keys(where).length ? where : undefined,
      order: { updatedAt: 'DESC' },
    });
    return this.hydrateFromWorkflows(rows);
  }

  async get(id: string) {
    const row = await this.productions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('制作单不存在');
    const [hydrated] = await this.hydrateFromWorkflows([row]);
    return hydrated;
  }

  async create(body: CreateProductionInput) {
    const row = this.productions.create({
      projectId: String(body.projectId || '').trim(),
      folderId: String(body.folderId || '').trim(),
      chapterId: String(body.chapterId || '').trim(),
      workflowId: String(body.workflowId || '').trim(),
      name: String(body.name || '未命名制作单').trim() || '未命名制作单',
      description: String(body.description || '').trim(),
      script: String(body.script || ''),
      cast: Array.isArray(body.cast) ? body.cast : [],
      scenes: Array.isArray(body.scenes) ? body.scenes : [],
      style: body.style && typeof body.style === 'object' ? body.style : {},
      assetIds: Array.isArray(body.assetIds) ? body.assetIds : [],
      templateId: String(body.templateId || '').trim(),
      shotLibraryId: String(body.shotLibraryId || '').trim(),
      status: String(body.status || 'draft').trim() || 'draft',
      tags: Array.isArray(body.tags) ? body.tags : [],
      thumbUrl: String(body.thumbUrl || '').trim(),
      meta: body.meta && typeof body.meta === 'object' ? body.meta : {},
    });
    return this.productions.save(row);
  }

  async update(id: string, body: UpdateProductionInput) {
    const row = await this.productions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('制作单不存在');
    if (body.projectId !== undefined) row.projectId = String(body.projectId || '').trim();
  if (body.folderId !== undefined) {
      row.folderId = body.folderId == null ? '' : String(body.folderId).trim();
    }
    if (body.chapterId !== undefined) row.chapterId = String(body.chapterId || '').trim();
    if (body.workflowId !== undefined) row.workflowId = String(body.workflowId || '').trim();
    if (body.name !== undefined) {
      row.name = String(body.name || '').trim() || row.name;
    }
    if (body.description !== undefined) row.description = String(body.description || '').trim();
    if (body.script !== undefined) row.script = String(body.script || '');
    if (body.cast !== undefined) row.cast = Array.isArray(body.cast) ? body.cast : [];
    if (body.scenes !== undefined) row.scenes = Array.isArray(body.scenes) ? body.scenes : [];
    if (body.style !== undefined) {
      row.style = body.style && typeof body.style === 'object' ? body.style : {};
    }
    if (body.assetIds !== undefined) {
      row.assetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
    }
    if (body.templateId !== undefined) row.templateId = String(body.templateId || '').trim();
    if (body.shotLibraryId !== undefined) {
      row.shotLibraryId = String(body.shotLibraryId || '').trim();
    }
    if (body.status !== undefined) {
      row.status = String(body.status || 'draft').trim() || 'draft';
    }
    if (body.tags !== undefined) row.tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.thumbUrl !== undefined) row.thumbUrl = String(body.thumbUrl || '').trim();
    if (body.meta !== undefined) {
      row.meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    }
    const saved = await this.productions.save(row);
    if (body.name !== undefined && saved.workflowId) {
      await this.workflows.update(saved.workflowId, { name: saved.name });
    }
    return saved;
  }

  async remove(id: string) {
    const row = await this.get(id);
    await this.productions.delete({ id: row.id });
    return { ok: true };
  }

  /** 旧数据：Production 未回写时，从关联工作流补名称/封面并落库 */
  private async hydrateFromWorkflows(rows: Production[]) {
    const workflowIds = [
      ...new Set(rows.map((r) => String(r.workflowId || '').trim()).filter(Boolean)),
    ];
    const workflows = workflowIds.length
      ? await this.workflows.find({ where: { id: In(workflowIds) } })
      : [];
    const byId = new Map(workflows.map((w) => [w.id, w]));

    for (const row of rows) {
      let dirty = false;

      const thumbFixed = rewriteOssPublicUrl(row.thumbUrl);
      if (thumbFixed !== String(row.thumbUrl || '').trim()) {
        row.thumbUrl = thumbFixed;
        dirty = true;
      }

      const wf = byId.get(row.workflowId);
      if (wf) {
        const wfThumbFixed = rewriteOssPublicUrl(wf.thumbUrl);
        if (wfThumbFixed !== String(wf.thumbUrl || '').trim()) {
          wf.thumbUrl = wfThumbFixed;
          await this.workflows.save(wf);
        }

        if (isPlaceholderName(row.name) && !isPlaceholderName(wf.name)) {
          row.name = wf.name;
          dirty = true;
        }

        if (!row.thumbUrl) {
          const thumb =
            String(wf.thumbUrl || '').trim() ||
            rewriteOssPublicUrl(pickThumbFromGraph(wf.graph));
          if (thumb) {
            row.thumbUrl = thumb;
            if (!wf.thumbUrl) {
              wf.thumbUrl = thumb;
              await this.workflows.save(wf);
            }
            dirty = true;
          }
        }
      }

      if (dirty) await this.productions.save(row);
    }

    return rows;
  }
}
