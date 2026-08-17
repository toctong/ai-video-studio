import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkflowsService } from './workflows.service';
import type { WorkflowDocument, WorkflowGraph } from '@ai-video-studio/shared';

class CreateWorkflowDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsObject() graph?: WorkflowGraph | WorkflowDocument;
  @IsOptional() tags?: string[];
  @IsOptional() @IsBoolean() isTemplate?: boolean;
  @IsOptional() @IsString() thumbUrl?: string;
}

class UpdateWorkflowDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsObject() graph?: WorkflowGraph | WorkflowDocument;
  @IsOptional() tags?: string[];
  @IsOptional() @IsBoolean() isTemplate?: boolean;
  @IsOptional() @IsString() thumbUrl?: string;
  @IsOptional() @IsString() revisionNote?: string;
  @IsOptional() @IsBoolean() saveRevision?: boolean;
}

class RunWorkflowDto {
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsObject() inputs?: Record<string, unknown>;
  @IsOptional() @IsString() fromNodeId?: string;
  @IsOptional() @IsString() onlyNodeId?: string;
  @IsOptional() @IsString() priorRunId?: string;
  /** 客户端幂等键：相同键的进行中运行会复用 */
  @IsOptional() @IsString() clientKey?: string;
  /** 强制新建运行（跳过幂等复用） */
  @IsOptional() @IsBoolean() force?: boolean;
}

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get('nodes/catalog')
  catalog(@Query('domain') domain?: string) {
    const d = domain === 'novel' || domain === 'studio' ? domain : undefined;
    return { nodes: this.workflows.catalog(d) };
  }

  @Get()
  list(@Query('projectId') projectId?: string) {
    return this.workflows.list({ projectId });
  }

  @Post()
  create(@Body() body: CreateWorkflowDto) {
    return this.workflows.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.workflows.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateWorkflowDto) {
    return this.workflows.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workflows.remove(id);
  }

  @Post(':id/run')
  run(@Param('id') id: string, @Body() body: RunWorkflowDto) {
    return this.workflows.run(id, {
      projectId: body.projectId,
      inputs: body.inputs,
      fromNodeId: body.fromNodeId,
      onlyNodeId: body.onlyNodeId,
      priorRunId: body.priorRunId,
      clientKey: body.clientKey,
      force: body.force,
    });
  }

  @Get(':id/revisions')
  listRevisions(@Param('id') id: string) {
    return this.workflows.listRevisions(id);
  }

  @Post(':id/revisions/:revisionId/restore')
  restoreRevision(@Param('id') id: string, @Param('revisionId') revisionId: string) {
    return this.workflows.restoreRevision(id, revisionId);
  }
}
