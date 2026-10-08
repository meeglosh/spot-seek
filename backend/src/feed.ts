import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, gte, lte, isNull, or, sql, ilike, inArray, asc } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';
import { discoverableEventSql, notBlockedWithHostSql } from './moderation/visibility';
import { effectiveEndSql, upcomingOrLiveSql, recentlyEndedSql } from './eventTime';

type AppEnv = { Bindings: Env };

export const feedRouter = new Hono<AppEnv>();

/**
 * Haversine approximation in SQL for filtering by lat/lng radius.
 * Returns distance in km. Accurate enough for event discovery at city scale.
 */
function haversineKm(lat: number, lng: number) {
  return sql<number>`
    (6371 * acos(
      cos(radians(${lat})) * cos(radians(${schema.events.venueLat})) *
      cos(radians(${schema.events.venueLng}) - radians(${lng})) +
      sin(radians(${lat})) * sin(radians(${schema.events.venueLat}))
    ))
  `;
}

/**
 * GET /api/feed
 * Query params:
 *   after=ISO8601    — only events starting at or after this time
 *   before=ISO8601   — only events starting at or before this time
 *   lat=float        — center latitude for radius filter
 *   lng=float        — center longitude for radius filter
 *   radiusKm=float   — radius in km (default 50, requires lat+lng)
 *   limit=int        — page size (default and max FEED_MAX_LIMIT)
 *   offset=int       — rows to skip (for paging; ordered by startsAt, id)
 *   include=past     - also return parties that ended in the last 30 days,
 *                      after the upcoming ones, most recent first
 *
 * Ended parties are hidden by default (see eventTime.ts: endsAt < now, or no
 * endsAt and startsAt < now - 4h). In-progress parties stay; undated ones are
 * excluded. Egress guard: the result is capped, and only the columns the app's
 * cards/map use are selected (description / recurrenceRule / createdAt etc. are detail-screen only).
 *
 * Returns published events. Private-location events include venue_name but
 * obscure venue_address/lat/lng for users who haven't RSVP'd going/waitlisted.
 */
// Hard cap on rows per response (Neon egress protection).
const FEED_MAX_LIMIT = 200;

