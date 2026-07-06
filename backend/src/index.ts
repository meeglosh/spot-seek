import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { createAuth } from './auth';
import { eventsRouter } from './events';
import { feedRouter } from './feed';

const app = new Hono<{ Bindings: Env }>();

app.on(['GET', 'POST'], '/api/auth/**', (c) => {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  return auth.handler(c.req.raw);
});

// Hono's app.route() strips /api/events from the path before the sub-router sees it.
app.route('/api/events', eventsRouter);
app.route('/api/feed', feedRouter);

app.get('/', (c) => c.json({ status: 'ok', name: 'spot-seek-api' }));

export default app;
