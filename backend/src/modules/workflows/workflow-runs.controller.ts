import { Controller, Get, Param, Post, Query, Sse, UseGuards } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkflowsService } from './workflows.service';

@Controller('workflow-runs')
@UseGuards(JwtAuthGuard)
export class WorkflowRunsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list(@Query('projectId') projectId?: string, @Query('workflowId') workflowId?: string) {
    return this.workflows.listRuns({ projectId, workflowId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.workflows.getRun(id);
  }

  @Sse(':id/events')
  events(@Param('id') id: string): Observable<MessageEvent> {
    return this.workflows.watchRun(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.workflows.cancelRun(id);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.workflows.retryRun(id, true);
  }
}
