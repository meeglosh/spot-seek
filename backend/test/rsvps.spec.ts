/**
 * RSVP tests (task 1.6).
 * Invariants: capacity enforcement (overflow -> waitlisted),
 * one-rsvp-per-user uniqueness, state transitions.
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const RSVPS = 'https://example.com/api/rsvps';

const TS = Date.now();

async function signUp(suffix: string) {
  const email = `rsvp-${suffix}-${TS}@spotseek.test`;
  const password = 'RSVP_Password_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

async function createPublishedEvent(cookie: string, capacity: number | null = null) {
  const res = await SELF.fetch(EVENTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      title: `Event ${TS}`,
      broadcastSubject: 'Game',
      status: 'published',
      ...(capacity !== null ? { capacity } : {}),
    }),
  });
  const event = ((await res.json()) as { event: { id: string } }).event;
  // Publish via PATCH since POST creates as draft by default in tests that don't set status
  await SELF.fetch(`${EVENTS}/${event.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ status: 'published' }),
  });
  return event;
}

let hostCookie: string;
let attendee1Cookie: string;
let attendee2Cookie: string;
let attendee3Cookie: string;

beforeAll(async () => {
  [hostCookie, attendee1Cookie, attendee2Cookie, attendee3Cookie] = await Promise.all([
    signUp('host'),
    signUp('att1'),
    signUp('att2'),
    signUp('att3'),
  ]);
});

describe('RSVP', () => {
  it('returns 401 without auth', async () => {
    const res = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: 'any' }),
    });
    expect(res.status).toBe(401);
  });

  it('creates an RSVP with state going', async () => {
    const event = await createPublishedEvent(hostCookie);
    const res = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    expect(res.status).toBe(201);
    const { rsvp } = await res.json() as { rsvp: { state: string; eventId: string } };
    expect(rsvp.state).toBe('going');
    expect(rsvp.eventId).toBe(event.id);
  });

  it('enforces one-rsvp-per-user (409 on duplicate)', async () => {
    const event = await createPublishedEvent(hostCookie);
    await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    const dup = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    expect(dup.status).toBe(409);
  });

  it('capacity enforcement: overflow becomes waitlisted', async () => {
    // Capacity = 2: first two going, third is waitlisted.
    const event = await createPublishedEvent(hostCookie, 2);

    // Run sequentially so capacity check is consistent across requests.
    // Concurrent capacity enforcement requires serializable isolation or
    // advisory locks — tested as a unit concern in schema.spec.ts.
    const states: string[] = [];
    for (const cookie of [attendee1Cookie, attendee2Cookie, attendee3Cookie]) {
      const r = await SELF.fetch(RSVPS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ eventId: event.id }),
      });
      const body = await r.json() as { rsvp: { state: string } };
      states.push(body.rsvp.state);
    }

    const goingCount = states.filter((s) => s === 'going').length;
    const waitlistCount = states.filter((s) => s === 'waitlisted').length;
    expect(goingCount).toBe(2);
    expect(waitlistCount).toBe(1);
  });

  it('cancelling an RSVP updates state', async () => {
    const event = await createPublishedEvent(hostCookie);
    const createRes = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    const { rsvp } = await createRes.json() as { rsvp: { id: string } };

    const patchRes = await SELF.fetch(`${RSVPS}/${rsvp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ state: 'cancelled' }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json() as { rsvp: { state: string } };
    expect(updated.rsvp.state).toBe('cancelled');
  });

  it('allows rejoining after cancelling (regression: cancel was permanent)', async () => {
    const event = await createPublishedEvent(hostCookie);

    const joinRes = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    const { rsvp } = await joinRes.json() as { rsvp: { id: string } };

    await SELF.fetch(`${RSVPS}/${rsvp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ state: 'cancelled' }),
    });

    // Rejoining used to 409 forever: the uniqueness guard matched the
    // cancelled row, so the user could never get back in.
    const rejoinRes = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    expect(rejoinRes.status).toBe(201);
    const rejoined = await rejoinRes.json() as { rsvp: { id: string; state: string } };
    expect(rejoined.rsvp.state).toBe('going');
    // Revives the same row rather than creating a duplicate.
    expect(rejoined.rsvp.id).toBe(rsvp.id);

    // A second attempt while active must still be rejected.
    const dupRes = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    expect(dupRes.status).toBe(409);
  });

  it('a cancelled RSVP does not consume a capacity slot on rejoin', async () => {
    // Capacity 1: attendee1 joins, cancels, then rejoins — the freed slot is
    // theirs again, so they come back as 'going' rather than 'waitlisted'.
    const event = await createPublishedEvent(hostCookie, 1);

    const first = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    const { rsvp } = await first.json() as { rsvp: { id: string } };

    await SELF.fetch(`${RSVPS}/${rsvp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ state: 'cancelled' }),
    });

    const rejoin = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: attendee1Cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    expect(rejoin.status).toBe(201);
    const body = await rejoin.json() as { rsvp: { state: string } };
    expect(body.rsvp.state).toBe('going');
  });
});
