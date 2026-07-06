# SpotSeek data model (v0 — tier one spine)

Principle: **the host owns the event; the venue is an optional attribute of the
event.** Changing venue is editing a field on an event the host already owns, not
moving an event between owners. The schema must never make venue the owner.

## Tables

### users
The account. Can act as host, attendee, or both. (Sponsor is a separate role
added in phase 2; do not build it yet.)
- id (pk)
- email (unique)
- display_name
- avatar_url (nullable, R2)
- created_at, updated_at

Auth fields are managed by Better Auth in its own tables — do not hand-roll
session/password columns here.

### events
Owned by a host (a user). This is the spine.
- id (pk)
- host_id (fk -> users.id, NOT NULL)   ← ownership lives here, always
- title
- description (nullable)
- broadcast_subject              what's being watched (e.g. "Arsenal v Spurs")
- starts_at, ends_at (nullable)
- capacity (nullable int; null = unlimited)
- status (enum: draft, published, cancelled, completed)
- cover_image_url (nullable, R2)
- created_at, updated_at

Venue fields live ON the event as a nullable attribute. A venue change is an
UPDATE to these columns — zero friction, no migration of the event.
- venue_name (nullable)
- venue_address (nullable)
- venue_lat, venue_lng (nullable; enables location filtering in the feed)
- is_private_location (bool, default false; e.g. a home watch party)

NOTE for phase 2: if venues become reusable first-class records (a bar that
hosts many parties), introduce a `venues` table and add a nullable
`venue_id fk -> venues.id` on events ALONGSIDE the denormalized fields. Do NOT
make events depend on a venue row existing. This is a BLOCKED.md decision when it
comes up, not a silent change.

### rsvps
Join between an attendee and an event.
- id (pk)
- event_id (fk -> events.id, NOT NULL)
- user_id (fk -> users.id, NOT NULL)
- state (enum: going, interested, waitlisted, cancelled)
- created_at, updated_at
- unique (event_id, user_id)          one rsvp per user per event

Capacity enforcement: when capacity is set and `going` count reaches it, new
RSVPs become `waitlisted`. This is application logic, asserted by tests.

## Out of scope for v0 (do not build until queued)
- venues as first-class table
- following / social graph
- event chat / comments
- sponsors, offers, analytics
- recurring events

## Invariants the tests must assert
- An event always has a host_id. No orphan events.
- Deleting a user is blocked or cascades deliberately — flag to BLOCKED.md, do
  not pick a cascade behavior silently.
- Changing venue_* fields never alters host_id or event ownership.
- RSVP respects capacity and the one-per-user uniqueness constraint.
