import * as speakeasy from 'speakeasy';
import QRCode from 'qrcode';

const ISSUER = 'AIGC 视频工厂';

export function generateTotpSecret() {
  const generated = speakeasy.generateSecret({
    length: 20,
    name: ISSUER,
  });
  return String(generated.base32 || '').trim();
}

export function totpKeyUri(username: string, secret: string) {
  const label = String(username || 'user').trim() || 'user';
  return speakeasy.otpauthURL({
    secret: String(secret || '').trim(),
    label: `${ISSUER}:${label}`,
    issuer: ISSUER,
    encoding: 'base32',
  });
}

export async function totpQrDataUrl(otpauthUrl: string) {
  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
    color: { dark: '#111111', light: '#ffffff' },
  });
}

export function verifyTotpCode(secret: string, code: string) {
  const token = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  const sec = String(secret || '').trim();
  if (!sec) return false;
  try {
    return speakeasy.totp.verify({
      secret: sec,
      encoding: 'base32',
      token,
      window: 1,
    });
  } catch {
    return false;
  }
}
