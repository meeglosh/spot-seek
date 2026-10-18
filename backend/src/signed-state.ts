/**
 * Small HMAC-signed, expiring state tokens for public links that must carry
 * server-verifiable context (e.g. Stripe's onboarding refresh_url, which opens
 * in a bare browser with no session). Format: `<exp>.<payloadB64url>.<hmac>`
 * where exp is unix seconds. The key and the MAC input are both bound to
 * `purpose`, so a token minted for one purpose never verifies for another.
 * Modeled on signAdminSession/verifyAdminSession (moderation/admin-page.ts).
 */
import { bufferToHex, timingSafeEqualHex } from './stripe';

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(v: string): Uint8Array {
  const b64 = v.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (v.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function hmacHex(secret: string, purpose: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`spotseek-signed-state-v1|${purpose}|${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bufferToHex(await crypto.subtle.sign('HMAC', key, enc.encode(`${purpose}|${message}`)));
}

export async function signState(
  secret: string,
  purpose: string,
  payload: unknown,
  expSeconds: number,
  now = Date.now(),
): Promise<string> {
  const exp = Math.floor(now / 1000) + expSeconds;
  const body = `${exp}.${b64urlEncode(enc.encode(JSON.stringify(payload)))}`;
  return `${body}.${await hmacHex(secret, purpose, body)}`;
}

/** Returns the payload, or null if the token is malformed, tampered, expired or for another purpose. */
export async function verifyState<T = unknown>(
  secret: string,
  purpose: string,
  token: string | undefined | null,
  now = Date.now(),
): Promise<T | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [exp, body, sig] = parts;
  if (!/^\d+$/.test(exp) || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[0-9a-f]+$/.test(sig)) return null;
  const expected = await hmacHex(secret, purpose, `${exp}.${body}`);
  if (!timingSafeEqualHex(expected, sig)) return null;
  if (Number(exp) <= Math.floor(now / 1000)) return null;
  try {
    return JSON.parse(dec.decode(b64urlDecode(body))) as T;
  } catch {
    return null;
  }
}
