// Sentry (crash and error reporting) for the Worker. Public DSN comes from the
// SENTRY_DSN var in wrangler.jsonc; with no DSN (tests, local runs that unset it)
// the SDK is a no-op. No PII: dataCollection is all-off, and beforeSend scrubs
// again as defense in depth (secrets, cookies, bodies, emails).
import type { CloudflareOptions } from '@sentry/cloudflare';

/** Request paths whose bodies/queries can carry credentials, payment or admin data. */
const SENSITIVE_PATH = /^\/(api\/auth|api\/admin|api\/payments|api\/stripe|api\/account|api\/sponsor|onboard|webhooks?)(\/|$)|stripe|password|payment|webhook/i;

/** Header names that are always removed, plus anything that looks like a credential. */
const DROP_HEADERS = new Set([
	'authorization', 'cookie', 'set-cookie', 'proxy-authorization',
	'stripe-signature', 'cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'true-client-ip',
]);
const SECRETISH_HEADER = /secret|token|key|auth|signature|session/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const redactEmails = (s: string): string => s.replace(EMAIL_RE, '[email]');

// Structural subset of the Sentry event we touch (keeps this file testable without the SDK).
type Scrubbable = {
	user?: { id?: string | number };
	request?: {
		url?: string;
		headers?: Record<string, string>;
		cookies?: unknown;
		data?: unknown;
		query_string?: unknown;
	};
	message?: string;
	server_name?: string;
	exception?: { values?: Array<{ value?: string }> };
};

export function scrubEvent<T extends Scrubbable>(event: T): T {
	// User context: id only (the Worker never sets one today; drop email/ip if anything did).
	if (event.user) {
		const id = event.user.id;
		event.user = id !== undefined && id !== '' ? { id: String(id) } : undefined;
	}
	delete event.server_name;
	const req = event.request;
	if (req) {
		delete req.cookies;
		if (req.headers) {
			for (const name of Object.keys(req.headers)) {
				const lower = name.toLowerCase();
				if (DROP_HEADERS.has(lower) || SECRETISH_HEADER.test(lower)) delete req.headers[name];
			}
		}
		let path = '';
		try {
			path = req.url ? new URL(req.url).pathname : '';
		} catch {
			/* relative or malformed url: treat as sensitive below */
		}
		// Query strings can hold reset tokens, signed params and emails: never send them.
		delete req.query_string;
		if (req.url) req.url = req.url.split('?')[0];
		// Bodies: always dropped on auth/payment/admin routes; also when the path is unknown.
		if (!path || SENSITIVE_PATH.test(path)) delete req.data;
	}
	if (event.message) event.message = redactEmails(event.message);
	for (const ex of event.exception?.values ?? []) {
		if (ex.value) ex.value = redactEmails(ex.value);
	}
	return event;
}

export function sentryOptions(env: Env): CloudflareOptions {
	return {
		dsn: env.SENTRY_DSN || undefined, // empty/unset -> SDK disabled
		environment: env.SENTRY_ENVIRONMENT || 'dev',
		// @sentry/cloudflare v11 replaced `sendDefaultPii` with `dataCollection` (and its
		// defaults collect everything). Equivalent of sendDefaultPii:false, made strict:
		// no user info/IP, cookies, headers, request/response bodies, query params,
		// DB query data, queue args or local variables.
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			databaseQueryData: false,
			queues: false,
			stackFrameVariables: false,
			genAI: { inputs: false, outputs: false },
		},
		tracesSampleRate: 0.05,
		beforeSend: (event) => scrubEvent(event),
		// Console breadcrumbs can carry logged emails or tokens.
		beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
	};
}
