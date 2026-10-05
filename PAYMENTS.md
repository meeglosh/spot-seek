# SpotSeek sponsorship payments — design

Status: **test-mode implementation in progress**. No live keys, no real
charges — per the agent operating rules in CLAUDE.md, everything below runs
against Stripe test mode until the human steps in BLOCKED.md are done.

## Model

Stripe Connect marketplace, **separate charges & transfers**:

1. **Host onboarding.** Hosts get a Stripe **Accounts v2** connected account
   (`POST /v2/core/accounts`) with the **recipient** configuration and the
   `stripe_balance.stripe_transfers` capability, `dashboard: express` (the
   Express-like Stripe-hosted experience), and platform-owned fees and losses
   (`fees_collector` and `losses_collector` both `application`). "Set up
   payouts" in the app opens a v2 account-link URL (`POST
   /v2/core/account_links`, `use_case.type = account_onboarding`,
   `configurations: ['recipient']`). Stripe owns KYC, bank details, and tax
   reporting. We store only the account id and a readiness flag (the
   `stripePayoutsEnabled` column; it now means "recipient transfers capability
   is active"). Accounts v1 (`/v1/accounts`, `type=express`) is rejected by
   Stripe for new Connect integrations ("Stripe no longer recommends Accounts
   v1...").
2. **Charge on acceptance.** When a host accepts a bid, the sponsor pays the
   full `amountCents` via a PaymentIntent. Funds land in the **platform
   balance** (GAPCO's Stripe account) — not the host's.
3. **Release after the event.** Once the event has ended (+24h dispute
   window), a cron sweep transfers `amountCents - platformFeeCents` to the
   host's connected account. The platform fee (15%, `PLATFORM_FEE_RATE` in
   `backend/src/sponsors.ts` — confirmed by the owner 2026-10-05) never leaves the platform balance.
4. **Cancellation → refund.** If the event is cancelled before release, the
   sponsor is refunded from the platform balance. Hosts are never clawed
   back because they were never paid early. See "Refund policy" below.

Why not instant destination charges: paying hosts weeks before the event
creates refund risk and misaligned incentives. The escrow-like timing above
reuses the existing cron sweep infrastructure (reminders/reviews) and the
existing `amountCents`/`platformFeeCents` columns.

## Refund policy (owner-confirmed 2026-10-05)

- **Platform fee: 15%**, confirmed. It stays parameterized in
  `PLATFORM_FEE_RATE`.
- **Before the event's start time:** a sponsor may withdraw/cancel a `paid`
  sponsorship and receives a full refund (`paymentStatus` → `refunded`).
- **After the start time:** a sponsor can no longer withdraw or cancel a
  `paid` sponsorship — `PATCH /api/sponsors/bids/:id` returns
  `403 { error: 'refund_window_closed' }`. A refund then happens only if the
  **host cancels the event** (refunded by the cron sweep, at any point before
  release).
- **After release:** no refund and no withdrawal
  (`409 { error: 'already_released' }`).
- Sponsorships that are not yet `paid` (pending / awaiting payment) are
  unaffected and can be cancelled at any time.
- A withdrawal needs Stripe configured; otherwise it returns
  `503 payments_not_configured` rather than cancelling without refunding.

## Money-state machine (sponsorships.paymentStatus)

```
unpaid → requires_payment → paid → released
                              ↘ refunded (event cancelled by host, or sponsor withdrew before start)
