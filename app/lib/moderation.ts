// Moderation helpers shared by the report sheet, block flow, host banners and
// the create/edit form. Pure where possible (reason list, error mapping) so the
// mapping is unit-tested without rendering anything.
import { Linking } from 'react-native';
import { ApiError, type ReportReason, type ModerationStatus } from './api';

// Public community guidelines (served by the backend, see backend/src/guidelines.ts).
export const GUIDELINES_URL = 'https://spotseek.app/guidelines';

// expo-web-browser is not installed, so the system browser is used.
export function openGuidelines(): void {
  Linking.openURL(GUIDELINES_URL).catch(() => {});
}

// ─── Report reasons ───────────────────────────────────────────────────────────
// The six API reasons, in the order the sheet lists them. Each carries its own
// plain label (moderation.json `report.reasons.<key>`); none are merged.
export const REPORT_REASON_KEYS: readonly ReportReason[] = [
  'hate', 'harassment', 'sexual', 'violence', 'spam', 'other',
];

export function reasonLabelKey(reason: ReportReason): string {
  return `report.reasons.${reason}`;
}

// ─── Report errors ────────────────────────────────────────────────────────────
// Keys are relative to the `moderation` namespace.
export function reportErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'report.errors.rateLimited';
    if (err.status === 403 && err.code === 'cannot_report_own_event') return 'report.errors.ownEvent';
    if (err.status === 400 && err.code === 'note_too_long') return 'report.errors.noteTooLong';
    if (err.status === 404) return 'report.errors.notFound';
    if (err.status === 401) return 'report.errors.signIn';
    return 'report.errors.generic';
  }
  // fetch() rejects with a TypeError when the network is down.
  return 'report.errors.network';
}

// ─── Create / edit errors ─────────────────────────────────────────────────────
export type PublishProblem =
  | { kind: 'content_rejected'; message: string | null }
  | { kind: 'publishing_paused' }
  | { kind: 'event_removed' };

export function publishProblem(err: unknown): PublishProblem | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 422 && err.code === 'content_rejected') {
    // ApiError.message falls back to the code when the backend sent no message.
    return { kind: 'content_rejected', message: err.message === err.code ? null : err.message };
  }
  if (err.status === 403 && err.code === 'publishing_paused') return { kind: 'publishing_paused' };
  if (err.status === 403 && err.code === 'event_removed') return { kind: 'event_removed' };
  return null;
}

// ─── RSVP ─────────────────────────────────────────────────────────────────────
// A 403 on RSVP means the host blocked this person. Callers show a neutral
// "You can't RSVP to this party" and never say why.
export function isRsvpForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

// ─── Host-side state ──────────────────────────────────────────────────────────
export function hostBannerKind(status: ModerationStatus | undefined): 'hidden' | 'removed' | null {
  return status === 'hidden' || status === 'removed' ? status : null;
}

// ─── Blocks changed: tiny pub/sub so open feeds can refresh ───────────────────
const listeners = new Set<() => void>();

export function onBlocksChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function emitBlocksChanged(): void {
  listeners.forEach((cb) => cb());
}
