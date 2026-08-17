import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { resolveSecret } from '../../config/env';
import { readAuthCookie } from './auth-cookie';

function jwtFromCookie(req: Request): string | null {
  return readAuthCookie(req?.headers?.cookie);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        jwtFromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveSecret('JWT_SECRET'),
    });
  }

  validate(payload: { sub: number; username: string; role: string }) {
    return { userId: payload.sub, username: payload.username, role: payload.role };
  }
}
