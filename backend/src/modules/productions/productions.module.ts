import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Production } from '../../entities/production.entity';
import { ProductionFolder } from '../../entities/production-folder.entity';
import { Workflow } from '../../entities/workflow.entity';
import { ProductionsController } from './productions.controller';
import { ProductionsService } from './productions.service';
import { ProductionFoldersController } from './production-folders.controller';
import { ProductionFoldersService } from './production-folders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Production, ProductionFolder, Workflow])],
  providers: [ProductionsService, ProductionFoldersService],
  controllers: [ProductionsController, ProductionFoldersController],
  exports: [ProductionsService, ProductionFoldersService],
})
export class ProductionsModule {}
