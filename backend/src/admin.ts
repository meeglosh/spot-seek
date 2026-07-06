/**
 * Admin endpoints (task 2.4 — host verification).
 * Protected by a Bearer token (ADMIN_SECRET wrangler secret).
 * Intentionally minimal: the full KYC/verification flow is a product decision
 * outside this scaffold.
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

type AppEnv = { Bindings: Env };

export const adminRouter = new Hono<AppEnv>();

// Bearer token auth: Authorization: Bearer <ADMIN_SECRET>
adminRouter.use('*', async (c, next) => {
  const secret = c.env.ADMIN_SECRET;
  if (!secret) return c.json({ error: 'Admin not configured' }, 503);
  const auth = c.req.header('Authorization') ?? '';
  if (auth !== `Bearer ${secret}`) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});

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
