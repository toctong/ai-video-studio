import type { Request, Response } from 'express';

export const AUTH_COOKIE = 'acd_token';
const MAX_AGE_SEC = 7 * 24 * 60 * 60;

/**
 * 仅在真实 HTTPS 时加 Secure。
 * 不能用 NODE_ENV=production 判断：Docker/本机常用 HTTP 跑 production，
 * Secure Cookie 会被浏览器直接丢弃，刷新后 /auth/me 无 Cookie → 看起来像登录失效。
 */
function shouldUseSecureCookie(req?: Request): boolean {
  const force = String(process.env.COOKIE_SECURE || '').trim().toLowerCase();
  if (force === '1' || force === 'true' || force === 'yes') return true;
  if (force === '0' || force === 'false' || force === 'no') return false;

  const xf = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (xf === 'https') return true;
  if (xf === 'http') return false;

  return Boolean(req?.secure);
}

function cookieFlags(maxAgeSec: number, req?: Request) {
  const secure = shouldUseSecureCookie(req) ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function setAuthCookie(res: Response, token: string, req?: Request) {
  res.append(
    'Set-Cookie',
    `${AUTH_COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(MAX_AGE_SEC, req)}`,
  );
}

export function clearAuthCookie(res: Response, req?: Request) {
  res.append('Set-Cookie', `${AUTH_COOKIE}=; ${cookieFlags(0, req)}`);
}

/** 从 Cookie 头解析 JWT（不依赖 cookie-parser） */
export function readAuthCookie(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === AUTH_COOKIE) {
      const v = rest.join('=').trim();
      if (!v) return null;
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return null;
}
