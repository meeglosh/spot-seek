# BLOCKED — human decisions waiting

The agents write here instead of guessing. Read this each morning. Empty is good.

<!-- Format per entry:
## <task id> — <one line>
- What it needs: 
- Why it is blocked (which hard-stop or ambiguity): 
- What was tried: 
- Real final error (verbatim, if any): 
-->

## R2 image storage — bucket must be created before deploying

- What it needs: an R2 bucket named `spotseek-images` in your Cloudflare account.
  Run: `npx wrangler r2 bucket create spotseek-images`
  Or create it in the Cloudflare dashboard under R2 → Create bucket.
- Why noted: wrangler local dev simulates R2 in memory (no bucket needed to test
  locally). The binding in wrangler.jsonc is wired. Deployment needs the real bucket.
- Public image URLs: for production, attach a custom domain to the R2 bucket in
  the Cloudflare dashboard. Until then, images are served through the Worker at
  GET /api/images/:key.

## 3.1-3.4 — Payment processor for sponsor transactions needs a human decision

- What it needs: a payment provider (Stripe recommended), test-mode API keys
  (`STRIPE_SECRET_KEY=sk_test_...`), and a decision on fee collection timing
  (collect at bid acceptance vs event completion).
- Why blocked: CLAUDE.md hard stop — all payment/money work uses test-mode keys only;
  anything touching real funds -> BLOCKED.md. No live credentials in codebase.
- What was built: full auction mechanics (bids, acceptance, fee calculation) with
  amount_cents stored in DB. The payment provider call is a stubbed placeholder that
  returns mock results. Wire in Stripe with `wrangler secret put STRIPE_SECRET_KEY`.
- Recommendation: Stripe — test-mode keys free, excellent DX, supports marketplace
  transfers for platform fee distribution.

## 2.2 — RESOLVED: Cloudflare Durable Objects WebSocket chat

- Decision: Cloudflare Durable Objects with Hibernation API.
- ChatRoom DO keyed by eventId; one instance per event.
- WebSocket upgrade at GET /api/chat/:eventId/ws; broadcasts via DO, persists to comments table.
- wrangler.jsonc: CHAT_ROOMS DO binding + v1 migration declared.

## 2.2 — Realtime chat transport was blocked (now resolved above)

- What it needs: a choice of realtime stack for event chat (WebSocket transport).
  Options: (a) Cloudflare Durable Objects + WebSockets — native to Workers, no extra cost
  at low scale, complex at high scale; (b) Partykit — managed Durable Objects, simpler
  DX; (c) Pusher/Ably — managed hosted pubsub, per-message pricing.
  Recommendation: Cloudflare Durable Objects (stays on Workers platform, no external
  dependency, aligns with existing stack).
- Why blocked: task 2.2 says "realtime stack choice -> BLOCKED.md."
- What was built: comment CRUD (HTTP polling baseline) is implemented and tested.
  The realtime layer sits on top — adding it does not break the REST endpoints.
- Real final error (verbatim, if any): n/a

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
