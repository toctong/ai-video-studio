import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserPromptsService, type UserPromptDto } from './user-prompts.service';

class CreateUserPromptDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  desc?: string;

  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsIn(['image', 'video'])
  mode?: 'image' | 'video';

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  coverOssKey?: string;
}

class UpdateUserPromptDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  desc?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @IsIn(['image', 'video'])
  mode?: 'image' | 'video';

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  coverOssKey?: string;
}

class MigrateUserPromptsDto {
  @IsArray()
  items!: Array<{
    name: string;
    desc?: string;
    prompt: string;
    mode?: string;
    coverUrl?: string;
  }>;
}

@Controller('user-prompts')
@UseGuards(JwtAuthGuard)
export class UserPromptsController {
  constructor(private readonly prompts: UserPromptsService) {}

  @Get()
  list(@Req() req: { user: { userId: number } }) {
    return this.prompts.list(req.user.userId);
  }

  @Post()
  create(
    @Body() body: CreateUserPromptDto,
    @Req() req: { user: { userId: number } },
  ) {
    return this.prompts.create(req.user.userId, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserPromptDto,
    @Req() req: { user: { userId: number } },
  ) {
    return this.prompts.update(id, req.user.userId, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: { userId: number } }) {
    return this.prompts.remove(id, req.user.userId);
  }

  /** 上传封面到 File OSS，返回公网 URL；可选绑定到已有提示词 */
  @Post('cover')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  uploadCover(
    @UploadedFile() file: Express.Multer.File,
    @Body('promptId') promptId: string | undefined,
    @Req() req: { user: { userId: number } },
  ) {
    if (!file) throw new BadRequestException('请选择封面图片');
    return this.prompts.uploadCover(
      req.user.userId,
      file,
      promptId ? String(promptId) : undefined,
    );
  }

  /** 一次性把浏览器本地自建提示词迁到后端（跳过 dataURL 封面） */
  @Post('migrate')
  async migrate(
    @Body() body: MigrateUserPromptsDto,
    @Req() req: { user: { userId: number } },
  ) {
    const items = Array.isArray(body?.items) ? body.items : [];
    const created: UserPromptDto[] = [];
    for (const it of items.slice(0, 100)) {
      const cover = String(it.coverUrl || '').trim();
      const coverUrl = /^https?:\/\//i.test(cover) ? cover : '';
      created.push(
        await this.prompts.create(req.user.userId, {
          name: String(it.name || '').trim() || '未命名',
          desc: it.desc,
          prompt: String(it.prompt || '').trim(),
          mode: it.mode === 'video' ? 'video' : 'image',
          coverUrl,
        }),
      );
    }
    return { ok: true, count: created.length, items: created };
  }
}
