import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, gte, lte, isNull, or, sql } from 'drizzle-orm';
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

  const { after, before, lat, lng, radiusKm } = c.req.query();

  const conditions = [eq(schema.events.status, 'published')];

  if (after) conditions.push(gte(schema.events.startsAt, new Date(after)));
  if (before) conditions.push(lte(schema.events.startsAt, new Date(before)));

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

  const events = rows.map((e) => {
    if (!e.isPrivateLocation) return e;
    if (rsvpdEventIds.has(e.id)) return e;
    // Mask exact address and coordinates for private-location events.
    return { ...e, venueAddress: null, venueLat: null, venueLng: null };
  });

  return c.json({ events });
});
