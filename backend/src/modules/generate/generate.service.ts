import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { extname } from 'path';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  GenerateMessage,
  type GenerateMessageKind,
  type GenerateMessageRole,
  type GenerateMessageStatus,
} from '../../entities/generate-message.entity';
import { GenerateSession } from '../../entities/generate-session.entity';
import { AiProviderService } from '../ai/ai-provider.service';
import { JobsService } from '../jobs/jobs.service';
import { FileOssService } from '../storage/file-oss.service';
import { VideoPosterService } from '../storage/video-poster.service';

export type GenerateSessionDto = {
  id: string;
  title: string;
  pinned: boolean;
  /** 最近一条已完成图片/视频封面（视频优先 poster） */
  coverUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerateMessageDto = {
  id: string;
  sessionId: string;
  role: GenerateMessageRole;
  kind: GenerateMessageKind;
  content: string;
  mediaUrl: string;
  mediaOssKey: string;
  aspectRatio: string;
  prefs: Record<string, unknown>;
  status: GenerateMessageStatus;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class GenerateService {
  private readonly log = new Logger(GenerateService.name);

  constructor(
    @InjectRepository(GenerateSession)
    private readonly sessions: Repository<GenerateSession>,
    @InjectRepository(GenerateMessage)
    private readonly messages: Repository<GenerateMessage>,
    private readonly ai: AiProviderService,
    private readonly fileOss: FileOssService,
    private readonly videoPoster: VideoPosterService,
    @Inject(forwardRef(() => JobsService))
    private readonly jobs: JobsService,
  ) {}

  private toSessionDto(row: GenerateSession, coverUrl = ''): GenerateSessionDto {
    return {
      id: row.id,
      title: row.title || '新对话',
      pinned: !!row.pinned,
      coverUrl: String(coverUrl || '').trim(),
      createdAt: row.createdAt?.toISOString?.() || String(row.createdAt || ''),
      updatedAt: row.updatedAt?.toISOString?.() || String(row.updatedAt || ''),
    };
  }

  private coverFromMessage(row: GenerateMessage): string {
    const prefs = this.parsePrefs(row.prefsJson);
    if (row.kind === 'video') {
      const poster = String(prefs.posterUrl || '').trim();
      if (poster) return poster;
    }
    const urls = Array.isArray(prefs.mediaUrls)
      ? (prefs.mediaUrls as unknown[]).map((u) => String(u || '').trim()).filter(Boolean)
      : [];
    return urls[0] || String(row.mediaUrl || '').trim();
  }

  private parsePrefs(raw: string): Record<string, unknown> {
    try {
      const v = JSON.parse(raw || '{}');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }

  private toMessageDto(row: GenerateMessage): GenerateMessageDto {
    return {
      id: row.id,
      sessionId: row.sessionId,
      role: row.role,
      kind: row.kind,
      content: row.content || '',
      mediaUrl: row.mediaUrl || '',
      mediaOssKey: row.mediaOssKey || '',
      aspectRatio: row.aspectRatio || '16:9',
      prefs: this.parsePrefs(row.prefsJson),
      status: row.status,
      errorMessage: row.errorMessage || '',
      createdAt: row.createdAt?.toISOString?.() || String(row.createdAt || ''),
      updatedAt: row.updatedAt?.toISOString?.() || String(row.updatedAt || ''),
    };
  }

  private async sessionOssPrefix(sessionId: string) {
    const cfg = await this.fileOss.getConfig();
    const prefix = String(cfg.keyPrefix || 'ai/video-studio')
      .trim()
      .replace(/^\/+|\/+$/g, '');
    const safe = String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${prefix}/generate/${safe}`;
  }

  private async buildGenerateKey(sessionId: string, fileName: string) {
    const base = String(fileName || 'file.bin').replace(/\\/g, '/').split('/').pop() || 'file.bin';
    const cleaned = base.replace(/[^\w.\-()+]/g, '_');
    const ext = extname(cleaned) || '';
    const stem = cleaned.slice(0, cleaned.length - ext.length) || 'file';
    const id = uuid().slice(0, 8);
    const root = await this.sessionOssPrefix(sessionId);
    return `${root}/${stem}-${id}${ext}`;
  }

  async listSessions(userId: number): Promise<GenerateSessionDto[]> {
    const rows = await this.sessions.find({ where: { userId } });
    rows.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const ta = new Date(a.updatedAt).getTime();
      const tb = new Date(b.updatedAt).getTime();
      return tb - ta;
    });
    const ids = rows.map((r) => r.id);
    const coverBySession = new Map<string, string>();
    if (ids.length) {
      const mediaRows = await this.messages
        .createQueryBuilder('m')
        .where('m.sessionId IN (:...ids)', { ids })
        .andWhere("m.kind IN ('image', 'video')")
        .andWhere("m.role = 'assistant'")
        .andWhere("m.mediaUrl != ''")
        .andWhere("m.status = 'done'")
        .orderBy('m.createdAt', 'DESC')
        .getMany();
      for (const m of mediaRows) {
        if (coverBySession.has(m.sessionId)) continue;
        const cover = this.coverFromMessage(m);
        if (cover) coverBySession.set(m.sessionId, cover);
      }
    }
    return rows.map((r) => this.toSessionDto(r, coverBySession.get(r.id) || ''));
  }

  async getOwnedSession(id: string, userId: number): Promise<GenerateSession> {
    const row = await this.sessions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('会话不存在');
    if (row.userId !== userId) throw new ForbiddenException('无权操作该会话');
    return row;
  }

  async createSession(userId: number, title?: string): Promise<GenerateSessionDto> {
    const row = this.sessions.create({
      userId,
      title: String(title || '').trim() || '新对话',
      pinned: false,
    });
    const saved = await this.sessions.save(row);
    return this.toSessionDto(saved);
  }

  async updateSession(
    id: string,
    userId: number,
    input: { title?: string; pinned?: boolean },
  ): Promise<GenerateSessionDto> {
    const row = await this.getOwnedSession(id, userId);
    if (input.title !== undefined) {
      const t = String(input.title || '').trim();
      if (!t) throw new BadRequestException('标题不能为空');
      row.title = t.slice(0, 80);
    }
    if (input.pinned !== undefined) row.pinned = !!input.pinned;
    const saved = await this.sessions.save(row);
    return this.toSessionDto(saved);
  }

  async deleteSession(id: string, userId: number): Promise<{ ok: true }> {
    const row = await this.getOwnedSession(id, userId);
    const msgs = await this.messages.find({ where: { sessionId: id } });
    for (const m of msgs) {
      const prefs = this.parsePrefs(m.prefsJson);
      const extraKeys = Array.isArray(prefs.mediaOssKeys)
        ? (prefs.mediaOssKeys as unknown[]).map((k) => String(k || '').trim()).filter(Boolean)
        : [];
      const keys = new Set<string>();
      const primary = String(m.mediaOssKey || '').trim();
      if (primary) keys.add(primary);
      for (const k of extraKeys) keys.add(k);
      if (!keys.size && m.mediaUrl) {
        const k = this.fileOss.keyFromOurUrl(m.mediaUrl);
        if (k) keys.add(k);
      }
      for (const k of keys) await this.fileOss.deleteObject(k);
    }
    try {
      const prefix = await this.sessionOssPrefix(id);
      await this.fileOss.deleteByPrefix(prefix);
    } catch (e: any) {
      this.log.warn(`deleteByPrefix session=${id}: ${e?.message || e}`);
    }
    await this.messages.delete({ sessionId: id });
    await this.sessions.delete({ id: row.id });
    return { ok: true };
  }

  async listMessages(sessionId: string, userId: number): Promise<GenerateMessageDto[]> {
    await this.getOwnedSession(sessionId, userId);
    await this.reconcileStaleInFlight(sessionId);
    const rows = await this.messages.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toMessageDto(r));
  }

  /**
   * 清理卡住的 pending|streaming。
   * 有活跃 job 的消息不杀；job 已终态则对齐消息；无 job 且过 TTL 则标失败。
   */
  private async reconcileStaleInFlight(sessionId: string) {
    const ttlMs = 15 * 60 * 1000;
    const cutoff = Date.now() - ttlMs;
    try {
      const rows = await this.messages.find({ where: { sessionId } });
      for (const row of rows) {
        if (row.status !== 'pending' && row.status !== 'streaming') continue;
        const prefs = this.parsePrefs(row.prefsJson);
        const jobRunId = String(prefs.jobRunId || '').trim();
        if (jobRunId) {
          try {
            const job = await this.jobs.get(jobRunId);
            if (job?.status === 'queued' || job?.status === 'active') continue;
            if (job?.status === 'cancelled') {
              row.status = 'error';
              row.errorMessage = '已取消';
              await this.messages.save(row);
              continue;
            }
            if (job?.status === 'failed') {
              row.status = 'error';
              row.errorMessage = String(job.error || '生成失败');
              await this.messages.save(row);
              continue;
            }
            // completed 但消息仍 pending：等轮询或由任务幂等补写；过久则标失败
          } catch {
            /* job 不存在则走 TTL */
          }
        }
        const t = row.updatedAt || row.createdAt;
        if (t && new Date(t).getTime() < cutoff) {
          row.status = 'error';
          row.errorMessage = row.errorMessage || '连接已中断，请重新生成';
          await this.messages.save(row);
        }
      }
    } catch (e: any) {
      this.log.warn(`reconcileStaleInFlight failed: ${e?.message || e}`);
    }
  }

  /** 取消生成页消息对应任务 */
  async cancelMessage(messageId: string, userId: number): Promise<GenerateMessageDto> {
    const row = await this.messages.findOne({ where: { id: String(messageId || '').trim() } });
    if (!row) throw new NotFoundException('消息不存在');
    await this.getOwnedSession(row.sessionId, userId);
    if (row.status === 'done') return this.toMessageDto(row);
    const prefs = this.parsePrefs(row.prefsJson);
    const jobRunId = String(prefs.jobRunId || '').trim();
    if (jobRunId) {
      try {
        await this.jobs.cancel(jobRunId);
      } catch (e: any) {
        this.log.warn(`cancel job ${jobRunId}: ${e?.message || e}`);
      }
    }
    if (row.status === 'pending' || row.status === 'streaming') {
      row.status = 'error';
      row.errorMessage = '已取消';
      await this.messages.save(row);
      await this.touchSession(row.sessionId);
    }
    return this.toMessageDto(row);
  }

  /** 资产页「生成」大类：按对话汇总图/视频 */
  async listMediaAssets(
    userId: number,
    opts?: {
      sessionId?: string;
      kind?: string;
      q?: string;
      take?: number;
      skip?: number;
    },
  ): Promise<{
    items: Array<{
      id: string;
      sessionId: string;
      sessionTitle: string;
      kind: 'image' | 'video';
      name: string;
      url: string;
      mediaOssKey: string;
      posterUrl: string;
      aspectRatio: string;
      createdAt: string;
    }>;
    total: number;
    hasMore: boolean;
    facets: {
      totalWithMedia: number;
      bySessionId: Record<string, number>;
    };
  }> {
    const sessions = await this.sessions.find({ where: { userId } });
    const sessionMap = new Map(sessions.map((s) => [s.id, s]));
    const sessionIds = sessions.map((s) => s.id);
    if (!sessionIds.length) {
      return {
        items: [],
        total: 0,
        hasMore: false,
        facets: { totalWithMedia: 0, bySessionId: {} },
      };
    }

    const rows = await this.messages
      .createQueryBuilder('m')
      .where('m.sessionId IN (:...ids)', { ids: sessionIds })
      .andWhere("m.kind IN ('image', 'video')")
      .andWhere("m.mediaUrl != ''")
      .andWhere("m.status = 'done'")
      .orderBy('m.createdAt', 'DESC')
      .getMany();

    const bySessionId: Record<string, number> = {};
    for (const m of rows) {
      bySessionId[m.sessionId] = (bySessionId[m.sessionId] || 0) + 1;
    }
    const totalWithMedia = rows.length;

    const sessionFilter = String(opts?.sessionId || '').trim();
    const kindFilter = String(opts?.kind || '').trim().toLowerCase();
    const q = String(opts?.q || '').trim().toLowerCase();

    let filtered = rows;
    if (sessionFilter && sessionFilter !== '__all__') {
      filtered = filtered.filter((m) => m.sessionId === sessionFilter);
    }
    if (kindFilter === 'image' || kindFilter === 'video') {
      filtered = filtered.filter((m) => m.kind === kindFilter);
    }
    if (q) {
      filtered = filtered.filter((m) => {
        const title = String(sessionMap.get(m.sessionId)?.title || '').toLowerCase();
        const content = String(m.content || '').toLowerCase();
        return title.includes(q) || content.includes(q) || m.id.toLowerCase().includes(q);
      });
    }

    const take = Math.min(100, Math.max(1, Number(opts?.take) || 48));
    const skip = Math.max(0, Number(opts?.skip) || 0);
    const page = filtered.slice(skip, skip + take);

    return {
      items: page.map((m) => {
        const session = sessionMap.get(m.sessionId);
        const title = session?.title || '新对话';
        const kind = m.kind === 'video' ? 'video' : 'image';
        const brief = String(m.content || '').trim().replace(/\s+/g, ' ');
        const name =
          (brief ? brief.slice(0, 36) : '') ||
          `${kind === 'video' ? '视频' : '图片'} · ${title}`.slice(0, 48);
        const prefs = this.parsePrefs(m.prefsJson);
        return {
          id: m.id,
          sessionId: m.sessionId,
          sessionTitle: title,
          kind,
          name,
          url: m.mediaUrl || '',
          mediaOssKey: m.mediaOssKey || '',
          posterUrl: String(prefs.posterUrl || '').trim(),
          aspectRatio: m.aspectRatio || '16:9',
          createdAt: m.createdAt?.toISOString?.() || String(m.createdAt || ''),
        };
      }),
      total: filtered.length,
      hasMore: skip + page.length < filtered.length,
      facets: { totalWithMedia, bySessionId },
    };
  }

  async deleteMediaMessage(userId: number, messageId: string): Promise<{ ok: true }> {
    const id = String(messageId || '').trim();
    if (!id) throw new BadRequestException('消息不存在');
    const row = await this.messages.findOne({ where: { id } });
    if (!row) throw new NotFoundException('消息不存在');
    await this.getOwnedSession(row.sessionId, userId);
    if (row.kind !== 'image' && row.kind !== 'video') {
      throw new BadRequestException('仅可删除图片/视频资产');
    }
    const prefs = this.parsePrefs(row.prefsJson);
    const extraKeys = Array.isArray(prefs.mediaOssKeys)
      ? (prefs.mediaOssKeys as unknown[]).map((k) => String(k || '').trim()).filter(Boolean)
      : [];
    const keys = new Set<string>();
    const primary = String(row.mediaOssKey || '').trim();
    if (primary) keys.add(primary);
    for (const k of extraKeys) keys.add(k);
    if (!keys.size && row.mediaUrl) {
      const k = this.fileOss.keyFromOurUrl(row.mediaUrl);
      if (k) keys.add(k);
    }
    for (const k of keys) await this.fileOss.deleteObject(k);
    await this.messages.delete({ id: row.id });
    await this.touchSession(row.sessionId);
    return { ok: true };
  }

  private async touchSession(sessionId: string, titleHint?: string) {
    const row = await this.sessions.findOne({ where: { id: sessionId } });
    if (!row) return;
    if (titleHint && (row.title === '新对话' || !row.title)) {
      row.title = titleHint.slice(0, 40);
    }
    row.updatedAt = new Date();
    await this.sessions.save(row);
  }

  private async addMessage(input: {
    sessionId: string;
    role: GenerateMessageRole;
    kind: GenerateMessageKind;
    content?: string;
    mediaUrl?: string;
    mediaOssKey?: string;
    aspectRatio?: string;
    prefs?: Record<string, unknown>;
    status?: GenerateMessageStatus;
    errorMessage?: string;
  }): Promise<GenerateMessage> {
    const row = this.messages.create({
      sessionId: input.sessionId,
      role: input.role,
      kind: input.kind,
      content: String(input.content || ''),
      mediaUrl: String(input.mediaUrl || ''),
      mediaOssKey: String(input.mediaOssKey || ''),
      aspectRatio: String(input.aspectRatio || '16:9'),
      prefsJson: JSON.stringify(input.prefs || {}),
      status: input.status || 'done',
      errorMessage: String(input.errorMessage || ''),
    });
    return this.messages.save(row);
  }

  private mergeMessagePrefs(row: GenerateMessage, patch: Record<string, unknown>) {
    row.prefsJson = JSON.stringify({
      ...this.parsePrefs(row.prefsJson),
      ...patch,
    });
  }

  /** 将临时 URL / dataURL 落到 generate/{sessionId}/ 前缀 */
  async persistMedia(
    sessionId: string,
    sourceUrl: string,
    opts?: { fileName?: string; contentType?: string },
  ): Promise<{ url: string; key: string }> {
    const src = String(sourceUrl || '').trim();
    if (!src) throw new BadRequestException('无媒体地址');

    if (await this.fileOss.isOurUrlAsync(src)) {
      const key = this.fileOss.keyFromOurUrl(src);
      const url = await this.fileOss.toCanonicalUrlAsync(src);
      return { url, key };
    }

    const isData = /^data:/i.test(src);
    const isHttp = /^https?:\/\//i.test(src);
    if (!isData && !isHttp) throw new BadRequestException('不支持的媒体地址');

    let contentType = opts?.contentType || 'application/octet-stream';
    let ext = '.bin';
    if (isData) {
      const m = /^data:([^;]+);base64,(.+)$/i.exec(src);
      if (!m) throw new BadRequestException('无法解析 data URL');
      contentType = m[1] || contentType;
      if (/png/i.test(contentType)) ext = '.png';
      else if (/jpeg|jpg/i.test(contentType)) ext = '.jpg';
      else if (/webp/i.test(contentType)) ext = '.webp';
      else if (/gif/i.test(contentType)) ext = '.gif';
      else if (/mp4|mpeg4/i.test(contentType)) ext = '.mp4';
      else if (/webm/i.test(contentType)) ext = '.webm';
      const body = Buffer.from(m[2], 'base64');
      const key = await this.buildGenerateKey(sessionId, opts?.fileName || `media${ext}`);
      const put = await this.fileOss.putObject({ key, body, contentType });
      return { url: put.url, key };
    }

    if (/mp4|webm|mov/i.test(src) || /video/i.test(contentType)) {
      ext = '.mp4';
      contentType = contentType.startsWith('video/') ? contentType : 'video/mp4';
    } else {
      ext = '.png';
      contentType = contentType.startsWith('image/') ? contentType : 'image/png';
    }
    const key = await this.buildGenerateKey(sessionId, opts?.fileName || `media${ext}`);
    try {
      const put = await this.fileOss.fetchRemote({
        sourceUrl: src,
        key,
        contentType,
      });
      return { url: put.url, key };
    } catch (e: any) {
      this.log.warn(`fetchRemote failed, keep source: ${e?.message || e}`);
      return { url: src, key: '' };
    }
  }

  async uploadRef(
    userId: number,
    sessionId: string,
    file: Express.Multer.File,
  ): Promise<{ url: string; key: string }> {
    await this.getOwnedSession(sessionId, userId);
    if (!file?.buffer?.length) throw new BadRequestException('请选择文件');
    const mime = String(file.mimetype || 'application/octet-stream');
    const name = String(file.originalname || 'ref.bin');
    const key = await this.buildGenerateKey(sessionId, name);
    const put = await this.fileOss.putObject({
      key,
      body: file.buffer,
      contentType: mime,
    });
    await this.touchSession(sessionId);
    return { url: put.url, key };
  }

  private heuristicIntent(text: string): 'chat' | 'image' | 'video' {
    const t = String(text || '').trim();
    if (!t) return 'chat';
    // 「视频提示词 / 写提示词」等只要文字，绝不直出媒体
    if (this.looksLikePromptWritingRequest(t)) return 'chat';
    // 勿单独匹配「短视频/运镜/seedance」等词：技能名与技能指引里很常见，会误触发直出视频
    // 「生成视频提示词」不能命中「生成视频」——用否定前瞻
    if (
      /生成视频(?!提示|文案|脚本|prompt)|做[一个张段]?视频(?!提示|文案|脚本)|出视频(?!提示|文案)|拍[一]?段(?!提示)|动画视频(?!提示)|图生视频|帮我做视频(?!提示|文案)|视频生成(?!提示|文案|脚本)|来[个段]视频(?!提示)|再来[一个段]视频|重新生成视频|做[一段个]短片|(生成|做|拍|出).{0,10}短视频(?!提示)|短视频.{0,10}(生成|制作|拍摄)(?!提示)|立刻(出|生成).{0,8}视频|马上(出|生成).{0,8}视频/i.test(
        t,
      )
    ) {
      return 'video';
    }
    if (
      /生成图片(?!提示|文案)|画一张|画个|出一张图|出图(?!提示)|生图(?!提示)|帮我画|做张图|封面图|生成一张(?!提示)|图片生成(?!提示|文案)|来[张幅]图|文生图|生成[一]?张(?!提示)|再来一张|再出一张|再画一张|重新生成图|再生成一张|做[一张个]?海报|做[一张个]?封面|做[一张个]?壁纸|做[一张个]?头像|出[一张个]?立绘|概念图|场景图|角色图|(生成|做|出).{0,10}seedream|seedream.{0,10}(生成|出图)/i.test(
        t,
      )
    ) {
      return 'image';
    }
    // 含画面描述 + 明确「生成/做出来」且指向视觉产物（排除「生成…提示词」）
    if (
      /(生成|做出|搞一张|来一张|直接出).{0,24}(图|封面|海报|壁纸|立绘|头像|场景)(?!提示|文案)/.test(t) ||
      /(图|封面|海报|壁纸|立绘|头像|场景).{0,16}(生成|做出来|直接出)(?!提示|文案)/.test(t)
    ) {
      return 'image';
    }
    if (
      /(生成|做出|搞一段|来一段|直接出).{0,24}(视频|短片|动画|镜头)(?!提示|文案|脚本)/.test(t) ||
      /(视频|短片|动画).{0,16}(生成|做出来|直接出)(?!提示|文案|脚本)/.test(t)
    ) {
      return 'video';
    }
    return 'chat';
  }

  /** 只要提示词/文案/脚本等文字产物（不是立刻出图出视频） */
  private looksLikePromptWritingRequest(text: string): boolean {
    const t = String(text || '').trim();
    if (!t) return false;
    if (
      !/提示词|prompt\b|文案|台词|脚本|分镜稿|分镜文案|怎么写|写一[段个句]|写[个段]提示|(优化|改写|润色|扩写|补全|整理).{0,16}(提示|prompt|文案|脚本)/i.test(
        t,
      )
    ) {
      return false;
    }
    // 明确「按提示词立刻出片」才不算写提示词
    if (
      /(按|用).{0,8}提示词.{0,8}(出|生成)|(立刻|马上|现在).{0,10}(出视频|生成视频|出图|生成图片|出片)|直接出片|开始生成视频|开始出图|做成视频|做成图/.test(
        t,
      )
    ) {
      return false;
    }
    return true;
  }

  /** 用户确认执行待挂起的出图/出视频 */
  private looksLikeMediaConfirm(text: string): boolean {
    const t = String(text || '').trim();
    if (!t) return false;
    if (this.looksLikePromptWritingRequest(t) && !/确认执行|确认生成|确认出/.test(t)) {
      return false;
    }
    if (
      /确认执行|确认生成|确认出图|确认出视频|确认出片|开始执行|可以执行|执行吧|就这样生成|按这个生成|同意生成|可以生成了|好的[，,\s]?开始(生成|出图|出视频)?|开始出图|开始出视频/.test(
        t,
      )
    ) {
      return true;
    }
    // 短确认（仅在有 pending 时由调用方启用）
    if (/^(确认|好的|可以|行|嗯|ok|okay|yes|执行|生成吧|出吧|开干)[.!！。]?$/i.test(t)) {
      return true;
    }
    return false;
  }

  /** 取消待确认的生成 */
  private looksLikeMediaCancel(text: string): boolean {
    const t = String(text || '').trim();
    if (!t) return false;
    return /^(取消|不要了|先不(生成|出)|算了|取消生成|取消执行)[.!！。]?$/i.test(t) ||
      /取消(本次|这次)?(生成|执行|出图|出视频)/.test(t);
  }

  private findPendingMedia(rows: GenerateMessage[]): {
    sourceMessageId: string;
    kind: 'image' | 'video';
    prompt: string;
    understanding: string;
    referenceImages: string[];
    referenceVideoUrls: string[];
    prefs: Record<string, unknown>;
  } | null {
    for (let i = rows.length - 1; i >= 0; i--) {
      const m = rows[i];
      if (!m || m.role !== 'assistant' || m.kind !== 'chat') continue;
      const prefs = this.parsePrefs(m.prefsJson);
      const raw = prefs.pendingMedia;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const p = raw as Record<string, unknown>;
      if (p.consumed || p.cancelled) continue;
      const kind = p.kind === 'video' ? 'video' : p.kind === 'image' ? 'image' : null;
      const prompt = String(p.prompt || '').trim();
      if (!kind || !prompt) continue;
      const nested =
        p.prefs && typeof p.prefs === 'object' && !Array.isArray(p.prefs)
          ? (p.prefs as Record<string, unknown>)
          : {};
      const referenceImages = Array.isArray(p.referenceImages)
        ? (p.referenceImages as unknown[]).map((u) => String(u || '').trim()).filter(Boolean)
        : [];
      const referenceVideoUrls = Array.isArray(p.referenceVideoUrls)
        ? (p.referenceVideoUrls as unknown[])
            .map((u) => String(u || '').trim())
            .filter(Boolean)
        : [];
      return {
        sourceMessageId: m.id,
        kind,
        prompt,
        understanding: String(p.understanding || '').trim(),
        referenceImages,
        referenceVideoUrls,
        prefs: nested,
      };
    }
    return null;
  }

  private async markPendingMediaStatus(
    messageId: string,
    status: 'consumed' | 'cancelled',
  ) {
    const row = await this.messages.findOne({ where: { id: messageId } });
    if (!row) return;
    const prefs = this.parsePrefs(row.prefsJson);
    const raw = prefs.pendingMedia;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    this.mergeMessagePrefs(row, {
      pendingMedia: {
        ...(raw as Record<string, unknown>),
        consumed: status === 'consumed' ? true : !!(raw as any).consumed,
        cancelled: status === 'cancelled' ? true : !!(raw as any).cancelled,
      },
    });
    await this.messages.save(row);
  }

  private async cancelOpenPendingMedia(rows: GenerateMessage[]) {
    for (const m of rows) {
      if (!m || m.role !== 'assistant' || m.kind !== 'chat') continue;
      const prefs = this.parsePrefs(m.prefsJson);
      const raw = prefs.pendingMedia;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      if ((raw as any).consumed || (raw as any).cancelled) continue;
      this.mergeMessagePrefs(m, {
        pendingMedia: { ...(raw as Record<string, unknown>), cancelled: true },
      });
      await this.messages.save(m);
    }
  }

  private buildMediaConfirmReply(opts: {
    kind: 'image' | 'video';
    prompt: string;
    understanding: string;
  }): string {
    const label = opts.kind === 'video' ? '视频' : '图片';
    const prompt = String(opts.prompt || '').trim();
    const understanding = String(opts.understanding || '').trim();
    const promptBlock =
      prompt.length > 1200 ? `${prompt.slice(0, 1200)}…` : prompt;
    return [
      `已准备好生成**${label}**，但我不会自动开跑——需要你确认后才会执行。`,
      understanding ? `\n**理解：** ${understanding}` : '',
      '\n**将使用的提示词：**',
      '```',
      promptBlock || '（将基于上文提示词）',
      '```',
      '\n请回复 **确认执行** 开始生成；若要改提示词或参数，直接说修改内容即可。回复 **取消** 可放弃本次生成。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * 意图探测用文案：技能指令只看【用户补充】，不扫技能全文/技能名。
   * 仅点选技能、未写补充 → 空串（按 chat，先出文字方案）。
   */
  private intentProbeText(message: string): string {
    const text = String(message || '');
    const skill = this.detectSkillDirective(text);
    if (!skill) return text.trim();
    const userPart = text.match(/【用户补充】\s*([\s\S]*)$/);
    if (userPart) return String(userPart[1] || '').trim();
    // 「执行以下指引」且无用户补充：整段是技能 body，不当作「立刻出片」指令
    if (/执行以下指引|【技能指引】/.test(text)) return '';
    return '';
  }

  /** 用户本轮是否明确要求立刻出图/出视频（含短指令跟进） */
  private looksLikeExplicitMediaRequest(text: string): boolean {
    const t = this.intentProbeText(text);
    if (!t) return false;
    if (this.looksLikePromptWritingRequest(t)) return false;
    if (this.heuristicIntent(t) !== 'chat') return true;
    if (
      /再来一张|再出一张|再画|再生成|重新生成|直接出|按上面|就这个|出一张|帮我出|做成图|做成视频|图生视频|按这个出|按提示词出|开始生成视频|开始出图|现在生成视频|现在出图|立刻生成|马上出图|马上生成视频/.test(
        t,
      )
    ) {
      return true;
    }
    // 「生成一下」过宽，仅当没有「提示词/文案」语境时才算
    if (/生成一下|开始生成|现在生成|马上生成/.test(t) && !/提示词|文案|脚本|prompt/i.test(t)) {
      return true;
    }
    if (
      /\b(generate|draw|paint|create|make)\b[\s\S]{0,40}\b(image|picture|photo|video|animation|clip)\b/i.test(
        t,
      ) &&
      !/\b(prompt|script)\b/i.test(t)
    ) {
      return true;
    }
    if (
      /\b(image|picture|photo|video|animation|clip)\b[\s\S]{0,40}\b(generate|create|make|draw)\b/i.test(
        t,
      ) &&
      !/\b(prompt|script)\b/i.test(t)
    ) {
      return true;
    }
    return false;
  }

  /** 是否为「请按技能执行」类指令 */
  private detectSkillDirective(text: string): { name: string; hasGuide: boolean } | null {
    const t = String(text || '');
    const m = t.match(/请按技能[「『"']([^」』"']+)[」』"']/);
    if (!m) return null;
    return {
      name: String(m[1] || '').trim(),
      hasGuide: /【技能指引】|执行以下指引/.test(t),
    };
  }

  /** 会话历史：chat 原文；已完成的图/视频写成摘要，避免路由「看不见出图结果」而反复出图 */
  private toAgentHistory(
    rows: Array<{
      role: string;
      kind: string;
      content: string;
      status?: string;
    }>,
  ): Array<{ role: string; content: string }> {
    const out: Array<{ role: string; content: string }> = [];
    for (const m of rows) {
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      if (m.kind === 'image' || m.kind === 'video') {
        if (m.role !== 'assistant') continue;
        const label = m.kind === 'video' ? '视频' : '图片';
        const prompt = String(m.content || '').trim().slice(0, 500);
        const status =
          m.status === 'error'
            ? `失败`
            : m.status === 'done' || !m.status
              ? '完成'
              : '进行中';
        out.push({
          role: 'assistant',
          content: [
            `[系统已${status}${label}生成]`,
            prompt ? `提示词：${prompt}` : '',
            `说明：本轮已处理${label}生成；除非用户明确再要求出${label}，否则下一轮应回复文字（chat），不要重复出${label}。`,
          ]
            .filter(Boolean)
            .join('\n'),
        });
        continue;
      }
      out.push({ role: m.role, content: m.content || '' });
    }
    return out;
  }

  /** 短指令 / 无可视化细节，不能直接当生图提示词 */
  private isThinPrompt(text: string): boolean {
    const t = String(text || '').trim();
    if (!t) return true;
    if (t.length <= 48 && /生成|出图|出视频|画一张|做[个张]|帮我|来一张|直接出/.test(t)) {
      return true;
    }
    if (t.length < 28) return true;
    // 缺少画面要素时也偏「薄」
    const hasVisual =
      /[，,、]|风格|光影|镜头|构图|立绘|角色|场景|cyber|portrait|cinematic|8k|lighting/i.test(
        t,
      );
    return t.length < 60 && !hasVisual;
  }

  private extractPromptCandidate(content: string): string {
    const raw = String(content || '').trim();
    if (!raw) return '';

    const fences = [...raw.matchAll(/```(?:[\w-]*)?\s*\n?([\s\S]*?)```/g)]
      .map((m) => String(m[1] || '').trim())
      .filter((s) => s.length >= 24 && !/^[\{\[]/.test(s));
    if (fences.length) {
      fences.sort((a, b) => b.length - a.length);
      return fences[0];
    }

    // Midjourney / 英文提示词段落
    const enBlocks = [
      ...raw.matchAll(
        /(?:Midjourney|英文|English|Prompt)[^\n]*\n+([\s\S]{40,}?)(?=\n#{1,3}\s|\n[一二三四五六七八九十]+[、．.]|\n---|\n\*\*|$)/gi,
      ),
    ]
      .map((m) => String(m[1] || '').trim())
      .filter(Boolean);
    if (enBlocks.length) {
      enBlocks.sort((a, b) => b.length - a.length);
      const best = enBlocks[0].replace(/\n+/g, ' ').trim();
      if (best.length >= 40) return best;
    }

    // 中文提示词段落
    const zhBlocks = [
      ...raw.matchAll(
        /(?:中文(?:通用版)?|提示词|生图)[^\n]*\n+([\s\S]{40,}?)(?=\n#{1,3}\s|\n[一二三四五六七八九十]+[、．.]|\n---|\n\*\*|Midjourney|英文|$)/gi,
      ),
    ]
      .map((m) => String(m[1] || '').trim())
      .filter(Boolean);
    if (zhBlocks.length) {
      zhBlocks.sort((a, b) => b.length - a.length);
      const best = zhBlocks[0].replace(/\n+/g, ' ').trim();
      if (best.length >= 40) return best;
    }

    // 逗号密集的英文 prompt 行
    const lines = raw
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length >= 50 && (l.match(/,/g) || []).length >= 3);
    if (lines.length) {
      lines.sort((a, b) => b.length - a.length);
      return lines[0];
    }

    return '';
  }

  /** 从最近对话里抠可用提示词（代码块 / 中英文 prompt） */
  private extractContextPrompt(
    history: Array<{ role: string; content: string }>,
    message: string,
  ): string {
    const fromUser = this.extractPromptCandidate(message);
    if (fromUser && !this.isThinPrompt(fromUser)) return fromUser;

    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (!m?.content) continue;
      // 优先助手刚写好的提示词
      if (m.role === 'assistant' || m.role === 'user') {
        const hit = this.extractPromptCandidate(m.content);
        if (hit && !this.isThinPrompt(hit)) return hit;
      }
    }
    return '';
  }

  private compressHistoryForRouter(
    history: Array<{ role: string; content: string }>,
  ): Array<{ role: string; content: string }> {
    const recent = history.slice(-12);
    return recent.map((m, idx) => {
      const tail = idx >= recent.length - 3;
      const max = tail ? 9000 : 1600;
      const c = String(m.content || '');
      if (c.length <= max) return { role: m.role, content: c };
      // 保留末尾（提示词通常在后半段）
      return { role: m.role, content: `…${c.slice(-(max - 1))}` };
    });
  }

  private parseAgentIntentJson(raw: string): {
    intent: 'chat' | 'image' | 'video';
    prompt: string;
    understanding: string;
  } | null {
    const text = String(raw || '').trim();
    if (!text) return null;
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence?.[1]?.trim() || text;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    const jsonText = start >= 0 && end > start ? body.slice(start, end + 1) : body;
    try {
      const data = JSON.parse(jsonText);
      const intentRaw = String(data?.intent || '').trim().toLowerCase();
      const intent =
        intentRaw === 'image' || intentRaw === 'video' || intentRaw === 'chat'
          ? intentRaw
          : null;
      if (!intent) return null;
      return {
        intent,
        prompt: String(data?.prompt || '').trim(),
        understanding: String(data?.understanding || data?.reply || '').trim(),
      };
    } catch {
      return null;
    }
  }

  private fallbackUnderstanding(
    intent: 'chat' | 'image' | 'video',
    promptOrMessage: string,
  ): string {
    const raw = String(promptOrMessage || '').trim().replace(/\s+/g, ' ');
    const brief = raw.length > 96 ? `${raw.slice(0, 96)}…` : raw;
    const skill = this.detectSkillDirective(raw);
    if (skill?.name) {
      if (intent === 'video') {
        return `你想按技能「${skill.name}」产出视频；对齐指引后我会请你确认，再提交生成。`;
      }
      if (intent === 'image') {
        return `你想按技能「${skill.name}」产出图片；对齐指引后我会请你确认，再提交出图。`;
      }
      return `你想使用技能「${skill.name}」推进创作；我会先按技能指引理解目标，再给出可执行方案或提示词。`;
    }
    if (intent === 'video') {
      return `我理解你想按上文设定生成一段视频（「${brief}」）。镜头与画面要求已对齐，确认后我会提交生成。`;
    }
    if (intent === 'image') {
      return `我理解你想按上文设定生成一张图片（「${brief}」）。风格与主体要求已对齐，确认后我会出图。`;
    }
    if (!brief) return '我先理解你的创作目标，再给出可执行建议。';
    return `我理解你本轮想：${brief}。先对齐意图与约束，再继续。`;
  }

  private finalizeMediaRoute(
    intent: 'chat' | 'image' | 'video',
    promptRaw: string,
    understandingRaw: string,
    history: Array<{ role: string; content: string }>,
    message: string,
  ): { intent: 'chat' | 'image' | 'video'; prompt: string; understanding: string } {
    const understanding =
      String(understandingRaw || '').trim() ||
      this.fallbackUnderstanding(intent, message);
    if (intent === 'chat') {
      return { intent: 'chat', prompt: '', understanding };
    }
    const ctx = this.extractContextPrompt(history, message);
    let prompt = String(promptRaw || '').trim();
    if (!prompt || this.isThinPrompt(prompt)) {
      prompt = ctx || prompt || message;
    }
    // 用户短指令 + 模型仍吐短指令时，强制用上下文提示词
    if (this.isThinPrompt(message) && ctx) {
      prompt = ctx;
    }
    if (this.isThinPrompt(prompt) && ctx) {
      prompt = ctx;
    }
    return {
      intent,
      prompt,
      understanding:
        String(understandingRaw || '').trim() ||
        this.fallbackUnderstanding(intent, prompt || message),
    };
  }

  /** Agent：判断本轮是闲聊写提示词，还是直接出图/出视频 */
  private async resolveAgentIntent(opts: {
    history: Array<{ role: string; content: string }>;
    message: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<{
    intent: 'chat' | 'image' | 'video';
    prompt: string;
    understanding: string;
  }> {
    const text = String(opts.message || '').trim();
    const probe = this.intentProbeText(text);
    const fallback = this.heuristicIntent(probe);
    const skill = this.detectSkillDirective(text);
    const hasRefs = /【本轮引用】|参考图|reference/i.test(text);
    const system = [
      '你是 AIGC 视频工厂 生成页的意图理解与路由器。先准确理解用户本轮目标，再决定行动。',
      '根据用户最新消息与对话上下文，判断本轮最想要：',
      '- chat：问答、写/改提示词、方案讨论、按技能给文字方案、只要文字（本轮不要直接出图/出视频）',
      '- image：现在就要生成图片（明确要出图/画一张/封面/海报/立绘/帮我生成图片 等）',
      '- video：现在就要生成视频（明确要出视频/短片/动画/运镜成片 等）',
      '只输出合法 JSON，不要 Markdown：',
      '{"intent":"chat|image|video","prompt":"image/video 时给出可直接提交的完整提示词；chat 时为空","understanding":"1～3 句中文，复述你理解的用户本轮目标与关键约束（chat/image/video 都必须填写）"}',
      '规则：',
      '1) 用户只要提示词、优化文案、讨论创意、闲聊、评价刚才结果 → chat；understanding 需说明其真正想达成什么',
      '1b) 【硬规则】用户说「视频提示词 / 图片提示词 / 写提示词 / 优化提示词 / 给我文案脚本」→ 必须 chat，只交付文字；禁止 image/video',
      '1c) 【硬规则】出图/出视频必须先经用户确认：若助手刚发出「请回复确认执行」的待确认消息，且用户本轮回复确认执行/确认/开始生成 → image/video；若用户还在改提示词或未确认 → chat',
      '2) 用户明确要求立刻生成图片/视频（出片、生成视频、出一张图）→ image/video（系统仍会先向用户确认，再真正入队）',
      '3) 不确定 → chat，并在 understanding 里写清你理解到的模糊点',
      '4) 【关键】上下文若出现「系统已完成图片/视频生成」，说明已经出过图/视频：后续默认 chat；只有用户再次明确说「再来一张/重新生成/按上面出图」等才 image/video',
      '5) 【关键】用户说「帮我生成图片/按上面的出图/就这个生成」等短指令时：必须从最近助手消息里的提示词、代码块、中文通用版、Midjourney 英文版提取完整 prompt；禁止把短指令本身当作 prompt',
      '6) prompt 要具体有画面；优先复用上下文已写好的完整提示词，不要擅自换成无关场景',
      '7) understanding 必须像「我听懂了」：概括主体、风格、用途或技能目标；不要复述短指令原文，不要空着',
      '8) 【本轮引用】里的图片/视频是参考素材 URL，出图/出视频时应作为参考，不要把 URL 当成画面描述原文',
      '9) 禁止因为「上轮出过图」或历史里有长提示词，就在本轮没有明确生成指令时自动选 image/video',
      '10) 用户消息含「请按技能「…」执行」时：默认先 chat，按技能交付文字方案/分镜/提示词；只有用户补充或技能指引明确写「立刻出图/立刻出视频/现在生成」等才 image/video。禁止仅因技能名含「短视频/导演」就直出视频',
      '11) 仅有长画面描写、未要求「生成/出图/出视频」→ chat（帮他整理或优化提示词），understanding 写明「先整理提示词，暂不直接生成」',
      '12) 有参考图且用户说「按这张改/基于此图/保持主体」并要求出图 → image；只说「怎么改提示词」→ chat',
      skill?.name
        ? `13) 本轮检测到技能「${skill.name}」${skill.hasGuide ? '（已附技能指引）' : ''}；${probe ? '用户另有补充，结合补充判断是否立刻生成' : '用户未写补充，intent 必须为 chat'}，understanding 必须点名该技能目标`
        : '',
      hasRefs ? '14) 本轮含引用/参考素材，understanding 要提到「将结合参考素材」' : '',
    ]
      .filter(Boolean)
      .join('\n');

    const recent = this.compressHistoryForRouter(opts.history);
    const clampIntent = (intent: 'chat' | 'image' | 'video') => {
      if (this.looksLikePromptWritingRequest(probe) || this.looksLikePromptWritingRequest(text)) {
        return 'chat' as const;
      }
      if (
        (intent === 'image' || intent === 'video') &&
        !this.looksLikeExplicitMediaRequest(text)
      ) {
        // 技能指令若本身写着出图/出视频，heuristic 已能识别；否则保守回 chat
        return 'chat' as const;
      }
      return intent;
    };
    try {
      const raw = await this.ai.chat(
        [
          { role: 'system', content: system },
          ...recent,
          {
            role: 'user',
            content: [
              text,
              '',
              '先写 understanding（你理解的用户本轮目标），再决定 intent。',
              '若本轮要出图/出视频，请务必基于上文已给出的提示词填写 prompt，不要只用我这句短指令。',
              '若用户只是改提示词、提问、按技能要文字方案或闲聊，intent 必须为 chat。',
            ].join('\n'),
          },
        ],
        opts.model,
        {
          temperature: 0.1,
          maxTokens: 1800,
          signal: opts.signal,
          timeoutMs: 25000,
        },
      );
      const parsed = this.parseAgentIntentJson(raw);
      if (!parsed) {
        return this.finalizeMediaRoute(
          clampIntent(fallback),
          fallback === 'chat' ? '' : text,
          '',
          opts.history,
          text,
        );
      }
      return this.finalizeMediaRoute(
        clampIntent(parsed.intent || fallback),
        parsed.prompt,
        parsed.understanding,
        opts.history,
        text,
      );
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') throw e;
      this.log.warn(`resolveAgentIntent failed: ${e?.message || e}`);
      return this.finalizeMediaRoute(
        clampIntent(fallback),
        fallback === 'chat' ? '' : text,
        '',
        opts.history,
        text,
      );
    }
  }

  private normalizeQuotes(
    raw?: Array<{
      id?: string;
      kind?: string;
      url?: string;
      label?: string;
      sourceMessageId?: string;
    }>,
  ): Array<{
    id: string;
    kind: 'image' | 'video';
    url: string;
    label?: string;
    sourceMessageId?: string;
  }> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{
      id: string;
      kind: 'image' | 'video';
      url: string;
      label?: string;
      sourceMessageId?: string;
    }> = [];
    for (let i = 0; i < raw.length && out.length < 8; i++) {
      const item = raw[i];
      if (!item || typeof item !== 'object') continue;
      const kindRaw = String(item.kind || '').trim();
      if (kindRaw !== 'image' && kindRaw !== 'video') continue;
      const url = String(item.url || '').trim();
      if (!url) continue;
      out.push({
        id: String(item.id || `q_${i}`),
        kind: kindRaw,
        url,
        label: item.label != null ? String(item.label) : undefined,
        sourceMessageId:
          item.sourceMessageId != null ? String(item.sourceMessageId) : undefined,
      });
    }
    return out;
  }

  private formatQuotesBlock(
    quotes: Array<{ kind: string; url?: string; label?: string }>,
  ): string {
    if (!quotes.length) return '';
    const lines = ['【本轮引用】'];
    quotes.forEach((q, i) => {
      const n = i + 1;
      if (q.kind === 'image') {
        lines.push(`${n}. [图片${q.label ? ` · ${q.label}` : ''}] ${q.url}`);
      } else {
        lines.push(`${n}. [视频${q.label ? ` · ${q.label}` : ''}] ${q.url}`);
      }
    });
    return lines.join('\n');
  }

  /** 将 content 中的 <think>/<thinking> 拆到思考通道 */
  private createContentThinkSplitter() {
    let mode: 'detect' | 'think' | 'answer' = 'detect';
    let hold = '';
    const incompleteOpen = (s: string) =>
      /^\s*<\s*[\/]?[a-z]*$/i.test(s) || /^\s*<\s*(think|thinking)\s*$/i.test(s);
    return {
      push(piece: string): { think: string; answer: string } {
        hold += piece;
        let think = '';
        let answer = '';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (mode === 'detect') {
            const m = hold.match(/^\s*<\s*(think|thinking)\s*>/i);
            if (m) {
              mode = 'think';
              hold = hold.slice(m[0].length);
              continue;
            }
            if (incompleteOpen(hold)) return { think, answer };
            mode = 'answer';
            continue;
          }
          if (mode === 'think') {
            const m = hold.match(/<\s*\/\s*(think|thinking)\s*>/i);
            if (!m || m.index == null) {
              if (hold.length > 32) {
                think += hold.slice(0, -32);
                hold = hold.slice(-32);
              }
              return { think, answer };
            }
            think += hold.slice(0, m.index);
            hold = hold.slice(m.index + m[0].length);
            mode = 'answer';
            continue;
          }
          answer += hold;
          hold = '';
          return { think, answer };
        }
      },
      flush(): { think: string; answer: string } {
        if (mode === 'think') {
          const t = hold;
          hold = '';
          return { think: t, answer: '' };
        }
        const a = hold;
        hold = '';
        return { think: '', answer: a };
      },
    };
  }

  private formatThinkRefs(imageCount: number, videoCount: number, quoteCount: number): string {
    const parts: string[] = [];
    if (imageCount) parts.push(`${imageCount} 张图片`);
    if (videoCount) parts.push(`${videoCount} 个视频`);
    if (quoteCount && !imageCount && !videoCount) parts.push(`${quoteCount} 条引用`);
    if (!parts.length) return '未附带参考素材，将主要依据对话内容作答。';
    return `本轮参考：${parts.join('、')}。`;
  }

  /** Agent 确认后真正入队出图/出视频 */
  private async enqueueAgentMedia(opts: {
    kind: 'image' | 'video';
    userId: number;
    sessionId: string;
    userMsg: GenerateMessage;
    touchText: string;
    prompt: string;
    understanding: string;
    thinking: string;
    prefs: Record<string, unknown>;
    refs: string[];
    videoRefs: string[];
    signal?: AbortSignal;
  }): Promise<{
    intent: 'image' | 'video';
    text: string;
    userMessage: GenerateMessageDto;
    assistantMessage: GenerateMessageDto;
  }> {
    const prefs = opts.prefs;
    const refs = opts.refs;
    const videoRefs = opts.videoRefs;
    const prompt = opts.prompt;
    const understanding = opts.understanding;

    if (opts.kind === 'image') {
      const imageModel =
        String(prefs.imageModel || '').trim() ||
        (String(prefs.mediaKind || '') === 'image' ? String(prefs.model || '').trim() : '');
      const aspect =
        String(prefs.imageAspectRatio || prefs.aspectRatio || '1:1').trim() || '1:1';
      try {
        const result = await this.generateImage({
          userId: opts.userId,
          sessionId: opts.sessionId,
          prompt,
          model: imageModel || undefined,
          size: String(prefs.imageSize || prefs.size || '') || undefined,
          aspectRatio: aspect,
          count: Number(prefs.count) || 1,
          referenceImages: refs.length ? refs : undefined,
          prefs: {
            ...prefs,
            model: imageModel,
            aspectRatio: aspect,
            referenceImages: refs,
            agentRouted: true,
            agentConfirmed: true,
            understanding,
            thinking: opts.thinking.trim(),
          },
          signal: opts.signal,
          skipUserMessage: true,
        });
        await this.touchSession(opts.sessionId, opts.touchText);
        return {
          intent: 'image',
          text: '',
          userMessage: this.toMessageDto(opts.userMsg),
          assistantMessage: result.assistantMessage,
        };
      } catch (e: any) {
        if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') throw e;
        const failed = await this.messages.findOne({
          where: { sessionId: opts.sessionId, role: 'assistant', kind: 'image' },
          order: { createdAt: 'DESC' },
        });
        if (failed) {
          this.mergeMessagePrefs(failed, { thinking: opts.thinking.trim() });
          await this.messages.save(failed);
          return {
            intent: 'image',
            text: '',
            userMessage: this.toMessageDto(opts.userMsg),
            assistantMessage: this.toMessageDto(failed),
          };
        }
        throw e;
      }
    }

    const videoModel =
      String(prefs.videoModel || '').trim() ||
      (String(prefs.mediaKind || '') === 'video' ? String(prefs.model || '').trim() : '');
    const aspect =
      String(prefs.videoAspectRatio || prefs.aspectRatio || '16:9').trim() || '16:9';
    const omni = String(prefs.refMode || '') === 'omni' && refs.length > 0;
    const frames = String(prefs.refMode || '') === 'frames';
    try {
      const result = await this.generateVideo({
        userId: opts.userId,
        sessionId: opts.sessionId,
        prompt,
        model: videoModel || undefined,
        aspectRatio: aspect,
        durationSec: Number(prefs.durationSec) || 10,
        resolution: String(prefs.quality || prefs.resolution || '') || undefined,
        omniRef: omni,
        imageUrl: !omni && frames ? refs[0] : undefined,
        endImageUrl: !omni && frames ? refs[1] : undefined,
        referenceImageUrls: omni ? refs : !frames ? refs : undefined,
        referenceVideoUrls: videoRefs.length ? videoRefs : undefined,
        prefs: {
          ...prefs,
          model: videoModel,
          aspectRatio: aspect,
          referenceImageUrls: refs,
          referenceVideoUrls: videoRefs,
          agentRouted: true,
          agentConfirmed: true,
          understanding,
          thinking: opts.thinking.trim(),
        },
        signal: opts.signal,
        skipUserMessage: true,
      });
      await this.touchSession(opts.sessionId, opts.touchText);
      return {
        intent: 'video',
        text: '',
        userMessage: this.toMessageDto(opts.userMsg),
        assistantMessage: result.assistantMessage,
      };
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') throw e;
      const failed = await this.messages.findOne({
        where: { sessionId: opts.sessionId, role: 'assistant', kind: 'video' },
        order: { createdAt: 'DESC' },
      });
      if (failed) {
        this.mergeMessagePrefs(failed, { thinking: opts.thinking.trim() });
        await this.messages.save(failed);
        return {
          intent: 'video',
          text: '',
          userMessage: this.toMessageDto(opts.userMsg),
          assistantMessage: this.toMessageDto(failed),
        };
      }
      throw e;
    }
  }

  async streamChat(opts: {
    userId: number;
    sessionId: string;
    message: string;
    model?: string;
    /** 出图/出视频时沿用底栏偏好 */
    prefs?: Record<string, unknown>;
    referenceImages?: string[];
    referenceVideoUrls?: string[];
    quotes?: Array<{
      id?: string;
      kind?: string;
      url?: string;
      label?: string;
      sourceMessageId?: string;
    }>;
    signal?: AbortSignal;
    onDelta: (delta: string) => void | Promise<void>;
    /** 思考过程增量（规划步骤 / 模型 reasoning） */
    onThink?: (delta: string) => void | Promise<void>;
    onRoute?: (route: {
      intent: 'chat' | 'image' | 'video';
      prompt: string;
      understanding: string;
    }) => void | Promise<void>;
  }): Promise<{
    intent: 'chat' | 'image' | 'video';
    text: string;
    userMessage: GenerateMessageDto;
    assistantMessage: GenerateMessageDto;
  }> {
    const session = await this.getOwnedSession(opts.sessionId, opts.userId);
    const quotes = this.normalizeQuotes(opts.quotes);
    const textRaw = String(opts.message || '').trim();
    const text = textRaw || (quotes.length ? '请基于引用内容继续' : '');
    if (!text) throw new BadRequestException('消息不能为空');
    const quoteBlock = this.formatQuotesBlock(quotes);
    const modelUserText = quoteBlock ? `${text}\n\n${quoteBlock}` : text;

    const historyRows = await this.messages.find({
      where: { sessionId: session.id },
      order: { createdAt: 'ASC' },
    });
    const history = this.toAgentHistory(historyRows);

    const prefs: Record<string, unknown> = {
      ...(opts.prefs || {}),
      quotes,
    };

    const userMsg = await this.addMessage({
      sessionId: session.id,
      role: 'user',
      kind: 'chat',
      content: text,
      status: 'done',
      prefs,
    });

    let thinking = '';
    const emitThink = async (piece: string) => {
      const t = String(piece || '');
      if (!t) return;
      thinking += t;
      await opts.onThink?.(t);
    };

    await emitThink('正在理解你的需求…\n');

    const quoteImages = quotes
      .filter((q) => q.kind === 'image')
      .map((q) => String(q.url || '').trim())
      .filter(Boolean);
    const quoteVideos = quotes
      .filter((q) => q.kind === 'video')
      .map((q) => String(q.url || '').trim())
      .filter(Boolean);
    const refs = [...(opts.referenceImages || []), ...quoteImages]
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .slice(0, 6);
    const videoRefs = [...(opts.referenceVideoUrls || []), ...quoteVideos]
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .slice(0, 4);

    await emitThink(
      `${this.formatThinkRefs(refs.length, videoRefs.length, quotes.length)}\n`,
    );

    const probe = this.intentProbeText(modelUserText);
    const pending = this.findPendingMedia(historyRows);

    // 取消待确认任务
    if (pending && this.looksLikeMediaCancel(probe)) {
      await this.markPendingMediaStatus(pending.sourceMessageId, 'cancelled');
      const cancelText = `已取消本次${pending.kind === 'video' ? '视频' : '图片'}生成确认。需要时再说一声即可。`;
      await emitThink('用户取消了待确认的生成。\n');
      await opts.onRoute?.({
        intent: 'chat',
        prompt: '',
        understanding: `用户取消了待确认的${pending.kind === 'video' ? '视频' : '图片'}生成`,
      });
      const assistant = await this.addMessage({
        sessionId: session.id,
        role: 'assistant',
        kind: 'chat',
        content: cancelText,
        status: 'done',
        prefs: {
          thinking: thinking.trim(),
          understanding: `用户取消了待确认的${pending.kind === 'video' ? '视频' : '图片'}生成`,
          model: String(opts.model || '').trim(),
        },
      });
      await opts.onDelta(cancelText);
      await this.touchSession(session.id, text);
      return {
        intent: 'chat',
        text: cancelText,
        userMessage: this.toMessageDto(userMsg),
        assistantMessage: this.toMessageDto(assistant),
      };
    }

    // 用户确认执行 → 真正入队
    if (pending && this.looksLikeMediaConfirm(probe)) {
      await this.markPendingMediaStatus(pending.sourceMessageId, 'consumed');
      const revised = this.extractPromptCandidate(probe);
      const prompt =
        revised && !this.isThinPrompt(revised) ? revised : pending.prompt;
      const understanding =
        pending.understanding ||
        `按你的确认开始生成${pending.kind === 'video' ? '视频' : '图片'}`;
      await emitThink(
        `已确认，开始${pending.kind === 'video' ? '出视频' : '出图'}…\n`,
      );
      await opts.onRoute?.({
        intent: pending.kind,
        prompt,
        understanding,
      });
      const mergedRefs = [...pending.referenceImages, ...refs]
        .filter(Boolean)
        .filter((u, i, arr) => arr.indexOf(u) === i)
        .slice(0, 6);
      const mergedVideoRefs = [...pending.referenceVideoUrls, ...videoRefs]
        .filter(Boolean)
        .filter((u, i, arr) => arr.indexOf(u) === i)
        .slice(0, 4);
      return this.enqueueAgentMedia({
        kind: pending.kind,
        userId: opts.userId,
        sessionId: session.id,
        userMsg,
        touchText: text,
        prompt,
        understanding,
        thinking,
        prefs: { ...pending.prefs, ...prefs },
        refs: mergedRefs,
        videoRefs: mergedVideoRefs,
        signal: opts.signal,
      });
    }

    // 引用里的文本也当作上下文提示词候选
    const historyForRoute = quoteBlock
      ? [...history, { role: 'user', content: quoteBlock }]
      : history;

    const route = await this.resolveAgentIntent({
      history: historyForRoute,
      message: modelUserText,
      model: opts.model,
      signal: opts.signal,
    });

    if (route.understanding) {
      await emitThink(`理解：${route.understanding}\n`);
    }

    // 出图/出视频：先回复确认，不直接入队（前端 route 必须是 chat，避免误切媒体卡）
    if (route.intent === 'image' || route.intent === 'video') {
      await this.cancelOpenPendingMedia(historyRows);
      const kind = route.intent;
      const label = kind === 'video' ? '视频' : '图片';
      const prompt = route.prompt || text;
      await emitThink(`识别为出${label}意图，需你确认后才会生成。\n`);
      await opts.onRoute?.({
        intent: 'chat',
        prompt: '',
        understanding: route.understanding || '',
      });
      const confirmText = this.buildMediaConfirmReply({
        kind,
        prompt,
        understanding: route.understanding || '',
      });
      const assistant = await this.addMessage({
        sessionId: session.id,
        role: 'assistant',
        kind: 'chat',
        content: confirmText,
        status: 'done',
        prefs: {
          thinking: thinking.trim(),
          understanding: route.understanding || '',
          model: String(opts.model || '').trim(),
          pendingMedia: {
            kind,
            prompt,
            understanding: route.understanding || '',
            referenceImages: refs,
            referenceVideoUrls: videoRefs,
            prefs: {
              ...prefs,
              imageModel: prefs.imageModel,
              videoModel: prefs.videoModel,
              imageAspectRatio: prefs.imageAspectRatio,
              videoAspectRatio: prefs.videoAspectRatio,
              imageSize: prefs.imageSize,
              count: prefs.count,
              durationSec: prefs.durationSec,
              quality: prefs.quality,
              resolution: prefs.resolution,
              refMode: prefs.refMode,
              mediaKind: prefs.mediaKind,
              model: prefs.model,
            },
          },
        },
      });
      await opts.onDelta(confirmText);
      await this.touchSession(session.id, text);
      return {
        intent: 'chat',
        text: confirmText,
        userMessage: this.toMessageDto(userMsg),
        assistantMessage: this.toMessageDto(assistant),
      };
    }

    await opts.onRoute?.(route);

    await emitThink(
      route.understanding
        ? `识别为创作对话。\n按上述理解组织回答…\n`
        : '识别为创作对话，开始组织回答…\n',
    );

    const chatModel = String(opts.model || '').trim();
    const assistant = await this.addMessage({
      sessionId: session.id,
      role: 'assistant',
      kind: 'chat',
      content: '',
      status: 'streaming',
      prefs: {
        thinking: thinking.trim(),
        understanding: route.understanding || '',
        model: chatModel,
      },
    });

    const system = [
      '你是 AIGC 视频工厂 创作 Agent，帮助用户做创意、写/改提示词、拆解画面与镜头。',
      '回答前先在心里对齐用户意图；正文直接给可用结论，不要用「我理解你的意思是…」开场废话。',
      '用简洁有结构的中文回答，可用 Markdown。',
      '若用户只要文字方案或提示词，直接给可用内容；若选用了技能，严格按技能指引交付。',
      '用户消息中的【本轮引用】包含其选中的文本段落、图片或视频链接，回答时要优先结合这些引用。',
      '不要假装已经生成了图片或视频；系统在识别到出图/出视频意图时会先请用户确认，用户回复「确认执行」后才会真正入队生成。',
      '可以主动问清风格、比例、用途，但一次最多一个关键问题，不要连环逼问。',
      '若用户目标模糊，先给一版可用草案，再标注可选项。',
      '排版：对话正文区约 800～900px 宽。Markdown 表格优先用「类别 | 内容」这类少列表（2～3 列）写长文案；多列分镜表（≥5 列）时短字段放前、长描述放后，避免为塞内容硬拆过多窄列。',
      route.understanding
        ? `本轮系统已理解的用户意图：${route.understanding}。请围绕该理解作答，不要偏题。`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const chatMessages = [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: modelUserText },
    ];

    const splitter = this.createContentThinkSplitter();
    let usedNativeReasoning = false;

    try {
      const full = await this.ai.chatStream(chatMessages, {
        model: opts.model || undefined,
        maxTokens: 4096,
        signal: opts.signal,
        onReasoningDelta: async (delta) => {
          usedNativeReasoning = true;
          await emitThink(delta);
        },
        onDelta: async (delta) => {
          if (usedNativeReasoning) {
            assistant.content = `${assistant.content || ''}${delta}`;
            await opts.onDelta(delta);
            return;
          }
          const parts = splitter.push(delta);
          if (parts.think) await emitThink(parts.think);
          if (parts.answer) {
            assistant.content = `${assistant.content || ''}${parts.answer}`;
            await opts.onDelta(parts.answer);
          }
        },
      });
      if (!usedNativeReasoning) {
        const tail = splitter.flush();
        if (tail.think) await emitThink(tail.think);
        if (tail.answer) {
          assistant.content = `${assistant.content || ''}${tail.answer}`;
          await opts.onDelta(tail.answer);
        }
      } else if (!assistant.content && full) {
        assistant.content = String(full);
      }
      assistant.content = String(assistant.content || full || '');
      this.mergeMessagePrefs(assistant, { thinking: thinking.trim() });
      assistant.status = 'done';
      await this.messages.save(assistant);
      await this.touchSession(session.id, text);
      return {
        intent: 'chat',
        text: assistant.content,
        userMessage: this.toMessageDto(userMsg),
        assistantMessage: this.toMessageDto(assistant),
      };
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') {
        assistant.status = assistant.content ? 'done' : 'error';
        assistant.errorMessage = assistant.content ? '' : '已取消';
        this.mergeMessagePrefs(assistant, { thinking: thinking.trim() });
        await this.messages.save(assistant);
        await this.touchSession(session.id, text);
        throw e;
      }
      assistant.status = 'error';
      assistant.errorMessage = String(e?.message || '对话失败');
      this.mergeMessagePrefs(assistant, { thinking: thinking.trim() });
      await this.messages.save(assistant);
      throw e;
    }
  }

  /**
   * 创建 pending 消息并入队（立即返回，刷新后可恢复）。
   * 实际出图由 `runStudioImageJob` 在任务队列中执行。
   */
  async generateImage(opts: {
    userId: number;
    sessionId: string;
    prompt: string;
    model?: string;
    size?: string;
    aspectRatio?: string;
    count?: number;
    referenceImages?: string[];
    prefs?: Record<string, unknown>;
    signal?: AbortSignal;
    skipUserMessage?: boolean;
  }): Promise<{
    userMessage: GenerateMessageDto | null;
    assistantMessage: GenerateMessageDto;
  }> {
    const session = await this.getOwnedSession(opts.sessionId, opts.userId);
    const prompt = String(opts.prompt || '').trim();
    if (!prompt) throw new BadRequestException('提示词不能为空');
    const aspect = String(opts.aspectRatio || '16:9').trim() || '16:9';
    const prefs: Record<string, unknown> = {
      ...(opts.prefs || {}),
      model: opts.model || '',
      size: opts.size || '',
      aspectRatio: aspect,
      count: opts.count || 1,
      referenceImages: opts.referenceImages || [],
    };

    const userMsg = opts.skipUserMessage
      ? null
      : await this.addMessage({
          sessionId: session.id,
          role: 'user',
          kind: 'image',
          content: prompt,
          aspectRatio: aspect,
          prefs,
          status: 'done',
        });
    const assistant = await this.addMessage({
      sessionId: session.id,
      role: 'assistant',
      kind: 'image',
      content: prompt,
      aspectRatio: aspect,
      prefs,
      status: 'pending',
    });

    const job = await this.jobs.enqueue('studio_generate_image', '_studio', {
      messageId: assistant.id,
      sessionId: session.id,
      userId: opts.userId,
      prompt,
      model: opts.model || '',
      size: opts.size || '',
      aspectRatio: aspect,
      count: opts.count || 1,
      referenceImages: opts.referenceImages || [],
      label: `生图 · ${prompt.slice(0, 24)}`,
      source: 'generate',
      // agent 对话路由的生成不进顶栏任务队列，仅图片/视频模式直出才展示
      via: prefs.agentRouted || prefs.agentConfirmed ? 'agent' : 'direct',
    });
    // 任务可能已开跑并改写消息：重新加载再写 jobRunId，避免覆盖完成态
    const latest = await this.messages.findOne({ where: { id: assistant.id } });
    const row = latest || assistant;
    this.mergeMessagePrefs(row, { jobRunId: job.id });
    await this.messages.save(row);
    await this.touchSession(session.id, prompt);
    return {
      userMessage: userMsg ? this.toMessageDto(userMsg) : null,
      assistantMessage: this.toMessageDto(row),
    };
  }

  /** 任务队列执行：完成/失败写回 GenerateMessage */
  async runStudioImageJob(
    messageId: string,
    signal?: AbortSignal,
    jobRunId?: string,
  ): Promise<Record<string, unknown>> {
    const assistant = await this.messages.findOne({
      where: { id: String(messageId || '').trim() },
    });
    if (!assistant || assistant.kind !== 'image') {
      throw new Error('生图消息不存在');
    }
    if (assistant.status === 'done') {
      return { messageId: assistant.id, skipped: true };
    }
    if (assistant.status === 'error' && assistant.errorMessage === '已取消') {
      return { messageId: assistant.id, skipped: true, cancelled: true };
    }

    const prefs = this.parsePrefs(assistant.prefsJson);
    const prompt = String(assistant.content || '').trim();
    const refs = (
      (Array.isArray(prefs.referenceImages) ? prefs.referenceImages : []) as unknown[]
    )
      .map((u) => String(u || '').trim())
      .filter(Boolean)
      .slice(0, 6);
    const n = Math.min(4, Math.max(1, Number(prefs.count) || 1));
    const model = String(prefs.model || '').trim() || undefined;
    const size = String(prefs.size || '').trim() || undefined;

    try {
      if (signal?.aborted) {
        const err = new Error('已取消');
        err.name = 'AbortError';
        throw err;
      }
      const rows = await this.ai.generateImage(prompt, {
        model,
        size,
        n,
        signal,
        referenceImages: refs.length ? refs : undefined,
        referenceImage: refs[0] || undefined,
      });
      const mediaUrls: string[] = [];
      const mediaOssKeys: string[] = [];
      for (let i = 0; i < (rows?.length || 0); i++) {
        const row = rows![i];
        let raw = String(row?.url || '').trim();
        if (!raw && row?.b64_json) raw = `data:image/png;base64,${row.b64_json}`;
        if (!raw) continue;
        const put = await this.persistMedia(assistant.sessionId, raw, {
          fileName: n > 1 ? `image-${i + 1}.png` : 'image.png',
          contentType: 'image/png',
        });
        mediaUrls.push(put.url);
        mediaOssKeys.push(put.key);
      }
      if (!mediaUrls.length) throw new Error('生图未返回图片');

      const latest = await this.messages.findOne({ where: { id: assistant.id } });
      if (latest?.status === 'error' && latest.errorMessage === '已取消') {
        return { messageId: assistant.id, cancelled: true };
      }

      assistant.mediaUrl = mediaUrls[0];
      assistant.mediaOssKey = mediaOssKeys[0] || '';
      const freshPrefs = this.parsePrefs(
        (await this.messages.findOne({ where: { id: assistant.id } }))?.prefsJson ||
          assistant.prefsJson,
      );
      assistant.prefsJson = JSON.stringify({
        ...freshPrefs,
        ...(jobRunId ? { jobRunId } : {}),
        count: mediaUrls.length || n,
        requestedCount: n,
        mediaUrls,
        mediaOssKeys,
      });
      assistant.status = 'done';
      assistant.errorMessage = '';
      await this.messages.save(assistant);
      await this.touchSession(assistant.sessionId, prompt);
      return { messageId: assistant.id, mediaUrls };
    } catch (e: any) {
      const aborted = e?.name === 'AbortError' || e?.code === 'ERR_CANCELED';
      const latest = await this.messages.findOne({ where: { id: assistant.id } });
      if (latest) {
        latest.status = 'error';
        latest.errorMessage = aborted ? '已取消' : String(e?.message || '生图失败');
        if (jobRunId) this.mergeMessagePrefs(latest, { jobRunId });
        await this.messages.save(latest);
        await this.touchSession(latest.sessionId, prompt);
      }
      throw e;
    }
  }

  async generateVideo(opts: {
    userId: number;
    sessionId: string;
    prompt: string;
    model?: string;
    aspectRatio?: string;
    durationSec?: number;
    imageUrl?: string;
    endImageUrl?: string;
    referenceImageUrls?: string[];
    referenceVideoUrls?: string[];
    omniRef?: boolean;
    resolution?: string;
    prefs?: Record<string, unknown>;
    signal?: AbortSignal;
    skipUserMessage?: boolean;
  }): Promise<{
    userMessage: GenerateMessageDto | null;
    assistantMessage: GenerateMessageDto;
  }> {
    const session = await this.getOwnedSession(opts.sessionId, opts.userId);
    const prompt = String(opts.prompt || '').trim();
    if (!prompt) throw new BadRequestException('提示词不能为空');
    const aspect = String(opts.aspectRatio || '16:9').trim() || '16:9';
    const prefs: Record<string, unknown> = {
      ...(opts.prefs || {}),
      model: opts.model || '',
      aspectRatio: aspect,
      durationSec: opts.durationSec || 5,
      omniRef: !!opts.omniRef,
      resolution: opts.resolution || '',
      imageUrl: opts.imageUrl || '',
      endImageUrl: opts.endImageUrl || '',
      referenceImageUrls: opts.referenceImageUrls || [],
      referenceVideoUrls: opts.referenceVideoUrls || [],
    };

    const userMsg = opts.skipUserMessage
      ? null
      : await this.addMessage({
          sessionId: session.id,
          role: 'user',
          kind: 'video',
          content: prompt,
          aspectRatio: aspect,
          prefs,
          status: 'done',
        });
    const assistant = await this.addMessage({
      sessionId: session.id,
      role: 'assistant',
      kind: 'video',
      content: prompt,
      aspectRatio: aspect,
      prefs,
      status: 'pending',
    });

    const job = await this.jobs.enqueue('studio_generate_video', '_studio', {
      messageId: assistant.id,
      sessionId: session.id,
      userId: opts.userId,
      prompt,
      model: opts.model || '',
      aspectRatio: aspect,
      durationSec: opts.durationSec || 5,
      imageUrl: opts.imageUrl || '',
      endImageUrl: opts.endImageUrl || '',
      referenceImageUrls: opts.referenceImageUrls || [],
      referenceVideoUrls: opts.referenceVideoUrls || [],
      omniRef: !!opts.omniRef,
      resolution: opts.resolution || '',
      label: `生视频 · ${prompt.slice(0, 24)}`,
      source: 'generate',
      via: prefs.agentRouted || prefs.agentConfirmed ? 'agent' : 'direct',
    });
    const latest = await this.messages.findOne({ where: { id: assistant.id } });
    const row = latest || assistant;
    this.mergeMessagePrefs(row, { jobRunId: job.id });
    await this.messages.save(row);
    await this.touchSession(session.id, prompt);
    return {
      userMessage: userMsg ? this.toMessageDto(userMsg) : null,
      assistantMessage: this.toMessageDto(row),
    };
  }

  async runStudioVideoJob(
    messageId: string,
    signal?: AbortSignal,
    jobRunId?: string,
  ): Promise<Record<string, unknown>> {
    const assistant = await this.messages.findOne({
      where: { id: String(messageId || '').trim() },
    });
    if (!assistant || assistant.kind !== 'video') {
      throw new Error('生视频消息不存在');
    }
    if (assistant.status === 'done') {
      return { messageId: assistant.id, skipped: true };
    }
    if (assistant.status === 'error' && assistant.errorMessage === '已取消') {
      return { messageId: assistant.id, skipped: true, cancelled: true };
    }

    const prefs = this.parsePrefs(assistant.prefsJson);
    const prompt = String(assistant.content || '').trim();

    try {
      if (signal?.aborted) {
        const err = new Error('已取消');
        err.name = 'AbortError';
        throw err;
      }
      const result = await this.ai.generateVideo(prompt, {
        model: String(prefs.model || '').trim() || undefined,
        imageUrl: String(prefs.imageUrl || '').trim() || undefined,
        endImageUrl: String(prefs.endImageUrl || '').trim() || undefined,
        referenceImageUrls: Array.isArray(prefs.referenceImageUrls)
          ? (prefs.referenceImageUrls as string[])
          : undefined,
        referenceVideoUrls: Array.isArray(prefs.referenceVideoUrls)
          ? (prefs.referenceVideoUrls as string[])
          : undefined,
        omniRef: !!prefs.omniRef,
        durationSec: Number(prefs.durationSec) || undefined,
        resolution: String(prefs.resolution || '').trim() || undefined,
        signal,
      });
      const raw = String(result?.url || '').trim();
      if (!raw) throw new Error('生视频未返回地址');
      const put = await this.persistMedia(assistant.sessionId, raw, {
        fileName: 'video.mp4',
        contentType: 'video/mp4',
      });

      const latest = await this.messages.findOne({ where: { id: assistant.id } });
      if (latest?.status === 'error' && latest.errorMessage === '已取消') {
        return { messageId: assistant.id, cancelled: true };
      }

      assistant.mediaUrl = put.url;
      assistant.mediaOssKey = put.key;
      assistant.status = 'done';
      assistant.errorMessage = '';
      if (jobRunId) this.mergeMessagePrefs(assistant, { jobRunId });
      await this.attachVideoPoster(assistant, assistant.sessionId);
      await this.messages.save(assistant);
      await this.touchSession(assistant.sessionId, prompt);
      return { messageId: assistant.id, mediaUrl: put.url };
    } catch (e: any) {
      const aborted = e?.name === 'AbortError' || e?.code === 'ERR_CANCELED';
      const latest = await this.messages.findOne({ where: { id: assistant.id } });
      if (latest) {
        latest.status = 'error';
        latest.errorMessage = aborted ? '已取消' : String(e?.message || '生视频失败');
        if (jobRunId) this.mergeMessagePrefs(latest, { jobRunId });
        await this.messages.save(latest);
        await this.touchSession(latest.sessionId, prompt);
      }
      throw e;
    }
  }

  /** 抽帧写入 prefs.posterUrl，供资产列表用 img 展示 */
  private async attachVideoPoster(row: GenerateMessage, sessionId: string) {
    const videoUrl = String(row.mediaUrl || '').trim();
    if (!videoUrl) return;
    const prefs = this.parsePrefs(row.prefsJson);
    if (String(prefs.posterUrl || '').trim()) {
      row.prefsJson = JSON.stringify(prefs);
      return;
    }
    try {
      const poster = await this.videoPoster.createPoster({
        videoUrl,
        projectId: `generate-${sessionId}`,
        nameHint: row.id.slice(0, 8),
      });
      if (!poster?.url) return;
      prefs.posterUrl = poster.url;
      prefs.posterOssKey = poster.key || '';
      row.prefsJson = JSON.stringify(prefs);
    } catch (e: any) {
      this.log.warn(`生成页视频封面失败: ${e?.message || e}`);
    }
  }
}
