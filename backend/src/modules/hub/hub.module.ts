import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '../../entities/app-setting.entity';
import { SettingsModule } from '../settings/settings.module';
import { HubController } from './hub.controller';
import { HubService } from './hub.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting]), SettingsModule],
  controllers: [HubController],
  providers: [HubService],
  exports: [HubService],
})
export class HubModule {}
