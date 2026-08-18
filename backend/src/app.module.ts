import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { AssetsModule } from './modules/assets/assets.module';
import { StorageModule } from './modules/storage/storage.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ScriptModule } from './modules/script/script.module';
import { ChaptersModule } from './modules/chapters/chapters.module';
import { CharactersModule } from './modules/characters/characters.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { AiModule } from './modules/ai/ai.module';
import { LibrariesModule } from './modules/libraries/libraries.module';
import { AppSetting } from './entities/app-setting.entity';
import { User } from './entities/user.entity';
import { Project } from './entities/project.entity';
import { Asset } from './entities/asset.entity';
import { Character } from './entities/character.entity';
import { JobRun } from './entities/job-run.entity';
import { Timeline } from './entities/timeline.entity';
import { Chapter } from './entities/chapter.entity';
import { ShotLibraryExpand } from './entities/shot-library-expand.entity';
import { WorkflowRevision } from './entities/workflow-revision.entity';
import { Workflow } from './entities/workflow.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { Production } from './entities/production.entity';
import { ProductionFolder } from './entities/production-folder.entity';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { ProductionsModule } from './modules/productions/productions.module';
import { DiscoverModule } from './modules/discover/discover.module';
import { DiscoverPost } from './entities/discover-post.entity';
import { UserPrompt } from './entities/user-prompt.entity';
import { UserPromptsModule } from './modules/user-prompts/user-prompts.module';
import { GenerateModule } from './modules/generate/generate.module';
import { GenerateSession } from './entities/generate-session.entity';
import { GenerateMessage } from './entities/generate-message.entity';
import { AppLogsModule } from './modules/app-logs/app-logs.module';
import { typeormSynchronizeEnabled } from './config/env';

const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'ai-video-studio.db');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '.env'),
        join(process.cwd(), '..', '.env'),
        join(__dirname, '..', '..', '.env'),
        join(__dirname, '..', '..', '..', '.env'),
      ],
    }),
    StorageModule,
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: dbPath,
      entities: [
        AppSetting,
        User,
        Project,
        Asset,
        Character,
        JobRun,
        Timeline,
        Chapter,
        ShotLibraryExpand,
        Workflow,
        WorkflowRun,
        WorkflowRevision,
        Production,
        ProductionFolder,
        DiscoverPost,
        UserPrompt,
        GenerateSession,
        GenerateMessage,
      ],
      // 未设置时：非 production 默认 true；production 默认 false
      synchronize: typeormSynchronizeEnabled(),
    }),
    AuthModule,
    SettingsModule,
    PluginsModule,
    AiModule,
    GenerateModule,
    ProjectsModule,
    AssetsModule,
    JobsModule,
    ScriptModule,
    ChaptersModule,
    CharactersModule,
    TimelineModule,
    LibrariesModule,
    WorkflowsModule,
    ProductionsModule,
    DiscoverModule,
    UserPromptsModule,
    AppLogsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
