# BLOCKED — human decisions waiting

The agents write here instead of guessing. Read this each morning. Empty is good.

<!-- Format per entry:
## <task id> — <one line>
- What it needs: 
- Why it is blocked (which hard-stop or ambiguity): 
- What was tried: 
- Real final error (verbatim, if any): 
-->

## Session lifetime — RESOLVED 2026-08-06: expiresIn extended to 1 year

- Decision: `session.expiresIn` raised from Better Auth's 7-day default to
  `60 * 60 * 24 * 365` (1 year), with `session.updateAge` set to 1 day so an
  active user's session keeps rolling forward instead of hitting a hard
  cliff.
- Why this needed a BLOCKED.md entry: `backend/src/auth.ts` flags any change
  to cookie/session config beyond defaults as requiring human review before
  it lands.
- Owner requested this interactively (session on 2026-08-06): sessions
  should last as long as possible and expire only at the max token lifespan,
  not on a short rolling window. Users sign out explicitly, or the session
  lapses after 1 year of inactivity.
- Also fixes the underlying "signed out every launch" bug alongside app-side
  changes (expo-router root index route + optimistic session restore) — this
  session-lifetime change means a validated session stays valid far longer
  once the app-side restore bug is fixed.

## R2 image storage — RESOLVED 2026-07-31: buckets created, Worker deployed

- Buckets `spotseek-images` + `spotseek-images-preview` created via wrangler
  (human authenticated wrangler OAuth in-session and approved).
- Worker deployed to the dev/preview URL
  https://spot-seek-api.dry-base-037d.workers.dev — NOT a production deploy;
  serves the Neon dev branch DB.
- Secrets set with human approval: DATABASE_URL (Neon dev), BETTER_AUTH_SECRET
  (freshly generated). BETTER_AUTH_URL set as a plain var in wrangler.jsonc.
- Public image URLs: for production later, attach a custom domain to the R2
  bucket. Until then, images are served through the Worker at
  GET /api/images/:key.

## 3.1-3.4 — RESOLVED 2026-10-05 (fee timing): Payment processor for sponsor transactions needs a human decision

- RESOLVED 2026-10-05: PAYMENTS.md answers fee collection timing — the sponsor
  pays in full at bid acceptance (platform balance); the platform fee is retained
  and the host share is transferred after the event (+24h). Stripe keys remain
  open under the PAYMENTS entry below.

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

## PAYMENTS — RESOLVED 2026-10-05 (test keys): Stripe account + test keys (2026-08-17)

- RESOLVED 2026-10-05: Stripe test keys are in place (dedicated "SpotSeek"
  Stripe account, SANDBOX). Sandbox end-to-end flow verified. The live-mode
  restriction below still stands.

- Task: sponsorship payments via Stripe Connect (design: PAYMENTS.md).
  Test-mode implementation is being built now; it runs in a graceful
  "payments_not_configured" mode until keys exist.
- What the owner must do (in order):
  1. Create a Stripe account for GAPCO Limited Liability Company and enable
     Connect (Express) in TEST mode — no business verification needed for
     test mode.
  2. Provide the TEST keys only: `sk_test_...` (wrangler secret
     STRIPE_SECRET_KEY), `pk_test_...` (app config), and after creating the
     webhook endpoint (`https://spot-seek-api.dry-base-037d.workers.dev/api/payments/webhook`)
     the signing secret `whsec_...` (wrangler secret STRIPE_WEBHOOK_SECRET).
  3. RESOLVED 2026-10-05 — platform fee: 15% confirmed (PLATFORM_FEE_RATE,
     backend/src/sponsors.ts), unchanged.
  4. RESOLVED 2026-10-05 — refund policy: full refund if the event is
     cancelled before release; once the event start time has passed a refund
     happens only if the host cancels (sponsors can no longer withdraw a paid
     sponsorship). Implemented; see PAYMENTS.md "Refund policy".
- Explicitly NOT happening without a separate owner decision: live-mode
  keys, real charges, live Connect onboarding. Per CLAUDE.md hard stops.

## Auth config warnings — owner review (2026-10-05)

- What it needs: human review of two Better Auth config warnings. No change has
  been made; per CLAUDE.md, auth/security config changes need human review.
- Why it is blocked: CLAUDE.md hard stop — no auth or security config changes
  (Better Auth provider config, session/cookie settings, CORS, secrets) without
  a BLOCKED.md flag.
- Items:
  1. Better Auth warns "Base URL is not set" even though BETTER_AUTH_URL is
     reportedly a wrangler var. Verify how `backend/src/auth.ts` passes
     `baseURL`.
  2. Better Auth deprecation: `disableOriginCheck: true` currently also
     disables CSRF, and future versions need `disableCSRFCheck: true` for that.
     Web pages now exist (`/e/:id` and the onboarding pages), so the
     origin/CSRF stance should be re-evaluated.

## Forgot password — auth config change, OWNER REVIEW REQUIRED (2026-10-05)

Branch `task/account-deletion-reset`. The `backend/src/auth.ts` change is in its
own commit so it can be reviewed (or reverted) in isolation. Revert that one
commit and the reset routes go back to returning `RESET_PASSWORD_DISABLED`.

`emailAndPassword` now additionally has:
- `sendResetPassword: opts?.sendResetPassword` — enables Better Auth's
  `POST /api/auth/request-password-reset` and `POST /api/auth/reset-password`.
  The callback is only supplied by the `/api/auth/*` handler in `index.ts`
  (it sends the branded Resend email via `waitUntil`); every other `createAuth`
  call (session lookups) leaves it undefined, i.e. disabled.
