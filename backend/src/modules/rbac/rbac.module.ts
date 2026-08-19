import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dept } from '../../entities/dept.entity';
import { Role } from '../../entities/role.entity';
import { SysMenu } from '../../entities/sys-menu.entity';
import { User } from '../../entities/user.entity';
import { RbacService } from './rbac.service';

@Module({
  imports: [TypeOrmModule.forFeature([Dept, Role, SysMenu, User])],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
