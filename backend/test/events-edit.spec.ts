/**
 * Event edit tests (task 1.4).
 * Key invariants:
 *  - venue change never alters host_id
 *  - non-host cannot edit (403)
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';

const TS = Date.now();
const HOST = { email: `host-edit-${TS}@spotseek.test`, password: 'Host_Pwd_789!', name: 'Edit Host' };
const OTHER = { email: `other-edit-${TS}@spotseek.test`, password: 'Other_Pwd_789!', name: 'Other User' };

let hostCookie = '';
let otherCookie = '';
let eventId = '';
let hostId = '';

async function signIn(email: string, password: string) {
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: email.split('@')[0] }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

beforeAll(async () => {
  [hostCookie, otherCookie] = await Promise.all([
    signIn(HOST.email, HOST.password),
    signIn(OTHER.email, OTHER.password),
  ]);

  // Host gets their ID from the session.
  const sess = await SELF.fetch(`${AUTH}/get-session`, { headers: { Cookie: hostCookie } });
  hostId = ((await sess.json()) as { user: { id: string } }).user.id;

  // Create an event to edit.
  const res = await SELF.fetch(EVENTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
    body: JSON.stringify({ title: 'Original Title', broadcastSubject: 'Some Game' }),
  });
  eventId = ((await res.json()) as { event: { id: string } }).event.id;
});

describe('event edit', () => {
  it('host can edit title', async () => {
    const res = await SELF.fetch(`${EVENTS}/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
      body: JSON.stringify({ title: 'Updated Title' }),
    });
    expect(res.status).toBe(200);
    const { event } = await res.json() as { event: { title: string; hostId: string } };
    expect(event.title).toBe('Updated Title');
    expect(event.hostId).toBe(hostId);
  });

  it('venue change never alters host_id', async () => {
    const res = await SELF.fetch(`${EVENTS}/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
      body: JSON.stringify({
        venueName: 'The Crown',
        venueAddress: '1 High Street',
        venueLat: 51.5,
        venueLng: -0.12,
      }),
    });
    expect(res.status).toBe(200);
    const { event } = await res.json() as { event: Record<string, unknown> };
    expect(event.venueName).toBe('The Crown');
    // The invariant: host_id is unchanged after venue edit.
    expect(event.hostId).toBe(hostId);
  });

  it('non-host gets 403', async () => {
    const res = await SELF.fetch(`${EVENTS}/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: otherCookie },
      body: JSON.stringify({ title: 'Hijacked' }),
    });
    expect(res.status).toBe(403);
  });

  it('edit attempt to override host_id is ignored', async () => {
    const res = await SELF.fetch(`${EVENTS}/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
      body: JSON.stringify({ hostId: 'attacker-id', title: 'Sneaky Edit' }),
    });
    expect(res.status).toBe(200);
    const { event } = await res.json() as { event: { hostId: string } };
    expect(event.hostId).toBe(hostId);
    expect(event.hostId).not.toBe('attacker-id');
  });

  it('unauthenticated edit returns 401', async () => {
    const res = await SELF.fetch(`${EVENTS}/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No Auth' }),
    });
    expect(res.status).toBe(401);
  });
});
