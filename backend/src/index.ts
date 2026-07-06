import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { createAuth } from './auth';
import { eventsRouter } from './events';
import { feedRouter } from './feed';
import { rsvpsRouter } from './rsvps';
import { dashboardRouter } from './dashboard';
import { remindersRouter } from './reminders';
import { profilesRouter } from './profiles';
import { chatRouter } from './chat';
import { adminRouter } from './admin';
import { sponsorsRouter } from './sponsors';

const app = new Hono<{ Bindings: Env }>();

app.all('/api/auth/*', (c) => {
  const auth = createAuth(neon(c.env.DATABASE_URL));
  return auth.handler(c.req.raw);
});

app.route('/api/events', eventsRouter);
app.route('/api/feed', feedRouter);
app.route('/api/rsvps', rsvpsRouter);
app.route('/api/dashboard', dashboardRouter);
app.route('/api/reminders', remindersRouter);
app.route('/api/profiles', profilesRouter);
app.route('/api/chat', chatRouter);
app.route('/api/admin', adminRouter);
app.route('/api/sponsors', sponsorsRouter);

app.get('/', (c) => c.json({ status: 'ok', name: 'spot-seek-api' }));

export default app;

// Required by Wrangler for DO binding resolution (does not affect test isolation).
export { ChatRoom } from './chat-room';

