import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';
import { PluginsService } from './plugins.service';
import { PluginsController } from './plugins.controller';

@Module({
  imports: [AiModule, SettingsModule],
  providers: [PluginsService],
  controllers: [PluginsController],
  exports: [PluginsService],
})
export class PluginsModule {}
