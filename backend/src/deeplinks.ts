import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

// Universal Links (iOS) + the shared-link landing page.
//
// `/e/:id` serves double duty: iOS intercepts it before it ever reaches this
// Worker when the app is installed and the domain is in the app's
// associatedDomains entitlement (via the AASA file below), opening the app
// directly at that route. When the app is NOT installed, or on any other
// platform, the link resolves normally and this handler serves an HTML
// fallback with an Open Graph preview and a placeholder store link — RN's
// `Linking`/custom `spotseek://` scheme has no not-installed fallback and
// renders as unclickable plain text in Messages, which is the bug this
// replaces.
export const deeplinksRouter = new Hono<{ Bindings: Env }>();

const APPLE_TEAM_ID = 'XM2SC5YZ8C';
const BUNDLE_ID = 'com.spotseek.app';

// Not yet published — placeholder until the App Store listing exists.
const APP_STORE_URL: string | null = null;

deeplinksRouter.get('/.well-known/apple-app-site-association', (c) => c.json({
  applinks: {
    apps: [],
    details: [
      {
        appID: `${APPLE_TEAM_ID}.${BUNDLE_ID}`,
        paths: ['/e/*'],
      },
    ],
  },
}));

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

deeplinksRouter.get('/e/:id', async (c) => {
  const id = c.req.param('id');
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const event = await db.query.events.findFirst({ where: eq(schema.events.id, id) });

  if (!event) {
    return c.html('<!doctype html><html><body>Event not found.</body></html>', 404);
  }

  const title = escapeHtml(event.title);
  const when = event.startsAt
    ? new Date(event.startsAt).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    : null;
  const description = escapeHtml([when, event.venueName].filter(Boolean).join(' — ') || 'Join this watch party on SpotSeek.');

  // Resolve to an absolute URL — Messages/WhatsApp/Slack/etc. fetch this
  // page server-side to build the link-preview card, so a relative
  // `/api/images/...` path (same shape the app resolves via
  // lib/api.ts#resolveImageUrl) means nothing to them.
  const origin = new URL(c.req.url).origin;
  const imageUrl = event.coverImageUrl
    ? (event.coverImageUrl.startsWith('/') ? `${origin}${event.coverImageUrl}` : event.coverImageUrl)
    : null;
  const ogImageTags = imageUrl
    ? `
<meta property="og:image" content="${imageUrl}">
<meta name="twitter:card" content="summary_large_image">`
    : '';

  // Placeholder while the app isn't on the App Store yet — swap in the real
  // listing URL once available (see APP_STORE_URL above).
  const storeCta = APP_STORE_URL
    ? `<a class="btn" href="${APP_STORE_URL}">Get SpotSeek</a>`
    : '<span class="btn btn-disabled">Coming soon to the App Store</span>';

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — SpotSeek</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">${ogImageTags}
<style>
  body { font-family: -apple-system, sans-serif; background: #0b0e0e; color: #fff; margin: 0; padding: 0 0 40px; text-align: center; }
  img { width: 100%; max-height: 320px; object-fit: cover; display: block; }
  .content { padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { color: #9aa; margin: 0 0 24px; }
  .btn { display: inline-block; background: #22e0ff; color: #000; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 4px; }
  .btn-disabled { background: #333; color: #999; }
</style>
</head>
<body>
  ${imageUrl ? `<img src="${imageUrl}" alt="">` : ''}
  <div class="content">
    <h1>${title}</h1>
    <p>${description}</p>
    ${storeCta}
  </div>
</body>
</html>`;

  return c.html(html);
});
