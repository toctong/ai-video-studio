import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PluginsService } from './plugins.service';

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get('catalog')
  catalog() {
    return this.plugins.catalog();
  }

  /** 全部 MCP 工具一览（按插件分组） */
  @Get('mcp/tools')
  mcpTools() {
    return this.plugins.listMcpTools();
  }

  @Get('provider/status')
  status() {
    return this.plugins.getProviderStatus();
  }

  @Post('provider/test')
  test() {
    return this.plugins.testProvider();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.plugins.getPlugin(id);
  }
}
