/**
 * Post-event reviews: upsert, validation, aggregates, and the review_request
 * cron sweep trigger.
 */
import { SELF, env } from 'cloudflare:test';
import { neon } from '@neondatabase/serverless';
import { describe, it, expect } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const RSVPS = 'https://example.com/api/rsvps';
const REVIEWS = 'https://example.com/api/reviews';
const NOTIFICATIONS = 'https://example.com/api/notifications';

const TS = Date.now();

async function signIn(suffix: string) {
  const email = `review-${suffix}-${TS}@spotseek.test`;
  const pw = 'Review_Pwd_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const sess = await SELF.fetch(`${AUTH}/get-session`, { headers: { Cookie: cookie } });
  const { user } = await sess.json() as { user: { id: string } };
  return { cookie, id: user.id };
}

type ApiReview = {
  id: string; eventId: string; reviewerId: string; reviewerName: string | null;
  hostRating: number; venueRating: number | null; comment: string | null;
  createdAt: string; updatedAt: string;
};

async function createEvent(
  cookie: string,
  overrides: Record<string, unknown> = {},
) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      title: 'Review Test Event',
      broadcastSubject: 'Basketball',
      status: 'published',
      ...overrides,
    }),
  });
  const { event } = await res.json() as { event: { id: string } };
  return event;
}


// Ended parties reject RSVPs / bids / acceptance (event_ended), so fixtures that
// need an already-ended party do their setup while it is "open", then restore
// the real times.
async function whileOpen<T>(eventId: string, fn: () => Promise<T>): Promise<T> {
  const sql = neon(env.DATABASE_URL);
  const [orig] = await sql`SELECT starts_at, ends_at FROM events WHERE id = ${eventId}`;
  await sql`UPDATE events SET starts_at = now() + interval '1 day', ends_at = now() + interval '2 days' WHERE id = ${eventId}`;
  try {
    return await fn();
  } finally {
    await sql`UPDATE events SET starts_at = ${orig.starts_at}, ends_at = ${orig.ends_at} WHERE id = ${eventId}`;
  }
}

async function rsvpGoing(cookie: string, eventId: string) {
  const res = await whileOpen(eventId, () => SELF.fetch(RSVPS, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ eventId }),
  }));
  expect(res.status).toBe(201);
}

const pastIso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const HOUR = 60 * 60 * 1000;

