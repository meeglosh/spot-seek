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

// Reusable middleware: 503 when ADMIN_SECRET is not configured, 401 otherwise
// unless the bearer matches. Also guards the manual job triggers
// (/api/payments/run-sweeps, /api/notifications/run-reminders|run-reviews).
export async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  if (!c.env.ADMIN_SECRET) return c.json({ error: 'Admin not configured' }, 503);
  if (!(await isAdminAuthorized(c.env, c.req.header('Authorization')))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
}

adminRouter.use('*', requireAdmin);

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
    .returning();

  return c.json({ user: updated });
});

// POST /api/admin/unverify/:userId — revoke verification.
adminRouter.post('/unverify/:userId', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const [updated] = await db
    .update(schema.users)
    .set({ isVerified: false, updatedAt: new Date() })
    .where(eq(schema.users.id, c.req.param('userId')))
    .returning();

  if (!updated) return c.json({ error: 'User not found' }, 404);
  return c.json({ user: updated });
});
