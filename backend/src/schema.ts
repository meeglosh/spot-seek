import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  doublePrecision,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const eventStatusEnum = pgEnum('event_status', [
  'draft',
  'published',
  'cancelled',
  'completed',
]);

export const rsvpStateEnum = pgEnum('rsvp_state', [
  'going',
  'interested',
  'waitlisted',
  'cancelled',
]);

// ─── users ────────────────────────────────────────────────────────────────────
// Auth fields (sessions, passwords, OAuth tokens) are managed by Better Auth
// in its own tables. Do not add session/password columns here.
// id is text (not uuid) because Better Auth generates non-UUID IDs like
// "D5ErO6BollVi3hk4pRdlE4hRWhSQytZb". Our users.id mirrors the BA user.id.

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  isVerified: boolean('is_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  // Coarse last-known location (rounded to ~1km) used to gate favorite_nearby
  // notifications. Not for precise tracking — see notification_prefs.radiusMiles.
  lastLat: doublePrecision('last_lat'),
  lastLng: doublePrecision('last_lng'),
  locationUpdatedAt: timestamp('location_updated_at', { withTimezone: true }),
});

// ─── events ───────────────────────────────────────────────────────────────────
// The host owns the event. The venue is an optional attribute on the event.
// Cascade-on-user-delete is intentionally absent — see BLOCKED.md.

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Ownership lives here — always host_id, never venue_id.
  // RESTRICT: a host cannot delete their account while they own events.
  hostId: text('host_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  description: text('description'),
  broadcastSubject: text('broadcast_subject').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  capacity: integer('capacity'),
  status: eventStatusEnum('status').notNull().default('draft'),
  coverImageUrl: text('cover_image_url'),
  // RRULE string (e.g. "FREQ=WEEKLY;BYDAY=SU") for recurring events.
  // null = one-off event.
  recurrenceRule: text('recurrence_rule'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  // Venue fields — changing these never touches hostId.
  venueName: text('venue_name'),
  venueAddress: text('venue_address'),
  venueLat: doublePrecision('venue_lat'),
  venueLng: doublePrecision('venue_lng'),
  // IANA timezone identifier derived from venueLat/venueLng, e.g. "America/New_York".
  // Nullable — absent until a venue with coordinates is set.
  venueTimezone: text('venue_timezone'),
  isPrivateLocation: boolean('is_private_location').notNull().default(false),
});

// ─── rsvps ────────────────────────────────────────────────────────────────────
// One rsvp per user per event, enforced by unique constraint.
// Capacity enforcement (going → waitlisted) is application logic, not DB.
// Cascade-on-user-delete is intentionally absent — see BLOCKED.md.