describe('POST /api/reviews — upsert', () => {
  it('creates a review, then editing it upserts in place', async () => {
    const host = await signIn('up-host');
    const attendee = await signIn('up-att');

    const event = await createEvent(host.cookie, {
      startsAt: pastIso(3 * HOUR),
      endsAt: pastIso(HOUR),
      venueName: 'The Tavern',
      venueAddress: '1 Main St',
    });
    await rsvpGoing(attendee.cookie, event.id);

    const createRes = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id, hostRating: 4, venueRating: 5, comment: '  Great time!  ' }),
    });
    expect(createRes.status).toBe(200);
    const { review: created } = await createRes.json() as { review: ApiReview };
    expect(created.hostRating).toBe(4);
    expect(created.venueRating).toBe(5);
    expect(created.comment).toBe('Great time!');
    expect(created.reviewerName).toBe('up-att');

    const editRes = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id, hostRating: 2, venueRating: 3, comment: 'Actually meh' }),
    });
    expect(editRes.status).toBe(200);
    const { review: edited } = await editRes.json() as { review: ApiReview };
    expect(edited.id).toBe(created.id);
    expect(edited.hostRating).toBe(2);
    expect(edited.venueRating).toBe(3);
    expect(edited.comment).toBe('Actually meh');

    const listRes = await SELF.fetch(`${REVIEWS}/event/${event.id}`, { headers: { Cookie: attendee.cookie } });
    const listBody = await listRes.json() as { reviews: ApiReview[] };
    expect(listBody.reviews).toHaveLength(1);
    expect(listBody.reviews[0].hostRating).toBe(2);
  });

  it('rejects: event not ended, not a going RSVP, is the host, bad rating', async () => {
    const host = await signIn('rej-host');
    const goer = await signIn('rej-goer');
    const stranger = await signIn('rej-stranger');

    // Not ended yet.
    const futureEvent = await createEvent(host.cookie, {
      startsAt: new Date(Date.now() + HOUR).toISOString(),
    });
    await rsvpGoing(goer.cookie, futureEvent.id);
    const notEndedRes = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: goer.cookie },
      body: JSON.stringify({ eventId: futureEvent.id, hostRating: 5 }),
    });
    expect(notEndedRes.status).toBe(400);

    // Ended event for the remaining checks.
    const endedEvent = await createEvent(host.cookie, {
      startsAt: pastIso(3 * HOUR),
      endsAt: pastIso(HOUR),
    });
    await rsvpGoing(goer.cookie, endedEvent.id);

    // Not a going RSVP (stranger never RSVP'd).
    const notGoingRes = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: stranger.cookie },
      body: JSON.stringify({ eventId: endedEvent.id, hostRating: 5 }),
    });
    expect(notGoingRes.status).toBe(400);

    // Host cannot review own event.
    const hostSelfRes = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ eventId: endedEvent.id, hostRating: 5 }),
    });
    expect(hostSelfRes.status).toBe(400);

    // Bad rating.
    const badRatingRes = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: goer.cookie },
      body: JSON.stringify({ eventId: endedEvent.id, hostRating: 6 }),
    });
    expect(badRatingRes.status).toBe(400);
    const zeroRatingRes = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: goer.cookie },
      body: JSON.stringify({ eventId: endedEvent.id, hostRating: 0 }),
    });
    expect(zeroRatingRes.status).toBe(400);
  });

  it('forces venueRating to null when the event has no venue', async () => {
    const host = await signIn('novenue-host');
    const attendee = await signIn('novenue-att');
    const event = await createEvent(host.cookie, {
      startsAt: pastIso(3 * HOUR),
      endsAt: pastIso(HOUR),
    });
    await rsvpGoing(attendee.cookie, event.id);

    const res = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id, hostRating: 5, venueRating: 4 }),
    });
    expect(res.status).toBe(200);
    const { review } = await res.json() as { review: ApiReview };
    expect(review.venueRating).toBeNull();
  });
});

describe('GET /api/reviews/event/:eventId — aggregates', () => {
  it('host avg spans that host\'s multiple events; venue avg spans events sharing a venueKey', async () => {
    const host = await signIn('agg-host');
    const attA = await signIn('agg-att-a');
    const attB = await signIn('agg-att-b');

    // Two events by the same host, same venue (identical name+address once
    // normalized, different case/whitespace) — venue name carries a per-run
    // unique suffix so the venueKey (and thus its aggregate count) doesn't
    // accumulate across repeated test runs against the shared dev DB.
    const venueSuffix = `${TS}-${Math.random().toString(36).slice(2, 8)}`;
    const eventA = await createEvent(host.cookie, {
      title: 'Event A',
      startsAt: pastIso(3 * HOUR),
      endsAt: pastIso(HOUR),
      venueName: `The Sports Bar ${venueSuffix}`,
      venueAddress: '42 Elm St',
    });
    const eventB = await createEvent(host.cookie, {
      title: 'Event B',
      startsAt: pastIso(3 * HOUR),
      endsAt: pastIso(HOUR),
      venueName: `  the sports bar ${venueSuffix}  `,
      venueAddress: '  42 ELM ST  ',
    });
    await rsvpGoing(attA.cookie, eventA.id);
    await rsvpGoing(attB.cookie, eventB.id);

    await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attA.cookie },
      body: JSON.stringify({ eventId: eventA.id, hostRating: 4, venueRating: 4 }),
    });
    await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attB.cookie },
      body: JSON.stringify({ eventId: eventB.id, hostRating: 2, venueRating: 2 }),
    });

    const res = await SELF.fetch(`${REVIEWS}/event/${eventA.id}`, { headers: { Cookie: attA.cookie } });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      myReview: ApiReview | null;
      host: { avg: number; count: number } | null;
      venue: { avg: number; count: number } | null;
      reviews: ApiReview[];
    };

    expect(body.myReview?.hostRating).toBe(4);
    expect(body.host).toEqual({ avg: 3, count: 2 }); // (4+2)/2
    expect(body.venue).toEqual({ avg: 3, count: 2 }); // shared venueKey despite case/whitespace
    expect(body.reviews).toHaveLength(1);
  });

  it('venue is null when the event has no venue', async () => {
    const host = await signIn('noven-agg-host');
    const attendee = await signIn('noven-agg-att');
    const event = await createEvent(host.cookie, {
      startsAt: pastIso(3 * HOUR),
      endsAt: pastIso(HOUR),
    });
    await rsvpGoing(attendee.cookie, event.id);
    await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id, hostRating: 5 }),
    });

    const res = await SELF.fetch(`${REVIEWS}/event/${event.id}`, { headers: { Cookie: attendee.cookie } });
    const body = await res.json() as { venue: unknown };
    expect(body.venue).toBeNull();
  });
});

