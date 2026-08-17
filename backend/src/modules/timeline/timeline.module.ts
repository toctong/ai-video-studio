import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
  Module,
  forwardRef,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Timeline } from '../../entities/timeline.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssetsModule } from '../assets/assets.module';
import { JobsModule } from '../jobs/jobs.module';
import { JobsService } from '../jobs/jobs.service';
import { TimelineService } from './timeline.service';

@Controller('projects/:projectId/timeline')
@UseGuards(JwtAuthGuard)
export class TimelineController {
  constructor(
    private readonly timeline: TimelineService,
    private readonly jobs: JobsService,
  ) {}

  @Get()
  get(@Param('projectId') projectId: string) {
    return this.timeline.getByProject(projectId);
  }

  @Put()
  update(
    @Param('projectId') projectId: string,
    @Body() body: { data: Timeline['data']; name?: string },
  ) {
    return this.timeline.update(projectId, body.data, body.name);
  }

  @Post('export')
  async export(@Param('projectId') projectId: string, @Body() body: { timelineId?: string }) {
    const t = await this.timeline.getByProject(projectId);
    return this.jobs.enqueue('timeline_export', projectId, {
      timelineId: body.timelineId || t.id,
    });
  }

  @Post('subtitles')
  async buildSubtitles(@Param('projectId') projectId: string) {
    return this.timeline.exportSubtitleAsset(projectId);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Timeline]),
    AssetsModule,
    forwardRef(() => JobsModule),
  ],
  providers: [TimelineService],
  controllers: [TimelineController],
  exports: [TimelineService],
})
export class TimelineModule {}
