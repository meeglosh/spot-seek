/**
 * Event creation integration tests.
 * Verifies the host_id invariant: host_id always comes from the authenticated
 * session, never from the request body.
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';

const EMAIL = `host-${Date.now()}@spotseek.test`;
const PASSWORD = 'Host_Password_456!';
const NAME = 'Event Host';

let sessionCookie = '';

beforeAll(async () => {
  // Sign up and sign in to get a session.
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: NAME }),
  });
  const signIn = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  sessionCookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
});

describe('event creation', () => {
  it('returns 401 without authentication', async () => {
    const res = await SELF.fetch(EVENTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', broadcastSubject: 'Game' }),
    });
    expect(res.status).toBe(401);
  });

  it('creates an event and the host_id comes from the session', async () => {
    const sessionRes = await SELF.fetch(`${AUTH}/get-session`, {
      headers: { Cookie: sessionCookie },
    });
    const session = await sessionRes.json() as { user: { id: string } };
    const authUserId = session.user.id;

    const res = await SELF.fetch(EVENTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({
        title: 'Arsenal v Spurs Watch Party',
        broadcastSubject: 'Arsenal v Spurs',
        capacity: 20,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { event: { hostId: string; title: string } };
    expect(body.event.title).toBe('Arsenal v Spurs Watch Party');
    // The invariant: host_id equals the authenticated user's id.
    expect(body.event.hostId).toBe(authUserId);
  });

  it('host_id cannot be overridden from the request body', async () => {
    const sessionRes = await SELF.fetch(`${AUTH}/get-session`, {
      headers: { Cookie: sessionCookie },
    });
    const session = await sessionRes.json() as { user: { id: string } };
    const authUserId = session.user.id;

    const res = await SELF.fetch(EVENTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({
        title: 'Attempted Hijack',
        broadcastSubject: 'Big Game',
        // Attacker tries to set a different hostId — must be ignored.
        hostId: 'attacker-supplied-id',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { event: { hostId: string } };
    expect(body.event.hostId).toBe(authUserId);
    expect(body.event.hostId).not.toBe('attacker-supplied-id');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await SELF.fetch(EVENTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ title: 'Only Title' }),
    });
    expect(res.status).toBe(400);
  });

  it('stores optional venue fields correctly', async () => {
    const res = await SELF.fetch(EVENTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({
        title: 'Venue Party',
        broadcastSubject: 'Champions League Final',
        venueName: 'The Red Lion',
        venueAddress: '123 Main St',
        venueLat: 51.5,
        venueLng: -0.1,
        isPrivateLocation: false,
      }),
    });
    expect(res.status).toBe(201);
    const { event } = await res.json() as { event: Record<string, unknown> };
    expect(event.venueName).toBe('The Red Lion');
    expect(event.venueAddress).toBe('123 Main St');
    expect(event.venueLat).toBe(51.5);
    expect(event.isPrivateLocation).toBe(false);
  });
});
