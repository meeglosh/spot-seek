/**
 * Anonymous placeholder users that inherit records which must outlive a deleted
 * account (payment history — see PAYMENTS.md "Account deletion").
 *
 *  - `deleted-host`    ("Deleted host")    owns events whose sponsorships have
 *                                          payment history (events.host_id is
 *                                          RESTRICT, so it needs a real user).
 *  - `deleted-sponsor` ("Deleted sponsor") is the sponsorships.sponsor_id of
 *                                          paid-history rows, with an anonymised
 *                                          sponsor_profiles row (the profile
 *                                          joins need it).
 *
 * Neither can sign in: they get a Better Auth `user` row (so nobody can
 * register `deleted-*@invalid` through public sign-up) but NO `account` row —
 * no credential, no password, nothing for sign-in or reset to match — and an
 * unroutable `.invalid` email. They are created lazily and idempotently.
 * They must never be shown as a real host/sponsor: the public profile and
 * sponsor directory endpoints 404 them, /e/:id omits the organizer, and kept
 * events are moved out of the feed (status 'completed'/'cancelled').
 */
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import * as authSchema from './auth-schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;
type AuthDb = ReturnType<typeof drizzle<typeof authSchema>>;

export const DELETED_HOST_ID = 'deleted-host';
export const DELETED_SPONSOR_ID = 'deleted-sponsor';
export const DELETED_HOST_NAME = 'Deleted host';
export const DELETED_SPONSOR_NAME = 'Deleted sponsor';

const PLACEHOLDER_IDS = new Set([DELETED_HOST_ID, DELETED_SPONSOR_ID]);
export function isPlaceholderUserId(id: string | null | undefined): boolean {
  return !!id && PLACEHOLDER_IDS.has(id);
}

async function ensurePlaceholder(db: Db, authDb: AuthDb, id: string, name: string): Promise<void> {
  const email = `${id}@invalid`;
  const now = new Date();
  await authDb
    .insert(authSchema.authUser)
    .values({ id, name, email, emailVerified: false, createdAt: now, updatedAt: now })
    .onConflictDoNothing();
  await db
    .insert(schema.users)
    .values({ id, email, displayName: name })
    .onConflictDoNothing();
}

export async function ensureDeletedHost(db: Db, authDb: AuthDb): Promise<string> {
  await ensurePlaceholder(db, authDb, DELETED_HOST_ID, DELETED_HOST_NAME);
  return DELETED_HOST_ID;
}

export async function ensureDeletedSponsor(db: Db, authDb: AuthDb): Promise<string> {
  await ensurePlaceholder(db, authDb, DELETED_SPONSOR_ID, DELETED_SPONSOR_NAME);
  await db
    .insert(schema.sponsorProfiles)
    .values({ id: DELETED_SPONSOR_ID, companyName: DELETED_SPONSOR_NAME })
    .onConflictDoNothing();
  return DELETED_SPONSOR_ID;
}
