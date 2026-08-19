import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const req = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    const role = String(req.user?.role || '');
    if (!roles.includes(role)) {
      throw new ForbiddenException('需要管理员权限');
    }
    return true;
  }
}
