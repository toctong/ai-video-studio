import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductionFolder } from '../../entities/production-folder.entity';
import { Production } from '../../entities/production.entity';

export type CreateProductionFolderInput = {
  name?: string;
  parentId?: string;
  sortOrder?: number;
};

export type UpdateProductionFolderInput = Partial<CreateProductionFolderInput>;

@Injectable()
export class ProductionFoldersService {
  constructor(
    @InjectRepository(ProductionFolder)
    private readonly folders: Repository<ProductionFolder>,
    @InjectRepository(Production)
    private readonly productions: Repository<Production>,
  ) {}

  async list() {
    return this.folders.find({ order: { sortOrder: 'ASC', updatedAt: 'DESC' } });
  }

  async create(body: CreateProductionFolderInput) {
    const name = String(body.name || '').trim() || '新建文件夹';
    const parentId = String(body.parentId || '').trim();
    if (parentId) {
      const parent = await this.folders.findOne({ where: { id: parentId } });
      if (!parent) throw new BadRequestException('父文件夹不存在');
    }
    const sortOrder =
      body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))
        ? Number(body.sortOrder)
        : 0;
    const row = this.folders.create({ name, parentId, sortOrder });
    return this.folders.save(row);
  }

  async update(id: string, body: UpdateProductionFolderInput) {
    const row = await this.folders.findOne({ where: { id } });
    if (!row) throw new NotFoundException('文件夹不存在');
    if (body.name !== undefined) {
      row.name = String(body.name || '').trim() || row.name;
    }
    if (body.parentId !== undefined) {
      const parentId = String(body.parentId || '').trim();
      if (parentId === id) {
        throw new BadRequestException('不能将文件夹移动到自身');
      }
      if (parentId) {
        const parent = await this.folders.findOne({ where: { id: parentId } });
        if (!parent) throw new BadRequestException('目标文件夹不存在');
        const blocked = await this.collectDescendantIds(id);
        if (blocked.has(parentId)) {
          throw new BadRequestException('不能将文件夹移动到其子文件夹中');
        }
      }
      row.parentId = parentId;
    }
    if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
      row.sortOrder = Number(body.sortOrder);
    }
    return this.folders.save(row);
  }

  async remove(id: string) {
    const row = await this.folders.findOne({ where: { id } });
    if (!row) throw new NotFoundException('文件夹不存在');
    const descendantIds = await this.collectDescendantIds(id);
    const folderIds = [id, ...descendantIds];
    await this.productions
      .createQueryBuilder()
      .delete()
      .from(Production)
      .where('folderId IN (:...folderIds)', { folderIds })
      .execute();
    await this.folders
      .createQueryBuilder()
      .delete()
      .from(ProductionFolder)
      .where('id IN (:...folderIds)', { folderIds })
      .execute();
    return { ok: true };
  }

  private async collectDescendantIds(rootId: string) {
    const all = await this.folders.find();
    const byParent = new Map<string, string[]>();
    for (const f of all) {
      const p = String(f.parentId || '');
      const list = byParent.get(p) || [];
      list.push(f.id);
      byParent.set(p, list);
    }
    const out = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const child of byParent.get(cur) || []) {
        if (out.has(child)) continue;
        out.add(child);
        stack.push(child);
      }
    }
    return out;
  }
}
