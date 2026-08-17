import { Body, Controller, Param, Post, UseGuards, Module } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobsModule } from '../jobs/jobs.module';
import { JobsService } from '../jobs/jobs.service';

class ScriptGenDto {
  @IsString() idea!: string;
  @IsOptional() @IsString() model?: string;
  /** 预估成书总字数（万字），用户指定 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  targetWordsWan?: number;
  /** 建议卷数，用户指定 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  volumeCount?: number;
}

@Controller('projects/:projectId/script')
@UseGuards(JwtAuthGuard)
export class ScriptController {
  constructor(private readonly jobs: JobsService) {}

  @Post('generate-skeleton')
  generateSkeleton(@Param('projectId') projectId: string, @Body() body: ScriptGenDto) {
    return this.jobs.enqueue('script_generate', projectId, body as any);
  }
}

@Module({
  imports: [JobsModule],
  controllers: [ScriptController],
})
export class ScriptModule {}
