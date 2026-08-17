import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString } from 'class-validator';
import type { AssetType } from '@ai-video-studio/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssetsService } from './assets.service';

class UploadMetaDto {
  @IsString() type!: AssetType;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() prompt?: string;
  /** 归属工作流：画布内上传时带上 */
  @IsOptional() @IsString() workflowId?: string;
  @IsOptional() @IsString() workflowName?: string;
  /** 素材库文件夹 id（工作流内归类） */
  @IsOptional() @IsString() libraryFolderId?: string;
}

class FromUrlDto {
  @IsString() url!: string;
  @IsOptional() @IsString() type?: AssetType;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() workflowId?: string;
  @IsOptional() @IsString() workflowName?: string;
}

@Controller('projects/:projectId/assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(
    @Param('projectId') projectId: string,
    @Query('type') type?: AssetType,
    @Query('library') library?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('q') q?: string,
    @Query('workflowId') workflowId?: string,
  ) {
    const libraryOnly = library === '1' || library === 'true';
    const takeN = take != null && String(take).trim() !== '' ? Number(take) : undefined;
    const skipN = skip != null && String(skip).trim() !== '' ? Number(skip) : undefined;
    const paged = Number.isFinite(takeN) || Number.isFinite(skipN);
    if (paged) {
      return this.assets.listPage(projectId, type, {
        libraryOnly,
        take: Number.isFinite(takeN) ? takeN : 48,
        skip: Number.isFinite(skipN) ? skipN : 0,
        q,
        workflowId,
      });
    }
    return this.assets.list(projectId, type, { libraryOnly });
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadMetaDto,
  ) {
    return this.assets.createFromUpload(projectId, file, body);
  }

  /**
   * 远端图转永久链（宫格切分等）。优先 FileOSS；失败再本地。
   */
  @Post('from-url')
  fromUrl(@Param('projectId') projectId: string, @Body() body: FromUrlDto) {
    return this.assets.localizeForCanvas(projectId, {
      url: String(body.url || '').trim(),
      type: (body.type || 'other') as AssetType,
      name: body.name || 'remote-image',
      meta: {
        ...(body.workflowId ? { workflowId: body.workflowId } : {}),
        ...(body.workflowName ? { workflowName: body.workflowName } : {}),
      },
    });
  }

  @Post('text')
  createText(
    @Param('projectId') projectId: string,
    @Body() body: { type: AssetType; name: string; content: string; prompt?: string },
  ) {
    return this.assets.createTextAsset(projectId, body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.assets.get(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.assets.remove(id);
  }
}
