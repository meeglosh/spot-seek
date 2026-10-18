import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as appSchema from './schema';
import * as authSchema from './auth-schema';

// Canonical public origin of the API/web pages. Used as the baseURL fallback so
// that EVERY createAuth() call (17 session-lookup call sites do not pass opts)
// has a baseURL; otherwise Better Auth logs "Base URL is not set" per instance.
// Cloudflare Workers do not expose wrangler vars as process.env here (compat date
// < 2025-04-01), so Better Auth cannot read BETTER_AUTH_URL itself.
export const DEFAULT_AUTH_BASE_URL = 'https://spotseek.app';

// BETTER_AUTH_URL (wrangler var), registered once per request by the index.ts
// middleware. Vars are constant for an isolate's lifetime, so module state is safe,
// and it keeps baseURL IDENTICAL across all createAuth() call sites. That matters:
// baseURL's protocol decides the cookie name/Secure prefix, so call sites that
// disagreed would fail to read each other's session cookies.
let configuredBaseURL: string | undefined;
export function setAuthBaseURL(url: string | undefined): void {
  if (url) configuredBaseURL = url;
}

// BETTER_AUTH_SECRET (wrangler secret), registered the same way. Better Auth only
// looks for its secret in process.env, which Workers do NOT populate from bindings
// at this compat date, so without an explicit `secret` it silently signs with its
// published default key. createAuth() therefore throws if no secret was registered.
let configuredSecret: string | undefined;
export function setAuthSecret(secret: string | undefined): void {
  if (secret) configuredSecret = secret;
}
// Better Auth's built-in fallback (better-auth/dist/utils/constants.mjs). Never acceptable.
const BETTER_AUTH_DEFAULT_SECRET = 'better-auth-secret-12345678901234567890';

// Origins allowed to make cookie-based (browser) POSTs to /api/auth/*. Native
// requests are not affected (no Origin, no Cookie; they use a bearer token).
export const AUTH_TRUSTED_ORIGINS = [
  'https://spotseek.app',
  'https://www.spotseek.app',
  'https://spot-seek-api.dry-base-037d.workers.dev',
];

// Any change to cookie/session config beyond defaults -> BLOCKED.md.
export function createAuth(
  sql: NeonQueryFunction<false, false>,
  opts?: {
    baseURL?: string;
    // Provided only by the /api/auth handler in index.ts. Absent everywhere else
    // (session lookups etc.), which leaves password reset disabled there.
    sendResetPassword?: (data: { user: { email: string }; token: string }) => Promise<void>;
  },
) {
  // Fail closed: never let Better Auth fall back to its public default secret.
  if (!configuredSecret || configuredSecret === BETTER_AUTH_DEFAULT_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is not configured (or is the library default); refusing to create auth');
  }

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
    secret: configuredSecret,
    // Always set explicitly (see DEFAULT_AUTH_BASE_URL); env override from index.ts.
    baseURL: opts?.baseURL || configuredBaseURL || DEFAULT_AUTH_BASE_URL,

    // Origin/CSRF checks are ON (Better Auth default). For any request carrying a
    // Cookie the Origin must match trustedOrigins; requests with neither a Cookie
    // nor an Origin (native app, bearer token) pass. Do not re-add
    // advanced.disableOriginCheck: it also disables CSRF protection.
    trustedOrigins: AUTH_TRUSTED_ORIGINS,

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
      // Forgot-password (OWNER REVIEW, see BLOCKED.md). Enables Better Auth's
      // POST /api/auth/request-password-reset + POST /api/auth/reset-password.
      // Better Auth answers the request identically for known/unknown emails.
      sendResetPassword: opts?.sendResetPassword,
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hour (also Better Auth's default)
      revokeSessionsOnPasswordReset: true, // a reset signs out every existing session
    },
    // Owner-requested 2026-08-06 (see BLOCKED.md): sessions should last as
    // long as possible, expiring only at the max token lifespan rather than
    // Better Auth's 7-day default. Sessions now persist until explicit
    // sign-out or 1 year of inactivity; updateAge rolls the expiry forward
    // daily as long as the user stays active.
    session: {
      expiresIn: 60 * 60 * 24 * 365, // 1 year
      updateAge: 60 * 60 * 24,       // rolls forward daily with activity
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
