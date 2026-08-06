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
import { favouritesRouter } from './favourites';
import { geocodeRouter } from './geocode';
import { deeplinksRouter } from './deeplinks';
import { notificationsRouter, scheduled } from './notifications';

const app = new Hono<{ Bindings: Env }>();

app.all('/api/auth/*', (c) => {
  const auth = createAuth(neon(c.env.DATABASE_URL), { baseURL: c.env.BETTER_AUTH_URL });
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
app.route('/api/favourites', favouritesRouter);
app.route('/api/geocode', geocodeRouter);
app.route('/api/notifications', notificationsRouter);
app.route('/', deeplinksRouter);

// GET /api/images/:key — serve R2 images through the Worker.
// Replace with a public R2 domain once the bucket has one configured.
app.get('/api/images/*', async (c) => {
  const key = c.req.path.replace('/api/images/', '');
  const obj = await c.env.SPOTSEEK_IMAGES.get(key);
  if (!obj) return c.json({ error: 'Not found' }, 404);
  const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
  return new Response(obj.body, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000' } });
});

app.get('/', (c) => c.json({ status: 'ok', name: 'spot-seek-api' }));

export default { fetch: app.fetch, scheduled };

// Required by Wrangler for DO binding resolution (does not affect test isolation).
export { ChatRoom } from './chat-room';

