# SpotSeek sponsorship payments — design

Status: **test-mode implementation in progress**. No live keys, no real
charges — per the agent operating rules in CLAUDE.md, everything below runs
against Stripe test mode until the human steps in BLOCKED.md are done.

## Model

Stripe Connect marketplace, **separate charges & transfers**:

1. **Host onboarding.** Hosts create a Stripe Connect **Express** account via
   Stripe-hosted onboarding ("Set up payouts" in the app opens an account
   link URL). Stripe owns KYC, bank details, and tax reporting. We store only
   the account id and its payouts-enabled state.
2. **Charge on acceptance.** When a host accepts a bid, the sponsor pays the
   full `amountCents` via a PaymentIntent. Funds land in the **platform
   balance** (GAPCO's Stripe account) — not the host's.
3. **Release after the event.** Once the event has ended (+24h dispute
   window), a cron sweep transfers `amountCents - platformFeeCents` to the
   host's connected account. The platform fee (15%, `PLATFORM_FEE_RATE` in
   `backend/src/sponsors.ts`) never leaves the platform balance.
4. **Cancellation → refund.** If the event is cancelled before release, the
   sponsor is refunded from the platform balance. Hosts are never clawed
   back because they were never paid early.

Why not instant destination charges: paying hosts weeks before the event
creates refund risk and misaligned incentives. The escrow-like timing above
reuses the existing cron sweep infrastructure (reminders/reviews) and the
existing `amountCents`/`platformFeeCents` columns.

## Money-state machine (sponsorships.paymentStatus)

```
unpaid → requires_payment → paid → released
                              ↘ refunded (event cancelled before release)
```

- `unpaid` — bid not yet accepted (or legacy rows).
- `requires_payment` — bid accepted; PaymentIntent created; awaiting sponsor
  payment confirmation.
- `paid` — webhook confirmed `payment_intent.succeeded`.
- `released` — post-event transfer to host completed.
- `refunded` — refund issued before release.

## Backend pieces

- `backend/src/stripe.ts` — thin fetch-based Stripe REST client (no SDK
  dependency; Workers-friendly). **Graceful unconfigured mode**: when
  `STRIPE_SECRET_KEY` is absent, payment endpoints return
  `503 { error: 'payments_not_configured' }` and the sweep no-ops —
  mirroring the `RESEND_API_KEY` fallback pattern.
- Schema (additive): `users.stripeAccountId`, `users.stripePayoutsEnabled`;
  `sponsorships.paymentStatus`, `.paymentIntentId`, `.transferId`,
  `.paidAt`, `.releasedAt`.
- Routes (`/api/payments`):
  - `POST /connect/onboard` (host) → creates/reuses Express account,
    returns a fresh account-link URL.
  - `GET /connect/status` (host) → `{ accountId, payoutsEnabled }`.
  - `POST /sponsorships/:id/pay` (sponsor) → creates the PaymentIntent,
    returns `{ clientSecret }` (consumed by the future in-app pay sheet).
  - `POST /webhook` — Stripe webhook (signature-verified with
    `STRIPE_WEBHOOK_SECRET`): `payment_intent.succeeded` → `paid` (+
    notifications to both parties), `account.updated` → payouts flag.
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
