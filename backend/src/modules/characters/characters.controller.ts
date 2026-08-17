import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharactersService } from './characters.service';
import { AssetsService } from '../assets/assets.service';

class CharacterDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() consistencyPrompt?: string;
  @IsOptional() @IsString() refImageAssetId?: string;
  @IsOptional() @IsString() voiceAssetId?: string;
  @IsOptional() @IsString() voiceProvider?: string;
  @IsOptional() @IsString() voiceId?: string;
  @IsOptional() meta?: Record<string, unknown>;
}

class ExtractDto {
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() model?: string;
}

@Controller('projects/:projectId/characters')
@UseGuards(JwtAuthGuard)
export class CharactersController {
  constructor(
    private readonly characters: CharactersService,
    private readonly assets: AssetsService,
  ) {}

  @Get()
  async list(@Param('projectId') projectId: string) {
    const rows = await this.characters.list(projectId);
    return Promise.all(
      rows.map(async (c) => {
        let refImageUrl = '';
        if (c.refImageAssetId) {
          try {
            const a = await this.assets.get(c.refImageAssetId);
            refImageUrl = a.url;
          } catch {
            /* ignore */
          }
        }
        return { ...c, refImageUrl };
      }),
    );
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() body: CharacterDto) {
    return this.characters.create(projectId, body);
  }

  /** 从剧情骨架自动提取角色入库 */
  @Post('extract')
  extract(@Param('projectId') projectId: string, @Body() body: ExtractDto) {
    if (body.text?.trim()) {
      return this.characters.extractAndUpsert(projectId, body.text, body.model);
    }
    return this.characters.extractFromProject(projectId, body.model);
  }

  @Get(':id/portrait-prompt')
  portraitPrompt(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.characters.getPortraitPrompt(projectId, id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: CharacterDto) {
    return this.characters.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.characters.remove(id);
  }
}
