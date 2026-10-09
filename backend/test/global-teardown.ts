/**
 * Vitest globalSetup (runs in Node, not workerd). The suite shares the real Neon
 * dev DB with the live dev app, so every fixture user a run creates is deleted
 * again when the run ends (vitest calls the returned teardown even when tests fail).
 *
 * Scope: users whose email ends with @spotseek.test / @spotseek-dev.test AND whose
 * created_at is at or after the run start (read from the DB clock, so no skew).
 * Excludes reviewer-e2e-% and msponsor-% accounts.
 *
 * Interim fix until a per-run ephemeral Neon branch exists.
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const DEV_BRANCH_HOST = 'ep-withered-brook-at893dfx';
const BATCH = 500;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const text = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
    const m = text.match(/^DATABASE_URL=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    // fall through
  }
  throw new Error('[test-teardown] DATABASE_URL not found in env or backend/.dev.vars');
}

export default async function setup() {
  const url = databaseUrl();
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    // leave empty -> refused below
  }
  if (!host.includes(DEV_BRANCH_HOST)) {
    throw new Error(`[test-teardown] refusing to run: DATABASE_URL host is not the dev branch (${DEV_BRANCH_HOST})`);
  }
  const startSql = neon(url);
  const [{ now }] = (await startSql`SELECT now()::text AS now`) as { now: string }[];
  const runStart = now;

  return async function teardown() {
    const sql = neon(url);
    const fixtures = (await sql`
      SELECT id, email FROM users
      WHERE (email LIKE '%@spotseek.test' OR email LIKE '%@spotseek-dev.test')
        AND email NOT LIKE 'reviewer-e2e-%' AND email NOT LIKE 'msponsor-%'
        AND created_at >= ${runStart}::timestamptz
      UNION
      SELECT id, email FROM "user"
      WHERE (email LIKE '%@spotseek.test' OR email LIKE '%@spotseek-dev.test')
        AND email NOT LIKE 'reviewer-e2e-%' AND email NOT LIKE 'msponsor-%'
        AND created_at >= ${runStart}::timestamptz
    `) as { id: string; email: string }[];

    const t = { users: 0, events: 0, rsvps: 0, verification: 0 };
    const count = (rows: unknown) => (rows as { c: number }[])[0]?.c ?? 0;
    for (let i = 0; i < fixtures.length; i += BATCH) {
      const chunk = fixtures.slice(i, i + BATCH);
      const ids = chunk.map((f) => f.id);
      const emails = chunk.map((f) => f.email);
      // FK order: rsvps on their events, events they host (RESTRICT), verification, users, "user".
      const r = await sql.transaction([
        sql`WITH d AS (DELETE FROM rsvps WHERE event_id IN (SELECT id FROM events WHERE host_id = ANY(${ids})) RETURNING 1) SELECT count(*)::int AS c FROM d`,
        sql`DELETE FROM moderation_events WHERE event_id IN (SELECT id FROM events WHERE host_id = ANY(${ids}))`,
        sql`WITH d AS (DELETE FROM events WHERE host_id = ANY(${ids}) RETURNING 1) SELECT count(*)::int AS c FROM d`,
        sql`WITH d AS (DELETE FROM verification WHERE identifier = ANY(${emails}) RETURNING 1) SELECT count(*)::int AS c FROM d`,
        sql`WITH d AS (DELETE FROM users WHERE id = ANY(${ids}) RETURNING 1) SELECT count(*)::int AS c FROM d`,
        sql`DELETE FROM "user" WHERE id = ANY(${ids})`,
      ]);
      t.rsvps += count(r[0]);
      t.events += count(r[2]);
      t.verification += count(r[3]);
      t.users += count(r[4]);
    }
    console.log(
      `[test-teardown] deleted ${t.users} fixture users, ${t.events} events, ${t.rsvps} rsvps, ${t.verification} verification rows (created since ${runStart})`,
    );
  };
}
