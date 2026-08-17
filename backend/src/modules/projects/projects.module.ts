import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../../entities/project.entity';
import { Asset } from '../../entities/asset.entity';
import { Character } from '../../entities/character.entity';
import { Chapter } from '../../entities/chapter.entity';
import { Timeline } from '../../entities/timeline.entity';
import { AssetsModule } from '../assets/assets.module';
import { JobsModule } from '../jobs/jobs.module';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Asset, Character, Chapter, Timeline]),
    AssetsModule,
    forwardRef(() => JobsModule),
  ],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