export const rsvps = pgTable(
  'rsvps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    // CASCADE: deleting a user removes their RSVPs (they were an attendee, not the owner).
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: rsvpStateEnum('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('rsvps_event_user_unique').on(table.eventId, table.userId)],
);

// ─── Phase 3: sponsor tables ──────────────────────────────────────────────────

export const sponsorshipStatusEnum = pgEnum('sponsorship_status', [
  'pending',   // awaiting review by whichever side didn't initiate
  'active',    // accepted
  'rejected',  // declined
  'cancelled', // initiator cancelled
  'completed', // event completed, payment settled
]);

// Who proposed the sponsorship — a sponsor bidding on a published event
// (original flow), or a host requesting a specific sponsor (added later).
// Determines who may accept/reject vs. only cancel in PATCH /bids/:id.
export const sponsorshipInitiatorEnum = pgEnum('sponsorship_initiator', ['sponsor', 'host']);

// Sponsor profile — a user opts in as a sponsor.
export const sponsorProfiles = pgTable('sponsor_profiles', {
  id: text('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  companyName: text('company_name').notNull(),
  website: text('website'),
  // Free-form tags a host can filter/skim by when browsing sponsors, e.g.
  // "Food & Drink", "Local Business" — not a fixed enum since sponsor
  // categories aren't a closed set.
  categories: text('categories').array(),
  budgetMinCents: integer('budget_min_cents'),
  budgetMaxCents: integer('budget_max_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// A sponsorship — either a sponsor's bid on a published event, or a host's
// request to a specific sponsor. amount_cents is what the sponsor pays;
// platform_fee_cents (15%) is the platform cut either way.
// Payment processing is stubbed — see BLOCKED.md.
export const sponsorships = pgTable('sponsorships', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  sponsorId: text('sponsor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  amountCents: integer('amount_cents').notNull(),
  platformFeeCents: integer('platform_fee_cents').notNull(),
  status: sponsorshipStatusEnum('status').notNull().default('pending'),
  requestedBy: sponsorshipInitiatorEnum('requested_by').notNull().default('sponsor'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Promo offer attached to a sponsorship — shown to event attendees.
export const sponsorOffers = pgTable('sponsor_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  sponsorshipId: uuid('sponsorship_id')
    .notNull()
    .references(() => sponsorships.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  promoCode: text('promo_code'),
  discountCents: integer('discount_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SponsorProfile = typeof sponsorProfiles.$inferSelect;
export type Sponsorship = typeof sponsorships.$inferSelect;
export type NewSponsorship = typeof sponsorships.$inferInsert;
export type SponsorOffer = typeof sponsorOffers.$inferSelect;
export type NewSponsorOffer = typeof sponsorOffers.$inferInsert;
export type SponsorshipStatus = (typeof sponsorshipStatusEnum.enumValues)[number];

// ─── user_favourites ─────────────────────────────────────────────────────────
// Stores sports, teams, and venues a user wants to quick-filter by.
// type: 'sport' | 'team' | 'venue'
// value: the display name (e.g. "Arsenal", "Premier League", "The Red Lion")
// sport: for type='team', the parent sport name (e.g. "Soccer")

export const userFavourites = pgTable(
  'user_favourites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    value: text('value').notNull(),
    sport: text('sport'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('user_favourites_unique').on(table.userId, table.type, table.value)],
);

export type UserFavourite = typeof userFavourites.$inferSelect;
export type NewUserFavourite = typeof userFavourites.$inferInsert;

// ─── comments ─────────────────────────────────────────────────────────────────
// HTTP polling baseline for event chat. Realtime transport -> BLOCKED.md (2.2).

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

// ─── follows ──────────────────────────────────────────────────────────────────
// Directed follow graph: follower → following.
// Used by the discovery feed to surface events from followed hosts.

export const follows = pgTable(
  'follows',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followingId: text('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('follows_unique').on(table.followerId, table.followingId)],
);

export type Follow = typeof follows.$inferSelect;

// ─── Relations (for Drizzle query builder `with:` syntax) ────────────────────

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, { fields: [follows.followerId], references: [users.id] }),
  following: one(users, { fields: [follows.followingId], references: [users.id] }),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── notifications ────────────────────────────────────────────────────────────
// type is plain text (not pgEnum) because the set of notification kinds is
// expected to grow — sponsor_bid | sponsorship_request | sponsorship_accepted |
// sponsorship_rejected | rsvp | reminder_24h | reminder_1h | event_cancelled |
// venue_changed | favorite_nearby.

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// ─── notification_prefs ───────────────────────────────────────────────────────

export const notificationPrefs = pgTable('notification_prefs', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  pushEnabled: boolean('push_enabled').notNull().default(false),
  radiusMiles: integer('radius_miles').notNull().default(100),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPrefs = typeof notificationPrefs.$inferSelect;
export type NewNotificationPrefs = typeof notificationPrefs.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Rsvp = typeof rsvps.$inferSelect;
export type NewRsvp = typeof rsvps.$inferInsert;
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type RsvpState = (typeof rsvpStateEnum.enumValues)[number];
