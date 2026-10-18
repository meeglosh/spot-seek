/**
 * Admin endpoints (task 2.4 — host verification).
 * Protected by a Bearer token (ADMIN_SECRET wrangler secret).
 * Intentionally minimal: the full KYC/verification flow is a product decision
 * outside this scaffold.
 */
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { bufferToHex, timingSafeEqualHex } from './stripe';
import { landingHealth } from './landing-calendar';
import { moderationAdminRouter } from './moderation/admin';
import { recordAdminLoginFailure } from './moderation/admin-login-failures';
import { allowRequest, tooManyRequests, AUTH_LIMIT_PER_MIN } from './ratelimit';

type AppEnv = { Bindings: Env };

export const adminRouter = new Hono<AppEnv>();

// Constant-time check of `Authorization: Bearer <ADMIN_SECRET>`. Both sides are
// SHA-256 digested first so the compared strings are always the same length
// (no length leak) and then compared with a timing-safe loop.
async function sha256Hex(value: string): Promise<string> {
  return bufferToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function isAdminAuthorized(env: Env, authHeader: string | undefined): Promise<boolean> {
  const secret = env.ADMIN_SECRET;
  if (!secret) return false;
  const [a, b] = await Promise.all([sha256Hex(authHeader ?? ''), sha256Hex(`Bearer ${secret}`)]);
  return timingSafeEqualHex(a, b);
}

// Rate-limited bearer check (same limiter and failure alert as the login page).
// Call only when an Authorization header is present. 'limited' = over the per-IP
// limit (checked before the secret so guessing is throttled); 'denied' = wrong
// secret, recorded as a failure (alert at 5/hour) unless opts.recordFailure is
// false. Successes are not counted.
export async function checkAdminBearer(
  env: Env,
  headers: { header(name: string): string | undefined },
  opts: { recordFailure?: boolean } = {},
): Promise<'ok' | 'denied' | 'limited'> {
  const ip = headers.header('cf-connecting-ip') ?? 'unknown';
  if (!(await allowRequest(env.AUTH_LIMITER, `admin-bearer:${ip}`, AUTH_LIMIT_PER_MIN))) return 'limited';
  if (await isAdminAuthorized(env, headers.header('Authorization'))) return 'ok';
  if (opts.recordFailure !== false) await recordAdminLoginFailure(env, ip);
  return 'denied';
}

// Reusable middleware: 503 when ADMIN_SECRET is not configured, 401 otherwise
// unless the bearer matches (429 past the per-IP limit). Also guards the manual
// job triggers (/api/payments/run-sweeps, /api/notifications/run-reminders|run-reviews).
export async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  if (!c.env.ADMIN_SECRET) return c.json({ error: 'Admin not configured' }, 503);
  if (!c.req.header('Authorization')) return c.json({ error: 'Unauthorized' }, 401);
  const result = await checkAdminBearer(c.env, c.req);
  if (result === 'limited') return tooManyRequests();
  if (result === 'denied') return c.json({ error: 'Unauthorized' }, 401);
  await next();
}

adminRouter.use('*', requireAdmin);

// Event moderation review: /api/admin/moderation/{queue,events/:id/restore,events/:id/remove}.
adminRouter.route('/moderation', moderationAdminRouter);

// GET /api/admin/landing-health: runway of the landing page's curated calendar (no side effects).
adminRouter.get('/landing-health', (c) => c.json(landingHealth(new Date())));

// Allowlist of users columns returned by verify/unverify (never the whole row:
// it carries email, location and Stripe fields). Same set as publicUserColumns.
const publicUserReturning = {
  id: schema.users.id,
  displayName: schema.users.displayName,
  avatarUrl: schema.users.avatarUrl,
  isVerified: schema.users.isVerified,
  createdAt: schema.users.createdAt,
};

// POST /api/admin/verify/:userId — mark a host as verified.
adminRouter.post('/verify/:userId', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, c.req.param('userId')),
  });
  if (!user) return c.json({ error: 'User not found' }, 404);

  const [updated] = await db
    .update(schema.users)
    .set({ isVerified: true, updatedAt: new Date() })
    .where(eq(schema.users.id, c.req.param('userId')))
    .returning(publicUserReturning);

  return c.json({ user: updated });
});

// POST /api/admin/unverify/:userId — revoke verification.
adminRouter.post('/unverify/:userId', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const [updated] = await db
    .update(schema.users)
    .set({ isVerified: false, updatedAt: new Date() })
    .where(eq(schema.users.id, c.req.param('userId')))
    .returning(publicUserReturning);

  if (!updated) return c.json({ error: 'User not found' }, 404);
  return c.json({ user: updated });
});
