# BLOCKED — human decisions waiting

The agents write here instead of guessing. Read this each morning. Empty is good.

<!-- Format per entry:
## <task id> — <one line>
- What it needs: 
- Why it is blocked (which hard-stop or ambiguity): 
- What was tried: 
- Real final error (verbatim, if any): 
-->

## 1.8 — RESOLVED: Resend + Expo Push, Cloudflare Queues for scheduling

- Decision: Email via Resend (RESEND_API_KEY wrangler secret), push via Expo Push API
  (direct fetch, tokens stored per-device in Phase 2.1), Cloudflare Queues for scheduling.
- `wrangler secret put RESEND_API_KEY` to enable real sending. Dev-console fallback
  when key is absent. Queue binding to be added in wrangler.jsonc once queue is created.

## 1.1 — RESOLVED: events.host_id RESTRICT, rsvps.user_id CASCADE

- Decision: `events.host_id` ON DELETE RESTRICT — a host cannot delete their account
  while they own events (protects attendees). `rsvps.user_id` ON DELETE CASCADE —
  deleting a user removes their RSVP rows (they were an attendee, not the owner).
- Applied via scripts/migrate-cascade.ts against the Neon dev branch.
