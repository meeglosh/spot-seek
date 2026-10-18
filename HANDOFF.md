# SpotSeek — Session Handoff

_Last updated: 2026-10-15. Read this first when resuming in a new session._

This is a running snapshot of where the project stands so work can continue
without re-deriving context. For the immutable operating rules see `CLAUDE.md`;
for payments design see `PAYMENTS.md`; for human-decisions-pending see
`BLOCKED.md`.

**Working conventions (standing):**
- Branch per task (per CLAUDE.md); the orchestrator verifies checks, then
  fast-forward merges into `main` and runs `npm run deploy` (dev worker)
  itself — the owner granted those permissions. Push to GitHub when asked.
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

## 0a. Update 2026-10-18 — build 43 uploaded

- **Build 43** (security-scan fixes, guest RSVP claim screen, cancel party, i18n) was
  archived and uploaded to App Store Connect on 2026-10-18. NOT yet added to the
  "Friends beta" group / submitted for beta review — ask the owner first.
- **Xcode 27.1 (Swift 6.4) gotcha:** Expo 57.0.26's prebuilt module XCFrameworks were
  built with Swift 6.3.1 and fail to load ("this SDK is not supported by the compiler",
  `ExpoModulesJSI`). `EXPO_USE_PRECOMPILED_MODULES=0` does NOT help (ExpoModulesJSI stays
  prebuilt). Fix was updating to Expo 57.0.30 (`npx expo install expo@~57.0.30` +
  `npx expo install --fix`), then `npx expo prebuild --platform ios --clean`. After an
  Xcode update, update Expo to the latest patch before archiving.
- The upload step (`xcodebuild -exportArchive`) is blocked for agents by the auto-mode
  classifier; the owner runs it with `!`.
- Security work, deploy steps and remaining owner decisions: see BLOCKED.md entries
  dated 2026-10-18.

## 0. RESUME HERE — status as of 2026-10-15

**Build 42 is submitted for External TestFlight beta review** (state
WAITING_FOR_REVIEW, submitted 2026-10-14 via the ASC API). External group
"Friends beta" was created and holds build 42. All TestFlight Test Information
(description, feedback email hello@spotseek.app, marketing + privacy URLs,
review contact incl. phone, demo account, review notes, "What to test") is
filled in via the API. Apple emails the result; once approved, add testers to
"Friends beta" (email or public link). **Always ask the owner before
submitting anything to Apple.**

