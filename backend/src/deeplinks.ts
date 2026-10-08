import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import * as schema from './schema';
import { isPlaceholderUserId } from './deleted-users';
import { publicBaseUrl } from './email';
import { countGoing, eventIsOpen } from './guests';
import { eventPhase } from './eventTime';
import { canViewEvent, discoverableEventSql, optionalViewerId } from './moderation/visibility';
import { escapeHtml, installCtas, renderPage, safeJson } from './webpage';

// Universal Links (iOS) + the shared-link landing page.
//
// `/e/:id` serves double duty: iOS intercepts it before it ever reaches this
// Worker when the app is installed and the domain is in the app's
// associatedDomains entitlement (via the AASA file below), opening the app
// directly at that route. When the app is NOT installed, or on any other
// platform, the link resolves normally and this handler serves the public
// event page: Open Graph / JSON-LD for previews and search, a guest RSVP form
// (no account — see webrsvp.ts), the going count, and install CTAs.
//
// Guest management links live under /rsvp/* (NOT /e/*) on purpose: /e/* is in
// the AASA paths, so an installed app would hijack the confirmation link.
export const deeplinksRouter = new Hono<{ Bindings: Env }>();

const APPLE_TEAM_ID = 'XM2SC5YZ8C';
const BUNDLE_ID = 'com.spotseek.app';

/** Max URLs in sitemap.xml (protocol limit is 50,000). */
export const SITEMAP_MAX_URLS = 1000;

deeplinksRouter.get('/.well-known/apple-app-site-association', (c) => c.body(
  JSON.stringify({
    applinks: {
      apps: [],
      details: [
        {
          appID: `${APPLE_TEAM_ID}.${BUNDLE_ID}`,
          paths: ['/e/*'],
        },
      ],
    },
  }),
  200,
  { 'Content-Type': 'application/json' },
));

deeplinksRouter.get('/robots.txt', (c) => {
  const base = publicBaseUrl(c.env);
  return c.text(
    [
      'User-agent: *',
      'Allow: /',
      'Allow: /e/',
      'Disallow: /api/',
      'Disallow: /rsvp/',
      'Disallow: /payments/',
      '',
      `Sitemap: ${base}/sitemap.xml`,
      '',
    ].join('\n'),
    200,
    { 'Cache-Control': 'public, max-age=3600' },
  );
});

// Upcoming, published, non-private events only — capped.
deeplinksRouter.get('/sitemap.xml', async (c) => {
  const base = publicBaseUrl(c.env);
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const rows = await db
    .select({ id: schema.events.id, updatedAt: schema.events.updatedAt })
    .from(schema.events)
    .where(
      and(
        discoverableEventSql(),
        eq(schema.events.isPrivateLocation, false),
        gt(schema.events.startsAt, new Date()),
      ),
    )
    .orderBy(asc(schema.events.startsAt))
    // One slot is the homepage entry, so the total never exceeds the cap.
    .limit(SITEMAP_MAX_URLS - 1);
  const urls = [
    `  <url><loc>${escapeHtml(`${base}/`)}</loc></url>`,
    ...rows.map(
      (r) =>
        `  <url><loc>${escapeHtml(`${base}/e/${r.id}`)}</loc><lastmod>${r.updatedAt.toISOString()}</lastmod></url>`,
    ),
  ].join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return c.body(xml, 200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  });
});

/** Build the schema.org/Event JSON-LD object. Location honours the private flag. */
export function buildEventJsonLd(
  event: schema.Event,
  opts: { url: string; hostName: string | null; imageUrl: string | null },
): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    url: opts.url,
    eventStatus:
      event.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  };
  if (event.description) ld.description = event.description.slice(0, 300);
  if (event.startsAt) ld.startDate = event.startsAt.toISOString();
  if (event.endsAt) ld.endDate = event.endsAt.toISOString();
  if (opts.imageUrl) ld.image = [opts.imageUrl];
  if (opts.hostName) ld.organizer = { '@type': 'Person', name: opts.hostName };
  // Private-location events must not leak the venue to bots/search engines.
  if (!event.isPrivateLocation && (event.venueName || event.venueAddress)) {
    const place: Record<string, unknown> = { '@type': 'Place' };
    if (event.venueName) place.name = event.venueName;
    if (event.venueAddress) place.address = event.venueAddress;
    if (event.venueLat != null && event.venueLng != null) {
      place.geo = { '@type': 'GeoCoordinates', latitude: event.venueLat, longitude: event.venueLng };
    }
    ld.location = place;
  }
  return ld;
}

export function absoluteImageUrl(base: string, coverImageUrl: string | null): string | null {
  if (!coverImageUrl) return null;
  return coverImageUrl.startsWith('/') ? `${base}${coverImageUrl}` : coverImageUrl;
}

