/**
 * Notifications system: prefs, in-app rows + triggers, mark-read, and the
 * scheduled-reminder sweep.
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const RSVPS = 'https://example.com/api/rsvps';
const SPONSORS = 'https://example.com/api/sponsors';
const FAVOURITES = 'https://example.com/api/favourites';
const NOTIFICATIONS = 'https://example.com/api/notifications';

const TS = Date.now();

async function signIn(suffix: string) {
  const email = `notif-${suffix}-${TS}@spotseek.test`;
  const pw = 'Notif_Pwd_1!';
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

type Prefs = { emailEnabled: boolean; pushEnabled: boolean; radiusMiles: number; lastLat: number | null; lastLng: number | null };
type NotifRow = { id: string; type: string; title: string; body: string; read: boolean; eventId: string | null };

describe('notification prefs', () => {
  it('GET /prefs returns defaults for a fresh user', async () => {
    const u = await signIn('prefs-default');
    const res = await SELF.fetch(`${NOTIFICATIONS}/prefs`, { headers: { Cookie: u.cookie } });
    expect(res.status).toBe(200);
    const { prefs } = await res.json() as { prefs: Prefs };
    expect(prefs).toEqual({ emailEnabled: true, pushEnabled: false, radiusMiles: 100, lastLat: null, lastLng: null });
  });

  it('PUT /prefs upserts, clamps radius, and rounds lat/lng coarsely', async () => {
    const u = await signIn('prefs-put');
    const lat = 40.7128456;
    const lng = -74.0060218;
    const expectedLat = Math.round(lat * 100) / 100;
    const expectedLng = Math.round(lng * 100) / 100;

    const res = await SELF.fetch(`${NOTIFICATIONS}/prefs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ emailEnabled: false, pushEnabled: true, radiusMiles: 5000, lat, lng }),
    });
    expect(res.status).toBe(200);
    const { prefs } = await res.json() as { prefs: Prefs };
    expect(prefs.emailEnabled).toBe(false);
    expect(prefs.pushEnabled).toBe(true);
    expect(prefs.radiusMiles).toBe(500); // clamped to max
    expect(prefs.lastLat).toBe(expectedLat);
    expect(prefs.lastLng).toBe(expectedLng);

    // Roundtrip via GET.
    const getRes = await SELF.fetch(`${NOTIFICATIONS}/prefs`, { headers: { Cookie: u.cookie } });
    const { prefs: getPrefs } = await getRes.json() as { prefs: Prefs };
    expect(getPrefs).toEqual(prefs);

    // Radius clamps to the floor too.
    const lowRes = await SELF.fetch(`${NOTIFICATIONS}/prefs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: u.cookie },
      body: JSON.stringify({ radiusMiles: 1 }),
    });
    const { prefs: lowPrefs } = await lowRes.json() as { prefs: Prefs };
    expect(lowPrefs.radiusMiles).toBe(10);
  });

  it('GET /prefs requires auth', async () => {
    const res = await SELF.fetch(`${NOTIFICATIONS}/prefs`);
    expect(res.status).toBe(401);
  });
});

describe('sponsor bid notifies host', () => {
  it('creates an in-app notification for the host with unread=1', async () => {
    const host = await signIn('bid-host');
    const sponsor = await signIn('bid-sponsor');

    await SELF.fetch(`${SPONSORS}/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sponsor.cookie },
      body: JSON.stringify({ companyName: 'Bid Co' }),
    });

    const eRes = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ title: 'Bid Event', broadcastSubject: 'Hockey', status: 'published' }),
    });
    const { event } = await eRes.json() as { event: { id: string } };

    const bidRes = await SELF.fetch(`${SPONSORS}/bids`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sponsor.cookie },
      body: JSON.stringify({ eventId: event.id, amountCents: 5000 }),
    });
    expect(bidRes.status).toBe(201);

    const notifRes = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: host.cookie } });
    expect(notifRes.status).toBe(200);
    const { notifications, unread } = await notifRes.json() as { notifications: NotifRow[]; unread: number };
    expect(unread).toBe(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('sponsor_bid');
    expect(notifications[0].title).toContain('Bid Event');
    expect(notifications[0].body).toContain('$50.00');
  });
});

describe('rsvp notifies host', () => {
  it('creates a notification when someone RSVPs', async () => {
    const host = await signIn('rsvp-host');
    const attendee = await signIn('rsvp-att');

    const eRes = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ title: 'RSVP Event', broadcastSubject: 'Soccer', status: 'published' }),
    });
    const { event } = await eRes.json() as { event: { id: string } };

    const rsvpRes = await SELF.fetch(RSVPS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    expect(rsvpRes.status).toBe(201);

    const notifRes = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: host.cookie } });
    const { notifications, unread } = await notifRes.json() as { notifications: NotifRow[]; unread: number };
    expect(unread).toBe(1);
    expect(notifications[0].type).toBe('rsvp');
    expect(notifications[0].body).toContain('1 going');

    // Host RSVPing to their own event should not self-notify.
    // (host isn't RSVPing here, so nothing further to assert beyond the above.)
  });

  it('mark-read: a specific id, then all', async () => {
    const host = await signIn('read-host');
    const attendee = await signIn('read-att');

    const eRes = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ title: 'Read Event', broadcastSubject: 'Tennis', status: 'published' }),
    });
    const { event } = await eRes.json() as { event: { id: string } };
    await SELF.fetch(RSVPS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id }),
    });

    const listRes = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: host.cookie } });
    const { notifications: before, unread: unreadBefore } = await listRes.json() as { notifications: NotifRow[]; unread: number };
    expect(unreadBefore).toBe(1);
    const id = before[0].id;

    const readOneRes = await SELF.fetch(`${NOTIFICATIONS}/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ ids: [id] }),
    });
    expect(readOneRes.status).toBe(200);
    expect(await readOneRes.json()).toEqual({ ok: true });

    const afterOne = await (await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: host.cookie } })).json() as { unread: number };
    expect(afterOne.unread).toBe(0);

    // Second RSVP by a different attendee to have something to mark-all.
    const attendee2 = await signIn('read-att2');
    await SELF.fetch(RSVPS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee2.cookie },
      body: JSON.stringify({ eventId: event.id }),
    });
    const midCheck = await (await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: host.cookie } })).json() as { unread: number };
    expect(midCheck.unread).toBe(1);

    const readAllRes = await SELF.fetch(`${NOTIFICATIONS}/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({}),
    });
    expect(readAllRes.status).toBe(200);
    const finalCheck = await (await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: host.cookie } })).json() as { unread: number };
    expect(finalCheck.unread).toBe(0);
  });
});

describe('event cancel notifies attendee', () => {
  it('notifies going RSVPs when a host cancels', async () => {
    const host = await signIn('cancel-host');
    const attendee = await signIn('cancel-att');

    const eRes = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ title: 'Cancel Event', broadcastSubject: 'Baseball', status: 'published' }),
    });
    const { event } = await eRes.json() as { event: { id: string } };
    await SELF.fetch(RSVPS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id }),
    });

    const patchRes = await SELF.fetch(`${EVENTS}/${event.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    expect(patchRes.status).toBe(200);

    const notifRes = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: attendee.cookie } });
    const { notifications } = await notifRes.json() as { notifications: NotifRow[] };
    expect(notifications.some((n) => n.type === 'event_cancelled' && n.eventId === event.id)).toBe(true);
  });
});

describe('favorite_nearby fanout', () => {
  it('notifies users within radius who favourited the subject, but not those far away', async () => {
    const host = await signIn('fav-host');
    const near = await signIn('fav-near');
    const far = await signIn('fav-far');
    const subject = `Curling-${TS}`;

    await SELF.fetch(FAVOURITES, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: near.cookie },
      body: JSON.stringify({ type: 'sport', value: subject }),
    });
    await SELF.fetch(FAVOURITES, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: far.cookie },
      body: JSON.stringify({ type: 'sport', value: subject }),
    });

    // Venue: NYC. `near` sets their location to NYC (within default 100mi
    // radius); `far` sets theirs to LA (well outside).
    await SELF.fetch(`${NOTIFICATIONS}/prefs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: near.cookie },
      body: JSON.stringify({ lat: 40.7128, lng: -74.0060 }),
    });
    await SELF.fetch(`${NOTIFICATIONS}/prefs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: far.cookie },
      body: JSON.stringify({ lat: 34.0522, lng: -118.2437 }),
    });

    const eRes = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({
        title: 'Curling Watch Party',
        broadcastSubject: subject,
        status: 'published',
        venueName: 'The Rink',
        venueLat: 40.7128,
        venueLng: -74.0060,
      }),
    });
    expect(eRes.status).toBe(201);
    const { event } = await eRes.json() as { event: { id: string } };

    const nearRes = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: near.cookie } });
    const { notifications: nearNotifs } = await nearRes.json() as { notifications: NotifRow[] };
    expect(nearNotifs.some((n) => n.type === 'favorite_nearby' && n.eventId === event.id)).toBe(true);

    const farRes = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: far.cookie } });
    const { notifications: farNotifs } = await farRes.json() as { notifications: NotifRow[] };
    expect(farNotifs.some((n) => n.type === 'favorite_nearby' && n.eventId === event.id)).toBe(false);
  });
});

describe('scheduled reminder sweep', () => {
  it('creates reminder_24h once for an event ~24.1h out, and does not duplicate on a second run', async () => {
    const host = await signIn('rem24-host');
    const attendee = await signIn('rem24-att');

    const startsAt = new Date(Date.now() + 24.1 * 60 * 60 * 1000).toISOString();
    const eRes = await SELF.fetch(EVENTS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: host.cookie },
      body: JSON.stringify({ title: 'Reminder Sweep Event', broadcastSubject: 'Golf', status: 'published', startsAt }),
    });
    const { event } = await eRes.json() as { event: { id: string } };
    await SELF.fetch(RSVPS, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attendee.cookie },
      body: JSON.stringify({ eventId: event.id }),
    });

    const run1 = await SELF.fetch(`${NOTIFICATIONS}/run-reminders`, {
      method: 'POST', headers: { Cookie: attendee.cookie },
    });
    expect(run1.status).toBe(200);

    const listRes1 = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: attendee.cookie } });
    const { notifications: notifs1 } = await listRes1.json() as { notifications: NotifRow[] };
    const reminders1 = notifs1.filter((n) => n.type === 'reminder_24h' && n.eventId === event.id);
    expect(reminders1).toHaveLength(1);

    const run2 = await SELF.fetch(`${NOTIFICATIONS}/run-reminders`, {
      method: 'POST', headers: { Cookie: attendee.cookie },
    });
    expect(run2.status).toBe(200);

    const listRes2 = await SELF.fetch(NOTIFICATIONS, { headers: { Cookie: attendee.cookie } });
    const { notifications: notifs2 } = await listRes2.json() as { notifications: NotifRow[] };
    const reminders2 = notifs2.filter((n) => n.type === 'reminder_24h' && n.eventId === event.id);
    expect(reminders2).toHaveLength(1);
  });
});
