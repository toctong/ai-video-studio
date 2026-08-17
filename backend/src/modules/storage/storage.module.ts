import { Global, Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SettingsModule } from '../settings/settings.module';
import { FileOssService } from './file-oss.service';
import { FileOssSetupGuard } from './file-oss-setup.guard';
import { StorageController } from './storage.controller';
import { VideoPosterService } from './video-poster.service';

@Global()
@Module({
  imports: [forwardRef(() => SettingsModule)],
  controllers: [StorageController],
  providers: [
    FileOssService,
    VideoPosterService,
    {
      provide: APP_GUARD,
      useClass: FileOssSetupGuard,
    },
  ],
  exports: [FileOssService, VideoPosterService],
})
export class StorageModule {}
