/**
 * Event moderation: blocklist, pre-publish screening, reporting + auto-hide,
 * visibility, blocking, admin review, repeat-offender pause and the daily
 * digest. Timestamp-unique fixtures (shared dev DB). The Workers AI classifier
 * is ALWAYS mocked (never a real model call) and Resend is stubbed.
 */
import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import worker from '../src/index';
import { __setEmailGuardTestHooks } from '../src/email-guard';
import { __setClassifierForTests, parseGuardOutput } from '../src/moderation/classifier';
import { matchBlocklist } from '../src/moderation/blocklist';
import { runModerationDigest } from '../src/moderation/admin';

// Several tests sign up 3-4 users against the remote dev DB; give them room.
vi.setConfig({ testTimeout: 30_000 });

const BASE = 'https://example.com';
const json = { 'Content-Type': 'application/json' };
const ADMIN = { Authorization: 'Bearer test-admin-secret' };
const TS = Date.now();
const realFetch = globalThis.fetch;
const sql = () => neon(env.DATABASE_URL);

let resendSent: { to: string; subject: string }[] = [];
let ipCounter = 0;

function app(path: string, init: RequestInit = {}, overrides: Record<string, unknown> = {}) {
  const ctx = createExecutionContext();
  return worker.fetch(
    new Request(`${BASE}${path}`, init),
    { ...env, ...overrides } as unknown as Env,
    ctx,
  ) as Promise<Response>;
}

// Mock classifier driven by marker words in the text.
beforeEach(() => {
  resendSent = [];
  __setEmailGuardTestHooks({ allowTestDomains: true, reserve: async () => 1 });
  __setClassifierForTests(async (_env, text) => {
    if (text.includes('REJECTME')) return { safe: false, categories: ['S10'] };
    if (text.includes('FLAGME')) return { safe: false, categories: ['S12'] };
    return { safe: true, categories: [] };
  });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.resend.com/')) {
      resendSent.push(JSON.parse(String(init?.body)));
      return new Response('{}', { status: 200 });
    }
    return realFetch(input, init);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  __setEmailGuardTestHooks(null);
  __setClassifierForTests(null);
});

