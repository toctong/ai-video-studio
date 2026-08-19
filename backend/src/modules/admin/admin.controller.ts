import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SkipFileOssSetup } from '../storage/file-oss-setup.guard';
import { AdminService } from './admin.service';
import { RbacService } from '../rbac/rbac.service';

class CreateUserDto {
  @IsString() @MinLength(2) username!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() deptId?: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() deptId?: string;
  @IsOptional() @IsString() @MinLength(6) password?: string;
  @IsOptional() @IsIn(['light', 'dark']) theme?: string;
}

class ChannelCredDto {
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsString() proxyUrl?: string;
  @IsOptional() @IsString() title?: string;
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
  channelCredentials?: Record<string, ChannelCredDto>;
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

class UpsertModelDto {
  @IsString() modelId!: string;
  @IsString() channelSlug!: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() channelTitle?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) modalities?: string[];
  @IsOptional() @IsBoolean() enabled?: boolean;
}

class CmsItemDto {
  @IsOptional()
  @IsIn(['banner', 'entry', 'showcase', 'discover', 'tool', 'skill', 'nav', 'brand', 'notice'])
  type?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsString() linkPath?: string;
  @IsOptional() @IsObject() meta?: Record<string, unknown>;
  @IsOptional() @IsNumber() sort?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

class CmsImportDto {
  @IsArray()
  items!: Array<Record<string, unknown>>;

  @IsOptional()
  @IsIn(['merge', 'replace'])
  mode?: 'merge' | 'replace';
}

@SkipFileOssSetup()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'ops')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly rbac: RbacService,
  ) {}

  @Get('me/access')
  myAccess(@Req() req: { user: { userId: number } }) {
    return this.rbac.myAccess(req.user.userId);
  }

  @Get('depts')
  listDepts(@Query('q') q?: string) {
    return this.rbac.listDeptTree(q);
  }

  @Post('depts')
  @Roles('admin')
  createDept(@Body() body: Record<string, unknown>) {
    return this.rbac.createDept(body as any);
  }

  @Patch('depts/:id')
  @Roles('admin')
  updateDept(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.rbac.updateDept(id, body as any);
  }

  @Delete('depts/:id')
  @Roles('admin')
  deleteDept(@Param('id') id: string) {
    return this.rbac.deleteDept(id);
  }

  @Get('roles')
  listRoles(@Query('q') q?: string) {
    return this.rbac.listRoles(q);
  }

  @Post('roles')
  @Roles('admin')
  createRole(@Body() body: Record<string, unknown>) {
    return this.rbac.createRole(body as any);
  }

  @Patch('roles/:id')
  @Roles('admin')
  updateRole(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.rbac.updateRole(id, body as any);
  }

  @Delete('roles/:id')
  @Roles('admin')
  deleteRole(@Param('id') id: string) {
    return this.rbac.deleteRole(id);
  }

  @Get('menus')
  listMenus(@Query('q') q?: string) {
    return this.rbac.listMenuTree(q);
  }

  @Post('menus')
  @Roles('admin')
  createMenu(@Body() body: Record<string, unknown>) {
    return this.rbac.createMenu(body as any);
  }

  @Patch('menus/:id')
  @Roles('admin')
  updateMenu(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.rbac.updateMenu(id, body as any);
  }

  @Delete('menus/:id')
  @Roles('admin')
  deleteMenu(@Param('id') id: string) {
    return this.rbac.deleteMenu(id);
  }

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('users')
  listUsers(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listUsers(q, Number(page), Number(pageSize));
  }

  @Post('users')
  createUser(@Body() body: CreateUserDto) {
    return this.admin.createUser(body);
  }

  @Patch('users/:id')
  updateUser(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateUserDto) {
    return this.admin.updateUser(id, body);
  }

  @Delete('users/:id')
  deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: { userId: number } },
  ) {
    return this.admin.deleteUser(id, req.user.userId);
  }

  @Get('projects')
  listProjects(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listProjects(q, Number(page), Number(pageSize));
  }

  @Delete('projects/:id')
  deleteProject(@Param('id') id: string) {
    return this.admin.deleteProject(id);
  }

  @Get('productions')
  listProductions(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listProductions(q, Number(page), Number(pageSize));
  }

  @Delete('productions/:id')
  deleteProduction(@Param('id') id: string) {
    return this.admin.deleteProduction(id);
  }

  @Get('assets')
  listAssets(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listAssets(q, type, Number(page), Number(pageSize));
  }

  @Delete('assets/:id')
  deleteAsset(@Param('id') id: string) {
    return this.admin.deleteAsset(id);
  }

  @Get('jobs')
  listJobs(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listJobs(status, Number(page), Number(pageSize));
  }

  @Post('jobs/:id/cancel')
  cancelJob(@Param('id') id: string) {
    return this.admin.cancelJob(id);
  }

  @Delete('jobs/finished')
  clearFinishedJobs() {
    return this.admin.clearFinishedJobs();
  }

  @Delete('jobs/:id')
  deleteJob(@Param('id') id: string) {
    return this.admin.deleteJob(id);
  }

  @Get('discover')
  listDiscover(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listDiscover(q, Number(page), Number(pageSize));
  }

  @Delete('discover/:id')
  deleteDiscover(@Param('id') id: string) {
    return this.admin.deleteDiscover(id);
  }

  @Get('settings')
  getSettings() {
    return this.admin.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() body: UpdateSettingsDto) {
    return this.admin.updateSettings(body as any);
  }

  @Post('settings/file-oss/test')
  testFileOss() {
    return this.admin.testFileOss();
  }

  @Delete('settings/channels/:slug')
  removeChannel(@Param('slug') slug: string) {
    return this.admin.removeChannel(slug);
  }

  @Post('settings/models')
  upsertModel(@Body() body: UpsertModelDto) {
    return this.admin.upsertModel(body);
  }

  @Delete('settings/models/:modelId')
  removeModel(@Param('modelId') modelId: string, @Query('channelSlug') channelSlug?: string) {
    return this.admin.removeModel(modelId, channelSlug);
  }

  @Get('cms')
  listCms(@Query('type') type?: string, @Query('q') q?: string) {
    return this.admin.listCms(type, q);
  }

  @Get('cms/export')
  exportCms() {
    return this.admin.exportCms();
  }

  @Post('cms/import')
  importCms(@Body() body: CmsImportDto) {
    return this.admin.importCms(body as any);
  }

  @Post('cms/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
  )
  uploadCms(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择文件');
    return this.admin.uploadCmsMedia(file);
  }

  @Post('cms')
  createCms(@Body() body: CmsItemDto) {
    return this.admin.createCms(body as any);
  }

  @Patch('cms/:id')
  updateCms(@Param('id') id: string, @Body() body: CmsItemDto) {
    return this.admin.updateCms(id, body as any);
  }

  @Delete('cms/:id')
  deleteCms(@Param('id') id: string) {
    return this.admin.deleteCms(id);
  }
}
