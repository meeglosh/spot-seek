import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';

type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const favouritesRouter = new Hono<AppEnv>();

favouritesRouter.use('*', async (c, next) => {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', session.user.id);
  await next();
});

// GET /api/favourites — list all favourites for the current user.
favouritesRouter.get('/', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const favs = await db.query.userFavourites.findMany({
    where: eq(schema.userFavourites.userId, c.get('userId')),
    orderBy: schema.userFavourites.createdAt,
  });
  return c.json({ favourites: favs });
});

// POST /api/favourites — add a favourite.
favouritesRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const { type, value, sport } = await c.req.json<{ type?: string; value?: string; sport?: string }>();

  if (!type || !value) return c.json({ error: 'type and value are required' }, 400);
  if (!['sport', 'team', 'venue'].includes(type)) return c.json({ error: 'type must be sport, team, or venue' }, 400);

  const [fav] = await db
    .insert(schema.userFavourites)
    .values({ userId, type, value, sport: sport ?? null })
    .onConflictDoNothing()
    .returning();

  return c.json({ favourite: fav ?? null }, 201);
});

// DELETE /api/favourites — remove a favourite by type + value.
favouritesRouter.delete('/', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const { type, value } = await c.req.json<{ type?: string; value?: string }>();

  if (!type || !value) return c.json({ error: 'type and value are required' }, 400);

  await db.delete(schema.userFavourites).where(
    and(
      eq(schema.userFavourites.userId, userId),
      eq(schema.userFavourites.type, type),
      eq(schema.userFavourites.value, value),
    ),
  );
  return c.json({ removed: true });
});

// PUT /api/favourites/bulk — replace all favourites (used by onboarding).
favouritesRouter.put('/bulk', async (c) => {
  const userId = c.get('userId');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const { favourites } = await c.req.json<{
    favourites: Array<{ type: string; value: string; sport?: string }>;
  }>();

  // Delete existing, then insert new set.
  await db.delete(schema.userFavourites).where(eq(schema.userFavourites.userId, userId));
  if (favourites.length > 0) {
    await db.insert(schema.userFavourites).values(
      favourites.map((f) => ({ userId, type: f.type, value: f.value, sport: f.sport ?? null })),
    );
  }
  const saved = await db.query.userFavourites.findMany({
    where: eq(schema.userFavourites.userId, userId),
  });
  return c.json({ favourites: saved });
});
