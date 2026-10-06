/**
 * Push token registration (native APNs device tokens; see apns.ts).
 *   POST   /api/push/tokens          { token, environment? } -> upsert for the session user
 *   DELETE /api/push/tokens/:token   remove the caller's token (sign-out / opt-out)
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';

type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const pushRouter = new Hono<AppEnv>();

pushRouter.use('*', async (c, next) => {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
});

// APNs device tokens are hex strings (32 bytes today, up to 100 bytes allowed).
const TOKEN_RE = /^[0-9a-fA-F]{32,200}$/;

pushRouter.post('/tokens', async (c) => {
  const userId = c.get('userId');
  const body = await c.req
    .json<{ token?: unknown; environment?: unknown; platform?: unknown }>()
    .catch(() => ({}) as { token?: unknown; environment?: unknown; platform?: unknown });
  if (typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) {
    return c.json({ error: 'invalid_token' }, 400);
  }
  const token = body.token.toLowerCase();
  const environment: schema.PushEnvironment = body.environment === 'sandbox' ? 'sandbox' : 'production';

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  // Idempotent: the token is globally unique; re-registering (same or another
  // user on a shared device) re-points the row and bumps last_seen_at.
  await db
    .insert(schema.pushTokens)
    .values({ userId, token, platform: 'ios', environment })
    .onConflictDoUpdate({
      target: schema.pushTokens.token,
      set: { userId, environment, lastSeenAt: new Date() },
    });
  return c.json({ ok: true });
});

pushRouter.delete('/tokens/:token', async (c) => {
  const userId = c.get('userId');
  const token = c.req.param('token').toLowerCase();
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  await db
    .delete(schema.pushTokens)
    .where(and(eq(schema.pushTokens.token, token), eq(schema.pushTokens.userId, userId)));
  return c.json({ ok: true });
});
