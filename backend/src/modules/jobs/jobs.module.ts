import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobRun } from '../../entities/job-run.entity';
import { WorkflowRun } from '../../entities/workflow-run.entity';
import { AiModule } from '../ai/ai.module';
import { AssetsModule } from '../assets/assets.module';
import { ProjectsModule } from '../projects/projects.module';
import { TimelineModule } from '../timeline/timeline.module';
import { CharactersModule } from '../characters/characters.module';
import { ChaptersModule } from '../chapters/chapters.module';
import { LibrariesModule } from '../libraries/libraries.module';
import { SettingsModule } from '../settings/settings.module';
import { JobsService } from './jobs.service';
import { JobsController, ProjectCoverJobsController } from './jobs.controller';
import { GenerateRunner } from './generate.processor';
import { InProcessJobQueue } from './in-process-job-queue';

/**
 * 不再 import WorkflowsModule，避免 Jobs ↔ Workflows 环。
 * workflow_run 经 ModuleRef 惰性解析 WorkflowsService（AppModule 已加载双方）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([JobRun, WorkflowRun]),
    AiModule,
    AssetsModule,
    LibrariesModule,
    forwardRef(() => SettingsModule),
    forwardRef(() => ProjectsModule),
    forwardRef(() => TimelineModule),
    forwardRef(() => CharactersModule),
    forwardRef(() => ChaptersModule),
  ],
  providers: [JobsService, GenerateRunner, InProcessJobQueue],
  controllers: [JobsController, ProjectCoverJobsController],
  exports: [JobsService, GenerateRunner, InProcessJobQueue],
})
export class JobsModule {}
