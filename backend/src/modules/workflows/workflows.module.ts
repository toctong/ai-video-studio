import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workflow } from '../../entities/workflow.entity';
import { WorkflowRun } from '../../entities/workflow-run.entity';
import { WorkflowRevision } from '../../entities/workflow-revision.entity';
import { Production } from '../../entities/production.entity';
import { AiModule } from '../ai/ai.module';
import { AssetsModule } from '../assets/assets.module';
import { LibrariesModule } from '../libraries/libraries.module';
import { JobsModule } from '../jobs/jobs.module';
import { NodeRegistry } from './node-registry';
import { GraphExecutor } from './graph-executor';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowRunsController } from './workflow-runs.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, WorkflowRun, WorkflowRevision, Production]),
    AiModule,
    AssetsModule,
    LibrariesModule,
    forwardRef(() => JobsModule),
  ],
  providers: [NodeRegistry, GraphExecutor, WorkflowsService],
  controllers: [WorkflowsController, WorkflowRunsController],
  exports: [WorkflowsService, NodeRegistry, GraphExecutor],
})
export class WorkflowsModule {}