```

- `unpaid` — bid not yet accepted (or legacy rows).
- `requires_payment` — bid accepted; PaymentIntent created; awaiting sponsor
  payment confirmation.
- `paid` — webhook confirmed `payment_intent.succeeded`.
- `released` — post-event transfer to host completed.
- `refunded` — refund issued before release.

## Backend pieces

- `backend/src/stripe.ts` — thin fetch-based Stripe REST client (no SDK
  dependency; Workers-friendly). v1 endpoints (PaymentIntents, Transfers,
  Refunds) are form-encoded with `Stripe-Version: 2024-06-20`; v2 endpoints
  (`/v2/core/accounts`, `/v2/core/account_links`) are JSON with
  `Stripe-Version: 2026-09-30.endive`. **Graceful unconfigured mode**: when
  `STRIPE_SECRET_KEY` is absent, payment endpoints return
  `503 { error: 'payments_not_configured' }` and the sweep no-ops —
  mirroring the `RESEND_API_KEY` fallback pattern.
- Schema (additive): `users.stripeAccountId`, `users.stripePayoutsEnabled`;
  `sponsorships.paymentStatus`, `.paymentIntentId`, `.transferId`,
  `.paidAt`, `.releasedAt`.
- Routes (`/api/payments`):
  - `POST /connect/onboard` (host) → creates/reuses the v2 recipient
    account, returns a fresh v2 account-link URL.
  - `GET /connect/status` (host) → `{ accountId, payoutsEnabled, configured }`.
    Re-checks the live v2 account (best effort; falls back to the stored
    flag on a Stripe error) so a host returning from onboarding sees the
    right state even before a webhook lands.
  - `POST /sponsorships/:id/pay` (sponsor) → creates the PaymentIntent,
    returns `{ clientSecret }` (consumed by the future in-app pay sheet).
  - `POST /webhook` — signature-verified with `STRIPE_WEBHOOK_SECRET`, a
    comma-separated list (one signing secret per destination). Thin (v2) and
    snapshot (v1) payloads use the same `Stripe-Signature` HMAC scheme.
    Handles: `payment_intent.succeeded` → `paid` (+ notifications; ignored if
    the event carries a connected `account`); v2 thin events
    `v2.core.account[configuration.recipient].capability_status_updated`,
    `v2.core.account[configuration.recipient].updated`,
    `v2.core.account[requirements].updated`, `v2.core.account.closed` →
    re-fetch the v2 account and set the readiness flag; v1 `account.updated`
    (backup) → same re-fetch (payload fallback only if no API key).
- Cron sweep: `paid` sponsorships whose event ended ≥24h ago and host has
  payouts enabled → Stripe Transfer of the host share → `released` (+
  notification). Event cancelled while `paid` → refund → `refunded`.

## App pieces (this pass)

- Host: "Set up payouts" (Command Center + Settings) → opens the account
  link in the browser; payout status shown once enabled.
- Sponsor: payment status labels on bids (awaiting payment / paid /
  released / refunded); accepted-bid card shows a "Pay now" affordance that
  explains payments are pending configuration until keys exist.
- Localized in EN/FR/ES/DE/PT like everything else.

## Phase 2 (after test keys exist — see BLOCKED.md)

- `@stripe/stripe-react-native` PaymentSheet for in-app card entry (native
  module → new TestFlight build), Apple Pay, saved payment methods.
- ACH debit + Stripe hosted invoices for larger B2B sponsors.
- Live-mode cutover: **human-only step**.

## Non-negotiables (from CLAUDE.md)

- Test-mode keys only; live keys/charges are a human decision recorded in
  BLOCKED.md.
- The fee stays parameterized in one place (`PLATFORM_FEE_RATE`).
- No auth/security config changes ride along with payment work.

## Accounts v2 specifics (researched 2026-10-05)

Docs relied on: docs.stripe.com/connect/accounts-v2,
/connect/accounts-v2/connected-account-configuration,
/connect/accounts-v2/migrate-integration (webhook scopes),
/api/v2/core/accounts/create, /retrieve, /api/v2/core/account-links/create,
/event-destinations, /api/v2/core/events/event-types,
/connect/account-capabilities?accounts-namespace=v2.

- **Readiness**: `GET /v2/core/accounts/:id?include[0]=configuration.recipient`;
  ready when
  `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status
  == "active"` and `closed` is not true. The hosted onboarding flow collects
  the payout bank account. The recipient configuration documents no separate
  payouts capability (that is on `merchant`), so transfers-active is the gate
  for both `/connect/status` and the release sweep.
- **Transfers**: `POST /v1/transfers` with `destination=acct_...` is unchanged;
  the docs state a v2 account id can be used in v1 endpoints and that
  `stripe_transfers` "enables this Account to receive /v1/transfers".
- **Sandboxes may not enforce capability status**, so a transfer can succeed
  in test mode before `active`; production gating still uses the flag.
- **Events**: a v2 account emits BOTH v1 snapshot events (`account.updated`,
  scope "Connected accounts") and v2 thin events (scope "Your account").
  `v2.core.account.updated` fires only for top-level props, so the specific
  `[configuration.recipient]` and `[requirements]` events are the ones we use.

### Webhook destinations the owner must create (Dashboard > Developers >
Workbench > Webhooks, test mode/sandbox)

1. **Payments (snapshot)** — Events from: **Your account**; Payload style:
   **Snapshot**; Event: `payment_intent.succeeded`; URL:
   `https://spot-seek-api.dry-base-037d.workers.dev/api/payments/webhook`.
   (Likely already exists; keep it.)
2. **Connect accounts (thin)** — Events from: **Your account** (v2 events use
   this scope, even for connected accounts); Payload style: **Thin**; Events:
   - `v2.core.account[configuration.recipient].capability_status_updated`
   - `v2.core.account[configuration.recipient].updated`
   - `v2.core.account[requirements].updated`
   - `v2.core.account.closed`
   Same URL as above.
3. Append each destination's signing secret (`whsec_...`) to the comma-separated
   `STRIPE_WEBHOOK_SECRET` Worker secret.
4. The old "Connected accounts" snapshot `account.updated` destination is now
   optional (backup); it still works.
