import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LibrariesService } from './libraries.service';

class ExpandShotDto {
  @IsOptional() @IsString() model?: string;
  /** 成片时长（秒）：常用 10/15 */
  @IsOptional() @Type(() => Number) @IsNumber() durationSec?: number;
}

class RenderPortraitDto {
  @IsOptional() @Type(() => Number) @IsNumber() characterIndex?: number;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() portraitPrompt?: string;
}

class RenderSheetDto {
  @IsOptional() @Type(() => Number) @IsNumber() characterIndex?: number;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() sheetPrompt?: string;
}

class RenderSceneDto {
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() imagePrompt?: string;
}

class RenderPlotGridDto {
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() plotGridPrompt?: string;
}

/**
 * 参考库静态目录 API + 镜头库细案扩写。
 */
@Controller('libraries')
@UseGuards(JwtAuthGuard)
export class LibrariesController {
  constructor(private readonly libraries: LibrariesService) {}

  @Get()
  list() {
    return { kinds: this.libraries.listKinds() };
  }

  /** 已生成细案列表（须在 :id 路由之前） */
  @Get('shots/expands')
  listShotExpands() {
    return this.libraries.listShotExpands();
  }

  /** 读取已入库细案 */
  @Get('shots/:id/expand')
  getShotExpand(@Param('id') id: string) {
    return this.libraries.getSavedShotExpand(id);
  }

  /** AI 扩写：成片 + 人物定妆 + 设定板 + 剧情宫格 + 场景，并入库 */
  @Post('shots/:id/expand')
  expandShot(@Param('id') id: string, @Body() body: ExpandShotDto) {
    return this.libraries.expandShotPrompt(id, {
      model: body?.model,
      durationSec: body?.durationSec,
    });
  }

  @Post('shots/:id/render/portrait')
  renderPortrait(@Param('id') id: string, @Body() body: RenderPortraitDto) {
    return this.libraries.renderShotPortrait(id, {
      characterIndex: body?.characterIndex ?? 0,
      model: body?.model,
      portraitPrompt: body?.portraitPrompt,
    });
  }

  @Post('shots/:id/render/sheet')
  renderSheet(@Param('id') id: string, @Body() body: RenderSheetDto) {
    return this.libraries.renderShotCharacterSheet(id, {
      characterIndex: body?.characterIndex ?? 0,
      model: body?.model,
      sheetPrompt: body?.sheetPrompt,
    });
  }

  @Post('shots/:id/render/scene')
  renderScene(@Param('id') id: string, @Body() body: RenderSceneDto) {
    return this.libraries.renderShotScene(id, {
      model: body?.model,
      imagePrompt: body?.imagePrompt,
    });
  }

  @Post('shots/:id/render/plot-grid')
  renderPlotGrid(@Param('id') id: string, @Body() body: RenderPlotGridDto) {
    return this.libraries.renderShotPlotGrid(id, {
      model: body?.model,
      plotGridPrompt: body?.plotGridPrompt,
    });
  }

  @Get(':kind')
  getKind(
    @Param('kind') kind: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
  ) {
    const data = this.libraries.getKind(kind);
    const kw = String(q || '').trim().toLowerCase();
    const cat = String(category || '').trim();
    if (!kw && (!cat || cat === '全部')) return data;

    const items = data.items.filter((item) => {
      if (cat && cat !== '全部' && item.category !== cat) return false;
      if (!kw) return true;
      const hay = [item.label, item.blurb, item.category, ...(item.tags || [])]
        .join(' ')
        .toLowerCase();
      return hay.includes(kw);
    });
    return { ...data, items, count: items.length };
  }

  @Get(':kind/items/:id')
  getItem(@Param('kind') kind: string, @Param('id') id: string) {
    return this.libraries.getItem(kind, id);
  }
}
