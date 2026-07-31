# SpotSeek — Session Handoff

_Last updated: 2026-07-31 (night — TestFlight pipeline working end-to-end).
Read this first when resuming in a new session._

This is a running snapshot of where the project stands so work can continue
without re-deriving context. For the immutable operating rules see `CLAUDE.md`;
for the task backlog see `TASKS.md`; for human-decisions-pending see `BLOCKED.md`.

**Working convention (as of 2026-07-31): commit directly to `main`, no
feature branches.** Earlier sessions used a branch-per-change + merge flow;
the human asked to stop that and work straight on `main` going forward.

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

## 4. Current git state

- **Branch**: `main`, pushed to origin (https://github.com/meeglosh/spot-seek.git).
- Design work merged via `design/high-energy-action` (merge commit `5fbda0a`):
  `3e465ae` foundation → `b9cf15c` sponsor API client → `aa27355` all screens.
- Guest mode merged via `feat/guest-mode` (merge commit `fee6aea`, single
  commit `2eea0f6`).
- Note: the 4.5MB design zip was accidentally committed in `3e465ae` and later
  untracked; it remains in git history (harmless, but known).

## 4b. Guest mode (added 2026-07-31)

Users can browse without an account; member actions gate to auth with a
return-path. Backend needed no changes (all gated endpoints already 401).

- **Entry**: "Explore as guest →" link on the `(auth)/index` landing panel →
  `router.replace('/(tabs)/discover')`.
- **Free for guests**: Discover feed, map view, filter screen, event detail
  pages (private venue addresses were already masked server-side).
- **Gated (members only)**: RSVP, My Parties, Command Center dashboard,
  Host a Party create form (gated before the form renders, not at submit),
  Personal Hub profile, Sponsorship Hub + bid screen, and the "your teams"
  favourites toggle on the filter screen (shows a sign-in nudge instead).
- **Gate primitives** in `app/components/AuthGate.tsx`:
  - `GuestGate` — full-screen block (MEMBERS ONLY badge, title w/ orange hard
    shadow, sign-in + create-account Btns). Screens render AppHeader above it.
  - `AuthGateSheet` — bottom-sheet modal for inline actions (used by the RSVP
    button on event detail), with a "Keep browsing" dismiss.
  - `goToAuth(router, 'sign-in'|'sign-up', redirect?)` — pushes the auth screen
    with a `redirect` param.
- **Redirect-back flow**: `sign-in`, `sign-up`, and `interests` all read a
  `redirect` search param (validated: must start with `/`). Sign-in replaces
  to it directly; sign-up threads it through interests onboarding, whose Save
  and Skip both land on it. Default target: `/(tabs)/discover`. So a guest
  gated at an event's RSVP returns to that exact event after auth.
- **Drawer** (AppHeader): guests see a cyan "Sign In" item where members see
  the red "Sign Out".

## 5. App structure (post-redesign)

**Navigation**: tabs **Discover / My Parties / Profile**; sponsorship screens are
a hidden tab stack reached via the AppHeader drawer. Old `(tabs)/host/` is gone.

- `(auth)/` — "JOIN THE ACTION" landing, sign-in, sign-up, interests onboarding.
  Email+password only (design's social buttons intentionally NOT built).
- `(tabs)/discover/` — index ("DISCOVERY FEED", sharp LIST|MAP toggle, filter
  category buttons routing to filter screen), `filter`, `[id]` ("Watch Party
  Public Page": duotone hero, LIVE TONIGHT badge only when startsAt is today,
  GET DIRECTIONS, JOIN PARTY hard-shadow CTA, THE BREAKDOWN).
- `(tabs)/parties/` — `index` (MY PARTIES: ATTENDING|HOSTING tabs,
  TONIGHT/UPCOMING/WAITLISTED badges), `dashboard` (COMMAND CENTER: TOTAL RSVP +
  SPONSOR REV tiles from `fetchHostAnalytics()`, active parties w/ SegmentBar,
  drafts, completed, CREATE PARTY), `create` (HOST A PARTY: numbered sections
  01 Basics / 02 Time & Place / 03 Privacy; all create/edit/delete/cover-upload
  logic preserved; edit contract: push create with `params: { eventId }`).
- `(tabs)/profile/` — PERSONAL HUB: milestone progress (real attended count),
  orange HOST A PARTY block, MY TEAMS favourites, saved parties, hosting history.
- `(tabs)/sponsorship/` — `index` (SPONSORSHIP HUB: register-as-sponsor card or
  real analytics tiles + event cards), `[eventId]` (bid form w/ live 15% fee
  math, bid status/cancel). Payments stubbed per BLOCKED.md.
- `components/` — AppHeader, ui, EventCard (duotone cover, TODAY badge only
  when real), EventMapView (NEON_MAP_STYLE dark map, cyan pins / orange for
  events starting within ~3h, LIVE NOW + sport chip overlay; custom style is
  Google-provider only, Apple Maps still works), DateTimePicker,
  BroadcastSubjectInput. `BroadcastSubjectPicker` was deleted (superseded).
- `lib/api.ts` — now includes the full sponsors client: registerSponsor,
  fetchMySponsorProfile, placeSponsorBid, fetchMyBids, fetchEventBids,
  updateBidStatus, fetchHostAnalytics, fetchSponsorAnalytics.

**Design principle enforced throughout**: no fabricated stats. Design mockups
showed fake numbers (engagement scores, media value, seeker levels) — every
screen renders real API data or omits the element.

## 6. How to run & verify

### Checks (definition of done = all four green, per CLAUDE.md)
```bash
cd app
npx tsc --noEmit -p .        # types (strict) — 0 errors
npx eslint .                 # 0 errors (3 pre-existing exhaustive-deps warnings)
npm test                     # jest — 5 theme tests
npm run check:bundle         # expo export dry run — ios+android OK

cd backend
npm test                     # vitest — ~75 tests
npm run lint                 # tsc --noEmit
npm run check:bundle         # wrangler deploy --dry-run
```
All four app checks were green at merge time (2026-07-31). Backend untouched
this session.

### Run locally
```bash
cd backend && npm run dev    # wrangler dev on http://localhost:8787
cd app && npm start          # then "i" for iOS simulator
```
Neon dev DB via `backend/.env` / `.dev.vars`; Google Maps key in `app/app.json`;
wrangler simulates R2 in memory locally.

## 7. Known constraints / gotchas
- **Hono routing**: keep `app.all('/api/auth/*')` (4.12+ regression).
- **RN + Better Auth**: bearer token from `body.token`; RN can't read Set-Cookie.
- **Better Auth schema spreading**: pass only table objects to the Drizzle adapter.
- **ESLint**: `react-hooks/set-state-in-effect` and `react-hooks/refs` off;
  `.expo/**` and `**/*.d.ts` ignored.
- **npm 11 workspaces**: jest pinned in root devDependencies; root scripts use
  `--prefix`.
- **Typed routes**: generated `.expo/types/router.d.ts` can go stale after
  route renames — regenerate by briefly running `expo start`; several dynamic
  pushes use `as never`.
- **Legacy theme keys**: `palette.green/amber/red/gray400` are kept as aliases
  mapped onto HEA accents (used by status colours).

## 8. Hard stops (from CLAUDE.md — never do autonomously; write to BLOCKED.md)
- No production deploys (dev/preview only).
- No real payment keys / live Stripe / real charges (test-mode only).
- No destructive DB migrations on shared/preview DBs.
- No auth/security config changes without a BLOCKED.md flag.
- Never weaken/skip/delete a check to reach green.

## 9. Open items in BLOCKED.md (need human decision)
- **Stripe / payments** for sponsor auctions — mechanics + full sponsor UI now
  built end-to-end; the payment call remains a stub. Needs test-mode keys +
  fee-timing decision.
- **R2 buckets**: RESOLVED — `spotseek-images` + `-preview` created, see §10.

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

## 11. Possible next steps (not started)
- End-to-end pass in the simulator against the live local backend (the redesign
  and guest mode have only been verified by the four checks, not by hand).
- Surface the sports-data `kind` field (league/cup/international) as badges in
  the autocomplete + filter UI.
- Wallet + Settings drawer items are stubs (Alert "Coming soon").
- Event chat UI — backend DO chat exists at `GET /api/chat/:eventId/ws`; the
  redesigned event detail screen does not yet expose a chat entry point.
- Wire Stripe test-mode keys once the BLOCKED.md decision lands.
- Session persistence: the bearer token is in-memory only (`lib/api.ts`), so
  every app launch starts signed-out — fine for guest-first flow, but consider
  expo-secure-store persistence before wider TestFlight testing.
- Wrangler 3 → 4 upgrade (backend devDependency): deploy works on v3 but it
  warns; upgrade + re-verify vitest-pool-workers when convenient.
- The Neon dev-branch DB contains test fixtures (e.g. a "Past Event") that
  TestFlight testers will see — seed or clean it before wider testing.
