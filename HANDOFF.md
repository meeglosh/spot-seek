# SpotSeek — Session Handoff

_Last updated: 2026-08-25. Read this first when resuming in a new session._

This is a running snapshot of where the project stands so work can continue
without re-deriving context. For the immutable operating rules see `CLAUDE.md`;
for payments design see `PAYMENTS.md`; for human-decisions-pending see
`BLOCKED.md`.

**Working conventions (standing):**
- Commit directly to `main`, no feature branches.
- The session owner acts as **orchestrator**: implementation is delegated to
  Sonnet subagents with precise specs; the orchestrator verifies (checks +
  on-simulator screenshots + live API probes) and commits. Trivial config
  bumps, image-asset pipeline work, and deploy/tooling commands are done
  directly.
- Bump `app/app.json` → `ios.buildNumber` before each TestFlight archive.
- Definition of done: tsc + eslint + jest + expo export (app); tsc + vitest +
  wrangler dry-run (backend); plus visual/functional verification where
  feasible, with honest notes on what couldn't be exercised (e.g. taps —
  simulator tap automation is unavailable; use deep links, `simctl launch`
  for cold-start flows, and temporary code edits reverted after screenshots).

---

## 1. What SpotSeek is

A **host-centric watch-party platform**. A host owns an event; a venue is an
optional attribute of the event (never its owner); attendees discover events and
RSVP; sponsors (phase 3) fund events via an auction. Three-sided: fans / hosts /
sponsors.

**The host owns the event. The venue hangs off it. Never invert this.**

## 2. Design system — "High-Energy Action" (NEW as of 2026-07-31)

The app was fully reskinned from the old quiet/monochrome/light+dark look to the
**High-Energy Action** cyber-brutalist system, implemented from the design
package in `stitch_spot_seek_event_network.zip` (repo root, untracked —
`*.zip` is gitignored).

- **Dark-only.** `useTheme()` always returns the single dark palette; `light`
  and `dark` exports in `app/lib/theme.ts` alias the same object. The old
  light theme is gone.
- **Palette**: near-black `#0F0F12` bg; electric cyan `#00e5ff` (primary CTAs,
  active states — `colors.accent`/`colors.fill`), neon orange `#ff5e07`
  (LIVE/urgent — `colors.live`), voltage lime `#b4e100` (success/sponsored —
  `colors.volt`).
- **Type**: Anton (ALL-CAPS headlines via `type.*` presets w/ textTransform),
  Archivo Narrow (body), Space Grotesk (caps labels). Loaded in root layout.
- **Shapes**: sharp 0px corners everywhere (`radius.*` = 0); 1px/2px borders
  instead of soft shadows; `hardShadow()` (solid offset, no blur) on primary
  CTAs only.
- **Shared primitives**: `app/components/ui.tsx` (Btn, Chip, Badge, SegmentBar,
  SectionTitle, FieldLabel, inputStyle/inputFocusedStyle) and
  `app/components/AppHeader.tsx` (SPOT SEEK wordmark + hamburger drawer:
  Switch to Hosting / Sponsorships / Wallet(stub) / Settings(stub) / Sign Out).
- A second design system in the zip ("Kinetic Pulse", rounded/communal) was
  considered and **rejected** — HEA was chosen (9 of 10 design screens use it).

## 3. Tech stack

**Monorepo** at `/Users/mikejerugim/spot-seek` — npm workspaces.

| Part | Location | Stack |
|------|----------|-------|
| Mobile app | `app/` | Expo SDK 57, Expo Router (typed routes), React Native, TypeScript strict, Jest + RNTL |
| Backend | `backend/` | Cloudflare Workers, Hono v4, Drizzle ORM, Neon Postgres, Better Auth, Vitest |

- **Storage**: Cloudflare R2 (`SPOTSEEK_IMAGES`) for event covers.
- **Realtime**: Durable Objects (`ChatRoom`) for event chat.

> ⚠️ Before writing Expo code, read the versioned docs at
> https://docs.expo.dev/versions/v57.0.0/ (per `app/AGENTS.md`).


## 4. Current state (builds 19–28 all uploaded to TestFlight)

Latest build: **28** (2026-08-17). Deployed backend: dev/preview worker at
https://spot-seek-api.dry-base-037d.workers.dev (cron `*/15 * * * *`).

Shipped since the last snapshot, newest first:
- **Payments scaffolding (test-mode)** — `PAYMENTS.md` is the spec. Stripe
  Connect separate-charges-&-transfers model; payment state machine on
  `sponsorships`; `/api/payments` routes; release/refund cron sweeps; fetch-
  based Stripe client with real webhook signature verify. Runs in graceful
  `payments_not_configured` mode — **no Stripe keys of any kind exist yet**
  (owner action in BLOCKED.md). App: PAYOUTS section in Settings, Command
  Center payout banner, per-bid payment status + Pay-now (503-aware).
  Phase 2 (native PaymentSheet, needs pk_test + new build) not started.