**Demo reviewer accounts** (credentials in the owner's possession, not in repo):
- `demo@spotseek.app` hosts "Demo watch party: big game night"
  (event 1f06897c-b781-4369-8b12-1e6495021113) and is going to
  "Season finale night".
- `demo-host@spotseek.app` ("Riley (demo host)", notifications off) hosts
  "Season finale night" (event c2b1b0e9-8fda-4881-9d07-5fac9b63f035).
- Event dates are ~2026-10-23/26 — re-date them if review slips past that.

**Owner decisions 2026-10-14:** admin page approved (12h sign-in, failed-login
alert after 5/hour); auth fix approved; legal: 16+, California law / LA County
courts, GAPCO address 132 S Rodeo Dr, Beverly Hills CA 90212, 30-day privacy
replies, liability cap greater of $100 or 12-month fees; sponsorship hidden
for beta (`app.json extra.features.sponsorship=false`); stay on free Resend
(guard caps 80/day); ship all 5 languages.

**Live on the dev worker (https://spotseek.app):** auth fix (baseURL +
trustedOrigins), /privacy + /terms, /admin/moderation (origin fix
169ff11), backend Sentry, ended-event rules, test global teardown.

**Sentry:** org `gapco-llc`, projects `spot-seek` (app) and
`spot-seek-backend`. app.json now names org/project (217978d). Org token
(`org:ci`) is in gitignored `app/.env.sentry-build-plugin`, verified working.
Build 42 has NO symbol upload; **verify debug files appear in Sentry on build
43**. A separate personal token (ends 7e85) is exported from `~/.zshenv`; it is
not SpotSeek's — leave it (the upload guard tolerates it).

**Neon:** project `muddy-hall-40509626` now lives in the GAPCO org;
`NEON_API_KEY` in `backend/.dev.vars` is the GAPCO key and works. Transfer
quota is tight until Nov 1 — minimise full test runs.

**Build tooling:** iOS builds go through a scratch script (prebuild --clean →
Release sim build → launch check → archive → upload) using ASC key UD4K88XVTT,
issuer b24f8676-542c-4f39-93de-7f011745a5f0, team XM2SC5YZ8C. Scratchpad is
wiped on reboot — recreate it from §10 if needed. Test-account cleanup script
deletes `@spotseek.test` users (keeps `reviewer-e2e-%`, `msponsor-%`), dev
host only.

**Next up:**
1. Owner runs the device checklist on build 42 while Apple reviews.
2. ~~Ephemeral Neon branch per test run~~ DONE 2026-10-15 (`npm test`).
3. Cut build 43 when there's a reason to; confirm Sentry symbol upload.
4. App Store privacy label: Crash Data = Linked.
5. Follow-ups (waitlist.ts eventPhase rule DONE 2026-10-15): "my
   sponsorships" list; add-to-calendar, public host page, analytics;
   native-speaker translation review; counsel review of legal drafts.
6. Before App Store release: production DB branch + live Stripe (owner
   decision, BLOCKED.md).

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
- **Tooling**: wrangler 4.x (upgraded from 3.114; `@cloudflare/vitest-pool-workers` 0.12.x
  stays on vitest 3.2 — its 0.13+ needs vitest 4). Rate limits (`AUTH_LIMITER`,
  `RSVP_LIMITER`, `GUEST_LIMITER`) use the first-class `ratelimits` field in
  `backend/wrangler.jsonc` (no more `unsafe` block).

> ⚠️ Before writing Expo code, read the versioned docs at
> https://docs.expo.dev/versions/v57.0.0/ (per `app/AGENTS.md`).


## 4. Current state (builds 19–28 all uploaded to TestFlight)

Latest build: **28** (2026-08-17). Deployed backend: dev/preview worker at
https://spot-seek-api.dry-base-037d.workers.dev (cron `*/15 * * * *`).
The Worker is moving to the custom domain **https://spotseek.app** (apex +
`www`, DNS on Cloudflare; `www` 301s to the apex). `workers_dev` is kept
enabled so builds <= 29, which hardcode the workers.dev URL, keep working.

Shipped since the last snapshot, newest first:
- **Refund rule** — sponsors can withdraw for a full refund before the event
  starts. After the start, a refund happens only if the host cancels. The 15%
  platform fee is confirmed.
- **Branded HTML emails via Resend** — sent from reminders@spotseek.app with
  reply-to hello@spotseek.app. spotseek.app is verified in Resend, inbound mail
  goes through Cloudflare Email Routing, and `RESEND_API_KEY` is set.
- **Stripe (sandbox)** — configured in a dedicated "SpotSeek" Stripe account's
  SANDBOX. The owner's other Stripe account is live and must never be touched.
  - Connect model is "You collect payments and pay recipients".
  - Connected accounts were migrated to Accounts v2 (recipient config, v2
    account links, thin events), because Stripe blocks v1 account creation for
    new platforms.
  - Two webhook destinations (platform snapshot `payment_intent.succeeded`, and
    thin v2 account events) plus the legacy Connected-accounts one.
    `STRIPE_WEBHOOK_SECRET` is a comma-separated list.
  - Sandbox end-to-end flow verified 2026-10-05: onboarding, pay, webhook marks
    it paid, and the release sweep transfers $17 of $20
    (tr_1UNKPxLdvtHgxDqEvOMShuT5).
  - Onboarding return/refresh pages exist at `/payments/onboard/*`, and "Pay
    now" is idempotent.
- **Review sweep bounded and batched** — before, an unbounded scan plus N+1
  queries made a test time out.
- **Payments tests scope sweeps to their own sponsorships**, so the shared-DB
  flakes are fixed.