deeplinksRouter.get('/e/:id', async (c) => {
  const id = c.req.param('id');
  const base = publicBaseUrl(c.env);
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  // Non-UUID ids would make Postgres throw; treat them as not found.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const found = isUuid ? await db.query.events.findFirst({ where: eq(schema.events.id, id) }) : undefined;
  // Drafts and hidden/removed events are 404 for the public; only the host sees them.
  const event =
    found && (canViewEvent(found, null) || canViewEvent(found, await optionalViewerId(c))) ? found : undefined;

  if (!event) {
    return c.html(
      renderPage({
        title: 'Party not found · SpotSeek',
        noindex: true,
        body: '<div class="content"><h1>Party not found</h1><p class="meta">This link may be wrong, or the host took the party down.</p></div>',
      }),
      404,
    );
  }

  const [host, goingCount, sponsorRows] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, event.hostId) }),
    countGoing(db, event.id),
    db
      .select({ companyName: schema.sponsorProfiles.companyName })
      .from(schema.sponsorships)
      .innerJoin(schema.sponsorProfiles, eq(schema.sponsorProfiles.id, schema.sponsorships.sponsorId))
      .where(and(eq(schema.sponsorships.eventId, event.id), eq(schema.sponsorships.status, 'active')))
      .orderBy(desc(schema.sponsorships.amountCents))
      .limit(5),
  ]);

  // The anonymous placeholder owner of a deleted host's kept events is never shown as a host.
  const hostName = host && !isPlaceholderUserId(host.id) ? host.displayName : null;
  const canonical = `${base}/e/${event.id}`;
  const title = escapeHtml(event.title);
  // Link-preview bots (Messages/WhatsApp/Slack) scrape this page's HTML
  // server-side and never run the client-side script below, so the
  // og:description needs a real, self-contained time — rendered in UTC and
  // labelled as such, since the Worker has no way to know the eventual
  // reader's timezone at scrape time. A human who actually opens the page
  // gets their own local time instead, via the inline script.
  const when = event.startsAt
    ? `${new Date(event.startsAt).toLocaleString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    })} UTC`
    : null;
  // /e/:id is fully public (no session) and its HTML is scraped by link-preview
  // bots, so a private-location event must not leak its venue name or address
  // here — only exact-location visitors (RSVP'd users) see it, in the app.
  const publicVenueName = event.isPrivateLocation ? null : event.venueName;
  const descriptionText = [when, publicVenueName].filter(Boolean).join(' · ') || 'Join this watch party on SpotSeek.';
  const description = escapeHtml(descriptionText);
  const imageUrl = absoluteImageUrl(base, event.coverImageUrl);

  const open = eventIsOpen(event);
  const ended = eventPhase(event) === 'ended';
  const published = event.status === 'published' && event.moderationStatus !== 'hidden' && event.moderationStatus !== 'removed';
  const jsonLd = published ? buildEventJsonLd(event, { url: canonical, hostName, imageUrl }) : null;

  const head = [
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta name="description" content="${description}">`,
    '<meta property="og:site_name" content="SpotSeek">',
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    '<meta property="og:type" content="website">',
    imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : '',
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : '',
    jsonLd ? `<script type="application/ld+json">${safeJson(jsonLd)}</script>` : '',
  ].filter(Boolean).join('\n');

  const spotsLeft = event.capacity != null ? Math.max(0, event.capacity - goingCount) : null;
  const chips = [
    `<span class="chip chip-volt">${goingCount} going</span>`,
    spotsLeft != null
      ? `<span class="chip ${spotsLeft === 0 ? 'chip-hot' : 'chip-cyan'}">${spotsLeft === 0 ? 'Full. Join the waitlist' : `${spotsLeft} spots left`}</span>`
      : '',
    event.status === 'cancelled' ? '<span class="chip chip-hot">Cancelled</span>' : '',
    ended && event.status !== 'cancelled' ? '<span class="chip">Ended</span>' : '',
  ].filter(Boolean).join('');

  const sponsors = sponsorRows.length
    ? `<div class="chips"><span class="label" style="align-self:center">Presented by</span>${sponsorRows
        .map((s) => `<span class="chip chip-cyan">${escapeHtml(s.companyName)}</span>`)
        .join('')}</div>`
    : '';

  const rsvpPanel = open
    ? `<form class="panel" method="post" action="/rsvp/${escapeHtml(event.id)}">
  <h2>${spotsLeft === 0 ? 'Join the waitlist' : "You're invited"}</h2>
  <p class="meta">No account needed. We'll email you a link to confirm your spot.</p>
  <label class="label" for="name">Your name</label>
  <input id="name" name="name" type="text" required maxlength="80" autocomplete="name" placeholder="Alex Rivera">
  <label class="label" for="email">Email</label>
  <input id="email" name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email" placeholder="you@example.com">
  <div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
  <button class="btn" type="submit">I'm going</button>
  <p class="fine">We only use your email for this event's RSVP.</p>
</form>`
    : `<div class="panel"><h2>${event.status === 'cancelled' ? 'This party was cancelled' : ended ? 'This party has ended' : 'RSVPs are closed'}</h2></div>`;

  const body = `${imageUrl ? `  <img class="cover" src="${escapeHtml(imageUrl)}" alt="">` : ''}
  <div class="content">
    ${hostName ? `<div class="label">Hosted by ${escapeHtml(hostName)}</div>` : ''}
    <h1>${title}</h1>
    <p class="meta" id="when">${description}</p>
    <div class="chips">${chips}</div>
    ${sponsors}
    ${rsvpPanel}
    ${installCtas(c.env.APP_STORE_URL, event.id)}
  </div>
  ${event.startsAt ? `<script>
    // Link-preview bots never run this — they only see the UTC-labelled
    // og:description above. A human opening the page gets the event time
    // re-rendered in *their own* device's local timezone instead, with no
    // location permission needed: the browser already knows its timezone.
    (function () {
      var startsAt = new Date(${safeJson(event.startsAt.toISOString())});
      var when = startsAt.toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });
      var venue = ${safeJson(publicVenueName ?? null)};
      document.getElementById('when').textContent = venue ? (when + ' · ' + venue) : when;
    })();
  </script>` : ''}`;

  return c.html(
    renderPage({ title: `${event.title} · SpotSeek`, head, body, noindex: !published }),
  );
});
