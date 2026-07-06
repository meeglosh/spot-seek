import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as appSchema from './schema';
import * as authSchema from './auth-schema';

// Any change to cookie/session config beyond defaults -> BLOCKED.md.
export function createAuth(sql: NeonQueryFunction<false, false>) {
  // Pass only table objects — spreading the full schema includes pgEnum objects
  // which confuse Better Auth's Drizzle adapter.
  const db = drizzle(sql, {
    schema: {
      users: appSchema.users,
      events: appSchema.events,
      rsvps: appSchema.rsvps,
      follows: appSchema.follows,
      comments: appSchema.comments,
      sponsorProfiles: appSchema.sponsorProfiles,
      sponsorships: appSchema.sponsorships,
      sponsorOffers: appSchema.sponsorOffers,
      ...authSchema,
    },
  });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: authSchema.authUser,
        session: authSchema.authSession,
        account: authSchema.authAccount,
        verification: authSchema.authVerification,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    databaseHooks: {
      user: {
        create: {
          // Mirror the Better Auth user into our app users table so that
          // events.host_id can reference users.id.
          after: async (user) => {
            await db
              .insert(appSchema.users)
              .values({
                id: user.id,
                email: user.email,
                displayName: user.name,
                ...(user.image ? { avatarUrl: user.image } : {}),
              })
              .onConflictDoNothing();
          },
        },
      },
    },
  });
}
