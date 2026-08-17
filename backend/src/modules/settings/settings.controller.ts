import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { IsNumber, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileOssService } from '../storage/file-oss.service';
import { SkipFileOssSetup } from '../storage/file-oss-setup.guard';
import { SettingsService } from './settings.service';

class ProviderCredDto {
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() apiKey?: string;
  /** 渠道出站代理 URL，如 http://127.0.0.1:7890；传空字符串可清除 */
  @IsOptional() @IsString() proxyUrl?: string;
}

class FileOssDto {
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() apiEndpoint?: string;
  @IsOptional() @IsString() bucket?: string;
  @IsOptional() @IsString() keyPrefix?: string;
  @IsOptional() @IsString() accessKeyId?: string;
  @IsOptional() @IsString() accessKeySecret?: string;
}

class UpdateSettingsDto {
  @IsOptional() @IsString() chatProvider?: string;
  @IsOptional() @IsString() imageProvider?: string;
  @IsOptional() @IsString() videoProvider?: string;
  @IsOptional()
  @IsObject()
  providerCredentials?: Record<string, ProviderCredDto>;
  @IsOptional()
  @IsObject()
  channelCredentials?: Record<string, ProviderCredDto>;
  @IsOptional() @IsString() defaultChatModel?: string;
  @IsOptional() @IsString() defaultImageModel?: string;
  @IsOptional() @IsString() defaultVideoModel?: string;
  @IsOptional() @IsString() defaultTtsModel?: string;
  @IsOptional() @IsString() defaultMusicModel?: string;
  @IsOptional() @IsNumber() @Min(1) jobConcurrency?: number;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FileOssDto)
  fileOss?: FileOssDto;
}

@SkipFileOssSetup()
@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly fileOss: FileOssService,
  ) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  async update(@Body() body: UpdateSettingsDto) {
    const data = await this.settings.update(body as any);
    this.fileOss.invalidateCache();
    return data;
  }

  @Post('file-oss/test')
  async testFileOss() {
    this.fileOss.invalidateCache();
    return this.fileOss.testConnection();
  }
}
