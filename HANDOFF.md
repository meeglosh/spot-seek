# SpotSeek — Session Handoff

_Last updated: 2026-07-11. Read this first when resuming in a new session._

This is a running snapshot of where the project stands so work can continue
without re-deriving context. For the immutable operating rules see `CLAUDE.md`;
for the task backlog see `TASKS.md`; for human-decisions-pending see `BLOCKED.md`.

---

## 1. What SpotSeek is

A **host-centric watch-party platform**. A host owns an event; a venue is an
optional attribute of the event (never its owner); attendees discover events and
RSVP; sponsors (phase 3) fund events via an auction. Three-sided: fans / hosts /
sponsors. Aesthetic: quiet, editorial, monochrome, light + dark themes.

**The host owns the event. The venue hangs off it. Never invert this.**

---

## 2. Tech stack

**Monorepo** at `/Users/mikejerugim/spot-seek` — npm workspaces.

| Part | Location | Stack |
|------|----------|-------|
| Mobile app | `app/` | Expo SDK 57, Expo Router (file-based, typed routes), React Native, TypeScript strict, Jest + RNTL |
| Backend | `backend/` | Cloudflare Workers, Hono v4, Drizzle ORM, Neon Postgres, Better Auth, Vitest |

- **Design system**: DM Sans (body) + DM Serif Display (headlines) via
  `@expo-google-fonts`. Theme in `app/lib/theme.ts` (`light`/`dark` + `Colors` type).
- **Storage**: Cloudflare R2 (`SPOTSEEK_IMAGES` binding) for event cover images.
- **Realtime**: Cloudflare Durable Objects (`ChatRoom`, Hibernation API) for event chat.

> ⚠️ Before writing Expo code, read the versioned docs at
> https://docs.expo.dev/versions/v57.0.0/ (per `app/AGENTS.md`).

---

## 3. Current git state

- **Branch**: `main` only (all feature/task branches merged in and deleted).
- **Tip**: `5087f3d feat: expand sports catalogue with competitions & cups`
- **Remote**: `origin` = https://github.com/meeglosh/spot-seek.git — `main` is
  pushed and in sync. Working tree clean.

Everything below is committed and on GitHub.

---

## 4. What's been built

