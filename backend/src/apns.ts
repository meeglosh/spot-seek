/**
 * Direct APNs sender (no Expo push service). Native device tokens registered
 * via POST /api/push/tokens are pushed to over HTTP/2 using a provider JWT
 * (ES256, signed with WebCrypto from the .p8 key in secret APNS_KEY_P8).
 *
 * Graceful unconfigured mode (mirrors RESEND_API_KEY / STRIPE_*): without
 * APNS_KEY_P8 every send is a no-op with a log line.
 *
 * notify() has no env/ctx, so index.ts calls `configureApns(env, ctx)` at the
 * start of every request and cron run (same pattern as email-guard.ts).
 */
import type { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import type { PushEnvironment } from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type ApnsEnv = {
  DATABASE_URL?: string;
  APNS_KEY_P8?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_TOPIC?: string;
};

type WaitUntil = (p: Promise<unknown>) => void;

export type ApnsConfig = {
  keyP8?: string;
  keyId?: string;
  teamId?: string;
  topic?: string;
};

let config: ApnsConfig = {};
let waitUntil: WaitUntil | null = null;
const pending = new Set<Promise<unknown>>();

export function configureApns(env: ApnsEnv, ctx?: { waitUntil(p: Promise<unknown>): void } | null): void {
  config = { keyP8: env.APNS_KEY_P8, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, topic: env.APNS_TOPIC };
  waitUntil = ctx ? (p) => ctx.waitUntil(p) : null;
}

/** Test hook: awaits every in-flight background push. */
export async function __flushPush(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}

export function apnsConfigured(cfg: ApnsConfig = config): boolean {
  return !!(cfg.keyP8 && cfg.keyId && cfg.teamId && cfg.topic);
}

// ─── Provider JWT ─────────────────────────────────────────────────────────────

const JWT_TTL_MS = 50 * 60 * 1000; // APNs rejects tokens older than 60 min

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function signApnsJwt(
  cfg: { keyP8: string; keyId: string; teamId: string },
  nowMs = Date.now(),
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(cfg.keyP8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(nowMs / 1000) }));
  const signingInput = `${header}.${claims}`;
  // WebCrypto ECDSA output is raw r||s (IEEE P1363) — exactly what JWS ES256 wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(sig)}`;
}

let jwtCache: { jwt: string; cacheKey: string; at: number } | null = null;

async function providerJwt(cfg: ApnsConfig, force = false): Promise<string> {
  const cacheKey = `${cfg.keyId}:${cfg.teamId}`;
  if (!force && jwtCache && jwtCache.cacheKey === cacheKey && Date.now() - jwtCache.at < JWT_TTL_MS) {
    return jwtCache.jwt;
  }
  const jwt = await signApnsJwt({ keyP8: cfg.keyP8!, keyId: cfg.keyId!, teamId: cfg.teamId! });
  jwtCache = { jwt, cacheKey, at: Date.now() };
  return jwt;
}

export function __resetApnsJwtCache(): void {
  jwtCache = null;
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export type PushPayload = { title: string; body: string; eventId?: string; type?: string };
export type ApnsResult = { status: number; reason?: string };

const HOSTS: Record<PushEnvironment, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

export async function sendApns(
  token: string,
  environment: PushEnvironment,
  payload: PushPayload,
  cfg: ApnsConfig = config,
): Promise<ApnsResult> {
  const post = async (jwt: string) =>
    fetch(`${HOSTS[environment]}/3/device/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': cfg.topic!,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
        ...(payload.eventId ? { eventId: payload.eventId } : {}),
        ...(payload.type ? { type: payload.type } : {}),
      }),
    });

  let res = await post(await providerJwt(cfg));
  if (res.status === 403) {
    // ExpiredProviderToken (clock skew / stale cache): refresh once and retry.
    const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason;
    if (reason === 'ExpiredProviderToken') {
      res = await post(await providerJwt(cfg, true));
    } else {
      return { status: 403, reason };
    }
  }
  if (res.status === 200) return { status: 200 };
  const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason;
  return { status: res.status, reason };
}

export function shouldDeleteToken(r: ApnsResult): boolean {
  return r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered';
}

/** Push to every registered device of a user; prunes dead tokens. Never throws. */
export async function pushToUser(db: Db, userId: string, payload: PushPayload): Promise<void> {
  if (!apnsConfigured()) {
    console.log(`[apns] APNS_KEY_P8 (or key id/team/topic) not configured — push skipped user=${userId}`);
    return;
  }
  try {
    const tokens = await db.query.pushTokens.findMany({ where: eq(schema.pushTokens.userId, userId) });
    await Promise.all(
      tokens.map(async (t) => {
        try {
          const r = await sendApns(t.token, t.environment, payload);
          if (shouldDeleteToken(r)) {
            await db.delete(schema.pushTokens).where(eq(schema.pushTokens.token, t.token));
            console.log(`[apns] removed dead token (${r.status} ${r.reason ?? ''})`);
          } else if (r.status !== 200) {
            console.error(`[apns] push failed status=${r.status} reason=${r.reason ?? ''}`);
          }
        } catch (err) {
          console.error('[apns] push error:', err);
        }
      }),
    );
  } catch (err) {
    console.error('[apns] pushToUser failed:', err);
  }
}

/** Fire-and-forget: registers with waitUntil when available. */
export function schedulePush(p: Promise<unknown>): void {
  const tracked = p.catch(() => {}).finally(() => pending.delete(tracked));
  pending.add(tracked);
  try {
    waitUntil?.(tracked);
  } catch {
    // stale/finished execution context — the promise still runs, just untracked
  }
}