- **Multi-sponsor display** — sponsors[] on event detail (active, amount
  desc), sponsorCount/topSponsor on feed items (batched); PRESENTED BY chips
  on event page, ⚡ tag on cards, SPONSORED ×n on dashboard.
- **Reviews/ratings** — post-event review_request notifications (going
  RSVPs, ~2h after end); host ★ + venue ★ + comment, one editable review per
  attendee per event; aggregates on event page (host row, venue card) and own
  profile. Venues stay event attributes — venue aggregates key on normalized
  name+address (`venueKey`).
- **i18n** — EN/FR/ES/DE/PT via i18next + expo-localization (native module,
  in builds ≥25). Namespace-per-domain files in `app/locales/`; persisted
  override + Settings language selector; ~500 keys, parity enforced across
  languages. Server-generated text (emails, notification bodies) is still
  English-only by design.
- **Launch splash** (every cold open, JS overlay after native splash) and
  **Command Center sticky CTA**.
- **Brand refresh** — orange pin icon/logo (`img/` holds owner source files,
  untracked); icon cropped edge-to-edge for iOS masking; splash/onboarding
  logo is the glow-free knockout (source glow was unsalvageably gray).
- **Onboarding v2** — 4 slides (brand splash + seeker/host/sponsor with owner
  photography, gradients baked into the JPEGs), persistent footer SKIP,
  first-launch gating via SecureStore flag in root index redirect.
- **Map fixes** — locate-me button; filter chips snap the viewport to
  matching events; null→value userLocation transition animates the map
  (fixes "stuck on London after granting permission").