### Backend (`backend/src/`) — all wired and tested (~75 Vitest tests passing)
- `auth.ts` / `auth-schema.ts` — Better Auth: email+password, **bearer plugin**
  (RN can't read Set-Cookie), `disableOriginCheck: true` for native, mirrors user
  to app `users` table via databaseHooks.
- `schema.ts` — Drizzle schema: users, events, rsvps, follows, comments,
  `user_favourites`, sponsors/bids, reminders, recurrence.
- `events.ts` — create/edit/delete, draft status, dates, `POST /:id/cover` (R2 upload).
- `feed.ts` — discovery with `after/before/lat/lng/radiusKm/q/sport` params,
  private-location masking.
- `rsvps.ts` — RSVP with capacity + uniqueness enforcement.
- `dashboard.ts` — host dashboard, per-event RSVP counts.
- `favourites.ts` — GET/POST/DELETE + `PUT /bulk` (onboarding).
- `profiles.ts` — attendee profiles + follow graph.
- `chat.ts` + `chat-room.ts` — WebSocket chat via Durable Object at
  `GET /api/chat/:eventId/ws`, persists to comments.
- `recurrence.ts` — RRULE recurring events.
- `reminders.ts` — Resend (email) + Expo Push, Cloudflare Queues scheduling.
- `sponsors.ts` — auction mechanics (bids, acceptance, fee calc). **Payment call is
  a stub** — real Stripe wiring is in BLOCKED.md (money = hard stop).
- `admin.ts` — host verification.
- `index.ts` — routes; note `app.all('/api/auth/*')` (Hono 4.12+ routing regression
  workaround — do NOT revert to `app.on([...], '/api/auth/**')`).

### Mobile app (`app/`)
- `lib/api.ts` — API client. `API_BASE` switches on `__DEV__`/platform
  (localhost:8787, or 10.0.2.2 for Android emulator). Bearer token via
  `setBearerToken()`. All endpoints wrapped (feed, events, rsvp, dashboard,
  favourites, cover upload, etc.).
- `lib/auth.tsx` — auth context; extracts `body.token` on sign-in/up → bearer.
- `lib/sports-data.ts` — **670 team/competition entries across 15 sports**
  (see §5). Helpers: `searchTeams`, `getSportById`, `getTeamById`, `getAllTeams`.
- `lib/discover-filters.ts` — module-level pub/sub shared state (no Zustand) for
  filter page ↔ Discover screen.
- Routes:
  - `(auth)/` — index, sign-in, sign-up, **interests** (onboarding after sign-up).
  - `(tabs)/discover/` — index (feed + map toggle), `[id]` (detail + RSVP),
    `filter` (full-screen Airbnb-style filter, modal).
  - `(tabs)/host/` — index (dashboard), create (create/edit, cover, dates, delete).
  - `(tabs)/profile/` — profile.
- Components: `BroadcastSubjectInput` (autocomplete "What is being watched?",
  free-text + scored suggestions — this is the CURRENT one),
  `BroadcastSubjectPicker` (superseded modal picker, still in repo — **can be
  deleted**), `EventMapView` (monochrome map + bottom sheet), `DateTimePicker`,
  `EventCard`.

---

## 5. Most recent work (this session)

Expanded `app/lib/sports-data.ts` from ~390 → **670 entries across 15 sports**,
FotMob-style, adding competitions/cups (not just league teams). Added a `kind`
field to the `League` type: `'league' | 'cup' | 'international'`.

- **Soccer** (7 → 26 competitions): World Cup, Euros, Copa América, Nations League,
  Europa/Conference League, Club World Cup, Libertadores, FA Cup, Carabao Cup,
  Copa del Rey, DFB-Pokal, Coppa Italia, Coupe de France; leagues Championship,
  Eredivisie, Primeira Liga, Scottish Prem, Liga MX, Brasileirão, Saudi Pro League.
- **Other sports**: Super Bowl/CFP + College Football, NBA Playoffs/WNBA/March
  Madness/EuroLeague/FIBA, World Series/WBC/NPB, Stanley Cup/IIHF, expanded rugby
  union, cricket (Ashes, ODI/T20 WCs, The Hundred, Big Bash), tennis
  (ATP/WTA/Davis), golf (team cups + tours + LIV), boxing/PFL/Bellator.
- **New categories**: Motorsport (F1/MotoGP/NASCAR/IndyCar), Rugby League,
  Esports (LoL/CS2/Valorant/Dota), Cycling, Darts & Snooker.
- All team IDs verified globally unique (fixed a `fla` collision:
  Florida Panthers vs Flamengo → Flamengo is now `bra-fla`).
- Flows automatically through the autocomplete, interests onboarding, and Discover
  filter (all read from `SPORTS`).

---

## 6. How to run & verify

### Checks (definition of done = all four green, per CLAUDE.md)
```bash
# App (from app/)
cd app
npx tsc --noEmit -p .        # types (strict)
npx eslint .                 # lint (7 pre-existing exhaustive-deps warnings, 0 errors)
npm test                     # jest — 3 tests
npm run check:bundle         # expo export dry run

# Backend (from backend/)
cd backend
npm test                     # vitest — ~75 tests
npm run lint                 # tsc --noEmit
npm run check:bundle         # wrangler deploy --dry-run
```

### Run locally (for the non-technical path)
```bash
# 1. Start the backend (terminal 1)
cd backend && npm run dev          # wrangler dev on http://localhost:8787

# 2. Start the app (terminal 2)
cd app && npm start                # then press "i" for iOS simulator
```
- Neon dev DB is already connected via `backend/.env` / `.dev.vars`.
- `backend/.dev.vars` has `BETTER_AUTH_URL=http://localhost:8787`.
- Google Maps API key is set in `app/app.json`.
- Wrangler dev simulates R2 in memory — no bucket needed to test locally.

---

## 7. Known constraints / gotchas
- **Hono routing**: keep `app.all('/api/auth/*')`. The `app.on([...],'/api/auth/**')`
  form loses priority in Hono 4.12+ → 404s.
- **RN + Better Auth**: must use bearer token from response `body.token`; RN cannot
  read `Set-Cookie`. Don't switch back to cookie-based sessions for the app.
- **Better Auth schema spreading**: pass only table objects to the Drizzle adapter;
  spreading a pgEnum confuses it.
- **ESLint**: `react-hooks/set-state-in-effect` and `react-hooks/refs` are off
  (standard RN patterns). `.expo/**` and `**/*.d.ts` globally ignored.
- **npm 11 workspaces**: `jest` + `@react-native/jest-preset` are pinned in root
  devDependencies to prevent dehoisting.

---

## 8. Hard stops (from CLAUDE.md — never do autonomously; write to BLOCKED.md)
- No production deploys (dev/preview only).
- No real payment keys / live Stripe / real charges (test-mode only).
- No destructive DB migrations on shared/preview DBs.
- No auth/security config changes without a BLOCKED.md flag.
- Never weaken/skip/delete a check to reach green.

---

## 9. Open items in BLOCKED.md (need human decision)
- **Stripe / payments** for sponsor auctions — mechanics built, payment call
  stubbed. Needs test-mode keys + fee-timing decision.
- **R2 bucket** `spotseek-images` must be created before any deploy
  (`npx wrangler r2 bucket create spotseek-images`). Local dev doesn't need it.

## 10. Possible next steps (not started)
- Delete the superseded `app/components/BroadcastSubjectPicker.tsx`.
- Surface the new `kind` field in the UI (e.g. group/badge cups vs leagues in the
  autocomplete and filter).
- Wire real Stripe test-mode keys for sponsor auctions (needs the BLOCKED.md decision).
- End-to-end test pass in the simulator against the live local backend.
