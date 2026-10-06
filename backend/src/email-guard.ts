/**
 * Outbound-email guard. EVERY real send (sendEmail in reminders.ts) goes
 * through `checkEmailAllowed` first. It protects the Resend quota (100/day on
 * the owner's plan) and the sender reputation (bounces from fake domains).
 *
 *  1. Reserved/test domains are never emailed ([EMAIL SUPPRESSED test-domain]).
 *  2. Optional EMAIL_ALLOWLIST (comma-separated exact addresses or @domain
 *     entries). When set, only matching recipients get real email.
 *  3. Daily cap (EMAIL_DAILY_CAP, default 80) of real sends per UTC day, kept
 *     in the email_send_counts table so it is atomic across isolates. The slot
 *     is reserved BEFORE sending; a failed send still consumes it
 *     (conservative). If the counter cannot be reached the send is suppressed
 *     (fail closed) so a DB hiccup can never blow the quota.
 *
 * In-app notifications are written regardless; only the email is skipped.
 *
 * The guard needs bindings but sendEmail has no env, so index.ts calls
 * `configureEmailGuard(env)` at the start of every request and cron run.
 */
import { neon } from '@neondatabase/serverless';

export const DEFAULT_EMAIL_DAILY_CAP = 80;

const RESERVED_SUFFIXES = ['.test', '.example', '.invalid', '.localhost'];
const RESERVED_DOMAINS = new Set(['example.com', 'example.org', 'example.net']);

export type EmailGuardEnv = {
  DATABASE_URL?: string;
  EMAIL_DAILY_CAP?: string | number;
  EMAIL_ALLOWLIST?: string;
};

type GuardConfig = { databaseUrl?: string; cap: number; allowlist: string[] | null };

let config: GuardConfig | null = null;
let capLogged = false;

function parseCap(raw: string | number | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_EMAIL_DAILY_CAP;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_EMAIL_DAILY_CAP;
}

export function parseAllowlist(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  const entries = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  // An all-blank value counts as "unset", not "allow nobody".
  return entries.length > 0 ? entries : null;
}

/** Called per request / cron run. Also resets the once-per-request cap log. */
export function configureEmailGuard(env: EmailGuardEnv): void {
  config = {
    databaseUrl: env.DATABASE_URL,
    cap: parseCap(env.EMAIL_DAILY_CAP),
    allowlist: parseAllowlist(env.EMAIL_ALLOWLIST),
  };
  capLogged = false;
}

// ─── Test-only hooks (same pattern as __setTestResendKey / __setTestStripeConfig).
// Not reachable from any route input. `reserve` replaces the DB counter so
// tests never touch the real day row; `allowTestDomains` lets legacy
// mocked-Resend flow tests keep using @spotseek.test fixtures.
type TestHooks = { allowTestDomains?: boolean; reserve?: () => Promise<number> };
let testHooks: TestHooks | null = null;
export function __setEmailGuardTestHooks(hooks: TestHooks | null): void {
  testHooks = hooks;
  capLogged = false;
}

function bareAddress(address: string): string {
  // Accept "Name <a@b.c>" as well as bare addresses.
  const m = /<([^>]+)>\s*$/.exec(address);
  return (m ? m[1] : address).trim().toLowerCase();
}

export function recipientDomain(address: string): string {
  const bare = bareAddress(address);
  const at = bare.lastIndexOf('@');
  return at === -1 ? '' : bare.slice(at + 1);
}

export function isReservedEmailDomain(address: string): boolean {
  const d = recipientDomain(address);
  if (!d) return true; // malformed -> never send
  return RESERVED_DOMAINS.has(d) || RESERVED_SUFFIXES.some((s) => d.endsWith(s));
}

export function matchesAllowlist(address: string, allowlist: string[]): boolean {
  const bare = bareAddress(address);
  const domain = recipientDomain(address);
  return allowlist.some((e) => (e.startsWith('@') ? domain === e.slice(1) : bare === e));
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Atomically takes one slot for `day`; returns the new count for that day. */
export async function reserveEmailSlot(databaseUrl: string, day = utcDay()): Promise<number> {
  const sql = neon(databaseUrl);
  const rows = (await sql`
    INSERT INTO email_send_counts (day, count) VALUES (${day}, 1)
    ON CONFLICT (day) DO UPDATE SET count = email_send_counts.count + 1
    RETURNING count
  `) as { count: number }[];
  return Number(rows[0].count);
}

/**
 * True when the send may proceed (a slot has been reserved). Logs the reason
 * and returns false otherwise.
 */
export async function checkEmailAllowed(to: string): Promise<boolean> {
  if (!testHooks?.allowTestDomains && isReservedEmailDomain(to)) {
    console.log(`[EMAIL SUPPRESSED test-domain] to=${to}`);
    return false;
  }
  if (config?.allowlist && !matchesAllowlist(to, config.allowlist)) {
    console.log(`[EMAIL SUPPRESSED allowlist] to=${to}`);
    return false;
  }
  const cap = config?.cap ?? DEFAULT_EMAIL_DAILY_CAP;
  let count: number;
  try {
    if (testHooks?.reserve) count = await testHooks.reserve();
    else if (config?.databaseUrl) count = await reserveEmailSlot(config.databaseUrl);
    else throw new Error('email guard not configured');
  } catch (err) {
    console.error('[EMAIL SUPPRESSED cap-unavailable]', err);
    return false;
  }
  if (count > cap) {
    if (!capLogged) {
      capLogged = true;
      console.log(`[EMAIL SUPPRESSED daily-cap] cap=${cap} count=${count}`);
    }
    return false;
  }
  return true;
}