- **Payments scaffolding (test-mode)** — `PAYMENTS.md` is the spec. Stripe
  Connect separate-charges-&-transfers model; payment state machine on
  `sponsorships`; `/api/payments` routes; release/refund cron sweeps; fetch-
  based Stripe client with real webhook signature verify. Now runs against the
  Stripe sandbox (see the Stripe entry above). App: PAYOUTS section in Settings, Command
  Center payout banner, per-bid payment status + Pay-now (503-aware).
  Phase 2 (native PaymentSheet, needs a new build) not started.
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
  (Resend; console fallback when no key — key is now set), prefs +
  radius slider in Settings, reminder sweeps, favourite-nearby geofencing.
- **Auth persistence fix** — root `app/app/index.tsx` redirect (the
  historical "signed out every launch" bug); 1-year rolling sessions.

Backend test suite: **160 backend tests**, re-run-safe against the shared
Neon dev DB (timestamped unique fixtures — keep doing this; two suites had
accumulation flakes that had to be fixed). App jest: 5 theme tests.

## 5. Dev environment gotchas (hard-won)

- **The dev app talks to `http://localhost:8787`** (`API_BASE` in
  `app/lib/api.ts` when `__DEV__`) — a local `wrangler dev` (wrangler 4) must be running
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
npm test                # 399 tests on an ephemeral Neon branch (created from the
                        # dev branch and deleted afterwards by scripts/test-branch.mjs;
                        # needs NEON_API_KEY in .dev.vars). `npm test -- --run test/x.spec.ts`
                        # for one file. `npm run test:shared` = old behaviour on the
                        # shared dev DB with the global teardown cleaning up.
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
- The root `app/app/index.tsx` redirect chain is load-bearing and has bitten
  twice; modify minimally, test with real cold launches. Since redesign
  phase 4 (guest-first) it is:
  `authenticated` -> `/(tabs)/discover`;
  `unauthenticated + onboarding not seen` -> `/onboarding` (promise screen)
  -> `/onboarding-location` -> `/(auth)/interests` -> `/(tabs)/discover`;
  `unauthenticated + seen` -> `/(tabs)/discover` as a guest (the old
  `/(auth)` welcome screen is no longer on the launch path; sign-out still
  lands on it). The "seen" SecureStore flag is set on the promise screen.
- **Guest mode (phase 4)**: guests browse Discover, event detail and the map
  with no account. Guest interests live in SecureStore
  (`spotseek_guest_interests`, `lib/guestState.ts`) and are MERGED into the
  account's favourites (the bulk endpoint replaces, so never send guest picks
  alone) by `AuthProvider` after every successful sign-in/sign-up. Members-only
  taps go through `useAuthGate().requireAuth(intent)` (`components/AuthGate`),
  which opens a contextual sheet ("Sign up to RSVP for …"); the auth screens
  receive `redirect` + `context` params and return with `router.dismissTo`.
  RSVP completes after auth via an in-memory pending intent consumed by the
  event screen. Guests get 401 (swallowed) on `/api/reviews/*` and
  `/api/favourites`; the feed, `/api/events/:id` and `/api/profiles/:id` are
  public. `assets/onboarding/*` is no longer referenced (removable).
- `npm test` runs on a throwaway Neon branch; `npm run test:shared` hits the
  REAL shared dev DB — keep fixtures timestamp-unique so both modes work.
- The Workers vitest pool blanks the bare `process.env` global inside
  globalSetup files; read env via `import process from 'node:process'`.

## 8. Hard stops (from CLAUDE.md — never do autonomously)

No production deploys (dev/preview worker is fine) · no real payment keys or
charges (test-mode only, and even test keys come from the owner via
BLOCKED.md) · no destructive migrations (additive `IF NOT EXISTS` scripts in
`backend/scripts/` only) · no auth/security config changes without a
BLOCKED.md flag · money/schema/product ambiguities → BLOCKED.md.

## 9. Waiting on the owner (see BLOCKED.md for full details)

