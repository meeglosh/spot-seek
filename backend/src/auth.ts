import { betterAuth } from 'better-auth';

// Default Better Auth configuration. Any changes beyond defaults -> BLOCKED.md.
export function createAuth(databaseUrl: string) {
  return betterAuth({
    database: {
      provider: 'pg',
      url: databaseUrl,
    },
  });
}
