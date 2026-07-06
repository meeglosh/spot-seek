import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { createAuth } from './auth';

const app = new Hono<{ Bindings: Env }>();

// Mount Better Auth at /api/auth/*
app.on(['GET', 'POST'], '/api/auth/**', (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const auth = createAuth(sql);
  return auth.handler(c.req.raw);
});

app.get('/', (c) => c.json({ status: 'ok', name: 'spot-seek-api' }));

export default app;
