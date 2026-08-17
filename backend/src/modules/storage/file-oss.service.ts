import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import axios from 'axios';
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { v4 as uuid } from 'uuid';
import { isLocalStorageMode } from '../../config/env';
import { SettingsService, type FileOssConfig } from '../settings/settings.service';

export type FileOssObject = {
  bucket: string;
  key: string;
  url: string;
  path?: string;
  size?: number;
  contentType?: string;
  etag?: string;
  acl?: string;
  access?: string;
};

/** 旧 FileOSS 域名：仅当设置了 LEGACY_OSS_HOSTS 时用于识别/改写历史直链 */
function legacyOssHosts(): string[] {
  return String(process.env.LEGACY_OSS_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
@Injectable()
export class FileOssService {
  private readonly log = new Logger(FileOssService.name);
  private cache: { at: number; cfg: FileOssConfig } | null = null;
  private s3Cache: { key: string; client: S3Client } | null = null;

  constructor(private readonly settings: SettingsService) {}

  invalidateCache() {
    this.cache = null;
    this.s3Cache = null;
  }

  private uploadRootDir() {
    return resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'data', 'uploads'));
  }

  private localPath(key: string) {
    const root = this.uploadRootDir();
    const clean = String(key || '').replace(/^\/+|\/+$/g, '');
    if (!clean) return root;
    const target = resolve(root, ...clean.split('/'));
    if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) {
      throw new Error('非法的本地存储 key');
    }
    return target;
  }

  private ensureLocalDir(filePath: string) {
    const dir = join(filePath, '..');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private async ensureLocalUploadRoot() {
    const root = this.uploadRootDir();
    if (!existsSync(root)) mkdirSync(root, { recursive: true });
  }

  async getConfig(force = false): Promise<FileOssConfig> {
    if (!force && this.cache && Date.now() - this.cache.at < 3000) {
      return this.cache.cfg;
    }
    const cfg = await this.settings.getFileOssConfig();
    this.cache = { at: Date.now(), cfg };
    return cfg;
  }

  /** 桶名 + AccessKeyId + AccessKeySecret + Base URL 齐备 */
  async isConfigured(): Promise<boolean> {
    if (isLocalStorageMode()) return true;
    const c = await this.getConfig();
    return Boolean(c.baseUrl && c.bucket && c.accessKeyId && c.accessKeySecret);
  }

  /** @deprecated 使用 isConfigured() */
  isEnabled() {
    if (isLocalStorageMode()) return true;
    const c = this.cache?.cfg;
    if (c) return Boolean(c.baseUrl && c.bucket && c.accessKeyId && c.accessKeySecret);
    return false;
  }

  private s3(cfg: FileOssConfig): S3Client {
    const endpoint = String(cfg.apiEndpoint || cfg.baseUrl || '')
      .trim()
      .replace(/\/+$/, '');
    if (!endpoint) {
      throw new Error('对象存储未配置公网读地址 / API Endpoint');
    }
    const key = `${endpoint}|${cfg.accessKeyId}|${cfg.accessKeySecret}`;
    if (this.s3Cache?.key === key) return this.s3Cache.client;
    const client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.accessKeySecret,
      },
      // AWS SDK v3 默认强制校验和，部分 MinIO/反代会报 SignatureDoesNotMatch
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.s3Cache = { key, client };
    return client;
  }

  /** 公开读永久直链：{base}/{bucket}/{key}（key 分段编码） */
  publicUrl(cfg: Pick<FileOssConfig, 'baseUrl' | 'bucket'>, key: string): string {
    if (isLocalStorageMode()) {
      const objectKey = String(key || '').replace(/^\/+/, '');
      return `/api/uploads/${objectKey
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`;
    }
    const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
    const bucket = String(cfg.bucket || '').replace(/^\/+|\/+$/g, '');
    if (!base || !bucket) {
      throw new Error('对象存储未配置公网读地址或桶名');
    }
    const objectKey = String(key || '').replace(/^\/+/, '');
    const encoded = objectKey
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `${base}/${bucket}/${encoded}`;
  }

  private hostOf(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private isLegacyHost(host: string) {
    const h = host.toLowerCase();
    return legacyOssHosts().some((x) => h === x || h.endsWith(`.${x}`));
  }

  private isConfiguredHost(host: string, baseUrl: string) {
    const cfgHost = this.hostOf(baseUrl);
    if (!cfgHost || !host) return false;
    return host === cfgHost || host.endsWith(`.${cfgHost}`);
  }

  /** 是否本存储永久直链（含旧 FileOSS /api/v1 与新 MinIO 路径风格） */
  isOurUrl(url: string) {
    const u = String(url || '').trim();
    if (!u) return false;
    if (isLocalStorageMode()) {
      return u.startsWith('/api/uploads/') || u.includes('/api/uploads/');
    }
    const cfg = this.cache?.cfg;
    const base = String(cfg?.baseUrl || '').replace(/\/+$/, '');
    const bucket = String(cfg?.bucket || '').trim();
    if (!base || !bucket) return false;
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname || '';
      if (path.includes(`/api/v1/${bucket}/`)) return true;
      if (
        (this.isConfiguredHost(host, base) || this.isLegacyHost(host)) &&
        (path.startsWith(`/${bucket}/`) || path.includes(`/api/v1/${bucket}/`))
      ) {
        return true;
      }
      return u.startsWith(`${base}/${bucket}/`);
    } catch {
      return (
        u.includes(`/api/v1/${bucket}/`) ||
        u.startsWith(`${base}/${bucket}/`) ||
        /\/api\/v1\/[^/]+\//.test(u)
      );
    }
  }

  async isOurUrlAsync(url: string) {
    await this.getConfig();
    return this.isOurUrl(url);
  }

  /**
   * 把旧 FileOSS 直链改写成当前 MinIO 公网地址（桶与 key 不变）。
   * 非本存储 URL 原样返回。
   */
  toCanonicalUrl(url: string, cfg?: FileOssConfig): string {
    const u = String(url || '').trim();
    if (!u) return '';
    const c = cfg || this.cache?.cfg;
    if (!c?.baseUrl || !c?.bucket) return u;
    if (!this.isOurUrl(u)) return u;
    const key = this.keyFromOurUrl(u);
    if (!key) return u;
    return this.publicUrl(c, key);
  }

  async toCanonicalUrlAsync(url: string) {
    const cfg = await this.getConfig();
    return this.toCanonicalUrl(url, cfg);
  }

  async buildKey(projectId: string, fileName: string, folder = 'assets') {
    const cfg = await this.getConfig();
    const prefix = String(cfg.keyPrefix || '')
      .trim()
      .replace(/^\/+|\/+$/g, '') || 'uploads';
    const safeProject = String(projectId || 'shared').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFolder = String(folder || 'assets').replace(/[^a-zA-Z0-9_-]/g, '_');
    const base = String(fileName || 'file.bin').replace(/\\/g, '/').split('/').pop() || 'file.bin';
    const cleaned = base.replace(/[^\w.\-()+]/g, '_');
    const ext = extname(cleaned) || '';
    const stem = cleaned.slice(0, cleaned.length - ext.length) || 'file';
    const id = uuid().slice(0, 8);
    return `${prefix}/${safeProject}/${safeFolder}/${stem}-${id}${ext}`;
  }

  private metaForS3(metadata?: Record<string, string>): Record<string, string> | undefined {
    if (!metadata) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadata)) {
      if (!k || v == null) continue;
      const mk = String(k)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
      if (!mk) continue;
      out[mk] = String(v).slice(0, 200);
    }
    return Object.keys(out).length ? out : undefined;
  }

  async putObject(opts: {
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<FileOssObject> {
    const cfg = await this.getConfig();
    const key = opts.key.replace(/^\/+/, '');
    if (isLocalStorageMode()) {
      await this.ensureLocalUploadRoot();
      const filePath = this.localPath(key);
      this.ensureLocalDir(filePath);
      writeFileSync(filePath, opts.body);
      const url = this.publicUrl(cfg, key);
      return {
        bucket: 'local',
        key,
        url,
        path: filePath,
        size: opts.body.length,
        contentType: opts.contentType,
      };
    }
    if (!cfg.accessKeyId || !cfg.accessKeySecret || !cfg.bucket) {
      throw new Error('对象存储未配置');
    }
    const out = await this.s3(cfg).send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: opts.body,
        ContentType: opts.contentType || 'application/octet-stream',
        Metadata: this.metaForS3(opts.metadata),
      }),
    );
    const url = this.publicUrl(cfg, key);
    this.log.debug(`put ${key} → ${url}`);
    return {
      bucket: cfg.bucket,
      key,
      url,
      size: opts.body.length,
      contentType: opts.contentType,
      etag: out.ETag,
    };
  }

  /** 拉取远端文件并写入本桶（替代旧 FileOSS /fetch） */
  async fetchRemote(opts: {
    sourceUrl: string;
    key: string;
    contentType?: string;
    metadata?: Record<string, string>;
    maxBytes?: number;
  }): Promise<FileOssObject> {
    const cfg = await this.getConfig();
    const key = opts.key.replace(/^\/+/, '');
    const maxBytes = Math.max(1, opts.maxBytes || 512 * 1024 * 1024);
    if (isLocalStorageMode()) {
      const res = await axios.get<ArrayBuffer>(opts.sourceUrl, {
        responseType: 'arraybuffer',
        timeout: 300_000,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        validateStatus: (s) => s >= 200 && s < 300,
      });
      const body = Buffer.from(res.data);
      if (body.length > maxBytes) {
        throw new Error(`远端文件过大（>${maxBytes} bytes）`);
      }
      const contentType =
        opts.contentType ||
        String(res.headers['content-type'] || '').split(';')[0].trim() ||
        'application/octet-stream';
      return this.putObject({ key, body, contentType, metadata: opts.metadata });
    }
    if (!cfg.accessKeyId || !cfg.accessKeySecret || !cfg.bucket) {
      throw new Error('对象存储未配置');
    }
    const res = await axios.get<ArrayBuffer>(opts.sourceUrl, {
      responseType: 'arraybuffer',
      timeout: 300_000,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    const body = Buffer.from(res.data);
    if (body.length > maxBytes) {
      throw new Error(`远端文件过大（>${maxBytes} bytes）`);
    }
    const contentType =
      opts.contentType ||
      String(res.headers['content-type'] || '').split(';')[0].trim() ||
      'application/octet-stream';
    const put = await this.putObject({
      key,
      body,
      contentType,
      metadata: opts.metadata,
    });
    this.log.debug(`fetch ${opts.sourceUrl.slice(0, 80)} → ${put.url}`);
    return put;
  }

  async deleteObject(key: string) {
    if (!key) return;
    try {
      if (isLocalStorageMode()) {
        const filePath = this.localPath(key);
        if (existsSync(filePath)) unlinkSync(filePath);
        return;
      }
      const cfg = await this.getConfig();
      if (!cfg.accessKeyId || !cfg.bucket) return;
      await this.s3(cfg).send(
        new DeleteObjectCommand({
          Bucket: cfg.bucket,
          Key: key.replace(/^\/+/, ''),
        }),
      );
    } catch (e: any) {
      this.log.warn(`delete ${key} failed: ${e?.message || e}`);
    }
  }

  /** 读取本桶对象（供同源下载代理流式转发） */
  async getObject(key: string): Promise<{
    body: Readable;
    contentType: string;
    contentLength?: number;
  }> {
    const cfg = await this.getConfig();
    const objectKey = String(key || '').replace(/^\/+/, '');
    if (!objectKey) throw new Error('对象 key 无效');
    if (isLocalStorageMode()) {
      const filePath = this.localPath(objectKey);
      if (!existsSync(filePath)) throw new Error('文件不存在');
      return {
        body: createReadStream(filePath),
        contentType: 'application/octet-stream',
        contentLength: statSync(filePath).size,
      };
    }
    if (!cfg.accessKeyId || !cfg.accessKeySecret || !cfg.bucket) {
      throw new Error('对象存储未配置');
    }
    const out = await this.s3(cfg).send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }),
    );
    const body = out.Body as Readable | undefined;
    if (!body || typeof (body as any).pipe !== 'function') {
      throw new Error('读取对象失败');
    }
    return {
      body,
      contentType:
        String(out.ContentType || '').split(';')[0].trim() || 'application/octet-stream',
      contentLength: typeof out.ContentLength === 'number' ? out.ContentLength : undefined,
    };
  }

  /** 从本存储永久直链解析 object key（兼容旧 /api/v1 与新路径风格） */
  keyFromOurUrl(url: string): string {
    const u = String(url || '').trim();
    if (!u || !this.isOurUrl(u)) return '';
    if (isLocalStorageMode()) {
      const marker = '/api/uploads/';
      const idx = u.indexOf(marker);
      if (idx < 0) return '';
      const raw = u.slice(idx + marker.length).split('?')[0].split('#')[0];
      try {
        return decodeURIComponent(raw).replace(/^\/+/, '');
      } catch {
        return raw.replace(/^\/+/, '');
      }
    }
    try {
      const path = decodeURIComponent(new URL(u).pathname);
      const legacy = path.match(/\/api\/v1\/[^/]+\/(.+)$/);
      if (legacy) return legacy[1];
      const pathStyle = path.match(/^\/[^/]+\/(.+)$/);
      return pathStyle ? pathStyle[1] : '';
    } catch {
      const legacy = u.match(/\/api\/v1\/[^/]+\/(.+?)(?:\?|$)/);
      if (legacy) return decodeURIComponent(legacy[1]);
      const pathStyle = u.match(/https?:\/\/[^/]+\/[^/]+\/(.+?)(?:\?|$)/i);
      return pathStyle ? decodeURIComponent(pathStyle[1]) : '';
    }
  }

  /** 列举前缀下对象 key（用于项目清理） */
  async listKeys(prefix: string, maxKeys = 1000): Promise<string[]> {
    if (isLocalStorageMode()) {
      await this.ensureLocalUploadRoot();
      const root = this.uploadRootDir();
      const p = String(prefix || '').replace(/^\/+/, '');
      const base = p ? resolve(root, ...p.split('/')) : root;
      if (!existsSync(base)) return [];
      const limit = Math.min(1000, Math.max(1, maxKeys));
      const keys: string[] = [];
      const walk = (dir: string) => {
        if (keys.length >= limit) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (keys.length >= limit) return;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile()) {
            const rel = full.slice(root.length).replace(/\\/g, '/').replace(/^\/+/, '');
            keys.push(rel);
          }
        }
      };
      walk(base);
      return keys;
    }
    const cfg = await this.getConfig();
    if (!cfg.accessKeyId || !cfg.bucket) return [];
    const p = String(prefix || '').replace(/^\/+/, '');
    const limit = Math.min(1000, Math.max(1, maxKeys));
    const keys: string[] = [];
    let token: string | undefined;
    try {
      do {
        const out = await this.s3(cfg).send(
          new ListObjectsV2Command({
            Bucket: cfg.bucket,
            Prefix: p,
            MaxKeys: Math.min(1000, limit - keys.length),
            ContinuationToken: token,
          }),
        );
        for (const obj of out.Contents || []) {
          const k = String(obj.Key || '').trim();
          if (k) keys.push(k);
          if (keys.length >= limit) return keys;
        }
        token = out.IsTruncated ? out.NextContinuationToken : undefined;
      } while (token);
      return keys;
    } catch (e: any) {
      this.log.warn(`list ${p} failed: ${e?.message || e}`);
      return [];
    }
  }

  async deleteByPrefix(prefix: string) {
    const p = String(prefix || '').replace(/^\/+|\/+$/g, '');
    if (!p) return;
    if (isLocalStorageMode()) {
      const root = this.uploadRootDir();
      const target = p ? resolve(root, ...p.split('/')) : root;
      if (existsSync(target) && target !== root) {
        rmSync(target, { recursive: true, force: true });
      }
      return;
    }
    const cfg = await this.getConfig();
    if (!cfg.accessKeyId || !cfg.bucket) return;
    const keys = await this.listKeys(`${p}/`, 1000);
    if (!keys.length) return;
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      try {
        await this.s3(cfg).send(
          new DeleteObjectsCommand({
            Bucket: cfg.bucket,
            Delete: {
              Objects: chunk.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
      } catch (e: any) {
        this.log.warn(`deleteByPrefix batch failed: ${e?.message || e}`);
        for (const key of chunk) await this.deleteObject(key);
      }
    }
  }

  /** 连通性探测：列举桶（MaxKeys=1） */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (isLocalStorageMode()) {
      await this.ensureLocalUploadRoot();
      return { ok: true, message: `本地磁盘存储可用（${this.uploadRootDir()}）` };
    }
    const cfg = await this.getConfig(true);
    if (!cfg.baseUrl || !cfg.bucket || !cfg.accessKeyId || !cfg.accessKeySecret) {
      return { ok: false, message: '请先填写公网地址、桶名、AccessKeyId、AccessKeySecret' };
    }
    const api = (cfg.apiEndpoint || cfg.baseUrl).replace(/\/+$/, '');
    try {
      await this.s3(cfg).send(
        new ListObjectsV2Command({
          Bucket: cfg.bucket,
          MaxKeys: 1,
        }),
      );
      return {
        ok: true,
        message: `已连通 MinIO 桶「${cfg.bucket}」（API：${api}）`,
      };
    } catch (e: any) {
      const raw = String(
        e?.message || e?.Code || e?.name || e?.Code || '连接失败',
      );
      let hint = '';
      if (/SignatureDoesNotMatch|not match the signature/i.test(raw)) {
        hint =
          '。常见原因：① AccessKey 不是 MinIO 的（旧 FileOSS Key 不可用）；② 公网反代改了 Host——请向运维要内网 S3 地址填到「API Endpoint」（如 http://ip:9000），公网地址仍用于读直链';
      }
      return { ok: false, message: `${raw}${hint}` };
    }
  }
}