- Native-speaker review of FR/ES/DE/PT translations before public launch.
- **Auth config warnings — owner review** (BLOCKED.md): Better Auth "Base URL
  is not set" warning and the `disableOriginCheck` / CSRF deprecation. No
  change made; needs human review per CLAUDE.md.

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
builds still use localhost:8787. Smoke-tested: `/health` (formerly `/`) and `/api/feed` return
live data. `GET /` is now the branded marketing page; the old JSON status is
at `GET /health` (nothing in the app or tests depended on `/`).
Custom domains `spotseek.app` / `www.spotseek.app` are declared in
`backend/wrangler.jsonc` (`routes` with `custom_domain: true`);
`PUBLIC_BASE_URL` is `https://spotseek.app` (drives emails, share/og/canonical,
sitemap, guest RSVP and reset links, Stripe onboarding URLs).
`BETTER_AUTH_URL` is unchanged (still workers.dev; auth review item in
BLOCKED.md). The AASA file is served as `application/json` on both hosts
with no redirect. Wrangler OAuth is authenticated on this machine; the Cloudflare
Claude Code plugin (`cloudflare@cloudflare`) is installed. Wrangler is v4 (upgraded from v3 on
`task/wrangler-v4`).

### Landing page (`GET /`)

Source: `backend/src/homepage.ts` (HTML + inlined CSS in one template; JSON-LD
and `PUBLIC_BASE_URL`-based canonical/og URLs are built there). Images are
Workers Static Assets in `backend/public/site/` (`assets` binding in
`wrangler.jsonc`, served at `/site/*`; `public/_headers` makes them immutable).
Filenames carry an 8-char content hash (`name.<sha256[:8]>.ext`). To change an
image: put the new file in `public/site/` named `name.<hash>.ext` (hash =
`shasum -a 256 file | cut -c1-8`), delete the old one, and update the URL in
`homepage.ts`. The test `every /site/ asset the page references exists` fails
if a reference is stale. Static Assets only answers paths that match a file, so
Worker routes are unaffected. Deploy is the normal `npm run deploy`.

Scroll moments (steps, stale-listing strike and card slam, calendar wipe, host
photo + Oscars card lock with venue chips, brands underline, closing headline
and pin; the hero block settles on load): one code path. A small inline
IntersectionObserver script (under 4 KB, the only non-JSON-LD script;
`test/index.spec.ts` enforces that) adds `html.sx-io`, then `.in` per element as
it enters; CSS transitions do the rest. CSS `animation-timeline: view()` was
removed (engines differed). With JS off or reduced motion the page is its static
design. transform, opacity and clip-path only; no scroll handlers.

Venue story (host section): the whole section is pinned and scrubbed by scroll. `.host` is a runway
(`.host__stage` sticky at 100svh + a `.host__rn` spacer of 230svh). One passive scroll listener (attached only
while an IntersectionObserver says the section is near; rAF-throttled) writes `--p` (0..1) on `.host`. CSS maps
p 0 to .3 onto the vertical split of frame and card (`--s`/`--e`, transform only). The same tick steps the venue
chips (radios) None yet, Bar, Living room, Rooftop at p .4/.6/.8 and reveals the "Same party. Any room." caption
at .9 (never hidden again). `:has()` on the checked chip drives venue text and photo crossfade, so a tap shares
the path; a chip click stops following scroll for the venue (the split keeps scrubbing). Phone (<900px): text
plus visual do not fit one viewport legibly, so only `.host__visual` is sticky and the text scrolls above first
(p is measured from the runway spacer). Reduced motion: no pin, no scrub, static Rooftop + caption. No JS: static
final layout, caption hidden. Same JS path in Chromium and WebKit (no CSS scroll timelines).

Evergreen calendar and ticker: `src/landing-events.ts` (curated, sourced dates,
tentative = month-level) + `src/landing-calendar.ts` (filter in America/New_York,
sort, exactly N=9 rows, recurring rows pinned: NFL Sundays first in season only,
"your show's new episode" last; NEXT UP / ON NOW / TODAY tag rendered server-side).
Keep 24 months of runway: the daily cron logs `[LANDING] calendar running low`
and `GET /api/admin/landing-health` returns the count.


