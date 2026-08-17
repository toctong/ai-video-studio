import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '../../entities/app-setting.entity';
import { StorageModule } from '../storage/storage.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { SchemaMigrateService } from './schema-migrate.service';
import { JobConcurrencyNotifier } from './job-concurrency.notifier';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting]), forwardRef(() => StorageModule)],
  providers: [SettingsService, SchemaMigrateService, JobConcurrencyNotifier],
  controllers: [SettingsController],
  exports: [SettingsService, JobConcurrencyNotifier],
})
export class SettingsModule {}
