/**
 * Re-screen existing events through today's moderation pipeline (screenEventContent).
 *
 * Why: events created before moderation shipped (2026-10-06) were never screened,
 * and nothing re-screened them afterwards.
 *
 * Scope: published events whose moderation_status is 'ok' or 'flagged' (never
 * hidden/removed) that are upcoming or ended within the last --days days (default
 * 30), plus published events with no dates.
 *
 * USAGE (from backend/):
 *   DATABASE_URL=... npx tsx scripts/rescreen-events.ts                 # DRY RUN: prints a report, writes nothing
 *   DATABASE_URL=... npx tsx scripts/rescreen-events.ts --days 90       # widen the "recent" window
 *   DATABASE_URL=... npx tsx scripts/rescreen-events.ts --host <userId>  # only one host's events (dry run or --apply)
 *   DATABASE_URL=... npx tsx scripts/rescreen-events.ts --apply         # ALSO write: reject -> 'hidden', flag -> 'flagged'
 *
 * --apply sets moderation_status and writes a moderation_events row per change
 * (actor 'system', stage 'rescreen'). It never touches removed events and never
 * downgrades a hidden one. Hosts are not notified and no repeat-offender strike is
 * recorded (only 'removed' counts toward the publishing pause).
 *
 * Classifier: Workers AI is not reachable from Node. If CLOUDFLARE_API_TOKEN and
 * CLOUDFLARE_ACCOUNT_ID are set, Llama Guard 3 is called through the REST API
 * (~10 neurons per event). Otherwise the classifier is skipped and ONLY the
 * blocklist and soft rules run; the report says so. A classifier error is reported
 * as 'error' and never applied.
 *
 * DATABASE_URL is read from the environment, else backend/.dev.vars. WARNING:
 * .dev.vars points at the LIVE database. Do not run --apply there without owner
 * sign-off; run the dry run first and read the report.
 */
import { neon } from '@neondatabase/serverless';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/schema';
import { CLASSIFIER_UNAVAILABLE, logModeration, markFlagged, screenEventContent } from '../src/moderation/screen';
import { LLAMA_GUARD_MODEL } from '../src/moderation/classifier';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type RescreenRow = {
  id: string;
  title: string;
  hostId: string;
  currentStatus: string;
  verdict: 'ok' | 'reject' | 'flag' | 'error';
  source: string;
  applied: boolean;
};

export type RescreenOptions = { apply: boolean; days: number; hostId?: string };

export async function rescreenEvents(db: Db, env: Env, opts: RescreenOptions): Promise<RescreenRow[]> {
  const rows = await db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.status, 'published'),
        opts.hostId ? eq(schema.events.hostId, opts.hostId) : undefined,
        inArray(schema.events.moderationStatus, ['ok', 'flagged']),
        sql`(coalesce(${schema.events.endsAt}, ${schema.events.startsAt}) IS NULL
             OR coalesce(${schema.events.endsAt}, ${schema.events.startsAt}) >= now() - make_interval(days => ${opts.days}))`,
      ),
    )
    .orderBy(schema.events.createdAt);

  const out: RescreenRow[] = [];
  for (const e of rows) {
    const res = await screenEventContent(env, {
      title: e.title,
      description: e.description,
      venueName: e.venueName,
      venueAddress: e.venueAddress,
      broadcastSubject: e.broadcastSubject,
    });
    const row: RescreenRow = {
      id: e.id,
      title: e.title,
      hostId: e.hostId,
      currentStatus: e.moderationStatus,
      verdict: res.verdict,
      source: '',
      applied: false,
    };
    if (res.verdict === 'reject') row.source = `${res.source}:${res.detail}`;
    else if (res.verdict === 'flag') {
      if (res.categories.includes(CLASSIFIER_UNAVAILABLE)) {
        row.verdict = 'error';
        row.source = CLASSIFIER_UNAVAILABLE;
      } else row.source = res.categories.join(',');
    }

    if (opts.apply && row.verdict === 'reject') {
      const changed = await db
        .update(schema.events)
        .set({ moderationStatus: 'hidden' })
        .where(and(eq(schema.events.id, e.id), inArray(schema.events.moderationStatus, ['ok', 'flagged'])))
        .returning({ id: schema.events.id });
      row.applied = changed.length > 0;
      if (row.applied) {
        await logModeration(db, {
          eventId: e.id,
          action: 'auto_hidden',
          reason: res.verdict === 'reject' ? res.source : null,
          actor: 'system',
          detail: { stage: 'rescreen', hostId: e.hostId, match: row.source },
        });
      }
    } else if (opts.apply && row.verdict === 'flag') {
      row.applied = await markFlagged(db, e.id);
      if (row.applied) {
        await logModeration(db, {
          eventId: e.id,
          action: 'auto_flagged',
          reason: row.source.includes('rule:') ? 'blocklist_rule' : 'classifier',
          actor: 'system',
          detail: { stage: 'rescreen', hostId: e.hostId, categories: row.source.split(',') },
        });
      }
    }
    out.push(row);
  }
  return out;
}

export function formatReport(rows: RescreenRow[], apply: boolean): string {
  const lines = [apply ? 'APPLY MODE' : 'DRY RUN (no writes; pass --apply to write)', `screened: ${rows.length}`];
  for (const r of rows) {
    if (r.verdict === 'ok') continue;
    lines.push(
      `${r.verdict.toUpperCase().padEnd(6)} ${r.id}  [${r.currentStatus}]  ${JSON.stringify(r.title.slice(0, 80))}  ${r.source}${
        r.applied ? '  -> APPLIED' : ''
      }`,
    );
  }
  const count = (v: string) => rows.filter((r) => r.verdict === v).length;
  lines.push(`ok=${count('ok')} flag=${count('flag')} reject=${count('reject')} error=${count('error')}`);
  return lines.join('\n');
}

/** Env for Node: Workers AI through the Cloudflare REST API, or no classifier. */
function nodeEnv(): { env: Env; classifier: boolean } {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return { env: { MODERATION_AI: 'off' } as unknown as Env, classifier: false };
  const AI = {
    async run(_model: string, input: unknown) {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${LLAMA_GUARD_MODEL}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!r.ok) throw new Error(`Workers AI REST ${r.status}`);
      return ((await r.json()) as { result: unknown }).result;
    },
  };
  return { env: { AI } as unknown as Env, classifier: true };
}

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
  const m = text.match(/^DATABASE_URL=(.*)$/m);
  if (!m) throw new Error('DATABASE_URL not set');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const di = args.indexOf('--days');
  const days = di !== -1 ? Number(args[di + 1]) : 30;
  if (!Number.isFinite(days) || days < 0) throw new Error('--days needs a non-negative number');

  const hi = args.indexOf('--host');
  const hostId = hi !== -1 ? args[hi + 1] : undefined;
  const url = await databaseUrl();
  console.log(`database host: ${new URL(url).host}`);
  const { env, classifier } = nodeEnv();
  if (!classifier) console.log('classifier: SKIPPED (set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID); blocklist and rules only');
  const db = drizzle(neon(url), { schema });
  console.log(formatReport(await rescreenEvents(db, env, { apply, days, hostId }), apply));
}

// Run only when executed directly (tests import this module).
if (typeof process !== 'undefined' && process.argv?.[1] && /rescreen-events\.[tj]s$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
