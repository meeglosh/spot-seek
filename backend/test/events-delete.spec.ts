/**
 * Event deletion — regression test for the FK bug where deleting an event
 * that had RSVPs failed (rsvps.event_id has no ON DELETE CASCADE).
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const RSVPS = 'https://example.com/api/rsvps';

const TS = Date.now();
const HOST = { email: `host-del-${TS}@spotseek.test`, password: 'Host_Pwd_789!', name: 'Delete Host' };
const GUEST = { email: `guest-del-${TS}@spotseek.test`, password: 'Guest_Pwd_789!', name: 'Delete Guest' };

let hostCookie = '';
let guestCookie = '';
let eventId = '';

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
  [hostCookie, guestCookie] = await Promise.all([
    signIn(HOST.email, HOST.password),
    signIn(GUEST.email, GUEST.password),
  ]);

  const res = await SELF.fetch(EVENTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
    body: JSON.stringify({ title: 'Doomed Party', broadcastSubject: 'The Big Game', status: 'published' }),
  });
  eventId = ((await res.json()) as { event: { id: string } }).event.id;
});

describe('DELETE /api/events/:id', () => {
  it('deletes an event that has RSVPs (regression: FK violation 500)', async () => {
    // Guest RSVPs to the event first.
    const rsvpRes = await SELF.fetch(RSVPS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: guestCookie },
      body: JSON.stringify({ eventId }),
    });
    expect(rsvpRes.status).toBe(201);

    // Host deletes the event — must succeed despite the RSVP row.
    const delRes = await SELF.fetch(`${EVENTS}/${eventId}`, {
      method: 'DELETE',
      headers: { Cookie: hostCookie },
    });
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ deleted: true });

    // Event is really gone.
    const getRes = await SELF.fetch(`${EVENTS}/${eventId}`);
    expect(getRes.status).toBe(404);
  });

  it('non-host cannot delete (403)', async () => {
    const res = await SELF.fetch(EVENTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
      body: JSON.stringify({ title: 'Protected Party', broadcastSubject: 'Game' }),
    });
    const id = ((await res.json()) as { event: { id: string } }).event.id;

    const delRes = await SELF.fetch(`${EVENTS}/${id}`, {
      method: 'DELETE',
      headers: { Cookie: guestCookie },
    });
    expect(delRes.status).toBe(403);
  });
});
