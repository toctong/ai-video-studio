import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { AssetsModule } from '../assets/assets.module';
import { ShotLibraryExpand } from '../../entities/shot-library-expand.entity';
import { LibrariesController } from './libraries.controller';
import { LibrariesService } from './libraries.service';

@Module({
  imports: [AiModule, AssetsModule, TypeOrmModule.forFeature([ShotLibraryExpand])],
  controllers: [LibrariesController],
  providers: [LibrariesService],
  exports: [LibrariesService],
})
export class LibrariesModule {}
