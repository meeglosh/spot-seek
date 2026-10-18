/**
 * Deep links can carry a `redirect` param into the auth screens. Only plain
 * in-app paths are honoured: a single leading '/', no '//' or '/\' (both are
 * protocol-relative to a URL parser), no backslashes and no control
 * characters. Anything else falls back to the screen's default route.
 */
export function safeRedirect(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
