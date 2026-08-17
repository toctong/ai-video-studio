import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductionsService } from './productions.service';

class CreateProductionDto {
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() folderId?: string;
  @IsOptional() @IsString() chapterId?: string;
  @IsOptional() @IsString() workflowId?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() script?: string;
  @IsOptional() @IsArray() cast?: unknown[];
  @IsOptional() @IsArray() scenes?: unknown[];
  @IsOptional() @IsObject() style?: Record<string, unknown>;
  @IsOptional() @IsArray() assetIds?: string[];
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() shotLibraryId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsString() thumbUrl?: string;
  @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

class UpdateProductionDto extends CreateProductionDto {}

@Controller('productions')
@UseGuards(JwtAuthGuard)
export class ProductionsController {
  constructor(private readonly productions: ProductionsService) {}

  @Get()
  list(
    @Query('projectId') projectId?: string,
    @Query('chapterId') chapterId?: string,
    @Query('folderId') folderId?: string,
  ) {
    return this.productions.list({
      projectId,
      chapterId,
      ...(folderId !== undefined ? { folderId } : {}),
    });
  }

  @Post()
  create(@Body() body: CreateProductionDto) {
    return this.productions.create(body as any);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.productions.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProductionDto) {
    return this.productions.update(id, body as any);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productions.remove(id);
  }
}
