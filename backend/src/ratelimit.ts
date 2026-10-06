/**
 * Rate limiting helper.
 *
 * Primary: the Cloudflare Rate Limiting binding (wrangler.jsonc `ratelimits`,
 * AUTH_LIMITER = 10/min, RSVP_LIMITER = 30/min). Fallback when a binding is
 * absent: a fixed-window counter in isolate memory — best-effort only (it is
 * per-isolate and resets on eviction), but keeps the endpoints from being
 * completely unprotected.
 */
export const AUTH_LIMIT_PER_MIN = 10;
export const RSVP_LIMIT_PER_MIN = 30;
/** Guest (no-account) web RSVPs, per client IP (GUEST_LIMITER binding). */
export const GUEST_RSVP_LIMIT_PER_MIN = 5;

const WINDOW_MS = 60_000;
const memory = new Map<string, { windowStart: number; count: number }>();

function memoryLimit(key: string, limit: number): boolean {
  const now = Date.now();
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (now - v.windowStart >= WINDOW_MS) memory.delete(k);
  }
  const entry = memory.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    memory.set(key, { windowStart: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/** Returns true when the request is allowed, false when it should get a 429. */
export async function allowRequest(
  binding: RateLimit | undefined,
  key: string,
  fallbackLimit: number,
): Promise<boolean> {
  if (binding) {
    try {
      const { success } = await binding.limit({ key });
      return success;
    } catch (err) {
      console.error('[ratelimit] binding error, falling back to memory:', err);
    }
  }
  return memoryLimit(`${fallbackLimit}:${key}`, fallbackLimit);
}

export function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  });
}