describe('GET /api/reviews/host/:userId', () => {
  it('returns avg/count 0 with no reviews, and aggregates once reviewed', async () => {
    const host = await signIn('hostagg-host');
    const attendee = await signIn('hostagg-att');

    const zeroRes = await SELF.fetch(`${REVIEWS}/host/${host.id}`, { headers: { Cookie: attendee.cookie } });
    expect(zeroRes.status).toBe(200);
    const zeroBody = await zeroRes.json() as { avg: number; count: number; recent: ApiReview[] };
    expect(zeroBody).toEqual({ avg: 0, count: 0, recent: [] });

    const event = await createEvent(host.cookie, {
      startsAt: pastIso(3 * HOUR),
      endsAt: pastIso(HOUR),
    });
    await rsvpGoing(attendee.cookie, event.id);
    await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id, hostRating: 3 }),
    });

    const res = await SELF.fetch(`${REVIEWS}/host/${host.id}`, { headers: { Cookie: attendee.cookie } });
    const body = await res.json() as { avg: number; count: number; recent: ApiReview[] };
    expect(body.avg).toBe(3);
    expect(body.count).toBe(1);
    expect(body.recent).toHaveLength(1);
  });
});

describe('review_request sweep', () => {
  it('fires once (dedupe) for a going attendee ~2h after end, but not for the host', async () => {
    const host = await signIn('sweep-host');
    const attendee = await signIn('sweep-att');

    // endsAt ~2h ago -> review moment (endsAt + 2h) lands right in "now".
    const event = await createEvent(host.cookie, {
      startsAt: pastIso(4 * HOUR),
      endsAt: pastIso(2 * HOUR),
    });
    await rsvpGoing(attendee.cookie, event.id);

    const run1 = await SELF.fetch(`${NOTIFICATIONS}/run-reviews`, {
      method: 'POST', headers: { Authorization: 'Bearer test-admin-secret' },
    });
    expect(run1.status).toBe(200);

    const attNotifs1 = await (await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: attendee.cookie } })).json() as {
      notifications: { type: string; eventId: string | null }[];
    };
    const reviewNotifs1 = attNotifs1.notifications.filter((n) => n.type === 'review_request' && n.eventId === event.id);
    expect(reviewNotifs1).toHaveLength(1);

    // Host never gets a review_request for their own event.
    const hostNotifs = await (await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: host.cookie } })).json() as {
      notifications: { type: string; eventId: string | null }[];
    };
    expect(hostNotifs.notifications.some((n) => n.type === 'review_request' && n.eventId === event.id)).toBe(false);

    // Second run does not duplicate.
    const run2 = await SELF.fetch(`${NOTIFICATIONS}/run-reviews`, {
      method: 'POST', headers: { Authorization: 'Bearer test-admin-secret' },
    });
    expect(run2.status).toBe(200);
    const attNotifs2 = await (await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: attendee.cookie } })).json() as {
      notifications: { type: string; eventId: string | null }[];
    };
    const reviewNotifs2 = attNotifs2.notifications.filter((n) => n.type === 'review_request' && n.eventId === event.id);
    expect(reviewNotifs2).toHaveLength(1);
  });
});

