/**
 * Account deletion vs. payment records (PAYMENTS.md "Account deletion"):
 * events/sponsorships with payment history survive under anonymous placeholder
 * users; unfinished (requires_payment) PaymentIntents are cancelled with Stripe
 * (mocked via fetchMock — no real Stripe call). Timestamp-unique fixtures
 * (shared dev DB). Only api.stripe.com is intercepted; Neon/Better Auth pass
 * through to the real network like every other spec.
 */
import { SELF, env, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq } from 'drizzle-orm';
import * as schema from '../src/schema';
import * as authSchema from '../src/auth-schema';
import { __setTestStripeConfig } from '../src/payments';
import { ensureDeletedHost, DELETED_HOST_ID, DELETED_SPONSOR_ID } from '../src/deleted-users';

const BASE = 'https://example.com';
const AUTH = `${BASE}/api/auth`;
const json = { 'Content-Type': 'application/json' };
const TS = Date.now();
const PW = 'Records_Pass_123!';
const HOUR = 3_600_000;

const db = drizzle(neon(env.DATABASE_URL), { schema });
const authDb = drizzle(neon(env.DATABASE_URL), { schema: authSchema });

interface TestUser { id: string; email: string; cookie: string }

async function signUp(suffix: string): Promise<TestUser> {
  const email = `acctrec-${suffix}-${TS}@spotseek.test`;
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: json, body: JSON.stringify({ email, password: PW, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: json, body: JSON.stringify({ email, password: PW }),
  });
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const sess = await SELF.fetch(`${AUTH}/get-session`, { headers: { Cookie: cookie } });
  const { user } = (await sess.json()) as { user: { id: string } };
  return { id: user.id, email, cookie };
}

/** Event inserted directly (ended 3h ago unless overridden). */
async function pastEvent(host: TestUser, extra: Partial<typeof schema.events.$inferInsert> = {}) {
  const [e] = await db.insert(schema.events).values({
    hostId: host.id,
    title: `AcctRec ${TS}`,
    broadcastSubject: 'Game',
    status: 'published',
    startsAt: new Date(Date.now() - 5 * HOUR),
    endsAt: new Date(Date.now() - 3 * HOUR),
    ...extra,
  }).returning();
  return e;
}

async function sponsorship(
  eventId: string,
  sponsor: TestUser,
  extra: Partial<typeof schema.sponsorships.$inferInsert> = {},
) {
  await db.insert(schema.sponsorProfiles).values({ id: sponsor.id, companyName: `AcctRec Co ${TS}` }).onConflictDoNothing();
  const [s] = await db.insert(schema.sponsorships).values({
    eventId, sponsorId: sponsor.id, amountCents: 10_000, platformFeeCents: 1_500, note: 'private sponsor note', ...extra,
  }).returning();
  return s;
}

const del = (u: TestUser) =>
  SELF.fetch(`${BASE}/api/account`, {
    method: 'DELETE', headers: { ...json, Cookie: u.cookie }, body: JSON.stringify({ confirm: 'DELETE' }),
  });

const getEvent = (id: string) => db.query.events.findFirst({ where: eq(schema.events.id, id) });
const getSponsorship = (id: string) => db.query.sponsorships.findFirst({ where: eq(schema.sponsorships.id, id) });
const appUser = (id: string) => db.query.users.findFirst({ where: eq(schema.users.id, id) });

const stripe = () => fetchMock.get('https://api.stripe.com');

beforeAll(() => {
  fetchMock.activate();
});
afterEach(() => __setTestStripeConfig(null));

const configureStripe = () =>
  __setTestStripeConfig({ secretKey: 'sk_test_fake_key', webhookSecret: 'whsec_fake_secret' });

