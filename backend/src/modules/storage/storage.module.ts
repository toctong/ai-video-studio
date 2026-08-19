import { Global, Module, forwardRef } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { FileOssService } from './file-oss.service';
import { StorageController } from './storage.controller';
import { VideoPosterService } from './video-poster.service';

@Global()
@Module({
  imports: [forwardRef(() => SettingsModule)],
  controllers: [StorageController],
  providers: [FileOssService, VideoPosterService],
  exports: [FileOssService, VideoPosterService],
})
export class StorageModule {}
