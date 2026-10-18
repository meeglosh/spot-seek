import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import * as Sentry from '@sentry/cloudflare';
import { neon } from '@neondatabase/serverless';
import { createAuth, setAuthBaseURL } from './auth';
import { eventsRouter } from './events';
import { feedRouter } from './feed';
import { rsvpsRouter } from './rsvps';
import { dashboardRouter } from './dashboard';
import { remindersRouter } from './reminders';
import { profilesRouter } from './profiles';
import { chatRouter } from './chat';
import { adminRouter } from './admin';
import { adminPageRouter } from './moderation/admin-page';
import { sponsorsRouter } from './sponsors';
import { favouritesRouter } from './favourites';
import { geocodeRouter } from './geocode';
import { deeplinksRouter } from './deeplinks';
import { webRsvpRouter } from './webrsvp';
import { configurePublicBaseUrl, publicBaseUrl } from './email';
import { renderHomePage } from './homepage';
import { warnIfLandingLow } from './landing-calendar';
import { configureEmailGuard } from './email-guard';
import { configureApns } from './apns';
import { pushRouter } from './push';
import { notificationsRouter, scheduled as notificationsScheduled } from './notifications';
import { reviewsRouter } from './reviews';
import { allowRequest, tooManyRequests, AUTH_LIMIT_PER_MIN } from './ratelimit';
import { EMAIL_LOGO_PNG_BASE64 } from './email-logo';
import { accountRouter } from './account';
import { passwordResetRouter, sendResetEmail } from './password-reset';
import { reportRouter, blocksRouter } from './moderation/routes';
import { runModerationDigest } from './moderation/admin';
import { renderGuidelinesPage } from './guidelines';
import { renderPrivacyPage, renderTermsPage } from './legal';
import { paymentsRouter, onboardPagesRouter, runPaymentSweeps } from './payments';
import { sentryOptions } from './sentry';

const app = new Hono<{ Bindings: Env }>();

// Same responses as Hono's built-in handler (HTTPException -> its own response,
// anything else -> 500 "Internal Server Error"), plus a Sentry report for the
// unhandled ones. Without this Hono swallows the error and Sentry never sees it.
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  Sentry.captureException(err);
  console.error(err);
  return c.text('Internal Server Error', 500);
});

// www.spotseek.app -> apex (301, path + query preserved). Runs before everything
// else. The AASA file is exempt so Apple's CDN never follows a redirect on either host.
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname === 'www.spotseek.app' && url.pathname !== '/.well-known/apple-app-site-association') {
    return c.redirect(`https://spotseek.app${url.pathname}${url.search}`, 301);
  }
  await next();
});

// Public base URL (PUBLIC_BASE_URL var) used by every outward-facing link.
app.use('*', async (c, next) => {
  configurePublicBaseUrl(c.env.PUBLIC_BASE_URL);
  configureEmailGuard(c.env);
  setAuthBaseURL(c.env.BETTER_AUTH_URL);
  try { configureApns(c.env, c.executionCtx); } catch { configureApns(c.env); }
  await next();
});

// Sign-up / sign-in / forgot-password requests are rate limited per client IP (10/min). This is a
// guard in front of Better Auth's handler — Better Auth's own config is untouched.
// cf-connecting-ip is always set by Cloudflare at the edge (and overwritten if a
// client sends it); when absent (local/test harness) there is no IP to key on.
const AUTH_RATE_LIMITED = /^\/api\/auth\/(sign-up|sign-in|request-password-reset)(\/|$)/;

// The native app authenticates with a bearer token, but iOS/Android HTTP stacks keep a
// cookie jar and replay Better Auth's Set-Cookie on later requests. Better Auth's CSRF
// check rejects any cookie-bearing request without a trusted Origin, which would 403
// the app (e.g. sign-out). CSRF is a browser-only attack and browsers always send
// Origin/Referer/Sec-Fetch-* on cross-site POSTs, so a request with none of them is
// not a browser: drop its Cookie header and let the bearer token authenticate it.
// Browser requests are untouched and still fully CSRF-checked.
function stripCookiesFromNonBrowserRequest(req: Request): Request {
  const h = req.headers;
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return req;
  if (!h.has('cookie')) return req;
  if (h.has('origin') || h.has('referer') || h.has('sec-fetch-site') || h.has('sec-fetch-mode') || h.has('sec-fetch-dest')) return req;
  const headers = new Headers(h);
  headers.delete('cookie');
  return new Request(req, { headers });
}

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
  return auth.handler(stripCookiesFromNonBrowserRequest(c.req.raw));
});

