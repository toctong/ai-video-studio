import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { DiscoverService } from './discover.service';

class PublishDto {
  @IsIn(['workflow', 'skill', 'template', 'production'])
  kind!: 'workflow' | 'skill' | 'template' | 'production';

  @IsString()
  title!: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() thumbUrl?: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsObject() payload!: Record<string, unknown>;
}

@Controller('discover')
@UseGuards(JwtAuthGuard)
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  @Get()
  feed(
    @Query('kind') kind?: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
  ) {
    return this.discover.feed({ kind, q, take: take ? Number(take) : undefined });
  }

  /** 分享落地：无需登录 */
  @Public()
  @Get('share/:token')
  byToken(@Param('token') token: string) {
    return this.discover.getByToken(token);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.discover.get(id);
  }

  @Post('publish')
  publish(
    @Body() body: PublishDto,
    @Req() req: { user: { userId: number } },
  ) {
    return this.discover.publish({
      kind: body.kind,
      title: body.title,
      description: body.description,
      thumbUrl: body.thumbUrl,
      payload: body.payload,
      sourceId: body.sourceId,
      authorUserId: req.user.userId,
    });
  }

  @Post(':id/like')
  like(@Param('id') id: string) {
    return this.discover.like(id);
  }

  @Delete(':id')
  unpublish(@Param('id') id: string, @Req() req: { user: { userId: number } }) {
    return this.discover.unpublish(id, req.user.userId);
  }
}
