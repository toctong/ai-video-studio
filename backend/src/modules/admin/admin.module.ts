import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { Project } from '../../entities/project.entity';
import { Production } from '../../entities/production.entity';
import { Asset } from '../../entities/asset.entity';
import { JobRun } from '../../entities/job-run.entity';
import { DiscoverPost } from '../../entities/discover-post.entity';
import { Workflow } from '../../entities/workflow.entity';
import { GenerateSession } from '../../entities/generate-session.entity';
import { SettingsModule } from '../settings/settings.module';
import { JobsModule } from '../jobs/jobs.module';
import { CmsModule } from '../cms/cms.module';
import { RbacModule } from '../rbac/rbac.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Project,
      Production,
      Asset,
      JobRun,
      DiscoverPost,
      Workflow,
      GenerateSession,
    ]),
    SettingsModule,
    JobsModule,
    CmsModule,
    RbacModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