feedRouter.get('/', async (c) => {
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });

  // Resolve caller identity (optional — affects private-location masking).
  let callerId: string | null = null;
  try {
    const auth = createAuth(neon(c.env.DATABASE_URL));
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    callerId = session?.user?.id ?? null;
  } catch {
    // Unauthenticated browsing is allowed; private-location addresses stay masked.
  }

  const { after, before, lat, lng, radiusKm, q, sport, include, limit: limitParam, offset: offsetParam } = c.req.query();
  const includePast = include === 'past';
  const limit = Math.min(Math.max(parseInt(limitParam ?? '', 10) || FEED_MAX_LIMIT, 1), FEED_MAX_LIMIT);
  const offset = Math.min(Math.max(parseInt(offsetParam ?? '', 10) || 0, 0), 100_000);

  const conditions = [
    // Published and not hidden/removed by moderation (drafts/cancelled never listed).
    discoverableEventSql(),
    // Upcoming and in-progress only (undated parties are excluded), plus the
    // last 30 days of ended ones when the caller opts in with include=past.
    includePast ? sql`(${upcomingOrLiveSql()} or ${recentlyEndedSql()})` : upcomingOrLiveSql(),
  ];

  // Blocks apply in both directions (feed and search alike).
  if (callerId) conditions.push(notBlockedWithHostSql(callerId));

  if (after) conditions.push(gte(schema.events.startsAt, new Date(after)));
  if (before) conditions.push(lte(schema.events.startsAt, new Date(before)));

  // Text search: matches title OR broadcastSubject (case-insensitive).
  if (q) {
    conditions.push(
      or(
        ilike(schema.events.title, `%${q}%`),
        ilike(schema.events.broadcastSubject, `%${q}%`),
      ) ?? eq(schema.events.status, 'published'),
    );
  }

  // Sport filter: exact match on broadcastSubject or substring of title.
  if (sport) {
    conditions.push(
      or(
        ilike(schema.events.broadcastSubject, `%${sport}%`),
        ilike(schema.events.title, `%${sport}%`),
      ) ?? eq(schema.events.status, 'published'),
    );
  }

  // Radius filter — only apply when lat+lng are provided AND venue coords exist.
  const radius = radiusKm ? parseFloat(radiusKm) : 50;
  const filterByLocation = lat && lng;
  if (filterByLocation) {
    const latF = parseFloat(lat);
    const lngF = parseFloat(lng);
    const dLat = radius / 111;
    const dLng = radius / (111 * Math.max(Math.cos((latF * Math.PI) / 180), 0.01));
    conditions.push(
      or(
        // Events with no venue coords are included regardless of location filter.
        and(isNull(schema.events.venueLat), isNull(schema.events.venueLng)),
        // Events within the radius.
        and(
          // Cheap bounding box first, then the exact distance.
          gte(schema.events.venueLat, latF - dLat),
          lte(schema.events.venueLat, latF + dLat),
          gte(schema.events.venueLng, lngF - dLng),
          lte(schema.events.venueLng, lngF + dLng),
          sql`${haversineKm(latF, lngF)} <= ${radius}`,
        ),
      ) ?? eq(schema.events.status, 'published'),
    );
  }

  const e = schema.events;
  const rows = await db
    .select({
      id: e.id,
      hostId: e.hostId,
      title: e.title,
      broadcastSubject: e.broadcastSubject,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      capacity: e.capacity,
      status: e.status,
      coverImageUrl: e.coverImageUrl,
      venueName: e.venueName,
      venueAddress: e.venueAddress,
      venueLat: e.venueLat,
      venueLng: e.venueLng,
      venueTimezone: e.venueTimezone,
      isPrivateLocation: e.isPrivateLocation,
    })
    .from(e)
    .where(and(...conditions))
    // Upcoming/live first by start time, then (include=past) ended parties,
    // most recent first. Deterministic, so offset paging stays stable.
    .orderBy(
      sql`case when ${effectiveEndSql()} < now() then 1 else 0 end`,
      sql`case when ${effectiveEndSql()} < now() then null else ${e.startsAt} end asc`,
      sql`case when ${effectiveEndSql()} < now() then ${e.startsAt} end desc`,
      asc(e.id),
    )
    .limit(limit)
    .offset(offset);

  // For private-location events, mask address details unless the caller has an
  // active going/waitlisted RSVP. Venue name is always visible (helps discovery).
  let rsvpdEventIds = new Set<string>();
  if (callerId && rows.length > 0) {
    const rsvps = await db
      .select({ eventId: schema.rsvps.eventId })
      .from(schema.rsvps)
      .where(
        and(
          eq(schema.rsvps.userId, callerId),
          or(eq(schema.rsvps.state, 'going'), eq(schema.rsvps.state, 'waitlisted')),
          inArray(schema.rsvps.eventId, rows.map((r) => r.id)),
        ),
      );
    rsvpdEventIds = new Set(rsvps.map((r) => r.eventId));
  }

  // Sponsor info for the page of events — one grouped query over active
  // sponsorships joined to sponsorProfiles, merged in JS (mirrors the
  // rsvp-count batching pattern used elsewhere; avoids per-event N+1).
  let sponsorCountByEvent = new Map<string, number>();
  let topSponsorByEvent = new Map<string, { companyName: string; amountCents: number }>();
  if (rows.length > 0) {
    const eventIds = rows.map((e) => e.id);
    const sponsorRows = await db
      .select({
        eventId: schema.sponsorships.eventId,
        companyName: schema.sponsorProfiles.companyName,
        amountCents: schema.sponsorships.amountCents,
      })
      .from(schema.sponsorships)
      .innerJoin(schema.sponsorProfiles, eq(schema.sponsorProfiles.id, schema.sponsorships.sponsorId))
      .where(and(eq(schema.sponsorships.status, 'active'), inArray(schema.sponsorships.eventId, eventIds)));

    for (const row of sponsorRows) {
      sponsorCountByEvent.set(row.eventId, (sponsorCountByEvent.get(row.eventId) ?? 0) + 1);
      const current = topSponsorByEvent.get(row.eventId);
      if (!current || row.amountCents > current.amountCents) {
        topSponsorByEvent.set(row.eventId, { companyName: row.companyName, amountCents: row.amountCents });
      }
    }
  }

  const events = rows.map((ev) => {
    const masked = !ev.isPrivateLocation || rsvpdEventIds.has(ev.id)
      ? ev
      // Mask exact address and coordinates for private-location events.
      : { ...ev, venueAddress: null, venueLat: null, venueLng: null };
    return {
      ...masked,
      sponsorCount: sponsorCountByEvent.get(ev.id) ?? 0,
      topSponsor: topSponsorByEvent.get(ev.id)?.companyName ?? null,
    };
  });

  // The anonymous response is identical for everyone, so it may be cached.
  // Signed-in responses depend on the caller's RSVPs (address masking).
  c.header('Vary', 'Cookie, Authorization');
  c.header('Cache-Control', callerId ? 'private, no-store' : 'public, max-age=60');

  return c.json({ events });
});
