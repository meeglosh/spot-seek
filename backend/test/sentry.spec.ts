import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { scrubEvent, sentryOptions } from '../src/sentry';

describe('sentry', () => {
	it('is a no-op in tests: no DSN in the test env', () => {
		expect(env.SENTRY_DSN).toBeFalsy();
		expect(sentryOptions(env).dsn).toBeUndefined();
	});

	it('wrapped worker still serves requests with the same responses', async () => {
		const ok = await SELF.fetch('https://example.com/health');
		expect(ok.status).toBe(200);
		const missing = await SELF.fetch('https://example.com/definitely-not-a-route');
		expect(missing.status).toBe(404);
	});

	it('scrubs credentials, cookies, bodies and emails', () => {
		const e = scrubEvent({
			user: { id: 'u1', email: 'a@b.co', ip_address: '1.2.3.4' } as { id: string },
			message: 'failed for jane.doe@example.com',
			exception: { values: [{ value: 'bad reset for jane.doe@example.com' }] },
			request: {
				url: 'https://spotseek.app/api/auth/sign-in/email?token=abc',
				headers: {
					Authorization: 'Bearer secret',
					Cookie: 'session=1',
					'stripe-signature': 't=1,v1=x',
					'x-admin-secret': 's',
					'cf-connecting-ip': '1.2.3.4',
					'content-type': 'application/json',
				},
				cookies: { session: '1' },
				data: '{"email":"a@b.co","password":"p"}',
				query_string: 'token=abc',
			},
		});
		expect(e.user).toEqual({ id: 'u1' });
		expect(e.message).toBe('failed for [email]');
		expect(e.exception?.values?.[0].value).toBe('bad reset for [email]');
		expect(e.request?.headers).toEqual({ 'content-type': 'application/json' });
		expect(e.request?.cookies).toBeUndefined();
		expect(e.request?.data).toBeUndefined();
		expect(e.request?.query_string).toBeUndefined();
		expect(e.request?.url).toBe('https://spotseek.app/api/auth/sign-in/email');
	});

	it('drops bodies on payment and admin routes', () => {
		for (const url of ['https://x.dev/api/admin/run-sweeps', 'https://x.dev/api/payments/webhook', 'https://x.dev/api/stripe/connect']) {
			expect(scrubEvent({ request: { url, data: 'x' } }).request?.data).toBeUndefined();
		}
	});
});
