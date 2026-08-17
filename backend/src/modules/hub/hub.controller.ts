import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { SkipFileOssSetup } from '../storage/file-oss-setup.guard';
import { HubService } from './hub.service';

class UpdateHubConfigDto {
  @IsOptional()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  preferDevHub?: boolean;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @IsOptional()
  syncIntervalMs?: number;

  @IsOptional()
  @IsString()
  instanceName?: string;
}

class SubmitCommunityPromptDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  authorName?: string;
}

class RecordResourceUseDto {
  @IsOptional()
  @IsString()
  kind?: string;
}

@Controller('hub')
export class HubController {
  constructor(private readonly hub: HubService) {}

  @Get('config')
  @UseGuards(JwtAuthGuard)
  getConfig() {
    return this.hub.getPublicConfig();
  }

  @Put('config')
  @UseGuards(JwtAuthGuard)
  updateConfig(@Body() body: UpdateHubConfigDto) {
    return this.hub.updateConfig(body);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status() {
    return this.hub.getStatus();
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  sync() {
    return this.hub.syncAll('manual');
  }

  @Post('register')
  @UseGuards(JwtAuthGuard)
  register() {
    return this.hub.registerInstance();
  }

  /**
   * 投稿提示词到 Hub 社区（代理 /api/v1/resources/submit）
   * 审核通过或自动通过后会出现在提示词广场
   */
  @Post('resources/submit')
  @UseGuards(JwtAuthGuard)
  submitCommunity(
    @Req() req: { user: { userId: number; username: string } },
    @Body() body: SubmitCommunityPromptDto,
  ) {
    if (!body?.title?.trim() || !body?.prompt?.trim()) {
      throw new BadRequestException('标题与提示词正文不能为空');
    }
    return this.hub.submitCommunityPrompt({
      ...body,
      userId: String(req.user.userId),
      authorName:
        body.authorName?.trim() || req.user.username || `用户${req.user.userId}`,
    });
  }

  /**
   * 代理 Hub POST /resources/:id/use — 广场点「使用」上报次数 +1
   */
  @Post('resources/:id/use')
  @UseGuards(JwtAuthGuard)
  recordUse(
    @Req() req: { user: { userId: number } },
    @Param('id') id: string,
    @Body() body: RecordResourceUseDto,
  ) {
    if (!String(id || '').trim()) {
      throw new BadRequestException('资源 id 不能为空');
    }
    return this.hub.recordResourceUse({
      id: decodeURIComponent(id),
      userId: String(req.user.userId),
      kind: body?.kind,
    });
  }

  @Get('skills/plaza')
  @UseGuards(JwtAuthGuard)
  async plaza() {
    const cached = await this.hub.getCachedPlaza();
    if (cached) return cached;
    return { version: 0, source: 'empty', filters: [], skills: [] };
  }

  /** 提示词广场（与 skills/plaza 同源缓存） */
  @Get('prompts/plaza')
  @UseGuards(JwtAuthGuard)
  async promptsPlaza() {
    return this.plaza();
  }

  /**
   * Agent Skill 广场（缓存自 Hub GET /skills/plaza，mode=agent）
   */
  @Get('agents/plaza')
  @UseGuards(JwtAuthGuard)
  async agentsPlaza() {
    const cached = await this.hub.getCachedAgentsPlaza();
    if (cached) return cached;
    return { version: 0, source: 'empty', filters: [], items: [], skills: [] };
  }

  /**
   * Workflow 广场（Hub GET /api/v1/workflows/plaza）
   * 未同步前返回空，前端不回填本地模板
   */
  @Get('workflows/plaza')
  @UseGuards(JwtAuthGuard)
  async workflowsPlaza() {
    const cached = await this.hub.getCachedWorkflowsPlaza();
    if (cached) return cached;
    return { version: 0, source: 'empty', filters: [], items: [] };
  }

  @Get('channels/catalog')
  @UseGuards(JwtAuthGuard)
  async channels() {
    const cached = await this.hub.getCachedChannels();
    if (cached) return cached;
    return { version: 0, kind: 'channel', items: [] };
  }

  @Get('models/catalog')
  @UseGuards(JwtAuthGuard)
  async models() {
    const cached = await this.hub.getCachedModels();
    if (cached) return cached;
    return { version: 0, kind: 'model', items: [] };
  }

  /** 从 Hub 缓存拉取渠道 + 模型快照到本端 */
  @Post('channels/:slug/pull')
  @UseGuards(JwtAuthGuard)
  pullChannel(@Param('slug') slug: string) {
    return this.hub.pullChannelToLocal(slug);
  }

  /** 用最新 Hub 模型缓存刷新本端已拉取渠道的模型快照 */
  @Post('local-models/refresh')
  @UseGuards(JwtAuthGuard)
  async refreshLocalModels() {
    const r = await this.hub.refreshPulledLocalModels();
    const settings = await this.hub.getPublicSettingsAfterRefresh();
    return { ok: true, ...r, settings };
  }

  /** 移除本端已拉取渠道及其模型快照 */
  @Delete('channels/:slug/local')
  @UseGuards(JwtAuthGuard)
  removeLocalChannel(@Param('slug') slug: string) {
    return this.hub.removeLocalChannel(slug);
  }

  @Get('libraries/catalog')
  @UseGuards(JwtAuthGuard)
  async libraries() {
    const cached = await this.hub.getCachedLibraries();
    if (cached) return cached;
    return { version: 0, kind: 'library', items: [] };
  }

  /** Hub → AIGC 视频工厂 推送入口（无需登录） */
  @Public()
  @SkipFileOssSetup()
  @Post('webhook')
  webhook(
    @Req() req: Request & { rawBody?: string },
    @Headers('x-lumina-event') event?: string,
    @Headers('x-lumina-timestamp') timestamp?: string,
    @Headers('x-lumina-signature') signature?: string,
  ) {
    const raw =
      typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {});
    return this.hub.handleWebhook(raw, { event, timestamp, signature });
  }
}
