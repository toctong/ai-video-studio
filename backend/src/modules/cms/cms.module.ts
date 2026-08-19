import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CmsItem } from '../../entities/cms-item.entity';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';

@Module({
  imports: [TypeOrmModule.forFeature([CmsItem])],
  controllers: [CmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
