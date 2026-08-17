import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import type { ProjectStage } from '@ai-video-studio/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectsService } from './projects.service';

class CreateProjectDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() styleBrief?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  targetWordsWan?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  volumeCount?: number;
}

class UpdateProjectDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() styleBrief?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsObject() modelOverrides?: Record<string, string>;
  @IsOptional() @IsString() coverAssetId?: string;
  @IsOptional() @IsObject() storyState?: Record<string, unknown>;
}

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query('archived') archived?: string) {
    return this.projects.list(archived === '1');
  }

  @Post()
  create(@Body() body: CreateProjectDto) {
    return this.projects.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.projects.get(id);
  }

  @Get(':id/overview')
  overview(@Param('id') id: string) {
    return this.projects.overview(id);
  }

  /** 作品简介 Word（封面 + 一句话 + 角色 + 大纲 + 分章目录） */
  @Get(':id/export/synopsis')
  async exportSynopsis(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, filename } = await this.projects.exportSynopsisDocxStream(id);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    });
    return file;
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateProjectDto) {
    return this.projects.update(id, body);
  }

  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file'))
  setCover(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('请选择封面图片');
    return this.projects.setCover(id, file);
  }

  @Delete(':id/cover')
  clearCover(@Param('id') id: string) {
    return this.projects.clearCover(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }

  @Post(':id/stages/:stage')
  markStage(
    @Param('id') id: string,
    @Param('stage') stage: ProjectStage,
    @Body() body: { done?: boolean },
  ) {
    return this.projects.markStage(id, stage, body.done !== false);
  }
}