### Sentry (crash and error reporting)

App: `@sentry/react-native` (init in `app/lib/sentry.ts`, called from `app/app/_layout.tsx`, root wrapped with
`Sentry.wrap` + an error boundary using `CrashFallback`). Backend: `@sentry/cloudflare` (`withSentry` around the
default export in `backend/src/index.ts`, options in `backend/src/sentry.ts`, `SENTRY_DSN` var in `wrangler.jsonc`;
tests blank it in `vitest.config.mts`). DSNs are public and committed. Dev builds send nothing unless
`EXPO_PUBLIC_SENTRY_DEV=1`; `/__gallery` has a "Send test event" button.

Source map and dSYM upload is OFF until a token, org and project all exist: `app/plugins/withSentryUploadGuard.js` sets
`SENTRY_DISABLE_AUTO_UPLOAD=true` for the Xcode phases unless token, org and project resolve (a bare exported `SENTRY_AUTH_TOKEN` is not enough; it used to break Release builds). Sources: env, `app/.env.sentry-build-plugin`, `ios/sentry.properties`. Previously: neither `SENTRY_AUTH_TOKEN` nor
`app/.env.sentry-build-plugin` is present, so builds never fail for lack of a token. To enable (no token in chat):
create the file `app/.env.sentry-build-plugin` (gitignored) containing one line `SENTRY_AUTH_TOKEN=<token>` plus
`SENTRY_ORG=<org slug>` and `SENTRY_PROJECT=<app project slug>` lines, then run `npx expo prebuild --platform ios`
and archive as usual. Token scopes: `project:releases` and `org:read`. Alternatively export `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, `SENTRY_PROJECT` in the shell that runs `xcodebuild`.

## 11. Next steps

- **Payments Phase 2: in-app PaymentSheet** (`@stripe/stripe-react-native`,
  native module, so it needs a new build). Publishable key (public, OK to
  commit):
  `pk_test_51UNDiHLdvtHgxDqEjzepUk5FpS6b7IDeRUjHC5Q3O068UWRgl2RTwUSVIaF1kPVvnmtsFZr9sOKh3C5Lpc2sFd7r00T7jLRDRt`.
  Apple Pay later.
- **Security hardening** is in progress on `task/security-hardening`.
- **Go-live checklist** (payments):
  - Radar Standard.
  - Sales-tax decision with the accountant (Stripe Tax was skipped; the
    category should be advertising/services, not software).
  - Live keys and webhooks.
  - `run-sweeps` gated to admin.
  - The hard-coded host country `us` in v2 account creation.
  - Review-sweep concurrent double-send caveat.
- **Growth and monetization priorities** (2026-10-05 review):
  - Link-first web RSVP on `/e/:id`, with a custom domain and JSON-LD.
  - Push notifications (deferred at notification-system build; prefs toggle
    already exists, disabled "Coming soon").
  - Calendar add.
  - An "I'm going" share card.
  - A public host page (host ratings currently show on event pages and own
    profile only).
  - A host-confirmed "showing this game" flag.
  - Tentpole templates (Super Bowl on Feb 14 2027; March Madness Mar 14 to
    Apr 5 2027).
  - Proof-of-attendance check-in for sponsors.
  - A supporter-group "home bar" program.
- Localize notification/email content (needs per-user locale server-side).
- `DELETE /api/account` backend route (Settings delete button currently
  surfaces the server error gracefully).
- Sponsor logos (upload flow + R2, slots into existing chip components).
- Event chat UI (backend DO exists at `GET /api/chat/:eventId/ws`; no entry
  point in the redesigned UI).
- Wallet drawer item is still a stub.
- Clean/seed the dev DB before wider TestFlight testing (test fixtures like
  "Past Event", curling events, and sponsor fixtures are visible).
- Wrangler 3 → 4 upgrade: DONE on `task/wrangler-v4` (pending owner merge; first
  real deploy with v4 is an owner step).
