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

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── events ───────────────────────────────────────────────────────────────────
// The host owns the event. The venue is an optional attribute on the event.
// Cascade-on-user-delete is intentionally absent — see BLOCKED.md.

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Ownership lives here — always host_id, never venue_id.
  hostId: uuid('host_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  broadcastSubject: text('broadcast_subject').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  capacity: integer('capacity'),
  status: eventStatusEnum('status').notNull().default('draft'),
  coverImageUrl: text('cover_image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  // Venue fields — changing these never touches hostId.
  venueName: text('venue_name'),
  venueAddress: text('venue_address'),
  venueLat: doublePrecision('venue_lat'),
  venueLng: doublePrecision('venue_lng'),
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
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    state: rsvpStateEnum('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('rsvps_event_user_unique').on(table.eventId, table.userId)],
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Rsvp = typeof rsvps.$inferSelect;
export type NewRsvp = typeof rsvps.$inferInsert;
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type RsvpState = (typeof rsvpStateEnum.enumValues)[number];
