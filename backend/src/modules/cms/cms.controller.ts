import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SkipFileOssSetup } from '../storage/file-oss-setup.guard';
import { CmsService } from './cms.service';

@SkipFileOssSetup()
@UseGuards(JwtAuthGuard)
@Controller('cms')
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  /** 前台首页 / 工具箱一次拉齐运营位 */
  @Public()
  @Get('home')
  home() {
    return this.cms.bundlePublic();
  }

  @Public()
  @Get()
  list(@Query('type') type?: string) {
    return this.cms.listPublic(type);
  }
}
