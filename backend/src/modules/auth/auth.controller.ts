import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AvatarService } from './avatar.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { clearAuthCookie, setAuthCookie } from './auth-cookie';
import { SkipFileOssSetup } from '../storage/file-oss-setup.guard';

class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  password!: string;

  /** 腾讯身份验证器（或兼容 TOTP App）6 位动态码；未绑定时可留空 */
  @IsOptional()
  @IsString()
  totpCode?: string;
}

class TotpConfirmDto {
  @IsString()
  code!: string;
}

class TotpDisableDto {
  @IsString()
  password!: string;

  @IsString()
  code!: string;
}

class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  nickname?: string;

  @IsOptional()
  @IsIn(['light', 'dark'])
  theme?: 'light' | 'dark';
}

class ChangeUsernameDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  username!: string;

  @IsString()
  oldPassword!: string;
}

class ListAvatarLibraryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  refresh?: boolean;
}

class ApplyLibraryAvatarDto {
  @IsString()
  previewUrl!: string;
}

const AVATAR_MAX_SIZE = 2 * 1024 * 1024;
const AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@SkipFileOssSetup()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly avatars: AvatarService,
  ) {}

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      body.username,
      body.password,
      String(body.totpCode || ''),
    );
    if (!result) {
      throw new UnauthorizedException('账号、密码或验证器动态码错误');
    }
    setAuthCookie(res, result.token, req);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('totp/setup')
  totpSetup(@Req() req: { user: { userId: number } }) {
    return this.auth.beginTotpSetup(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('totp/confirm')
  totpConfirm(@Req() req: { user: { userId: number } }, @Body() body: TotpConfirmDto) {
    return this.auth.confirmTotpSetup(req.user.userId, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('totp/disable')
  totpDisable(@Req() req: { user: { userId: number } }, @Body() body: TotpDisableDto) {
    return this.auth.disableTotp(req.user.userId, body.password, body.code);
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    clearAuthCookie(res, req);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('me')
  async me(@Req() req: { user: { userId: number; username: string; role: string } }) {
    const profile = await this.auth.profile(req.user.userId);
    if (!profile) throw new UnauthorizedException('用户不存在');
    return { user: profile };
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(
    @Req() req: { user: { userId: number } },
    @Body() body: UpdateProfileDto,
  ) {
    if (body.nickname === undefined && body.theme === undefined) {
      throw new BadRequestException('没有可更新的字段');
    }
    return this.auth.updateProfileFields(req.user.userId, {
      nickname: body.nickname,
      theme: body.theme,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put('username')
  async changeUsername(
    @Req() req: Request & { user: { userId: number } },
    @Body() body: ChangeUsernameDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.changeUsername(
      req.user.userId,
      body.username,
      body.oldPassword,
    );
    if (result?.token) setAuthCookie(res, result.token, req);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('avatar-library')
  listAvatarLibrary(@Query() query: ListAvatarLibraryDto) {
    return this.avatars.listLibrary(query.page, query.limit, !!query.refresh);
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar-library')
  applyLibraryAvatar(
    @Req() req: { user: { userId: number } },
    @Body() body: ApplyLibraryAvatarDto,
  ) {
    return this.avatars.applyFromPreview(req.user.userId, body.previewUrl);
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AVATAR_MAX_SIZE },
      fileFilter: (_req, file, callback) => {
        if (!AVATAR_MIME.has(file.mimetype)) {
          callback(new Error('仅支持 JPG、PNG、WebP、GIF 图片'), false);
          return;
        }
        callback(null, true);
      },
      storage: memoryStorage(),
    }),
  )
  async uploadAvatar(
    @Req() req: { user: { userId: number } },
    @UploadedFile() file?: { buffer?: Buffer; mimetype?: string; originalname?: string },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('请选择头像图片');
    const ext = extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.png';
    return this.avatars.saveBuffer(
      req.user.userId,
      file.buffer,
      file.mimetype || 'image/png',
      `avatar${safeExt}`,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: { user: { userId: number } },
    @Body() body: ChangePasswordDto,
  ) {
    try {
      return await this.auth.changePassword(
        req.user.userId,
        body.oldPassword,
        body.newPassword,
      );
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(e?.message || '修改密码失败');
    }
  }
}
