# SpotSeek task queue

Format: each task is small enough to finish and verify in one loop session.
`[ ]` = not started, `[~]` = in progress, `[x]` = done, `[!]` = blocked.
Work top to bottom. Do not skip ahead unless a task is blocked.

## Phase 0 — harness (must run first; the loop has no rails without these)

- [x] 0.1 Initialize Expo + TypeScript (strict) project targeting iOS, Android,
      and web. Commit a runnable empty app.
- [x] 0.2 Set up the test runner (Jest + React Native Testing Library). Add one
      trivially-passing test AND one deliberately-failing test. Prove the checker
      reports GREEN on the first and FAILED with a real error on the second, then
      delete the failing test. This verifies both checker paths before any
      feature work.
- [x] 0.3 Configure TypeScript strict checking via `tsc --noEmit` and confirm it
      runs clean on the empty project.
- [x] 0.4 Configure ESLint + the `npm run lint` script. Confirm clean.
- [x] 0.5 Add `npm run check:bundle` — an Expo export/bundle dry run that fails on
      Metro resolution or native-module errors. Confirm it passes on the empty app.
- [x] 0.6 Wire backend scaffolding: Cloudflare Workers project, Neon connection
      (dev branch), Better Auth installed but NOT configured beyond defaults.
      Anything beyond default auth config -> BLOCKED.md.

## Phase 1 — the spine (build only after Phase 0 is fully green)

Follow docs/DATA_MODEL.md exactly. Host owns event; venue is an event attribute.

- [x] 1.1 Schema + migrations for users, events, rsvps on the Neon dev branch.
      Assert the invariants from DATA_MODEL.md in tests. Cascade-on-user-delete
      behavior -> BLOCKED.md, do not choose silently.
- [x] 1.2 Auth flow: sign up, sign in, sign out via Better Auth. Session
      persistence. Any cookie/session config change beyond defaults -> BLOCKED.md.
- [x] 1.3 Event creation: host creates an event (title, broadcast_subject, time,
      capacity, optional venue fields). Persist. Tests for the host_id invariant.
- [x] 1.4 Event edit: host edits their own event, including changing venue_*
      fields. Test that venue change never alters host_id. Authorization test:
      a non-host cannot edit.
- [x] 1.5 Discovery feed: list published events, filter by time and by location
      (venue_lat/lng radius). Private-location events appear but obscure exact
      address until RSVP. Tests for filter correctness.
- [ ] 1.6 RSVP: attendee RSVPs to an event. Enforce capacity (overflow ->
      waitlisted) and one-rsvp-per-user uniqueness. Tests for both.
- [ ] 1.7 Host dashboard: a host sees their events and RSVP counts.
- [ ] 1.8 Reminders scaffolding: schedule a reminder for RSVP'd attendees before
      start. Sending via a real email/push provider with real credentials ->
      BLOCKED.md. Build the scheduling + a fake/dev sender only.

## Phase 2 — stickiness (do not start without human go-ahead)
- [ ] 2.1 Attendee profiles + following
- [ ] 2.2 Event chat / comments (realtime stack choice -> BLOCKED.md)
- [ ] 2.3 Recurring events
- [ ] 2.4 Host verification

## Phase 3 — the business (do not start without human go-ahead)
- [ ] 3.1 Sponsor accounts
- [ ] 3.2 Sponsored event slots
- [ ] 3.3 Offers/promos attached to events
- [ ] 3.4 Host + sponsor analytics
- Note: all payment/money work is a hard stop. Test-mode keys and fixtures only;
  anything touching real funds -> BLOCKED.md.
