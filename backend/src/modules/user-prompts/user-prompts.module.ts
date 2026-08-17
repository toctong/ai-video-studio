import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPrompt } from '../../entities/user-prompt.entity';
import { UserPromptsController } from './user-prompts.controller';
import { UserPromptsService } from './user-prompts.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserPrompt])],
  controllers: [UserPromptsController],
  providers: [UserPromptsService],
  exports: [UserPromptsService],
})
export class UserPromptsModule {}
