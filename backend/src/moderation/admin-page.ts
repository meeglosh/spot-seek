/**
 * Admin moderation web page (GET /admin/moderation) for reviewing the queue
 * from a phone. Admin-only; NOT part of Better Auth or app sessions.
 *
 * Auth: POST /admin/login checks the secret (constant-time, SHA-256 digested),
 * then sets an HttpOnly/Secure/SameSite=Strict cookie on path /admin holding
 * `<expiryMs>.<nonce>.<HMAC-SHA256>` signed with a key derived from ADMIN_SECRET
 * (domain-separated). The raw secret never leaves the server. The CSRF token is
 * HMAC(key, "csrf|" + cookie value): bound to the session, no extra storage.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../schema';
import { bufferToHex, timingSafeEqualHex } from '../stripe';
import { publicBaseUrl } from '../email';
import { allowRequest, tooManyRequests, AUTH_LIMIT_PER_MIN } from '../ratelimit';
import { escapeHtml, renderPage } from '../webpage';
import { recordAdminLoginFailure } from './admin-login-failures';
import { loadQueue, restoreEvent, removeEvent, type Db, type QueueItem } from './admin';

const COOKIE = 'ss_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;
const enc = new TextEncoder();

async function sha256Hex(v: string): Promise<string> {
  return bufferToHex(await crypto.subtle.digest('SHA-256', enc.encode(v)));
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`spotseek-admin-page-v1|${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bufferToHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export async function secretMatches(secret: string, supplied: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(supplied), sha256Hex(secret)]);
  return timingSafeEqualHex(a, b);
}

export async function signAdminSession(secret: string, now = Date.now()): Promise<string> {
  const nonce = bufferToHex(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);
  const payload = `${now + SESSION_MS}.${nonce}`;
  return `${payload}.${await hmacHex(secret, `session|${payload}`)}`;
}

export async function verifyAdminSession(secret: string, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  if (!/^\d+$/.test(exp) || !/^[0-9a-f]+$/.test(nonce)) return false;
  const expected = await hmacHex(secret, `session|${exp}.${nonce}`);
  if (!timingSafeEqualHex(expected, sig)) return false;
  return Number(exp) > now;
}

const csrfFor = (secret: string, token: string) => hmacHex(secret, `csrf|${token}`);

type AppEnv = { Bindings: Env };
type Ctx = Context<AppEnv>;
export const adminPageRouter = new Hono<AppEnv>();

// Every admin page response: private, not indexed, no framing.
adminPageRouter.use('*', async (c, next) => {
  await next();
  c.res.headers.set('Cache-Control', 'no-store');
  c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'same-origin');
});

function page(c: Ctx, body: string, status: 200 | 401 | 403 | 404 | 503 = 200) {
  return c.html(renderPage({ title: 'Moderation · SpotSeek', noindex: true, body: `<div class="content">${body}</div>` }), status);
}

function loginPage(c: Ctx, error?: string, status: 200 | 401 | 503 = 200) {
  return page(
    c,
    `<div class="label">Admin</div>
    <h1>Moderation</h1>
    ${error ? `<p class="meta status-wait">${escapeHtml(error)}</p>` : ''}
    <form class="panel" method="post" action="/admin/login">
      <label for="secret">Admin secret</label>
      <input id="secret" name="secret" type="password" autocomplete="current-password" required>
      <button class="btn" type="submit">Sign in</button>
    </form>`,
    status,
  );
}

const ALLOWED_ORIGINS = [
  'https://spotseek.app',
  'https://www.spotseek.app',
  'https://spot-seek-api.dry-base-037d.workers.dev',
];

/**
 * Cross-site check, layered on top of the session-bound CSRF token. Returns null
 * when OK, else a reason for the server log.
 * Origin in the allow-list (or this request's own origin / PUBLIC_BASE_URL) passes.
 * Origin missing or "null" (browsers send "null" for some same-origin form POSTs)
 * falls back to Sec-Fetch-Site: same-origin or a same-origin Referer.
 */
function originProblem(c: Ctx): string | null {
  const origin = c.req.header('Origin');
  const own = new URL(c.req.url).origin;
  const allowed = new Set([own, new URL(publicBaseUrl(c.env)).origin, ...ALLOWED_ORIGINS]);
  if (origin && origin !== 'null') return allowed.has(origin) ? null : `origin not allowed: ${origin}`;
  if (c.req.header('Sec-Fetch-Site') === 'same-origin') return null;
  const referer = c.req.header('Referer');
  if (referer) {
    try {
      if (allowed.has(new URL(referer).origin)) return null;
    } catch {
      /* fall through */
    }
  }
  return `origin ${origin ?? 'missing'}, sec-fetch-site=${c.req.header('Sec-Fetch-Site') ?? 'none'}, no same-origin referer`;
}

const REJECTED = '<h1>Rejected</h1><p class="meta">That action didn\'t go through. Go back and try again.</p><p><a class="btn" href="/admin/moderation">Back to the queue</a></p>';

async function sessionToken(c: Ctx): Promise<string | null> {
  const secret = c.env.ADMIN_SECRET;
  if (!secret) return null;
  const t = getCookie(c, COOKIE);
  return (await verifyAdminSession(secret, t)) ? (t as string) : null;
}