describe('account deletion keeps payment history', () => {
  it('host: events with paid history survive under "Deleted host" (scrubbed); history-free events are deleted', async () => {
    const host = await signUp('h1');
    const sponsor = await signUp('h1-sponsor');
    const kept = await pastEvent(host, {
      description: 'my private house party',
      coverImageUrl: 'https://example.com/me.jpg',
      isPrivateLocation: true,
      venueName: 'My Home',
      venueAddress: '1 Secret Lane',
      venueLat: 40.1,
      venueLng: -70.1,
    });
    const gone = await pastEvent(host, { title: `AcctRec nohistory ${TS}` });
    const released = await sponsorship(kept.id, sponsor, {
      status: 'completed', paymentStatus: 'released', paymentIntentId: `pi_h1_${TS}`, transferId: `tr_h1_${TS}`,
    });
    const unpaidOnGone = await sponsorship(gone.id, sponsor, { status: 'rejected' });

    const res = await del(host);
    expect(res.status).toBe(200);

    const e = await getEvent(kept.id);
    expect(e).toBeDefined();
    expect(e!.hostId).toBe(DELETED_HOST_ID);
    expect(e!.title).toBe(kept.title);
    expect(e!.description).toBeNull();
    expect(e!.coverImageUrl).toBeNull();
    expect(e!.venueName).toBeNull();
    expect(e!.venueAddress).toBeNull();
    expect(e!.venueLat).toBeNull();
    expect(e!.status).toBe('completed'); // out of the public feed
    const s = await getSponsorship(released.id);
    expect(s?.paymentStatus).toBe('released');
    expect(s?.transferId).toBe(`tr_h1_${TS}`);
    expect(s?.sponsorId).toBe(sponsor.id); // the other party's side is untouched

    // No payment history -> deleted, with its sponsorship.
    expect(await getEvent(gone.id)).toBeUndefined();
    expect(await getSponsorship(unpaidOnGone.id)).toBeUndefined();

    // The real host is gone, the placeholder is a valid, anonymous user.
    expect(await appUser(host.id)).toBeUndefined();
    const ph = await appUser(DELETED_HOST_ID);
    expect(ph?.displayName).toBe('Deleted host');
    expect(ph?.email).toBe('deleted-host@invalid');

    // Never shown as a real host: no organizer on /e/:id, no public profile, not in the feed.
    const page = await (await SELF.fetch(`${BASE}/e/${kept.id}`)).text();
    expect(page).not.toContain('Deleted host');
    expect(page).not.toContain('HOSTED BY');
    expect((await SELF.fetch(`${BASE}/api/profiles/${DELETED_HOST_ID}`)).status).toBe(404);
    const feed = (await (await SELF.fetch(`${BASE}/api/feed`)).json()) as { events?: { id: string }[] };
    expect((feed.events ?? []).some((x) => x.id === kept.id)).toBe(false);
  }, 60_000);

  it('host: a past event with no payment history is simply deleted (no placeholder involved)', async () => {
    const host = await signUp('h2');
    const ev = await pastEvent(host);
    expect((await del(host)).status).toBe(200);
    expect(await getEvent(ev.id)).toBeUndefined();
  }, 60_000);

  it('sponsor: a released sponsorship survives, anonymised; their profile and history-free bids are removed', async () => {
    const host = await signUp('s1-host');
    const sponsor = await signUp('s1');
    const ev = await pastEvent(host);
    const ev2 = await pastEvent(host);
    const released = await sponsorship(ev.id, sponsor, {
      status: 'completed', paymentStatus: 'released', paymentIntentId: `pi_s1_${TS}`, transferId: `tr_s1_${TS}`,
    });
    const pending = await sponsorship(ev2.id, sponsor);

    expect((await del(sponsor)).status).toBe(200);

    const s = await getSponsorship(released.id);
    expect(s).toBeDefined();
    expect(s!.sponsorId).toBe(DELETED_SPONSOR_ID);
    expect(s!.note).toBeNull();
    expect(s!.amountCents).toBe(10_000);
    expect(s!.paymentStatus).toBe('released');
    expect(await getSponsorship(pending.id)).toBeUndefined();
    expect(await getEvent(ev.id)).toBeDefined(); // host's event untouched
    expect((await appUser(host.id))?.id).toBe(host.id);
    expect(await appUser(sponsor.id)).toBeUndefined();
    const profiles = await db.select().from(schema.sponsorProfiles).where(eq(schema.sponsorProfiles.id, sponsor.id));
    expect(profiles).toHaveLength(0);
    const ph = await db.query.sponsorProfiles.findFirst({ where: eq(schema.sponsorProfiles.id, DELETED_SPONSOR_ID) });
    expect(ph?.companyName).toBe('Deleted sponsor');
    // Placeholder sponsor is not listed / fetchable.
    expect((await SELF.fetch(`${BASE}/api/sponsors/${DELETED_SPONSOR_ID}`)).status).toBe(404);
  }, 60_000);
});