async function signIn(suffix: string) {
  const email = `mod-${suffix}-${TS}@spotseek.test`;
  const pw = 'Moderation_Pwd_1!';
  await app('/api/auth/sign-up/email', {
    method: 'POST', headers: json, body: JSON.stringify({ email, password: pw, name: `Mod ${suffix}` }),
  });
  const res = await app('/api/auth/sign-in/email', {
    method: 'POST', headers: json, body: JSON.stringify({ email, password: pw }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const sess = await app('/api/auth/get-session', { headers: { Cookie: cookie } });
  const { user } = (await sess.json()) as { user: { id: string } };
  return { cookie, id: user.id };
}
type User = Awaited<ReturnType<typeof signIn>>;

async function createEvent(host: User, overrides: Record<string, unknown> = {}) {
  const res = await app('/api/events', {
    method: 'POST', headers: { ...json, Cookie: host.cookie },
    body: JSON.stringify({
      title: `Mod Party ${TS} ${Math.random().toString(36).slice(2, 8)}`,
      broadcastSubject: 'Basketball',
      status: 'published',
      startsAt: new Date(Date.now() + 60_000).toISOString(),
      ...overrides,
    }),
  });
  return { res, body: (await res.json()) as { event?: { id: string; title: string; moderationStatus: string }; error?: string; message?: string } };
}
const mk = async (host: User, overrides: Record<string, unknown> = {}) => (await createEvent(host, overrides)).body.event!;

const report = (user: User, eventId: string, reason = 'spam', note?: string) =>
  app(`/api/events/${eventId}/report`, {
    method: 'POST', headers: { ...json, Cookie: user.cookie }, body: JSON.stringify({ reason, note }),
  });
const modStatus = async (id: string) =>
  ((await sql()`SELECT moderation_status AS s FROM events WHERE id = ${id}`) as { s: string }[])[0]?.s;
const logActions = async (id: string) =>
  ((await sql()`SELECT action FROM moderation_events WHERE event_id = ${id} ORDER BY created_at`) as { action: string }[]).map((r) => r.action);
const getEvent = (id: string, headers: Record<string, string> = {}) => app(`/api/events/${id}`, { headers });
const feedIds = async (q: string, headers: Record<string, string> = {}) =>
  ((await (await app(`/api/feed?q=${encodeURIComponent(q)}&limit=50`, { headers })).json()) as { events: { id: string }[] }).events.map((e) => e.id);

// ─── Blocklist ────────────────────────────────────────────────────────────────

describe('blocklist', () => {
  it.each([
    'nigger', 'N1GG3R', 'niiiiigger', 'n.i.g.g.e.r', 'n i g g e r', 'nig-ger', 'faggot', 'F@gg0t',
    'Join us for white power night', 'HEIL  HITLER', 'kill all muslims', 'k1ke', 'sp1c', 'wetback',
  ])('rejects "%s"', (t) => {
    expect(matchBlocklist(t)).not.toBeNull();
  });

  it.each([
    'Niger vs Ghana watch party', 'Arsenal v Spurs', 'Mike and Ike night', 'Go OK State',
    'Premier League Sunday, bring snacks', 'Shit show of a season, come vent', 'chink in their armor',
    'Class of 1488 reunion?', 'Super Bowl LX', 'Whitepower plant tour',
  ])('passes "%s"', (t) => {
    expect(matchBlocklist(t)).toBeNull();
  });

  it('parses both Llama Guard output shapes', () => {
    expect(parseGuardOutput({ response: { safe: false, categories: ['S10', 's1'] } })).toEqual({ safe: false, categories: ['S10', 'S1'] });
    expect(parseGuardOutput({ response: { safe: true } })).toEqual({ safe: true, categories: [] });
    expect(parseGuardOutput('unsafe\nS12,S4')).toEqual({ safe: false, categories: ['S12', 'S4'] });
    expect(parseGuardOutput('safe')).toEqual({ safe: true, categories: [] });
    expect(parseGuardOutput({ nonsense: 1 })).toBeNull();
  });
});

// ─── Pre-publish screening ────────────────────────────────────────────────────

describe('pre-publish screening', () => {
  it('rejects a blocklist hit on publish with 422, allows it as a draft, then blocks publishing the draft', async () => {
    const host = await signIn('scr-host');
    const bad = await createEvent(host, { title: `n1gg3r night ${TS}` });
    expect(bad.res.status).toBe(422);
    expect(bad.body).toEqual({ error: 'content_rejected', message: "This doesn't meet our community guidelines." });

    const draft = await createEvent(host, { title: `n1gg3r night ${TS}`, status: 'draft' });
    expect(draft.res.status).toBe(201);
    const id = draft.body.event!.id;

    const pub = await app(`/api/events/${id}`, {
      method: 'PATCH', headers: { ...json, Cookie: host.cookie }, body: JSON.stringify({ status: 'published' }),
    });
    expect(pub.status).toBe(422);
    expect(((await pub.json()) as { error: string }).error).toBe('content_rejected');
    expect(await logActions(id)).toContain('blocked_on_publish');

    const rows = (await sql()`SELECT status FROM events WHERE id = ${id}`) as { status: string }[];
    expect(rows[0].status).toBe('draft');
  });

  it('screens edits to a published event (title/description/venue/subject) and leaves it untouched on reject', async () => {
    const host = await signIn('scr-edit');
    const ev = await mk(host);
    for (const field of ['title', 'description', 'venueName', 'broadcastSubject']) {
      const res = await app(`/api/events/${ev.id}`, {
        method: 'PATCH', headers: { ...json, Cookie: host.cookie }, body: JSON.stringify({ [field]: 'kill all gays' }),
      });
      expect(res.status, field).toBe(422);
    }
    const ok = await app(`/api/events/${ev.id}`, {
      method: 'PATCH', headers: { ...json, Cookie: host.cookie }, body: JSON.stringify({ description: 'Bring snacks' }),
    });
    expect(ok.status).toBe(200);
  });

  it('classifier hate/violence category rejects the publish (422)', async () => {
    const host = await signIn('scr-cls');
    const r = await createEvent(host, { description: 'REJECTME' });
    expect(r.res.status).toBe(422);
    expect(r.body.error).toBe('content_rejected');
  });

  it('other unsafe categories publish but are flagged and logged', async () => {
    const host = await signIn('scr-flag');
    const r = await createEvent(host, { description: 'FLAGME' });
    expect(r.res.status).toBe(201);
    expect(r.body.event!.moderationStatus).toBe('flagged');
    expect(await logActions(r.body.event!.id)).toEqual(['auto_flagged']);
    // Flagged is still live to the public.
    expect((await getEvent(r.body.event!.id)).status).toBe(200);
    expect(await feedIds(r.body.event!.title)).toContain(r.body.event!.id);
  });

  it('fails open when the classifier errors, but the blocklist still fails closed', async () => {
    __setClassifierForTests(async () => { throw new Error('AI down'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const host = await signIn('scr-open');
    expect((await createEvent(host)).res.status).toBe(201);
    expect((await createEvent(host, { title: 'faggot night' })).res.status).toBe(422);
  });
});

// ─── Reporting + auto-hide ────────────────────────────────────────────────────

describe('reporting', () => {
  it('needs auth, a valid reason and a short note', async () => {
    const host = await signIn('rep-host');
    const u = await signIn('rep-u1');
    const ev = await mk(host);
    expect((await app(`/api/events/${ev.id}/report`, { method: 'POST', headers: json, body: JSON.stringify({ reason: 'spam' }) })).status).toBe(401);
    expect((await report(u, ev.id, 'nope')).status).toBe(400);
    expect((await report(u, ev.id, 'spam', 'x'.repeat(501))).status).toBe(400);
    expect((await report(u, '00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('is idempotent per reporter and denied for the host', async () => {
    const host = await signIn('rep2-host');
    const u = await signIn('rep2-u');
    const ev = await mk(host);
    expect((await report(host, ev.id)).status).toBe(403);
    const first = await report(u, ev.id, 'spam', 'meh');
    expect(first.status).toBe(201);
    const second = await report(u, ev.id, 'harassment');
    expect(second.status).toBe(200);
    expect(((await second.json()) as { duplicate: boolean }).duplicate).toBe(true);
    const n = (await sql()`SELECT count(*)::int AS n FROM event_reports WHERE event_id = ${ev.id}`) as { n: number }[];
    expect(n[0].n).toBe(1);
    expect(await modStatus(ev.id)).toBe('ok');
  });

  it('hides immediately on a single hate report, tells the host, keeps RSVPs', async () => {
    const host = await signIn('hate-host');
    const att = await signIn('hate-att');
    const rep = await signIn('hate-rep');
    const ev = await mk(host);
    expect((await app('/api/rsvps', { method: 'POST', headers: { ...json, Cookie: att.cookie }, body: JSON.stringify({ eventId: ev.id }) })).status).toBe(201);

    expect((await report(rep, ev.id, 'hate')).status).toBe(201);
    expect(await modStatus(ev.id)).toBe('hidden');
    expect(await logActions(ev.id)).toContain('auto_hidden');

    const notes = (await sql()`SELECT title, body, type FROM notifications WHERE user_id = ${host.id} AND event_id = ${ev.id}`) as { title: string; type: string }[];
    expect(notes.some((n) => n.type === 'event_under_review' && n.title === 'Your party is under review.')).toBe(true);

    const rsvps = (await sql()`SELECT state FROM rsvps WHERE event_id = ${ev.id} AND user_id = ${att.id}`) as { state: string }[];
    expect(rsvps[0].state).toBe('going');
  });

  it('hides at 3 distinct reporters, not before', async () => {
    const host = await signIn('three-host');
    const [a, b, c] = await Promise.all([signIn('three-a'), signIn('three-b'), signIn('three-c')]);
    const ev = await mk(host);
    await report(a, ev.id, 'spam');
    await report(b, ev.id, 'other');
    expect(await modStatus(ev.id)).toBe('ok');
    await report(c, ev.id, 'harassment');
    expect(await modStatus(ev.id)).toBe('hidden');
  });

  it('hides on one report when the event is already flagged', async () => {
    const host = await signIn('fl-host');
    const u = await signIn('fl-u');
    const ev = await mk(host, { description: 'FLAGME' });
    expect(ev.moderationStatus).toBe('flagged');
    await report(u, ev.id, 'other');
    expect(await modStatus(ev.id)).toBe('hidden');
  });

  it('re-runs the classifier on report and hides when it now flags the event', async () => {
    const host = await signIn('rr-host');
    const u = await signIn('rr-u');
    const ev = await mk(host, { description: 'SNEAKY' });
    expect(ev.moderationStatus).toBe('ok');
    __setClassifierForTests(async () => ({ safe: false, categories: ['S12'] }));
    await report(u, ev.id, 'sexual');
    expect(await modStatus(ev.id)).toBe('hidden');
    expect(await logActions(ev.id)).toEqual(['auto_flagged', 'auto_hidden']);
  });

  it('one non-hate report on a clean event does nothing', async () => {
    const host = await signIn('one-host');
    const u = await signIn('one-u');
    const ev = await mk(host);
    await report(u, ev.id, 'spam');
    expect(await modStatus(ev.id)).toBe('ok');
  });
});

// ─── Visibility ───────────────────────────────────────────────────────────────

describe('visibility', () => {
  it('hidden events 404 for others, stay visible to the host and admin, and leave discovery', async () => {
    const host = await signIn('vis-host');
    const other = await signIn('vis-other');
    const rep = await signIn('vis-rep');
    const ev = await mk(host);
    expect(await feedIds(ev.title)).toContain(ev.id);
    await report(rep, ev.id, 'hate');
    expect(await modStatus(ev.id)).toBe('hidden');

    expect((await getEvent(ev.id)).status).toBe(404);
    expect((await getEvent(ev.id, { Cookie: other.cookie })).status).toBe(404);
    expect((await getEvent(ev.id, { Cookie: host.cookie })).status).toBe(200);
    expect((await getEvent(ev.id, ADMIN)).status).toBe(200);

    expect(await feedIds(ev.title)).not.toContain(ev.id);
    const page = await app(`/e/${ev.id}`);
    expect(page.status).toBe(404);
    expect((await page.text())).toContain('Party not found');
    expect((await app(`/e/${ev.id}`, { headers: { Cookie: host.cookie } })).status).toBe(200);

    const sitemap = await (await app('/sitemap.xml')).text();
    expect(sitemap).not.toContain(ev.id);
    expect((await app(`/rsvp/${ev.id}/event.ics`)).status).toBe(404);
    expect((await app(`/api/events/${ev.id}/occurrences`)).status).toBe(404);
  });

  it('sitemap and feed list a normal published event', async () => {
    const host = await signIn('vis2-host');
    const ev = await mk(host);
    expect(await feedIds(ev.title)).toContain(ev.id);
    expect(await (await app('/sitemap.xml')).text()).toContain(ev.id);
  });

  it('draft events 404 publicly (API and /e/:id) but not for the host', async () => {
    const host = await signIn('draft-host');
    const ev = await mk(host, { status: 'draft' });
    expect((await getEvent(ev.id)).status).toBe(404);
    const page = await app(`/e/${ev.id}`);
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('Party not found');
    expect((await getEvent(ev.id, { Cookie: host.cookie })).status).toBe(200);
    expect((await app(`/e/${ev.id}`, { headers: { Cookie: host.cookie } })).status).toBe(200);
    expect(await feedIds(ev.title)).not.toContain(ev.id);
  });

  it('cancelled events stay reachable (attendees see "cancelled") but are not in the feed', async () => {
    const host = await signIn('canc-host');
    const ev = await mk(host);
    await app(`/api/events/${ev.id}`, { method: 'PATCH', headers: { ...json, Cookie: host.cookie }, body: JSON.stringify({ status: 'cancelled' }) });
    expect((await getEvent(ev.id)).status).toBe(200);
    const page = await app(`/e/${ev.id}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Cancelled');
    expect(await feedIds(ev.title)).not.toContain(ev.id);
  });

  it('guest web RSVP is refused for hidden and draft events', async () => {
    const host = await signIn('guest-host');
    const hidden = await mk(host);
    const rep = await signIn('guest-rep');
    await report(rep, hidden.id, 'hate');
    const draft = await mk(host, { status: 'draft' });
    // Hidden: 404. Draft: the existing generic "closed" 410 (no event content exposed).
    for (const [id, want] of [[hidden.id, 404], [draft.id, 410]] as const) {
      const res = await app(`/rsvp/${id}`, {
        method: 'POST',
        headers: { ...json, 'cf-connecting-ip': `10.9.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}` },
        body: JSON.stringify({ name: 'Gus', email: `gus-${TS}@spotseek.test`, website: '' }),
      });
      expect(res.status).toBe(want);
    }
  });
});

// ─── Blocking ─────────────────────────────────────────────────────────────────

describe('blocking', () => {
  it('requires auth, rejects self-block, lists and removes blocks', async () => {
    const a = await signIn('blk-a');
    const b = await signIn('blk-b');
    expect((await app(`/api/users/${b.id}/block`, { method: 'POST' })).status).toBe(401);
    expect((await app(`/api/users/${a.id}/block`, { method: 'POST', headers: { Cookie: a.cookie } })).status).toBe(400);
    expect((await app(`/api/users/nobody-${TS}/block`, { method: 'POST', headers: { Cookie: a.cookie } })).status).toBe(404);
    expect((await app(`/api/users/${b.id}/block`, { method: 'POST', headers: { Cookie: a.cookie } })).status).toBe(201);
    // Idempotent.
    expect((await app(`/api/users/${b.id}/block`, { method: 'POST', headers: { Cookie: a.cookie } })).status).toBe(201);
    const list = (await (await app('/api/users/blocked', { headers: { Cookie: a.cookie } })).json()) as { blocks: { userId: string }[] };
    expect(list.blocks.map((x) => x.userId)).toEqual([b.id]);
    expect((await app(`/api/users/${b.id}/block`, { method: 'DELETE', headers: { Cookie: a.cookie } })).status).toBe(200);
    const after = (await (await app('/api/users/blocked', { headers: { Cookie: a.cookie } })).json()) as { blocks: unknown[] };
    expect(after.blocks).toEqual([]);
    expect((await app('/api/users/blocked')).status).toBe(401);
  });

  it('a blocked user cannot RSVP or see the blocker\'s events; the blocker does not see theirs', async () => {
    const host = await signIn('blk2-host');
    const guest = await signIn('blk2-guest');
    const ev = await mk(host);
    const evOfGuest = await mk(guest);

    expect(await feedIds(ev.title, { Cookie: guest.cookie })).toContain(ev.id);
    await app(`/api/users/${guest.id}/block`, { method: 'POST', headers: { Cookie: host.cookie } });

    expect(await feedIds(ev.title, { Cookie: guest.cookie })).not.toContain(ev.id);
    expect(await feedIds(ev.title)).toContain(ev.id); // anonymous feed unaffected
    expect(await feedIds(ev.title, { Cookie: host.cookie })).toContain(ev.id); // host still sees own
    // The blocker no longer sees the blocked user's events either.
    expect(await feedIds(evOfGuest.title, { Cookie: host.cookie })).not.toContain(evOfGuest.id);

    const rsvp = await app('/api/rsvps', { method: 'POST', headers: { ...json, Cookie: guest.cookie }, body: JSON.stringify({ eventId: ev.id }) });
    expect(rsvp.status).toBe(403);

    await app(`/api/users/${guest.id}/block`, { method: 'DELETE', headers: { Cookie: host.cookie } });
    expect(await feedIds(ev.title, { Cookie: guest.cookie })).toContain(ev.id);
    expect((await app('/api/rsvps', { method: 'POST', headers: { ...json, Cookie: guest.cookie }, body: JSON.stringify({ eventId: ev.id }) })).status).toBe(201);
  });
});

// ─── Admin review ─────────────────────────────────────────────────────────────

describe('admin moderation', () => {
  it('requires the admin secret on every route', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    expect((await app('/api/admin/moderation/queue')).status).toBe(401);
    expect((await app(`/api/admin/moderation/events/${id}/restore`, { method: 'POST' })).status).toBe(401);
    expect((await app(`/api/admin/moderation/events/${id}/remove`, { method: 'POST' })).status).toBe(401);
    const user = await signIn('adm-user');
    expect((await app('/api/admin/moderation/queue', { headers: { Cookie: user.cookie } })).status).toBe(401);
    expect((await app(`/api/admin/moderation/events/${id}/restore`, { method: 'POST', headers: ADMIN })).status).toBe(404);
  });

  it('lists the queue with report counts, restores (reports reset), and removes with a host notice', async () => {
    const host = await signIn('adm-host');
    const r1 = await signIn('adm-r1');
    const r2 = await signIn('adm-r2');
    const r3 = await signIn('adm-r3');
    const ev = await mk(host);
    await report(r1, ev.id, 'hate', 'bad stuff');

    const queue = (await (await app('/api/admin/moderation/queue', { headers: ADMIN })).json()) as {
      events: { id: string; moderationStatus: string; reportCount: number; reasons: Record<string, number>; notes: string[] }[];
    };
    const item = queue.events.find((e) => e.id === ev.id)!;
    expect(item.moderationStatus).toBe('hidden');
    expect(item.reportCount).toBe(1);
    expect(item.reasons).toEqual({ hate: 1 });
    expect(item.notes).toEqual(['bad stuff']);

    const restored = await app(`/api/admin/moderation/events/${ev.id}/restore`, { method: 'POST', headers: ADMIN });
    expect(restored.status).toBe(200);
    expect(await modStatus(ev.id)).toBe('ok');
    expect((await getEvent(ev.id)).status).toBe(200);
    expect(await logActions(ev.id)).toEqual(['auto_hidden', 'restored']);

    // Old reports do not count after a restore: one new non-hate report leaves it up.
    await report(r2, ev.id, 'spam');
    expect(await modStatus(ev.id)).toBe('ok');
    await report(r3, ev.id, 'spam');
    expect(await modStatus(ev.id)).toBe('ok');

    const removed = await app(`/api/admin/moderation/events/${ev.id}/remove`, { method: 'POST', headers: ADMIN });
    expect(removed.status).toBe(200);
    expect(await modStatus(ev.id)).toBe('removed');
    expect((await getEvent(ev.id)).status).toBe(404);
    const notes = (await sql()`SELECT type FROM notifications WHERE user_id = ${host.id} AND event_id = ${ev.id}`) as { type: string }[];
    expect(notes.map((n) => n.type)).toContain('event_removed');
    // A removed event cannot be edited back to life by its host.
    const edit = await app(`/api/events/${ev.id}`, { method: 'PATCH', headers: { ...json, Cookie: host.cookie }, body: JSON.stringify({ title: 'Back again' }) });
    expect(edit.status).toBe(403);
  });
});

// ─── Repeat offenders ─────────────────────────────────────────────────────────

describe('repeat-offender pause', () => {
  it('blocks publishing after 2 removals in 90 days (drafts still save), until one is restored', async () => {
    const host = await signIn('rep-off');
    const e1 = await mk(host);
    const e2 = await mk(host);
    await app(`/api/admin/moderation/events/${e1.id}/remove`, { method: 'POST', headers: ADMIN });
    // One removal: still allowed.
    expect((await createEvent(host)).res.status).toBe(201);
    await app(`/api/admin/moderation/events/${e2.id}/remove`, { method: 'POST', headers: ADMIN });

    const blocked = await createEvent(host);
    expect(blocked.res.status).toBe(403);
    expect(blocked.body.error).toBe('publishing_paused');

    const draft = await createEvent(host, { status: 'draft' });
    expect(draft.res.status).toBe(201);
    const pub = await app(`/api/events/${draft.body.event!.id}`, { method: 'PATCH', headers: { ...json, Cookie: host.cookie }, body: JSON.stringify({ status: 'published' }) });
    expect(pub.status).toBe(403);
    expect(((await pub.json()) as { error: string }).error).toBe('publishing_paused');

    await app(`/api/admin/moderation/events/${e2.id}/restore`, { method: 'POST', headers: ADMIN });
    expect((await createEvent(host)).res.status).toBe(201);
  });
});

// ─── Daily digest ─────────────────────────────────────────────────────────────

describe('moderation digest', () => {
  it('emails hello@spotseek.app at most once per UTC day, and only when the queue is non-empty', async () => {
    const host = await signIn('dig-host');
    const rep = await signIn('dig-rep');
    const ev = await mk(host);
    await report(rep, ev.id, 'hate'); // guarantees a non-empty queue

    // A synthetic far-future day so this never collides with a real digest row.
    const day = new Date(Date.UTC(2090, TS % 12, 1 + (TS % 27)));
    await sql()`DELETE FROM moderation_digests WHERE day = ${day.toISOString().slice(0, 10)}`;
    const e = { ...env, RESEND_API_KEY: 'test-resend-key' } as unknown as Env;

    expect(await runModerationDigest(e, day)).toBe('sent');
    expect(await runModerationDigest(e, day)).toBe('already_sent');
    expect(await runModerationDigest(e, new Date(day.getTime() + 3600_000))).toBe('already_sent');
    const digests = resendSent.filter((m) => m.to === 'hello@spotseek.app');
    expect(digests.length).toBe(1);
    expect(digests[0].subject).toMatch(/^Moderation queue: \d+ to review$/);

    await sql()`DELETE FROM moderation_digests WHERE day = ${day.toISOString().slice(0, 10)}`;
  });
});

describe('guidelines page', () => {
  it('serves the guidelines with the contact address and is linked from the landing footer', async () => {
    const res = await app('/guidelines');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('hello@spotseek.app');
    expect(html).toContain('How reporting works');
    expect(html).not.toContain('—');
    expect(await (await app('/')).text()).toContain('href="/guidelines"');
  });
});
