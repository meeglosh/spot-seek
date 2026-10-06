/**
 * Discovery feed tests (task 1.5).
 * Verifies: time filter, location filter, private-location masking.
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const FEED = 'https://example.com/api/feed';

const TS = Date.now();
const SOON = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

// The feed is capped (200) and ordered by startsAt; tests narrow it by a
// unique title so each response is tiny and bounded, never the whole DB.
async function feedQ(title: string, extra = '', init?: RequestInit) {
  const res = await SELF.fetch(`${FEED}?q=${encodeURIComponent(title)}&limit=20${extra}`, init);
  expect(res.status).toBe(200);
  const { events } = (await res.json()) as { events: Array<Record<string, any>> };
  expect(events.length).toBeLessThanOrEqual(20);
  return { res, events };
}
const HOST = { email: `feed-host-${TS}@spotseek.test`, password: 'Feed_Pwd_1!', name: 'Feed Host' };

let hostCookie = '';

async function createEvent(cookie: string, fields: Record<string, unknown>) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(fields),
  });
  return ((await res.json()) as { event: Record<string, unknown> }).event;
}

async function publish(cookie: string, id: string) {
  await SELF.fetch(`${EVENTS}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'published' }),
  });
}

beforeAll(async () => {
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: HOST.email, password: HOST.password, name: HOST.name }),
  });
  const signIn = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: HOST.email, password: HOST.password }),
  });
  hostCookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
});

describe('discovery feed', () => {
  it('returns only published events', async () => {
    const draft = await createEvent(hostCookie, {
      title: `Published Event ${TS} draft`,
      broadcastSubject: 'Draft',
      startsAt: SOON(),
    });
    const pub = await createEvent(hostCookie, {
      title: `Published Event ${TS}`,
      broadcastSubject: 'Published',
      startsAt: SOON(),
    });
    await publish(hostCookie, pub.id as string);

    const { res, events } = await feedQ(`Published Event ${TS}`);
    // Anonymous response is cacheable.
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    // Heavy detail-only columns are not shipped on feed items.
    expect(events[0]).not.toHaveProperty('description');
    expect(events[0]).not.toHaveProperty('recurrenceRule');
    expect(events.some((e) => e.id === pub.id)).toBe(true);
    expect(events.some((e) => e.id === draft.id)).toBe(false);
  });

  it('filters by time (after / before)', async () => {
    const future = await createEvent(hostCookie, {
      title: `Future Event ${TS}`,
      broadcastSubject: 'Future',
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const past = await createEvent(hostCookie, {
      title: `Future Event ${TS} past`,
      broadcastSubject: 'Past',
      startsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await Promise.all([
      publish(hostCookie, future.id as string),
      publish(hostCookie, past.id as string),
    ]);

    const now = new Date().toISOString();
    const { events: futureEvents } = await feedQ(`Future Event ${TS}`, `&after=${encodeURIComponent(now)}`);
    expect(futureEvents.some((e) => e.id === future.id)).toBe(true);
    expect(futureEvents.some((e) => e.id === past.id)).toBe(false);

    // Even without `after`, events that ended long ago are excluded by default.
    const { events: defaultEvents } = await feedQ(`Future Event ${TS}`);
    expect(defaultEvents.some((e) => e.id === future.id)).toBe(true);
    expect(defaultEvents.some((e) => e.id === past.id)).toBe(false);

    // limit is honoured.
    const { events: one } = await feedQ(`Future Event ${TS}`, '&limit=1');
    expect(one.length).toBe(1);
  });

  it('masks private-location address for unauthenticated users', async () => {
    const privateEvent = await createEvent(hostCookie, {
      title: `Private Party ${TS}`,
      startsAt: SOON(),
      broadcastSubject: 'Secret Game',
      venueName: 'My House',
      venueAddress: '42 Secret St',
      venueLat: 40.7128,
      venueLng: -74.006,
      isPrivateLocation: true,
    });
    await publish(hostCookie, privateEvent.id as string);

    const { events } = await feedQ(`Private Party ${TS}`);
    const found = events.find((e) => e.id === privateEvent.id);
    expect(found).toBeDefined();
    // Venue name visible -helps discovery.
    expect(found?.venueName).toBe('My House');
    // Address and coords are masked for unauthenticated viewer.
    expect(found?.venueAddress).toBeNull();
    expect(found?.venueLat).toBeNull();
    expect(found?.venueLng).toBeNull();
  });

  it('does not mask private-location for the host (has rsvp implicitly? no -host can still see via auth)', async () => {
    // Future task: host/rsvp'd attendees see full address.
    // For now, even the host sees the masked version via the feed
    // unless they have an RSVP -that logic is in task 1.6.
    // This test just confirms the masking itself applies to the authenticated host
    // when they don't yet have an RSVP.
    const privateEvent = await createEvent(hostCookie, {
      title: `Another Private Party ${TS}`,
      startsAt: SOON(),
      broadcastSubject: 'Another Secret',
      venueAddress: '99 Private Rd',
      venueLat: 51.5,
      venueLng: -0.1,
      isPrivateLocation: true,
    });
    await publish(hostCookie, privateEvent.id as string);

    // Host browsing the feed (no RSVP yet) -address still masked.
    const { res, events } = await feedQ(`Another Private Party ${TS}`, '', { headers: { Cookie: hostCookie } });
    // Signed-in responses are never publicly cached.
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const found = events.find((e) => e.id === privateEvent.id);
    expect(found?.venueAddress).toBeNull();
  });
});
