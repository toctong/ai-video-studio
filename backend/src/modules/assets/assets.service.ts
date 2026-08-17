import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  unlinkSync,
} from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import { v4 as uuid } from 'uuid';
import axios from 'axios';
import type { AssetType } from '@ai-video-studio/shared';
import { Asset } from '../../entities/asset.entity';
import { FileOssService, type FileOssObject } from '../storage/file-oss.service';
import { VideoPosterService } from '../storage/video-poster.service';

@Injectable()
export class AssetsService {
  private readonly log = new Logger(AssetsService.name);

  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    private readonly fileOss: FileOssService,
    private readonly videoPoster: VideoPosterService,
  ) {}

  private uploadsRoot() {
    return process.env.UPLOAD_DIR || join(process.cwd(), 'data', 'uploads');
  }

  private projectDir(projectId: string) {
    const dir = join(this.uploadsRoot(), 'projects', projectId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  async list(projectId: string, type?: AssetType, opts?: { libraryOnly?: boolean }) {
    const rows = await this.assets.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    return this.normalizeList(rows, type, opts);
  }

  /**
   * 分页列表：返回 items + total + hasMore + 侧栏 facets。
   * 未传分页参数时控制器仍走 list() 保持旧调用方兼容。
   */
  async listPage(
    projectId: string,
    type?: AssetType,
    opts?: {
      libraryOnly?: boolean;
      take?: number;
      skip?: number;
      q?: string;
      workflowId?: string;
    },
  ) {
    const rows = await this.assets.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    let out = await this.normalizeList(rows, undefined, { libraryOnly: opts?.libraryOnly });

    const byWorkflowId: Record<string, number> = {};
    let unassigned = 0;
    for (const a of out) {
      if (!a.url) continue;
      const wid = String((a.meta as any)?.workflowId || '').trim();
      if (!wid) unassigned += 1;
      else byWorkflowId[wid] = (byWorkflowId[wid] || 0) + 1;
    }

    const workflowId = String(opts?.workflowId || '').trim();
    if (workflowId === '__unassigned__') {
      out = out.filter((a) => !String((a.meta as any)?.workflowId || '').trim());
    } else if (workflowId && workflowId !== '__all__') {
      out = out.filter((a) => String((a.meta as any)?.workflowId || '').trim() === workflowId);
    }

    if (type) out = out.filter((a) => a.type === type);

    const q = String(opts?.q || '').trim().toLowerCase();
    if (q) {
      out = out.filter(
        (a) =>
          String(a.name || '')
            .toLowerCase()
            .includes(q) || String(a.id).includes(q),
      );
    }

    // 仅保留可预览 URL（与资产中心前端一致）
    out = out.filter((a) => !!a.url);

    const total = out.length;
    const take = Math.min(100, Math.max(1, Math.floor(Number(opts?.take) || 48)));
    const skip = Math.max(0, Math.floor(Number(opts?.skip) || 0));
    const items = out.slice(skip, skip + take);
    return {
      items,
      total,
      hasMore: skip + items.length < total,
      facets: {
        totalWithUrl: Object.values(byWorkflowId).reduce((s, n) => s + n, 0) + unassigned,
        byWorkflowId,
        unassigned,
      },
    };
  }

  private async normalizeList(
    rows: Asset[],
    type?: AssetType,
    opts?: { libraryOnly?: boolean },
  ) {
    // 旧工作流资产曾一律标成 storyboard：按名称纠正角色/场景/关键帧
    const dirty: Asset[] = [];
    for (const a of rows) {
      if (a.type !== 'storyboard') continue;
      const next = inferAssetTypeFromName(a.name);
      if (next === 'storyboard') continue;
      a.type = next;
      dirty.push(a);
    }
    if (dirty.length) await this.assets.save(dirty);
    let out = type ? rows.filter((a) => a.type === type) : rows;
    if (opts?.libraryOnly) {
      out = out.filter((a) => !(a.meta as any)?.libraryHidden);
    }
    return out;
  }

  async get(id: string) {
    const a = await this.assets.findOne({ where: { id } });
    if (!a) throw new NotFoundException('素材不存在');
    return a;
  }

  private async requireOssConfigured() {
    if (!(await this.fileOss.isConfigured())) {
      throw new BadRequestException(
        '未配置对象存储：请到「设置 → 任务与存储 → 对象存储」配齐 MinIO（Endpoint + AccessKey）后重试。素材必须存入 OSS。',
      );
    }
  }

  private async putToOssOrThrow(
    projectId: string,
    fileName: string,
    body: Buffer,
    contentType: string,
  ): Promise<FileOssObject> {
    await this.requireOssConfigured();
    const key = await this.fileOss.buildKey(projectId, fileName);
    return this.fileOss.putObject({ key, body, contentType });
  }

  async createFromUpload(
    projectId: string,
    file: Express.Multer.File,
    meta: {
      type: AssetType;
      name?: string;
      prompt?: string;
      workflowId?: string;
      workflowName?: string;
      libraryFolderId?: string;
    },
  ) {
    const id = uuid();
    const ext = extname(file.originalname) || '.bin';
    const workflowId = String(meta.workflowId || '').trim();
    const libraryFolderId = String(meta.libraryFolderId || '').trim();
    const assetMeta: Record<string, unknown> = {
      workflowId: workflowId || '',
      productionId: '',
      role: 'reference',
    };
    if (workflowId) {
      assetMeta.source = 'workflow-upload';
      assetMeta.workflowName = String(meta.workflowName || '').trim();
    }
    if (libraryFolderId) assetMeta.libraryFolderId = libraryFolderId;

    const put = await this.putToOssOrThrow(projectId, `${id}${ext}`, file.buffer, file.mimetype);
    const asset = this.assets.create({
      id,
      projectId,
      type: meta.type,
      name: meta.name || file.originalname,
      mimeType: file.mimetype,
      filePath: '',
      url: put.url,
      prompt: meta.prompt || '',
      meta: this.ossAssetMeta(put, assetMeta),
    });
    const saved = await this.assets.save(asset);
    return this.finalizeVideoPoster(saved);
  }

  async createFromBuffer(
    projectId: string,
    opts: {
      type: AssetType;
      name: string;
      buffer: Buffer;
      ext: string;
      mimeType: string;
      prompt?: string;
      meta?: Record<string, unknown>;
      parentAssetId?: string;
    },
  ) {
    const id = uuid();
    const put = await this.putToOssOrThrow(
      projectId,
      `${id}${opts.ext}`,
      opts.buffer,
      opts.mimeType,
    );
    const asset = this.assets.create({
      id,
      projectId,
      type: opts.type,
      name: opts.name,
      mimeType: opts.mimeType,
      filePath: '',
      url: put.url,
      prompt: opts.prompt || '',
      meta: this.ossAssetMeta(put, opts.meta || {}),
      parentAssetId: opts.parentAssetId || '',
    });
    return this.assets.save(asset);
  }

  /** 规范化远端 URL，用于去重（去 hash；trim） */
  normalizeSourceUrl(url: string) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      u.hash = '';
      return u.toString();
    } catch {
      return raw;
    }
  }

  /** 展示/节点回写：仅返回本系统对象存储永久直链（旧 FileOSS URL 自动改写为 MinIO） */
  resolveMediaUrl(asset: Pick<Asset, 'url' | 'meta'> | null | undefined): string {
    if (!asset) return '';
    const url = String(asset.url || '').trim();
    if (url && this.fileOss.isOurUrl(url)) return this.fileOss.toCanonicalUrl(url);
    return '';
  }

  /** @deprecated 不再提供本地 uploads 展示地址 */
  resolveLocalUrl(_asset: Pick<Asset, 'url' | 'filePath'> | null | undefined): string {
    return '';
  }

  private metaRemoteKey(a: Asset): string {
    const m = (a.meta || {}) as Record<string, unknown>;
    return this.normalizeSourceUrl(
      String(m.remoteUrl || m.sourceUrl || (m.remote ? a.url : '') || ''),
    );
  }

  /** 同项目已有镜像（本地 uploads 或 OSS，按 remote/sourceUrl） */
  private async findMirrorByRemote(projectId: string, remoteUrl: string) {
    const key = this.normalizeSourceUrl(remoteUrl);
    if (!key || !/^https?:\/\//i.test(key)) return null;
    const rows = await this.assets.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    return (
      rows.find((a) => {
        if (this.metaRemoteKey(a) !== key) return false;
        // 仅复用已落入本系统 FileOSS 的镜像
        return this.isStoredOnOss(a) && this.fileOss.isOurUrl(String(a.url || ''));
      }) || null
    );
  }

  /**
   * AI 生成入库：必须落到本系统 FileOSS；展示 URL 仅为 OSS 直链。
   * 第三方临时链仅作拉取源，失败则抛错（不把第三方 URL 写进 asset.url）。
   */
  async createGenerationAsset(
    projectId: string,
    opts: {
      type: AssetType;
      name: string;
      url: string;
      prompt?: string;
      meta?: Record<string, unknown>;
      download?: (url: string, dest: string) => Promise<string>;
      ext?: string;
      mimeType?: string;
    },
  ) {
    const sourceUrl = String(opts.url || '').trim();
    if (!sourceUrl) throw new BadRequestException('素材 URL 为空');
    await this.requireOssConfigured();

    const baseMeta: Record<string, unknown> = {
      ...(opts.meta || {}),
      libraryHidden: true,
    };

    const isRemote = /^https?:\/\//i.test(sourceUrl);
    const isDataUrl = /^data:/i.test(sourceUrl);

    let asset: Asset;

    if (isRemote) {
      if (await this.fileOss.isOurUrlAsync(sourceUrl)) {
        const ossKey =
          this.fileOss.keyFromOurUrl(sourceUrl) ||
          String((opts.meta as any)?.ossKey || '').trim();
        asset = await this.assets.save(
          this.assets.create({
            projectId,
            type: opts.type,
            name: opts.name,
            mimeType: opts.mimeType || '',
            filePath: '',
            url: sourceUrl,
            prompt: opts.prompt || '',
            meta: {
              ...baseMeta,
              storage: 'fileoss',
              ...(ossKey ? { ossKey } : {}),
              libraryHidden: true,
            },
          }),
        );
      } else {
        const reused = await this.findMirrorByRemote(projectId, sourceUrl);
        if (reused) {
          const meta = {
            ...(reused.meta || {}),
            ...baseMeta,
            libraryHidden: true,
          };
          if (JSON.stringify(reused.meta || {}) !== JSON.stringify(meta)) {
            reused.meta = meta;
            asset = await this.assets.save(reused);
          } else {
            asset = reused;
          }
        } else {
          asset = await this.createFromUrl(projectId, {
            type: opts.type,
            name: opts.name,
            url: sourceUrl,
            prompt: opts.prompt,
            download: opts.download,
            ext: opts.ext,
            mimeType: opts.mimeType,
            forceDownload: true,
            meta: {
              ...baseMeta,
              sourceUrl: this.normalizeSourceUrl(sourceUrl),
              libraryHidden: true,
            },
          });
        }
      }
    } else {
      asset = await this.createFromUrl(projectId, {
        type: opts.type,
        name: opts.name,
        url: sourceUrl,
        prompt: opts.prompt,
        download: opts.download,
        ext: opts.ext,
        mimeType: opts.mimeType,
        forceDownload: isDataUrl || !isRemote,
        meta: {
          ...baseMeta,
          sourceUrl: isDataUrl ? 'data-url' : sourceUrl,
          libraryHidden: true,
        },
      });
    }

    return this.finalizeVideoPoster(asset);
  }

  /** 视频资产尽力写入 meta.posterUrl（JPG）；失败不抛错 */
  async ensureVideoPoster(assetId: string): Promise<Asset | null> {
    const id = String(assetId || '').trim();
    if (!id) return null;
    const asset = await this.assets.findOne({ where: { id } });
    if (!asset || asset.type !== 'video') return asset;
    const meta = { ...(asset.meta || {}) } as Record<string, unknown>;
    if (String(meta.posterUrl || '').trim()) return asset;
    const videoUrl = String(asset.url || '').trim();
    if (!videoUrl) return asset;
    const poster = await this.videoPoster.createPoster({
      videoUrl,
      projectId: asset.projectId,
      nameHint: asset.name || asset.id.slice(0, 8),
    });
    if (!poster?.url) return asset;
    asset.meta = {
      ...meta,
      posterUrl: poster.url,
      posterOssKey: poster.key || '',
    };
    return this.assets.save(asset);
  }

  private async finalizeVideoPoster(asset: Asset): Promise<Asset> {
    if (!asset || asset.type !== 'video') return asset;
    if (String((asset.meta as any)?.posterUrl || '').trim()) return asset;
    try {
      const updated = await Promise.race([
        this.ensureVideoPoster(asset.id),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000)),
      ]);
      if (updated?.meta && String((updated.meta as any).posterUrl || '').trim()) {
        return updated;
      }
    } catch (e: any) {
      this.log.warn(`视频封面同步失败: ${e?.message || e}`);
    }
    // 后台再试一次，不挡主流程返回
    void this.ensureVideoPoster(asset.id).catch((e: any) =>
      this.log.warn(`视频封面后台失败: ${e?.message || e}`),
    );
    return asset;
  }

  /**
   * 画布裁切用：同一 sourceUrl 只落盘一次，已有本地文件则直接复用。
   */
  async localizeForCanvas(
    projectId: string,
    opts: {
      url: string;
      type?: AssetType;
      name?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const sourceUrl = this.normalizeSourceUrl(opts.url);
    if (!sourceUrl) throw new BadRequestException('素材 URL 为空');

    // 已是本地 uploads：不新建素材，原样返回可用 url
    const asLocalUrl = (() => {
      const path = this.resolveLocalUploadPath(sourceUrl);
      if (!path || !existsSync(path)) return '';
      const marker = '/api/uploads/';
      const norm = sourceUrl.replace(/\\/g, '/');
      const idx = norm.indexOf(marker);
      if (idx >= 0) return norm.slice(idx).split('?')[0];
      if (sourceUrl.startsWith('/api/uploads/')) return sourceUrl.split('?')[0];
      return '';
    })();
    if (asLocalUrl) {
      const byUrl = await this.assets.findOne({ where: { projectId, url: asLocalUrl } });
      if (byUrl) return byUrl;
      const now = new Date();
      return {
        id: '',
        projectId,
        type: (opts.type || 'other') as AssetType,
        name: opts.name || 'local-image',
        mimeType: '',
        filePath: this.resolveLocalUploadPath(asLocalUrl) || '',
        url: asLocalUrl,
        prompt: '',
        meta: { sourceUrl, reusedLocal: true },
        version: 1,
        parentAssetId: '',
        createdAt: now,
        updatedAt: now,
      } satisfies Asset;
    }

    // 已是 OSS 直链：复用已有记录或返回虚拟对象
    if (await this.fileOss.isOurUrlAsync(sourceUrl)) {
      const byUrl = await this.assets.findOne({ where: { projectId, url: sourceUrl } });
      if (byUrl) return byUrl;
      const now = new Date();
      return {
        id: '',
        projectId,
        type: (opts.type || 'other') as AssetType,
        name: opts.name || 'oss-image',
        mimeType: '',
        filePath: '',
        url: sourceUrl,
        prompt: '',
        meta: { sourceUrl, storage: 'fileoss', reusedOss: true },
        version: 1,
        parentAssetId: '',
        createdAt: now,
        updatedAt: now,
      } satisfies Asset;
    }

    if (/^https?:\/\//i.test(sourceUrl)) {
      const hit = await this.findMirrorByRemote(projectId, sourceUrl);
      if (hit) return hit;
    }

    return this.createFromUrl(projectId, {
      type: (opts.type || 'other') as AssetType,
      name: opts.name || 'remote-image',
      url: sourceUrl,
      forceDownload: true,
      meta: {
        ...(opts.meta || {}),
        sourceUrl,
        remoteUrl: /^https?:\/\//i.test(sourceUrl) ? sourceUrl : undefined,
        localizedForCanvas: true,
      },
    });
  }

  /**
   * 登记素材：http(s)/data 一律拉取进本系统 FileOSS；asset.url 只存 OSS 直链。
   * keepRemoteUrl 已废弃（忽略）；第三方地址仅作拉取源。
   */
  async createFromUrl(
    projectId: string,
    opts: {
      type: AssetType;
      name: string;
      url: string;
      prompt?: string;
      meta?: Record<string, unknown>;
      download?: (url: string, dest: string) => Promise<string>;
      ext?: string;
      mimeType?: string;
      /** @deprecated 忽略：一律进 FileOSS */
      keepRemoteUrl?: boolean;
      /** 兼容旧调用；对远程始终强制入库 OSS */
      forceDownload?: boolean;
    },
  ) {
    const sourceUrl = String(opts.url || '').trim();
    if (!sourceUrl) throw new BadRequestException('素材 URL 为空');
    await this.requireOssConfigured();

    // 已是本系统 OSS：直接登记
    if (await this.fileOss.isOurUrlAsync(sourceUrl)) {
      const ossKey = this.fileOss.keyFromOurUrl(sourceUrl);
      const asset = this.assets.create({
        projectId,
        type: opts.type,
        name: opts.name,
        mimeType: opts.mimeType || '',
        filePath: '',
        url: sourceUrl,
        prompt: opts.prompt || '',
        meta: {
          ...(opts.meta || {}),
          storage: 'fileoss',
          ...(ossKey ? { ossKey } : {}),
        },
      });
      return this.assets.save(asset);
    }

    const isRemote = /^https?:\/\//i.test(sourceUrl);
    const isDataUrl = /^data:/i.test(sourceUrl);
    const id = uuid();
    let ext = this.inferExt(sourceUrl, opts.ext, opts.mimeType);
    let mimeType = opts.mimeType || this.mimeFromExt(ext);

    try {
      if (isDataUrl) {
        const m = /^data:([^;]+);base64,(.+)$/i.exec(sourceUrl);
        if (!m) throw new Error('无法解析 data URL');
        mimeType = opts.mimeType || m[1] || mimeType;
        ext = this.inferExt('', opts.ext, mimeType);
        const buffer = Buffer.from(m[2], 'base64');
        const key = await this.fileOss.buildKey(projectId, `${id}${ext}`);
        const put = await this.fileOss.putObject({
          key,
          body: buffer,
          contentType: mimeType,
        });
        return this.saveOssAsset({
          id,
          projectId,
          type: opts.type,
          name: opts.name,
          mimeType,
          put,
          prompt: opts.prompt,
          meta: { ...(opts.meta || {}), sourceUrl: 'data-url' },
        });
      }

      if (isRemote) {
        const key = await this.fileOss.buildKey(projectId, `${id}${ext}`);
        try {
          const put = await this.fileOss.fetchRemote({
            sourceUrl,
            key,
            contentType: mimeType,
          });
          return this.saveOssAsset({
            id,
            projectId,
            type: opts.type,
            name: opts.name,
            mimeType: put.contentType || mimeType,
            put,
            prompt: opts.prompt,
            meta: {
              ...(opts.meta || {}),
              sourceUrl: this.normalizeSourceUrl(sourceUrl),
            },
          });
        } catch {
          // fetch 接口失败时：本机下载再 put（仍不落 /api/uploads 展示）
          const tmpDir = join(this.uploadsRoot(), '_tmp');
          if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
          const tmp = join(tmpDir, `${id}${ext}`);
          try {
            const download = opts.download || ((u, d) => this.downloadRemoteToFile(u, d));
            await download(sourceUrl, tmp);
            const body = readFileSync(tmp);
            const put = await this.fileOss.putObject({
              key,
              body,
              contentType: mimeType,
            });
            return this.saveOssAsset({
              id,
              projectId,
              type: opts.type,
              name: opts.name,
              mimeType,
              put,
              prompt: opts.prompt,
              meta: {
                ...(opts.meta || {}),
                sourceUrl: this.normalizeSourceUrl(sourceUrl),
                ingestedVia: 'download+put',
              },
            });
          } finally {
            this.unlinkFile(tmp);
          }
        }
      }

      // 相对 /api/uploads 旧路径：读本地再上传 OSS
      const localPath = this.resolveLocalUploadPath(sourceUrl);
      if (!localPath || !existsSync(localPath)) {
        throw new Error('无法识别的素材地址（非 http/data/本机 uploads）');
      }
      ext = extname(localPath) || ext;
      mimeType = opts.mimeType || this.mimeFromExt(ext);
      const body = readFileSync(localPath);
      const key = await this.fileOss.buildKey(projectId, `${id}${ext}`);
      const put = await this.fileOss.putObject({ key, body, contentType: mimeType });
      return this.saveOssAsset({
        id,
        projectId,
        type: opts.type,
        name: opts.name,
        mimeType,
        put,
        prompt: opts.prompt,
        meta: { ...(opts.meta || {}), sourceUrl: 'migrated-local-upload' },
      });
    } catch (e: any) {
      throw new BadRequestException(
        `素材入库 FileOSS 失败：${e?.message || e}（源：${sourceUrl.slice(0, 120)}）`,
      );
    }
  }

  /** `/api/uploads/projects/...` → 本地绝对路径 */
  private resolveLocalUploadPath(url: string): string | null {
    const u = String(url || '').trim().replace(/\\/g, '/');
    const marker = '/api/uploads/';
    const idx = u.indexOf(marker);
    if (idx < 0) return null;
    const rel = u.slice(idx + marker.length).split('?')[0];
    if (!rel || rel.includes('..')) return null;
    return join(this.uploadsRoot(), ...rel.split('/').filter(Boolean));
  }

  private inferExt(url: string, preferred?: string, mime?: string) {
    const fromOpt = String(preferred || '').trim();
    if (fromOpt) return fromOpt.startsWith('.') ? fromOpt : `.${fromOpt}`;
    try {
      const pathname = new URL(url).pathname;
      const e = extname(pathname).toLowerCase();
      if (e && e.length <= 5) return e;
    } catch {
      /* ignore */
    }
    const m = String(mime || '').toLowerCase();
    if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
    if (m.includes('webp')) return '.webp';
    if (m.includes('gif')) return '.gif';
    if (m.includes('mp4')) return '.mp4';
    if (m.includes('webm')) return '.webm';
    if (m.includes('mpeg') || m.includes('mp3')) return '.mp3';
    if (m.includes('wav')) return '.wav';
    return '.png';
  }

  private mimeFromExt(ext: string) {
    const e = ext.toLowerCase();
    if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
    if (e === '.webp') return 'image/webp';
    if (e === '.gif') return 'image/gif';
    if (e === '.mp4') return 'video/mp4';
    if (e === '.webm') return 'video/webm';
    if (e === '.mp3') return 'audio/mpeg';
    if (e === '.wav') return 'audio/wav';
    return 'image/png';
  }

  private async downloadRemoteToFile(url: string, destPath: string) {
    const dir = join(destPath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const res = await axios.get(url, {
      responseType: 'stream',
      timeout: 300000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    await pipeline(res.data, createWriteStream(destPath));
    return destPath;
  }

  async createTextAsset(
    projectId: string,
    opts: {
      type: AssetType;
      name: string;
      content: string;
      prompt?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    return this.createFromBuffer(projectId, {
      type: opts.type,
      name: opts.name,
      buffer: Buffer.from(opts.content, 'utf8'),
      ext: '.txt',
      mimeType: 'text/plain',
      prompt: opts.prompt,
      meta: { ...opts.meta, content: opts.content },
    });
  }

  async updateMeta(id: string, patch: Record<string, unknown>) {
    const a = await this.get(id);
    a.meta = { ...(a.meta || {}), ...patch };
    return this.assets.save(a);
  }

  private ossAssetMeta(put: FileOssObject, extra: Record<string, unknown> = {}) {
    return {
      ...extra,
      storage: 'fileoss',
      ossKey: put.key,
      ossBucket: put.bucket,
    };
  }

  private isStoredOnOss(asset: Pick<Asset, 'meta' | 'url'>): boolean {
    const m = (asset.meta || {}) as Record<string, unknown>;
    if (m.storage === 'fileoss') return true;
    return this.fileOss.isOurUrl(String(asset.url || ''));
  }

  private async tryPutToOss(
    projectId: string,
    fileName: string,
    body: Buffer,
    contentType: string,
  ): Promise<FileOssObject | null> {
    try {
      return await this.putToOssOrThrow(projectId, fileName, body, contentType);
    } catch {
      return null;
    }
  }

  private async saveOssAsset(opts: {
    id: string;
    projectId: string;
    type: AssetType;
    name: string;
    mimeType: string;
    put: FileOssObject;
    prompt?: string;
    meta?: Record<string, unknown>;
    parentAssetId?: string;
  }) {
    // 不把第三方源站写入展示字段；sourceUrl 仅审计
    const cleanMeta = { ...(opts.meta || {}) };
    delete (cleanMeta as any).remoteUrl;
    delete (cleanMeta as any).remote;
    delete (cleanMeta as any).mirrorFailed;
    const asset = this.assets.create({
      id: opts.id,
      projectId: opts.projectId,
      type: opts.type,
      name: opts.name,
      mimeType: opts.mimeType,
      filePath: '',
      url: opts.put.url,
      prompt: opts.prompt || '',
      meta: this.ossAssetMeta(opts.put, cleanMeta),
      parentAssetId: opts.parentAssetId || '',
    });
    return this.assets.save(asset);
  }

  private async deleteStoredAsset(a: Asset) {
    const m = (a.meta || {}) as Record<string, unknown>;
    let key = String(m.ossKey || '').trim();
    if (!key && this.fileOss.isOurUrl(String(a.url || ''))) {
      key = this.fileOss.keyFromOurUrl(String(a.url || ''));
    }
    if (key) {
      await this.fileOss.deleteObject(key);
    }
    this.unlinkFile(a.filePath);
  }

  /** FFmpeg 等需要本地路径：已有 filePath 则复用，否则从 resolveMediaUrl 下载到 destDir */
  async ensureLocalFilePath(asset: Asset, destDir: string): Promise<string> {
    const fp = String(asset.filePath || '').trim();
    if (fp && existsSync(fp)) return fp;

    const url = this.resolveMediaUrl(asset);
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('素材无本地文件且无法下载');
    }

    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    const ext = this.inferExt(url, '', asset.mimeType);
    const dest = join(destDir, `${asset.id || uuid()}${ext}`);
    await this.downloadRemoteToFile(url, dest);
    return dest;
  }

  private unlinkFile(filePath?: string) {
    const p = String(filePath || '').trim();
    if (!p || !existsSync(p)) return;
    try {
      unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  async remove(id: string) {
    const a = await this.get(id);
    await this.deleteStoredAsset(a);
    await this.assets.delete({ id });
    return { ok: true };
  }

  /** 旧指针替换用：不存在也不抛错 */
  async removeQuiet(id?: string | null) {
    const aid = String(id || '').trim();
    if (!aid) return { ok: true, removed: false };
    const a = await this.assets.findOne({ where: { id: aid } });
    if (!a) return { ok: true, removed: false };
    await this.deleteStoredAsset(a);
    await this.assets.delete({ id: aid });
    return { ok: true, removed: true };
  }

  async removeMany(ids: Array<string | null | undefined>) {
    const uniq = [...new Set(ids.map((x) => String(x || '').trim()).filter(Boolean))];
    for (const id of uniq) {
      await this.removeQuiet(id);
    }
    return { ok: true, count: uniq.length };
  }

  /** 删除项目全部素材记录 + OSS 前缀对象 + 本地残留目录 */
  async purgeProject(projectId: string) {
    const rows = await this.assets.find({ where: { projectId } });
    for (const a of rows) {
      await this.deleteStoredAsset(a);
    }
    await this.assets.delete({ projectId });

    // 前缀扫尾：meta 缺 ossKey 时仍能清掉项目下垃圾文件
    try {
      if (await this.fileOss.isConfigured()) {
        const cfg = await this.fileOss.getConfig();
        const prefix = String(cfg.keyPrefix || 'ai/video-studio')
          .trim()
          .replace(/^\/+|\/+$/g, '');
        const safeProject = String(projectId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        if (safeProject) {
          await this.fileOss.deleteByPrefix(`${prefix}/${safeProject}`);
        }
      }
    } catch {
      /* ignore */
    }

    const dir = join(this.uploadsRoot(), 'projects', projectId);
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    return { ok: true, count: rows.length };
  }

  /** 删除某工作流产出的资产（meta.workflowId 匹配） */
  async removeByWorkflowId(workflowId: string) {
    const wid = String(workflowId || '').trim();
    if (!wid) return { ok: true, count: 0 };
    // simple-json 存文本：先模糊查出候选再精确过滤
    const candidates = await this.assets
      .createQueryBuilder('a')
      .where('a.meta LIKE :q', { q: `%${wid}%` })
      .getMany();
    const rows = candidates.filter((a) => String(a.meta?.workflowId || '').trim() === wid);
    for (const a of rows) {
      await this.deleteStoredAsset(a);
    }
    if (rows.length) {
      await this.assets.delete({ id: In(rows.map((a) => a.id)) });
    }
    return { ok: true, count: rows.length };
  }
}

/** 按资产名推断类型（纠正旧 storyboard 标注） */
function inferAssetTypeFromName(name?: string): AssetType {
  const n = String(name || '');
  if (/定妆|角色定妆|portrait/i.test(n)) return 'character_ref';
  if (/^场景|场景图/i.test(n) && !/关键帧|分镜/.test(n)) return 'scene';
  // 「暗底金尘…场景」等不以「场景」开头但以场景结尾
  if (/场景$|scene/i.test(n) && !/关键帧|分镜|定妆/.test(n)) return 'scene';
  if (/关键帧|keyframe|首帧|尾帧/i.test(n)) return 'keyframe';
  return 'storyboard';
}
