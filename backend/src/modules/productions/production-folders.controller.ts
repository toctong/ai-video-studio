import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductionFoldersService } from './production-folders.service';

class CreateProductionFolderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class UpdateProductionFolderDto extends CreateProductionFolderDto {}

@Controller('production-folders')
@UseGuards(JwtAuthGuard)
export class ProductionFoldersController {
  constructor(private readonly folders: ProductionFoldersService) {}

  @Get()
  list() {
    return this.folders.list();
  }

  @Post()
  create(@Body() body: CreateProductionFolderDto) {
    return this.folders.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProductionFolderDto) {
    return this.folders.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.folders.remove(id);
  }
}
