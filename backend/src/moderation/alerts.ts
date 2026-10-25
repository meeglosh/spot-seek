import { sendEmail } from '../reminders';
import { DIGEST_TO } from './admin';

/** One immediate email to the admin address. Dev fallback: console log. Never throws. */
export async function alertAdmin(
  resendApiKey: string | undefined,
  subject: string,
  body: string,
  eventId: string,
): Promise<void> {
  try {
    if (!resendApiKey) console.log(`[DEV MODERATION ALERT] ${subject} ${eventId}`);
    else await sendEmail(DIGEST_TO, subject, body, resendApiKey, { type: 'moderation_alert', eventId });
  } catch (err) {
    console.error('[moderation] admin alert failed:', err);
  }
}