app.route('/api/events', eventsRouter);
app.route('/api/events', reportRouter);
app.route('/api/users', blocksRouter);
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
app.route('/api/push', pushRouter);
app.route('/payments', onboardPagesRouter);
app.route('/', passwordResetRouter);
app.route('/admin', adminPageRouter);
app.route('/', webRsvpRouter);
app.route('/', deeplinksRouter);

const IMAGE_SERVE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']);

// GET /api/images/:key — serve R2 images through the Worker.
// Replace with a public R2 domain once the bucket has one configured.
app.get('/api/images/*', async (c) => {
  const key = c.req.path.replace('/api/images/', '');
  const obj = await c.env.SPOTSEEK_IMAGES.get(key);
  if (!obj) return c.json({ error: 'Not found' }, 404);
  // Never echo a stored Content-Type (objects may predate upload validation):
  // only raster types are served inline; anything else is a forced download.
  const stored = obj.httpMetadata?.contentType?.toLowerCase();
  const safe = stored !== undefined && IMAGE_SERVE_TYPES.has(stored);
  const headers: Record<string, string> = {
    'Content-Type': safe ? stored : 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'public, max-age=31536000',
  };
  if (!safe) headers['Content-Disposition'] = 'attachment';
  return new Response(obj.body, { headers });
});

// Public logo used by transactional emails (derived from app/assets/icon.png).
app.get('/static/email-logo.png', () => {
  const bin = atob(EMAIL_LOGO_PNG_BASE64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
});

app.get('/health', (c) => c.json({ status: 'ok', name: 'spot-seek-api' }));

app.get('/', (c) =>
  c.html(renderHomePage({ baseUrl: publicBaseUrl(c.env) }), 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  }),
);

// Community guidelines (Apple 1.2: published contact info + what is not allowed).
app.get('/guidelines', (c) =>
  c.html(renderGuidelinesPage({ baseUrl: publicBaseUrl(c.env) }), 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  }),
);

// Draft legal pages (owner review before launch). Needed for TestFlight external testing.
app.get('/privacy', (c) =>
  c.html(renderPrivacyPage({ baseUrl: publicBaseUrl(c.env) }), 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  }),
);
app.get('/terms', (c) =>
  c.html(renderTermsPage({ baseUrl: publicBaseUrl(c.env) }), 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  }),
);

// Combines the notifications sweep (reminders/reviews) with the payments
// sweep (release/refund) into a single cron handler.
async function scheduled(controller: ScheduledController, env: Env, ctx?: ExecutionContext): Promise<void> {
  configurePublicBaseUrl(env.PUBLIC_BASE_URL);
  configureEmailGuard(env);
  configureApns(env, ctx);
  // Landing calendar runway check, once a day (the 13:00 UTC run). Logs only; never emails.
  const at = new Date(controller.scheduledTime);
  const dailyTick = at.getUTCHours() === 13 && at.getUTCMinutes() < 15;
  if (dailyTick) warnIfLandingLow(at);
  // Moderation digest: one email to hello@ if the review queue is non-empty (guarded send, once per UTC day).
  if (dailyTick) await runModerationDigest(env, at).catch((err) => {
    Sentry.captureException(err);
    console.error('[moderation] digest failed:', err);
  });
  await notificationsScheduled(controller, env);
  await runPaymentSweeps(env);
}

// withSentry instruments both `fetch` and `scheduled` (cron failures are reported too).
export default Sentry.withSentry((env: Env) => sentryOptions(env), { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>);

// Required by Wrangler for DO binding resolution (does not affect test isolation).
export { ChatRoom } from './chat-room';

