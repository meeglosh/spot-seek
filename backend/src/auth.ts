import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as appSchema from './schema';
import * as authSchema from './auth-schema';

// Any change to cookie/session config beyond defaults -> BLOCKED.md.
export function createAuth(sql: NeonQueryFunction<false, false>) {
  const db = drizzle(sql, { schema: { ...appSchema, ...authSchema } });

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
  });
}