describe('guest (signed-out) review reads', () => {
  async function reviewedEvent(tag: string) {
    const host = await signIn(`${tag}-host`);
    const attendee = await signIn(`${tag}-att`);
    const event = await createEvent(host.cookie, {
      startsAt: pastIso(3 * HOUR),
      endsAt: pastIso(HOUR),
    });
    await rsvpGoing(attendee.cookie, event.id);
    const r = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id, hostRating: 4, comment: 'Fun' }),
    });
    expect(r.status).toBe(200);
    return { host, attendee, event };
  }

  it('guest GET /event/:id returns 200 with aggregates and no email', async () => {
    const { host, attendee, event } = await reviewedEvent('g1');
    const res = await SELF.fetch(`${REVIEWS}/event/${event.id}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('@');
    expect(text).not.toContain('spotseek.test');
    const body = JSON.parse(text) as { myReview: unknown; host: { avg: number; count: number } | null; reviews: ApiReview[] };
    expect(body.myReview).toBeNull();
    expect(body.host).toEqual({ avg: 4, count: 1 });
    expect(body.reviews).toHaveLength(1);
    expect(body.reviews[0].reviewerName).toBe('g1-att');
    expect(Object.keys(body.reviews[0]).sort()).toEqual(
      ['comment', 'createdAt', 'eventId', 'hostRating', 'id', 'reviewerId', 'reviewerName', 'updatedAt', 'venueRating'],
    );

    const hostRes = await SELF.fetch(`${REVIEWS}/host/${host.id}`);
    expect(hostRes.status).toBe(200);
    const hostText = await hostRes.text();
    expect(hostText).not.toContain('@');
    expect((JSON.parse(hostText) as { count: number }).count).toBe(1);
    expect(attendee.id).toBeTruthy();
  });

  it('guest POST is still 401', async () => {
    const { event } = await reviewedEvent('g2');
    const res = await SELF.fetch(REVIEWS, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, hostRating: 5 }),
    });
    expect(res.status).toBe(401);
  });

  it('hides reviews of hidden/removed/draft events from guests but not from the host', async () => {
    const { host, event } = await reviewedEvent('g3');
    const sql = neon(env.DATABASE_URL);

    await sql`UPDATE events SET moderation_status = 'hidden' WHERE id = ${event.id}`;
    expect((await SELF.fetch(`${REVIEWS}/event/${event.id}`)).status).toBe(404);
    expect((await SELF.fetch(`${REVIEWS}/event/${event.id}`, { headers: { Cookie: host.cookie } })).status).toBe(200);
    const hostAgg = await (await SELF.fetch(`${REVIEWS}/host/${host.id}`)).json() as { count: number; recent: unknown[] };
    expect(hostAgg.count).toBe(0);
    expect(hostAgg.recent).toEqual([]);

    await sql`UPDATE events SET moderation_status = 'removed' WHERE id = ${event.id}`;
    expect((await SELF.fetch(`${REVIEWS}/event/${event.id}`)).status).toBe(404);

    await sql`UPDATE events SET moderation_status = 'ok', status = 'draft' WHERE id = ${event.id}`;
    expect((await SELF.fetch(`${REVIEWS}/event/${event.id}`)).status).toBe(404);
    expect(((await (await SELF.fetch(`${REVIEWS}/host/${host.id}`)).json()) as { count: number }).count).toBe(0);
  });
});
