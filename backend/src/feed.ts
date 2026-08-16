import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, gte, lte, isNull, or, sql, ilike, inArray } from 'drizzle-orm';
import * as schema from './schema';
import { createAuth } from './auth';

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
 *
 * Returns published events. Private-location events include venue_name but
 * obscure venue_address/lat/lng for users who haven't RSVP'd going/waitlisted.
 */
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

  const { after, before, lat, lng, radiusKm, q, sport } = c.req.query();

  const conditions = [eq(schema.events.status, 'published')];

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
    conditions.push(
      or(
        // Events with no venue coords are included regardless of location filter.
        and(isNull(schema.events.venueLat), isNull(schema.events.venueLng)),
        // Events within the radius.
        sql`${haversineKm(latF, lngF)} <= ${radius}`,
      ) ?? eq(schema.events.status, 'published'),
    );
  }

  const rows = await db.query.events.findMany({
    where: and(...conditions),
    orderBy: schema.events.startsAt,
  });

  // For private-location events, mask address details unless the caller has an
  // active going/waitlisted RSVP. Venue name is always visible (helps discovery).
  let rsvpdEventIds = new Set<string>();
  if (callerId) {
    const rsvps = await db.query.rsvps.findMany({
      where: and(
        eq(schema.rsvps.userId, callerId),
        or(eq(schema.rsvps.state, 'going'), eq(schema.rsvps.state, 'waitlisted')),
      ),
    });
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

  const events = rows.map((e) => {
    const masked = !e.isPrivateLocation || rsvpdEventIds.has(e.id)
      ? e
      // Mask exact address and coordinates for private-location events.
      : { ...e, venueAddress: null, venueLat: null, venueLng: null };
    return {
      ...masked,
      sponsorCount: sponsorCountByEvent.get(e.id) ?? 0,
      topSponsor: topSponsorByEvent.get(e.id)?.companyName ?? null,
    };
  });

  return c.json({ events });
});
