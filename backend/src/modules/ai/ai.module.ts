import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { HubModule } from '../hub/hub.module';
import { AgentA2uiService } from './agent-a2ui.service';
import { AiController } from './ai.controller';
import { AiHubClient } from './ai-hub.client';
import { AiProviderService } from './ai-provider.service';
import { AssembleA2uiService } from './assemble-a2ui.service';
import { AssembleService } from './assemble.service';
import { QuickCreateService } from './quick-create.service';

@Module({
  imports: [SettingsModule, HubModule],
  providers: [
    AiHubClient,
    AiProviderService,
    AssembleService,
    AssembleA2uiService,
    AgentA2uiService,
    QuickCreateService,
  ],
  controllers: [AiController],
  exports: [
    AiHubClient,
    AiProviderService,
    AssembleService,
    AssembleA2uiService,
    AgentA2uiService,
    QuickCreateService,
  ],
})
export class AiModule {}