- **Venue-timezone localization** — `venue_timezone` on events (tz-lookup at
  create/update, backfilled); `formatEventDateTime` renders venue-local time,
  12h/24h by region, abbreviations via offset math (NOT Intl timeZoneName —
  Hermes can't parse toLocaleString round-trips; see `getOffsetMinutes`).
- **Share fix** — iOS share sheet no longer double-renders link previews
  (link lives only in `url`, not also in the message).
- **Notification system** (build 19) — in-app Notification Center + emails
  (Resend; **RESEND_API_KEY still unset** → console fallback), prefs +
  radius slider in Settings, reminder sweeps, favourite-nearby geofencing.
- **Auth persistence fix** — root `app/app/index.tsx` redirect (the
  historical "signed out every launch" bug); 1-year rolling sessions.

Backend test suite: **138 tests / 20 files**, re-run-safe against the shared
Neon dev DB (timestamped unique fixtures — keep doing this; two suites had
accumulation flakes that had to be fixed). App jest: 5 theme tests.

## 5. Dev environment gotchas (hard-won)

- **The dev app talks to `http://localhost:8787`** (`API_BASE` in
  `app/lib/api.ts` when `__DEV__`) — a local `wrangler dev` must be running
  or every API call fails with "Could not connect to the server" (blank
  sections, silent 401-style fallbacks). Start it:
  `cd backend && set -a && source ../.env && set +a && npx wrangler dev --port 8787`.
- Simulator: **SpotSeek-Test** (UDID FB1FD0CF-3FB4-4383-8A31-A6D376FC630F).
  Tap automation is unavailable (no idb; AppleScript unreliable). Verification
  tricks that work: deep links (`xcrun simctl openurl booted spotseek:///…`),
  real cold launches (`simctl launch`, NOT deep links, for launch-flow bugs),
  temporary code edits hot-reloaded via Metro (scroll offsets, slide/tab
  reorders, seeded search) — always reverted before commit, and
  `-AppleLanguages "(fr)"` launch args for language testing.
- Metro must be serving THIS repo on 8081 (another project stole the port
  once): `cd app && npx expo start --port 8081`.
- Icon assets are pre-rendered PNGs from Material Symbols (freetype/uharfbuzz
  /PIL pipeline in the session scratchpad) — never runtime icon fonts (a
  font-linking crash shipped once). White-on-transparent, tinted via
  `tintColor`.
- New native modules so far: `@react-native-community/slider` (pod name
  `react-native-slider`), `expo-localization`. After adding one: fresh
  `npx expo prebuild --platform ios` (stale incremental builds throw
  `ld: symbol(s) not found`), then `expo run:ios` for the dev app.
- Test users in dev DB with password `testpass1234`:
  `reviewer-e2e-1@spotseek.test` (Riley Reviewer, has a review on the FC
  Barcelona event), `msponsor-*@spotseek.test` fixtures (Volt Cola / Nimbus
  Beer sponsor the "Multi Sponsor Cup Final" event). Owner sim account:
  meeglosh+2@gmail.com (password unknown to agents — never needed; use API-
  created users for E2E).

## 6. Checks (definition of done)

```bash
cd app
npx tsc --noEmit -p .   # 0 errors
npx eslint . --ext .ts,.tsx  # 0 errors; exactly 3 baseline exhaustive-deps
                             # warnings in discover/index.tsx (loadFeed)
npm test                # 5 theme tests
npx expo export --platform ios

cd backend
npx tsc --noEmit
npm test                # 138 tests — run TWICE if fixtures changed
npm run check:bundle
npm run deploy          # dev/preview worker (allowed per CLAUDE.md)
```

## 7. Known constraints / gotchas (code-level)

- **Hono routing**: keep `app.all('/api/auth/*')` (4.12+ regression).
- **RN + Better Auth**: bearer token from `body.token`; RN can't read
  Set-Cookie. Optimistic auth restore caches the user object in SecureStore;
  only definitive-invalid responses sign out.
- **Hermes Intl**: baseline `timeZone` support only — never rely on
  `timeZoneName` display data or `new Date(toLocaleString(...))` parsing.
  Use `formatToParts` (see `dateFormat.ts` / backend `timezone.ts`).
- **Better Auth schema spreading**: pass only table objects to the Drizzle
  adapter. Non-UUID user ids (text).
- **i18n**: `t` is aliased `tr` in screens (theme `type as t` collides).
  Keys nested per-namespace; `_one`/`_other` plurals; keep 5-language parity
  (python key-diff) whenever EN gains keys.
- **EventMapView** had a freeze bug historically — keep diffs there minimal.
- The root `app/app/index.tsx` redirect chain (auth → onboarding → welcome)
  is load-bearing and has bitten twice; modify minimally, test with real
  cold launches.
- vitest runs against the REAL shared dev DB — always timestamp-unique
  fixtures.

## 8. Hard stops (from CLAUDE.md — never do autonomously)

No production deploys (dev/preview worker is fine) · no real payment keys or
charges (test-mode only, and even test keys come from the owner via
BLOCKED.md) · no destructive migrations (additive `IF NOT EXISTS` scripts in
`backend/scripts/` only) · no auth/security config changes without a
BLOCKED.md flag · money/schema/product ambiguities → BLOCKED.md.

## 9. Waiting on the owner (see BLOCKED.md for full details)

- **Stripe**: GAPCO Stripe account + TEST keys (sk_test → wrangler secret
  STRIPE_SECRET_KEY, pk_test for the app, whsec → STRIPE_WEBHOOK_SECRET);
  confirm 15% fee; refund policy. Unblocks payments Phase 2.
- **RESEND_API_KEY** (wrangler secret) — emails currently console-only.
- Native-speaker review of FR/ES/DE/PT translations before public launch.

## 10. TestFlight / iOS release pipeline

**Status (2026-07-31): working end-to-end from the command line.** Build 2
archived, exported, and uploaded to App Store Connect entirely via
`xcodebuild` — no Xcode GUI interaction required. Reuse this pipeline for
every future TestFlight build.

### One-time setup (already done on this Mac — reference only)

- **Apple Team**: GAPCO Limited Liability Company, Team ID `XM2SC5YZ8C`.
  Baked into `app.json` as `expo.ios.appleTeamId` — **this is the fix that
  matters**. `app/ios/` is fully regenerated by `expo prebuild` on every
  `app.json` change (icon, splash, buildNumber, etc.), which wipes any team
  selection made by hand in Xcode's Signing & Capabilities. Baking it into
  `app.json` makes it survive every regeneration. Do not rely on the Xcode
  GUI setting alone — it will not persist.
- **App Store Connect API key** (for headless, non-interactive auth — no
  Xcode sign-in needed): generated at App Store Connect → Users and Access →
  Integrations → App Store Connect API, Access level Admin. Stored at
  `~/.appstoreconnect/private_keys/AuthKey_UD4K88XVTT.p8` (chmod 600), the
  standard path Apple's tooling auto-discovers by filename convention. Key ID
  `UD4K88XVTT`, Issuer ID `b24f8676-542c-4f39-93de-7f011745a5f0`. **Never let
  this file sit inside the git repo** — it was briefly saved at
  `app/.appstoreconnect/` (untracked but NOT gitignored, one `git add -A`
  from being pushed to GitHub) before being moved to the safe location.
- The keychain also has unrelated Apple Development certs under two other
  personal teams (`UR2V2UVBMP`, `AL29JCFFF6`) from before this project — the
  archive step below will sign under whichever team it has a cert for
  (harmless), and the export step is what forces the correct GAPCO team via
  `exportOptions.plist`.
- App Store Connect app record: bundle ID `com.spotseek.app`, suggested SKU
  `SPOTSEEK001`.

### Every future build: 4 commands

```bash
# 0. Bump the build number first — Apple rejects a duplicate upload.
#    Edit app/app.json: ios.buildNumber, e.g. "2" -> "3".

# 1. Regenerate the native project (picks up appleTeamId, icons, etc.)
cd app && npx expo prebuild --platform ios

# 2. Archive
cd ios
xcodebuild -workspace SpotSeek.xcworkspace -scheme SpotSeek -configuration Release \
  -sdk iphoneos -destination "generic/platform=iOS" \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_UD4K88XVTT.p8 \
  -authenticationKeyID UD4K88XVTT \
  -authenticationKeyIssuerID b24f8676-542c-4f39-93de-7f011745a5f0 \
  archive -archivePath /tmp/SpotSeek.xcarchive

# 3. Export + upload to App Store Connect in one step
cat > /tmp/exportOptions.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
	<key>method</key><string>app-store-connect</string>
	<key>teamID</key><string>XM2SC5YZ8C</string>
	<key>signingStyle</key><string>automatic</string>
	<key>destination</key><string>upload</string>
</dict></plist>
EOF
xcodebuild -exportArchive -archivePath /tmp/SpotSeek.xcarchive \
  -exportOptionsPlist /tmp/exportOptions.plist \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_UD4K88XVTT.p8 \
  -authenticationKeyID UD4K88XVTT \
  -authenticationKeyIssuerID b24f8676-542c-4f39-93de-7f011745a5f0 \
  -exportPath /tmp/SpotSeek-export
```

Look for `** ARCHIVE SUCCEEDED **` and `** EXPORT SUCCEEDED **` /
`Upload succeeded.` in the output. Then allow 10–30 min for App Store Connect
processing before the build shows up under TestFlight.

### Gotchas hit getting here
- **Simulator GUI automation is unreliable in this environment** — `System
  Events` clicks intermittently resolved to the macOS `loginwindow` process
  (screen lock racing with the automation, invisible to `simctl` screenshots
  since those only read the simulated device framebuffer, never the host
  desktop). Don't try to drive Xcode or the Simulator via clicks/AppleScript;
  the `xcodebuild` CLI path above is both more reliable and fully scriptable.
- **dSYM warnings on upload are expected and harmless**: React.framework,
  ReactNativeDependencies.framework, and hermesvm.framework (prebuilt
  binaries) upload without debug symbols. Crash reports for these frameworks
  won't symbolicate; app-level Swift/JS crashes still will. Not worth chasing
  unless crash reporting becomes a priority.
- Archive signs under whatever dev-team cert is available locally
  (`AL29JCFFF6` here) — that's fine; only the **export** step's
  `exportOptions.plist teamID` needs to be correct.

### Backend: deployed and live (resolved 2026-07-31)

Deployed to **https://spot-seek-api.dry-base-037d.workers.dev** (dev/preview
— Neon dev branch DB, R2 buckets `spotseek-images`/`-preview` created,
secrets DATABASE_URL + BETTER_AUTH_SECRET set, BETTER_AUTH_URL as wrangler
var). `API_BASE` release path in `app/lib/api.ts` now points at it; dev
builds still use localhost:8787. Smoke-tested: `/` and `/api/feed` return
live data. Wrangler OAuth is authenticated on this machine; the Cloudflare
Claude Code plugin (`cloudflare@cloudflare`) is installed. Wrangler is v3 (v4
upgrade is a pending follow-up — see §11).


## 11. Next steps (not started)

- **Payments Phase 2** once test keys land: `@stripe/stripe-react-native`
  PaymentSheet (native module → new build), end-to-end test-money flow,
  Apple Pay later.
- Push notifications (deferred at notification-system build; prefs toggle
  already exists, disabled "Coming soon").
- Localize notification/email content (needs per-user locale server-side).
- `DELETE /api/account` backend route (Settings delete button currently
  surfaces the server error gracefully).
- Public host profile route (host ratings currently show on event pages and
  own profile only — no public host page exists).
- Sponsor logos (upload flow + R2, slots into existing chip components).
- Event chat UI (backend DO exists at `GET /api/chat/:eventId/ws`; no entry
  point in the redesigned UI).
- Wallet drawer item is still a stub.
- Clean/seed the dev DB before wider TestFlight testing (test fixtures like
  "Past Event", curling events, and sponsor fixtures are visible).
- Wrangler 3 → 4 upgrade (deploy warns on v3).
