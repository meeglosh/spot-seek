import Constants from 'expo-constants';

/**
 * Feature flags, read from app.json `extra.features` so they flip without code
 * edits. Every flag defaults to OFF when the key is missing or not a boolean.
 *
 * Sponsorship is hidden for the external TestFlight beta (Stripe is test-mode
 * only). To turn it back on: set `expo.extra.features.sponsorship` to `true` in
 * app.json and rebuild (extra is baked in at build time; Metro needs a restart).
 */
export type FeatureExtra = { features?: { sponsorship?: unknown } } | null | undefined;

export function readSponsorshipFlag(extra: FeatureExtra): boolean {
  return extra?.features?.sponsorship === true;
}

/** Re-evaluated on each call; prefer this in code that tests need to flip. */
export function isSponsorshipEnabled(): boolean {
  return readSponsorshipFlag(Constants.expoConfig?.extra as FeatureExtra);
}

export const SPONSORSHIP_ENABLED: boolean = isSponsorshipEnabled();

/** Where a sponsorship deep link lands when the flag is off. */
export const SPONSORSHIP_FALLBACK_ROUTE = '/(tabs)/discover';

/** Notification types that only make sense with sponsorship on. */
export const SPONSOR_NOTIFICATION_TYPES = [
  'sponsor_bid', 'sponsorship_request', 'payment_due', 'payment_received', 'payment_refunded', 'payout_sent',
] as const;

export function isSponsorNotificationType(type: string | undefined | null): boolean {
  return !!type && (SPONSOR_NOTIFICATION_TYPES as readonly string[]).includes(type);
}
