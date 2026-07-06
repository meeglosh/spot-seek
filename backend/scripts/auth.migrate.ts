// Migration entry point for @better-auth/cli.
// DATABASE_URL must be set in environment.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? '');
const db = drizzle(sql, { schema });

const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user: schema.users },
  }),
  emailAndPassword: { enabled: true },
});

export default auth;
