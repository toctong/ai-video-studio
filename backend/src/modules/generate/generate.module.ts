import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerateMessage } from '../../entities/generate-message.entity';
import { GenerateSession } from '../../entities/generate-session.entity';
import { AiModule } from '../ai/ai.module';
import { JobsModule } from '../jobs/jobs.module';
import { GenerateController } from './generate.controller';
import { GenerateService } from './generate.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GenerateSession, GenerateMessage]),
    AiModule,
    forwardRef(() => JobsModule),
  ],
  controllers: [GenerateController],
  providers: [GenerateService],
  exports: [GenerateService],
})
export class GenerateModule {}
