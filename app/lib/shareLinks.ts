// Public base for links shared with other people. Always the production
// domain, even in dev builds, so it can never be a localhost API_BASE value.
// Old workers.dev links still open in the app: both hosts are listed in
// app.json associatedDomains and the /e/:id route ignores the host.
export const EVENT_SHARE_BASE = 'https://spotseek.app';

export function eventShareUrl(eventId: string): string {
  return `${EVENT_SHARE_BASE}/e/${eventId}`;
}
