import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import * as schema from './schema';
import { isPlaceholderUserId } from './deleted-users';
import { createAuth } from './auth';

type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const profilesRouter = new Hono<AppEnv>();

// Explicit allowlist of user columns visible to other people. Never serialize the
// whole users row: it carries email, last-known location and Stripe account data.
const publicUserColumns = {
  id: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
  createdAt: true,
} as const;

// Auth middleware — required for follow/unfollow; optional for public profile reads.
profilesRouter.use('*', async (c, next) => {
  try {
    const auth = createAuth(neon(c.env.DATABASE_URL));
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) c.set('userId', session.user.id);
  } catch {
    // Unauthenticated — read-only routes still work.
  }
  await next();
});

// GET /api/profiles/:id — public user profile.
profilesRouter.get('/:id', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, c.req.param('id')),
    columns: publicUserColumns,
  });
  if (!user || isPlaceholderUserId(user.id)) return c.json({ error: 'Not found' }, 404);

  return c.json({ user });
});

// POST /api/profiles/:id/follow — follow a user.
profilesRouter.post('/:id/follow', async (c) => {
  const followerId = c.get('userId');
  if (!followerId) return c.json({ error: 'Unauthorized' }, 401);

  const followingId = c.req.param('id');
  if (followingId === followerId) return c.json({ error: 'Cannot follow yourself' }, 400);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const target = await db.query.users.findFirst({ where: eq(schema.users.id, followingId) });
  if (!target) return c.json({ error: 'User not found' }, 404);

  await db.insert(schema.follows).values({ followerId, followingId }).onConflictDoNothing();
  return c.json({ followed: true }, 201);
});

// DELETE /api/profiles/:id/follow — unfollow a user.
profilesRouter.delete('/:id/follow', async (c) => {
  const followerId = c.get('userId');
  if (!followerId) return c.json({ error: 'Unauthorized' }, 401);

  const followingId = c.req.param('id');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  await db
    .delete(schema.follows)
    .where(
      and(eq(schema.follows.followerId, followerId), eq(schema.follows.followingId, followingId)),
    );
  return c.json({ unfollowed: true });
});

// GET /api/profiles/:id/followers — list of followers.
profilesRouter.get('/:id/followers', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const rows = await db.query.follows.findMany({
    where: eq(schema.follows.followingId, c.req.param('id')),
    with: { follower: { columns: publicUserColumns } },
  });
  const followers = rows.map((r) => r.follower);
  return c.json({ followers });
});

// GET /api/profiles/:id/following — list of users this person follows.
profilesRouter.get('/:id/following', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const rows = await db.query.follows.findMany({
    where: eq(schema.follows.followerId, c.req.param('id')),
    with: { following: { columns: publicUserColumns } },
  });
  const following = rows.map((r) => r.following);
  return c.json({ following });
});
