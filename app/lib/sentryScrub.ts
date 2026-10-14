// PII scrubbing for Sentry events. Kept free of any Sentry import so it can be
// unit tested without the native module. Applied in `beforeSend`.

type ScrubbableEvent = {
  user?: { id?: string | number };
  request?: { headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown };
  server_name?: string;
};

/**
 * Reduces the user context to the id only (drops email, username, ip_address
 * and anything else) and removes request headers, cookies, bodies and query
 * strings. Returns the same event object.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.user) {
    const id = event.user.id;
    event.user = id !== undefined && id !== null && id !== '' ? { id: String(id) } : undefined;
  }
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
  }
  delete event.server_name; // device name can contain a person's name
  return event;
}

type Breadcrumb = { category?: string; data?: { [key: string]: unknown } };

/** Drops console breadcrumbs (they can carry arbitrary logged values) and URL query strings. */
export function scrubBreadcrumb<T extends Breadcrumb>(crumb: T): T | null {
  if (crumb.category === 'console') return null;
  const url = crumb.data?.url;
  if (crumb.data && typeof url === 'string') crumb.data.url = url.split('?')[0];
  return crumb;
}
