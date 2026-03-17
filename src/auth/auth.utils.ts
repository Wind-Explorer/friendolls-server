import { createHash, randomBytes } from 'crypto';
import type { SsoProvider } from './dto/sso-provider';

export function randomOpaqueToken(size = 32): string {
  return randomBytes(size).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function isLoopbackRedirect(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      ['127.0.0.1', 'localhost'].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function asProviderName(value: SsoProvider): 'GOOGLE' | 'DISCORD' {
  return value === 'google' ? 'GOOGLE' : 'DISCORD';
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
