import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../../entities/chapter.entity';
import { ChaptersService } from './chapters.service';
import { ChaptersController } from './chapters.controller';
import { ProjectsModule } from '../projects/projects.module';
import { CharactersModule } from '../characters/characters.module';
import { AssetsModule } from '../assets/assets.module';
import { JobsModule } from '../jobs/jobs.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chapter]),
    forwardRef(() => ProjectsModule),
    AssetsModule,
    AiModule,
    forwardRef(() => CharactersModule),
    forwardRef(() => JobsModule),
  ],
  providers: [ChaptersService],
  controllers: [ChaptersController],
  exports: [ChaptersService],
})
export class ChaptersModule {}
