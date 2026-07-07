import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as appSchema from './schema';
import * as authSchema from './auth-schema';

// Any change to cookie/session config beyond defaults -> BLOCKED.md.
export function createAuth(sql: NeonQueryFunction<false, false>, opts?: { baseURL?: string }) {
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
    // baseURL silences the "Base URL is not set" warning and anchors
    // cookie domains. Set BETTER_AUTH_URL in .dev.vars (dev) or
    // `wrangler secret put BETTER_AUTH_URL` (production).
    ...(opts?.baseURL ? { baseURL: opts.baseURL } : {}),

    // Native mobile clients (React Native) do not send an Origin header —
    // they are not browser contexts and cannot be CSRF-attacked via iframes.
    // Disabling the origin check is the correct posture for mobile API traffic.
    // Re-evaluate if a web front-end is added (add trustedOrigins instead).
    advanced: {
      disableOriginCheck: true,
    },

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
    // bearer plugin: returns the session token in the response body so React
    // Native clients can store and send it as Authorization: Bearer <token>.
    // Native apps can't read Set-Cookie headers, so this is the correct approach.
    plugins: [bearer()],
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
