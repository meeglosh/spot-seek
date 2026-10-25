import { notify } from '../notifications';
import { publicBaseUrl } from '../email';
import { alertAdmin } from './alerts';
import { logModeration } from './screen';
import type { Db } from './admin';
import type * as schema from '../schema';

/**
 * Side effects of holding an event (already set to moderation 'hidden') after a
 * soft-rule hit: moderation log, kind host notice, one immediate admin email.
 * Each step is best-effort and never throws.
 */
export async function announceHold(
  env: Env,
  db: Db,
  event: Pick<schema.Event, 'id' | 'title' | 'hostId'>,
  categories: string[],
  stage: 'create' | 'update',
): Promise<void> {
  await logModeration(db, {
    eventId: event.id,
    action: 'auto_hidden',
    reason: 'blocklist_rule',
    actor: 'system',
    detail: { categories, hostId: event.hostId, stage },
  });
  await notify(db, env.RESEND_API_KEY, {
    userId: event.hostId,
    type: 'event_under_review',
    title: 'Your party is in review',
    body: `Thanks for hosting! We're giving "${event.title}" a quick check before it goes public. Only you can see it for now, and we'll let you know as soon as it's live. Questions? Write to hello@spotseek.app.`,
    eventId: event.id,
  }).catch((err) => console.error('[moderation] host notify failed:', err));
  await alertAdmin(
    env.RESEND_API_KEY,
    'New party held for review',
    `"${event.title}" matched a content rule and is hidden until an admin reviews it.\n\n` +
      `Review, restore or remove: ${publicBaseUrl(env)}/admin/moderation\nEvent id ${event.id}`,
    event.id,
  );
}
