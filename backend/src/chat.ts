/**
 * Event chat / comments (task 2.2).
 * HTTP polling baseline — realtime transport (Cloudflare Durable Objects) is
 * BLOCKED.md until the stack choice is made. Adding WebSocket upgrade on top
 * of these endpoints won't break the REST interface.
 */
import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, asc } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';
export { ChatRoom } from './chat-room';

type AppEnv = { Bindings: Env; Variables: { userId: string } };

export const chatRouter = new Hono<AppEnv>();

// Auth required for posting; reading is open so attendees can preview before RSVP.
chatRouter.use('*', async (c, next) => {
  try {
    const auth = createAuth(neon(c.env.DATABASE_URL));
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) c.set('userId', session.user.id);
  } catch {
    // Unauthenticated reads are allowed.
  }
  await next();
});

// GET /api/chat/:eventId — list comments for an event.
chatRouter.get('/:eventId', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, c.req.param('eventId')),
  });
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const comments = await db.query.comments.findMany({
    where: eq(schema.comments.eventId, c.req.param('eventId')),
    orderBy: asc(schema.comments.createdAt),
  });
  return c.json({ comments });
});

// POST /api/chat/:eventId — post a comment.
chatRouter.post('/:eventId', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, c.req.param('eventId')),
  });
  if (!event) return c.json({ error: 'Event not found' }, 404);

  const { body } = await c.req.json<{ body?: string }>();
  if (!body?.trim()) return c.json({ error: 'body is required' }, 400);

  const [comment] = await db
    .insert(schema.comments)
    .values({ eventId: c.req.param('eventId'), userId, body: body.trim() })
    .returning();

  return c.json({ comment }, 201);
});

// GET /api/chat/:eventId/ws — WebSocket upgrade, forwarded to ChatRoom DO.
chatRouter.get('/:eventId/ws', async (c) => {
  const eventId = c.req.param('eventId');
  // Resolve authenticated userId from session (anonymous allowed as fallback).
  let userId = 'anonymous';
  try {
    const auth = createAuth(neon(c.env.DATABASE_URL));
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) userId = session.user.id;
  } catch { /* anonymous */ }

  const id = c.env.CHAT_ROOMS.idFromName(eventId);
  const stub = c.env.CHAT_ROOMS.get(id);
  const url = new URL(c.req.url);
  url.searchParams.set('eventId', eventId);
  url.searchParams.set('userId', userId);
  return stub.fetch(new Request(url.toString(), c.req.raw));
});

// DELETE /api/chat/:eventId/:commentId — delete own comment or host deletes any.
chatRouter.delete('/:eventId/:commentId', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const comment = await db.query.comments.findFirst({
    where: eq(schema.comments.id, c.req.param('commentId')),
  });
  if (!comment) return c.json({ error: 'Not found' }, 404);

  // Allow author or event host to delete.
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, c.req.param('eventId')),
  });
  const isHost = event?.hostId === userId;
  const isAuthor = comment.userId === userId;
  if (!isHost && !isAuthor) return c.json({ error: 'Forbidden' }, 403);

  await db.delete(schema.comments).where(
    and(
      eq(schema.comments.id, c.req.param('commentId')),
      eq(schema.comments.eventId, c.req.param('eventId')),
    ),
  );
  return c.json({ deleted: true });
});