adminPageRouter.post('/login', async (c) => {
  if (!c.env.ADMIN_SECRET) return loginPage(c, 'Admin is not configured.', 503);
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  if (!(await allowRequest(c.env.AUTH_LIMITER, `admin-login:${ip}`, AUTH_LIMIT_PER_MIN))) return tooManyRequests();
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const supplied = typeof form.secret === 'string' ? form.secret : '';
  if (!(await secretMatches(c.env.ADMIN_SECRET, supplied))) {
    await recordAdminLoginFailure(c.env, ip);
    return loginPage(c, 'Wrong secret.', 401);
  }
  setCookie(c, COOKIE, await signAdminSession(c.env.ADMIN_SECRET), {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/admin',
    maxAge: SESSION_MS / 1000,
  });
  return c.redirect('/admin/moderation', 303);
});

adminPageRouter.post('/logout', async (c) => {
  deleteCookie(c, COOKIE, { path: '/admin', secure: true, httpOnly: true, sameSite: 'Strict' });
  return c.redirect('/admin/login', 303);
});

function when(d: Date | string): string {
  return escapeHtml(new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
}

function itemHtml(q: QueueItem, csrf: string): string {
  const reasons = Object.entries(q.reasons).map(([k, v]) => `${escapeHtml(k)} x${v}`).join(', ') || 'none';
  const notes = q.notes.length
    ? `<ul>${q.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
    : '<p class="fine">No report notes.</p>';
  const last = q.lastAction
    ? `${escapeHtml(q.lastAction.action)} by ${escapeHtml(q.lastAction.actor)}${q.lastAction.reason ? ` (${escapeHtml(q.lastAction.reason)})` : ''}, ${when(q.lastAction.at)}`
    : 'none';
  const hid = `<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">`;
  const chip = q.moderationStatus === 'hidden' ? 'chip-hot' : 'chip-volt';
  const id = escapeHtml(q.id);
  return `<div class="panel">
    <h2>${escapeHtml(q.title)}</h2>
    <div class="chips"><span class="chip ${chip}">${escapeHtml(q.moderationStatus)}</span><span class="chip">${escapeHtml(q.status)}</span><span class="chip chip-cyan">${q.reportCount} report${q.reportCount === 1 ? '' : 's'}</span></div>
    <p class="meta">Host: ${escapeHtml(q.hostName ?? 'unknown')}</p>
    <p class="meta">Reasons: ${reasons}</p>
    ${notes}
    <p class="fine">Last action: ${last}</p>
    <p class="fine">Updated ${when(q.updatedAt)} · id ${id}</p>
    <form method="post" action="/admin/moderation/events/${id}/restore">${hid}<button class="btn" type="submit">Restore</button></form>
    <form method="post" action="/admin/moderation/events/${id}/remove" onsubmit="return confirm('Remove this party? The host will be notified.')">${hid}<button class="btn btn-ghost" type="submit">Remove</button></form>
  </div>`;
}

adminPageRouter.get('/moderation', async (c) => {
  if (!c.env.ADMIN_SECRET) return loginPage(c, 'Admin is not configured.', 503);
  const token = await sessionToken(c);
  if (!token) return c.redirect('/admin/login', 302);
  const csrf = await csrfFor(c.env.ADMIN_SECRET, token);
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  const showTest = c.req.query('test') === '1';
  const queue = await loadQueue(db, { excludeTestHosts: !showTest });
  const done = c.req.query('done');
  const flash = done === 'restored' ? 'Restored.' : done === 'removed' ? 'Removed.' : '';
  return page(
    c,
    `<div class="label">Admin</div>
    <h1>Moderation</h1>
    ${flash ? `<p class="meta status-going">${flash}</p>` : ''}
    ${queue.length === 0 ? '<div class="panel"><p class="meta">Nothing to review.</p></div>' : queue.map((q) => itemHtml(q, csrf)).join('')}
    <p class="fine">${showTest ? '<a href="/admin/moderation">Hide test data</a>' : '<a href="/admin/moderation?test=1">Show test data</a>'}</p>
    <form method="post" action="/admin/logout"><button class="link-btn" type="submit">Sign out</button></form>`,
  );
});

adminPageRouter.get('/login', async (c) => {
  if (await sessionToken(c)) return c.redirect('/admin/moderation', 302);
  return loginPage(c);
});

adminPageRouter.get('/', (c) => c.redirect('/admin/moderation', 302));

async function guardedAction(c: Ctx, run: (db: Db) => Promise<boolean>, done: string) {
  if (!c.env.ADMIN_SECRET) return loginPage(c, 'Admin is not configured.', 503);
  const token = await sessionToken(c);
  if (!token) return c.redirect('/admin/login', 302);
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const supplied = typeof form.csrf === 'string' ? form.csrf : '';
  const expected = await csrfFor(c.env.ADMIN_SECRET, token);
  if (!timingSafeEqualHex(await sha256Hex(supplied), await sha256Hex(expected))) {
    console.warn('[ADMIN] rejected action: invalid or missing csrf token');
    return page(c, REJECTED, 403);
  }
  const problem = originProblem(c);
  if (problem) {
    console.warn(`[ADMIN] rejected action: ${problem}`);
    return page(c, REJECTED, 403);
  }
  const db = drizzle(neon(c.env.DATABASE_URL), { schema });
  if (!(await run(db))) return page(c, '<h1>Not found</h1><p class="meta"><a href="/admin/moderation">Back to the queue</a></p>', 404);
  return c.redirect(`/admin/moderation?done=${done}`, 303);
}

adminPageRouter.post('/moderation/events/:id/restore', (c) =>
  guardedAction(c, async (db) => (await restoreEvent(db, c.req.param('id'))).ok, 'restored'),
);
adminPageRouter.post('/moderation/events/:id/remove', (c) =>
  guardedAction(c, async (db) => (await removeEvent(c.env, db, c.req.param('id'))).ok, 'removed'),
);