describe('account deletion cancels unfinished payments', () => {
  it('requires_payment: the PaymentIntent is cancelled, the sponsorship cancelled and the other side notified', async () => {
    configureStripe();
    const host = await signUp('u1-host');
    const sponsor = await signUp('u1');
    const ev = await pastEvent(host);
    const s = await sponsorship(ev.id, sponsor, {
      status: 'active', paymentStatus: 'requires_payment', paymentIntentId: `pi_u1_${TS}`,
    });
    let cancelled = 0;
    stripe().intercept({ path: `/v1/payment_intents/pi_u1_${TS}/cancel`, method: 'POST' }).reply(200, () => {
      cancelled++;
      return { id: `pi_u1_${TS}`, status: 'canceled' };
    });

    expect((await del(sponsor)).status).toBe(200);
    expect(cancelled).toBe(1);

    const row = await getSponsorship(s.id);
    expect(row?.status).toBe('cancelled');
    expect(row?.paymentStatus).toBe('unpaid');
    const notes = await db.select().from(schema.notifications).where(
      and(eq(schema.notifications.userId, host.id), eq(schema.notifications.eventId, ev.id)),
    );
    expect(notes.some((n) => n.title === 'Sponsorship cancelled')).toBe(true);
    expect(await appUser(sponsor.id)).toBeUndefined();
  }, 60_000);

  it('host deleting: the sponsor is notified when their unpaid sponsorship is cancelled', async () => {
    configureStripe();
    const host = await signUp('u2-host');
    const sponsor = await signUp('u2');
    const ev = await pastEvent(host);
    const s = await sponsorship(ev.id, sponsor, {
      status: 'active', paymentStatus: 'requires_payment', paymentIntentId: `pi_u2_${TS}`,
    });
    stripe().intercept({ path: `/v1/payment_intents/pi_u2_${TS}/cancel`, method: 'POST' })
      .reply(200, { id: `pi_u2_${TS}`, status: 'canceled' });

    expect((await del(host)).status).toBe(200);
    expect((await getSponsorship(s.id))?.status).toBe('cancelled');
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, sponsor.id));
    expect(notes.some((n) => n.eventId === ev.id && n.title === 'Sponsorship cancelled')).toBe(true);
    expect((await getEvent(ev.id))?.hostId).toBe(DELETED_HOST_ID); // PI record kept
  }, 60_000);

  it('PI already cancelled at Stripe: treated gracefully', async () => {
    configureStripe();
    const host = await signUp('u3-host');
    const sponsor = await signUp('u3');
    const ev = await pastEvent(host);
    const s = await sponsorship(ev.id, sponsor, {
      status: 'active', paymentStatus: 'requires_payment', paymentIntentId: `pi_u3_${TS}`,
    });
    stripe().intercept({ path: `/v1/payment_intents/pi_u3_${TS}/cancel`, method: 'POST' })
      .reply(400, { error: { code: 'payment_intent_unexpected_state', message: 'already canceled' } });
    stripe().intercept({ path: `/v1/payment_intents/pi_u3_${TS}`, method: 'GET' })
      .reply(200, { id: `pi_u3_${TS}`, status: 'canceled' });

    expect((await del(sponsor)).status).toBe(200);
    expect((await getSponsorship(s.id))?.status).toBe('cancelled');
  }, 60_000);

  it('PI succeeded at the last moment: 409 money_in_flight and nothing is deleted', async () => {
    configureStripe();
    const host = await signUp('u4-host');
    const sponsor = await signUp('u4');
    const ev = await pastEvent(host);
    const s = await sponsorship(ev.id, sponsor, {
      status: 'active', paymentStatus: 'requires_payment', paymentIntentId: `pi_u4_${TS}`,
    });
    stripe().intercept({ path: `/v1/payment_intents/pi_u4_${TS}/cancel`, method: 'POST' })
      .reply(400, { error: { code: 'payment_intent_unexpected_state', message: 'already succeeded' } });
    stripe().intercept({ path: `/v1/payment_intents/pi_u4_${TS}`, method: 'GET' })
      .reply(200, { id: `pi_u4_${TS}`, status: 'succeeded' });

    const res = await del(sponsor);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; sponsorships: { id: string; role: string }[] };
    expect(body.error).toBe('money_in_flight');
    expect(body.sponsorships).toEqual([expect.objectContaining({ id: s.id, role: 'sponsor' })]);
    expect((await getSponsorship(s.id))?.paymentStatus).toBe('requires_payment');
    expect((await getSponsorship(s.id))?.status).toBe('active');
    expect((await appUser(sponsor.id))?.id).toBe(sponsor.id);
  }, 60_000);

  it('Stripe not configured: the sponsorship is just marked cancelled (no Stripe call)', async () => {
    const host = await signUp('u5-host');
    const sponsor = await signUp('u5');
    const ev = await pastEvent(host);
    const s = await sponsorship(ev.id, sponsor, {
      status: 'active', paymentStatus: 'requires_payment', paymentIntentId: `pi_u5_${TS}`,
    });
    expect((await del(sponsor)).status).toBe(200);
    expect((await getSponsorship(s.id))?.status).toBe('cancelled');
  }, 60_000);
});

describe('placeholder users', () => {
  it('cannot sign in, cannot be re-registered, and has no credential row', async () => {
    await ensureDeletedHost(db, authDb);
    await ensureDeletedHost(db, authDb); // idempotent

    for (const password of [PW, 'password', '']) {
      const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
        method: 'POST', headers: json, body: JSON.stringify({ email: 'deleted-host@invalid', password }),
      });
      expect(res.status).not.toBe(200);
      expect(res.headers.get('set-cookie') ?? '').not.toContain('session_token');
    }
    const up = await SELF.fetch(`${AUTH}/sign-up/email`, {
      method: 'POST', headers: json, body: JSON.stringify({ email: 'deleted-host@invalid', password: PW, name: 'x' }),
    });
    expect(up.status).not.toBe(200);

    const accounts = await authDb.select().from(authSchema.authAccount).where(eq(authSchema.authAccount.userId, DELETED_HOST_ID));
    expect(accounts).toHaveLength(0);
    const sessions = await authDb.select().from(authSchema.authSession).where(eq(authSchema.authSession.userId, DELETED_HOST_ID));
    expect(sessions).toHaveLength(0);
  }, 60_000);
});
