import { Injectable, NotFoundException } from '@nestjs/common';
import { PLUGIN_CATALOG, PLUGIN_GROUPS, PLUGIN_TOOLS } from './plugins.catalog';
import { AiProviderService } from '../ai/ai-provider.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class PluginsService {
  constructor(
    private readonly ai: AiProviderService,
    private readonly settings: SettingsService,
  ) {}

  catalog() {
    return {
      groups: PLUGIN_GROUPS,
      items: [...PLUGIN_CATALOG].sort((a, b) => a.order - b.order),
    };
  }

  getPlugin(id: string) {
    const item = PLUGIN_CATALOG.find((p) => p.id === id);
    if (!item) throw new NotFoundException('插件不存在');
    return {
      ...item,
      tools: PLUGIN_TOOLS[id] || [],
    };
  }

  listMcpTools() {
    return Object.entries(PLUGIN_TOOLS).map(([pluginId, tools]) => ({
      pluginId,
      plugin: PLUGIN_CATALOG.find((p) => p.id === pluginId) || null,
      tools,
    }));
  }

  async testProvider() {
    return this.ai.testConnection();
  }

  async getProviderStatus() {
    const s = await this.settings.get();
    const volc = s.providerCredentials?.volcengine;
    return {
      configured:
        Object.values(s.providerCredentials || {}).some((c) => c.hasKey) ||
        Object.values(s.channelCredentials || {}).some((c) => c.hasKey),
      baseUrl: volc?.baseUrl || '',
      apiKeyMasked: volc?.apiKeyMasked || '',
      routing: {
        chat: s.chatProvider,
      },
      defaults: {
        chat: s.defaultChatModel,
      },
    };
  }
}