- `resetPasswordTokenExpiresIn: 3600` — 1 hour (same as Better Auth's default,
  stated explicitly).
- `revokeSessionsOnPasswordReset: true` — a completed reset signs out all
  existing sessions of that user (not requested in the brief; added as the
  safe default — drop it if unwanted).

Not changed: cookies/session settings, `disableOriginCheck`, CORS, secrets,
`baseURL`. Rate limiting: `request-password-reset` now shares the existing
`AUTH_LIMITER` guard in `index.ts` (10/min/IP). Reset page is public at
`GET /reset-password?token=...`; the link in the email is built from
`PUBLIC_BASE_URL` (falls back to the default workers.dev URL); `BETTER_AUTH_URL` is
still used only by Better Auth itself.

## Account deletion — decisions (informational; satisfies the DATA_MODEL
"deleting a user must be deliberate" invariant)

`DELETE /api/account` (body `{confirm:"DELETE"}`): blocks with 409
`has_upcoming_events` (published, not-yet-ended hosted events) or
`money_in_flight` (any `paid` sponsorship where the user is sponsor or event
host). Otherwise: cancels the user's `going` RSVPs and runs waitlist promotion,
deletes their non-upcoming events (RSVPs cleared explicitly since
`rsvps.event_id` has no cascade; comments/reviews/sponsorships/offers on those
events cascade), deletes per-user rows, the app user and the Better Auth user.
Better Auth's own `deleteUser` was NOT enabled (that would be an auth config
change). Stripe connected accounts are never deleted (see PAYMENTS.md).
Owner may want to decide: (a) whether a `requires_payment` (unpaid
PaymentIntent) sponsorship should also block deletion — currently only `paid`
does; (b) whether other users' released sponsorships / reviews on a deleted
past event should be preserved (currently they cascade away with the event).

## Integration (task/integration-oct6: account-deletion-reset + web-rsvp)

Both feature sections below are merged here without changes to their review
items. Interaction decisions: account deletion also deletes `guest_rsvps` rows
whose email equals the user's email (any state) AND rows claimed by the user
(otherwise the FK SET NULL would resurrect a claimed 'going' row as a phantom
unclaimed guest holding a spot and the email). Events where a deleted guest row
held a `going` spot get waitlist promotion (users and guests, via the merged
`waitlist.ts`). Deleting the user's own past events cascades their guest_rsvps.
The password-reset email link now uses `PUBLIC_BASE_URL`. The auth rate-limit
guard covers sign-up, sign-in and request-password-reset (AUTH_LIMITER); guest
RSVP uses GUEST_LIMITER.

## Web guest RSVP + custom domain — owner review (task/web-rsvp)

- `wrangler.jsonc` additions (OWNER REVIEW, not deployed): var `PUBLIC_BASE_URL`
  (still the workers.dev URL), unsafe ratelimit binding `GUEST_LIMITER`
  (namespace_id 1003, 5/min per IP). Optional var `APP_STORE_URL` (unset =
  "Coming soon").
- Schema: additive `guest_rsvps` table via `backend/scripts/add-guest-rsvps.ts`
  (applied to the Neon `dev` branch only; must be run on any other DB before deploy).
- `app/app.json` `associatedDomains` is `applinks:spot-seek-api.dry-base-037d.workers.dev`
  and was NOT changed. `app/lib/api.ts` `EVENT_SHARE_BASE` is hard-coded to the
  same host and was NOT changed (needs a new app build).
- Account linking by email does not require the email to be verified (Better
  Auth email verification is not enabled). Someone signing up with another
  person's email could claim only that person's guest RSVPs. Low impact; decide
  whether to require verified email before claiming.
- Custom domain steps for spotseek.app (owner):
  1. Cloudflare dashboard > Workers & Pages > spot-seek-api > Settings >
     Domains & Routes > Add > Custom Domain > `spotseek.app` (zone is already on
     Cloudflare; this creates the proxied DNS record and certificate). Or in
     wrangler.jsonc: `"routes": [{ "pattern": "spotseek.app", "custom_domain": true }]`.
     Alternative if the apex must keep serving something else: a route
     `spotseek.app/e/*` plus `/rsvp/*`, `/.well-known/*`, `/robots.txt`,
     `/sitemap.xml`, `/static/*`, `/api/*`, `/payments/*` (all paths used in
     public links and emails) on zone spotseek.app. A Custom Domain is simpler.
  2. Set `PUBLIC_BASE_URL` to `https://spotseek.app` (wrangler.jsonc vars) and
     redeploy. Optionally set `BETTER_AUTH_URL` to the same origin (auth review item above).
  3. Check `https://spotseek.app/.well-known/apple-app-site-association` returns
     JSON, status 200, no redirect (Apple requires this; Cloudflare must not
     redirect or challenge it).
  4. iOS Universal Links: change `app/app.json` `ios.associatedDomains` to
     `["applinks:spotseek.app"]` (keep the workers.dev entry too during the
     transition), bump `ios.buildNumber`, `expo prebuild`, and ship a new
     TestFlight/App Store build. Associated domains are baked into the app, so
     existing builds keep only the workers.dev domain. Update `EVENT_SHARE_BASE`
     in `app/lib/api.ts` in the same build so shared links use the new domain.
  5. Email: Resend is already verified for spotseek.app; email CTAs follow
     `PUBLIC_BASE_URL` automatically. Stripe onboarding return URLs also follow it.
  6. Submit `https://spotseek.app/sitemap.xml` in Google Search Console.
