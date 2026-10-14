/**
 * Failed admin sign-in tracking. Each failure is logged (never the submitted
 * secret) and stored durably in admin_login_failures so counts hold across
 * isolates. When the trailing-hour count (all IPs) reaches ALERT_THRESHOLD, ONE
 * alert email goes to hello@spotseek.app through the guarded sendEmail (daily
 * cap applies). At most one alert per hour: an admin_login_alerts row is
 * claimed atomically (only if none exists in the last hour) before sending.
 * Rows older than 7 days are pruned opportunistically.
 * Never throws: tracking must not break the login path.
 */
import { neon } from '@neondatabase/serverless';
import { sendEmail } from '../reminders';
import { DIGEST_TO } from './admin';

export const ALERT_THRESHOLD = 5;

export async function recordAdminLoginFailure(env: Env, ip: string): Promise<void> {
  try {
    const sql = neon(env.DATABASE_URL);
    await sql`INSERT INTO admin_login_failures (ip) VALUES (${ip})`;
    const rows = (await sql`
      SELECT ip, created_at FROM admin_login_failures
      WHERE created_at > now() - interval '1 hour' ORDER BY created_at
    `) as { ip: string; created_at: Date | string }[];
    const count = rows.length;
    console.warn(`[ADMIN] failed login ip=${ip} count=${count}`);

    if (count >= ALERT_THRESHOLD) {
      const claimed = (await sql`
        INSERT INTO admin_login_alerts (created_at)
        SELECT now() WHERE NOT EXISTS (
          SELECT 1 FROM admin_login_alerts WHERE created_at > now() - interval '1 hour'
        )
        RETURNING id
      `) as unknown[];
      if (claimed.length > 0) {
        const subject = 'Admin sign-in: 5 failed attempts in the last hour';
        const lines = rows
          .map((r) => `- ${new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ')} UTC  ip ${r.ip}`)
          .join('\n');
        const body = `${count} failed admin sign-in attempts in the last hour:\n\n${lines}`;
        if (!env.RESEND_API_KEY) console.log(`[DEV ADMIN ALERT] ${subject}`);
        else await sendEmail(DIGEST_TO, subject, body, env.RESEND_API_KEY, { type: 'admin_login_alert' });
      }
    }

    // Opportunistic prune (about 1 in 20 failures).
    if (Math.random() < 0.05) {
      await sql`DELETE FROM admin_login_failures WHERE created_at < now() - interval '7 days'`;
      await sql`DELETE FROM admin_login_alerts WHERE created_at < now() - interval '7 days'`;
    }
  } catch (err) {
    console.error('[ADMIN] failed-login tracking error', err);
  }
}
