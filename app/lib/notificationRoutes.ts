import type { ApiNotificationType } from './api';
import type { IconName } from '../components/icons';

/**
 * Icon shown beside a notification in the Notification Center. Only types that
 * need to read at a glance carry one; the rest return null (title-only row).
 */
export function iconFor(type: ApiNotificationType | string | undefined): IconName | null {
  if (type === 'event_under_review') return 'shield';
  if (type === 'event_removed') return 'block';
  return null;
}

/**
 * Where a notification should take the user. Shared by the Notification Center
 * and push-notification taps (components/PushBootstrap.tsx) so both route
 * identically.
 */
export function routeFor(type: ApiNotificationType | string | undefined, eventId: string | null | undefined): string | null {
  if (!eventId) return null;
  // Host-facing: a bid landed, an RSVP came in, or a sponsor's payment/payout
  // cleared — all live in the Command Center.
  if (type === 'sponsor_bid' || type === 'rsvp' || type === 'payment_received' || type === 'payout_sent') {
    return '/(tabs)/parties/dashboard';
  }
  // Moderation: the host lands on the Command Center, where the party carries
  // its "Under review" / "Taken down" banner.
  if (type === 'event_under_review' || type === 'event_removed') return '/(tabs)/parties/dashboard';
  if (type === 'sponsorship_request') return '/(tabs)/sponsorship';
  // Sponsor-facing payment states land on the bid detail screen — that's
  // where the "Pay now" affordance and payment-status line live.
  if (type === 'payment_due' || type === 'payment_refunded') return `/(tabs)/sponsorship/${eventId}`;
  // 'review_request' falls through to this default along with every other
  // event-scoped type — the event detail screen is where the rate-this-event
  // section lives, so that's always the right destination.
  return `/(tabs)/discover/${eventId}`;
}
