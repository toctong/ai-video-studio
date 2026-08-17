import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from '../../entities/character.entity';
import { CharactersService } from './characters.service';
import { CharactersController } from './characters.controller';
import { AiModule } from '../ai/ai.module';
import { AssetsModule } from '../assets/assets.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Character]),
    AiModule,
    AssetsModule,
    forwardRef(() => ProjectsModule),
  ],
  providers: [CharactersService],
  controllers: [CharactersController],
  exports: [CharactersService],
})
export class CharactersModule {}
