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
import { webRsvpRouter } from './webrsvp';
import { configurePublicBaseUrl } from './email';
import { notificationsRouter, scheduled as notificationsScheduled } from './notifications';
import { reviewsRouter } from './reviews';
import { allowRequest, tooManyRequests, AUTH_LIMIT_PER_MIN } from './ratelimit';
import { EMAIL_LOGO_PNG_BASE64 } from './email-logo';
import { accountRouter } from './account';
import { passwordResetRouter, sendResetEmail } from './password-reset';
import { paymentsRouter, onboardPagesRouter, runPaymentSweeps } from './payments';

const app = new Hono<{ Bindings: Env }>();

// Public base URL (PUBLIC_BASE_URL var) used by every outward-facing link.
app.use('*', async (c, next) => {
  configurePublicBaseUrl(c.env.PUBLIC_BASE_URL);
  await next();
});

// Sign-up / sign-in / forgot-password requests are rate limited per client IP (10/min). This is a
// guard in front of Better Auth's handler — Better Auth's own config is untouched.
// cf-connecting-ip is always set by Cloudflare at the edge (and overwritten if a
// client sends it); when absent (local/test harness) there is no IP to key on.
const AUTH_RATE_LIMITED = /^\/api\/auth\/(sign-up|sign-in|request-password-reset)(\/|$)/;

app.all('/api/auth/*', async (c) => {
  if (c.req.method === 'POST' && AUTH_RATE_LIMITED.test(c.req.path)) {
    const ip = c.req.header('cf-connecting-ip');
    if (ip && !(await allowRequest(c.env.AUTH_LIMITER, `auth:${ip}`, AUTH_LIMIT_PER_MIN))) {
      return tooManyRequests();
    }
  }
  const auth = createAuth(neon(c.env.DATABASE_URL), {
    baseURL: c.env.BETTER_AUTH_URL,
    // Send the reset email in the background so the response time is the same
    // for known and unknown emails (no account enumeration via timing).
    sendResetPassword: async ({ user, token }) => {
      const send = sendResetEmail(c.env, user, token).catch((err) =>
        console.error('[auth] reset email failed:', err),
      );
      try {
        c.executionCtx.waitUntil(send);
      } catch {
        await send; // no execution context (should not happen on Workers)
      }
    },
  });
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
app.route('/api/reviews', reviewsRouter);
app.route('/api/payments', paymentsRouter);
app.route('/api/account', accountRouter);
app.route('/payments', onboardPagesRouter);
app.route('/', passwordResetRouter);
app.route('/', webRsvpRouter);
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

// Public logo used by transactional emails (derived from app/assets/icon.png).
app.get('/static/email-logo.png', () => {
  const bin = atob(EMAIL_LOGO_PNG_BASE64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
});

app.get('/', (c) => c.json({ status: 'ok', name: 'spot-seek-api' }));

// Combines the notifications sweep (reminders/reviews) with the payments
// sweep (release/refund) into a single cron handler.
async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  configurePublicBaseUrl(env.PUBLIC_BASE_URL);
  await notificationsScheduled(controller, env);
  await runPaymentSweeps(env);
}

export default { fetch: app.fetch, scheduled };

// Required by Wrangler for DO binding resolution (does not affect test isolation).
export { ChatRoom } from './chat-room';

