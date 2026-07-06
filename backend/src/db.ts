import { neon } from '@neondatabase/serverless';

export function createDb(databaseUrl: string) {
  return neon(databaseUrl);
}
