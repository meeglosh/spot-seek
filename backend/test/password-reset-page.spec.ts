/**
 * Forgot-password: reset page + email rendering (no Better Auth config needed).
 */
import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderEmailHtml, renderEmailText } from '../src/email';
import { resetUrl, sendResetEmail, SIGN_IN_DEEP_LINK } from '../src/password-reset';

const BASE = 'https://example.com';

describe('GET /reset-password', () => {
  it('renders the form with the token in an escaped data attribute', async () => {
    const res = await SELF.fetch(`${BASE}/reset-password?token=abc123XYZ`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const html = await res.text();
    expect(html).toContain('data-token="abc123XYZ"');
    expect(html).toContain('Choose a new password');
    expect(html).toContain('type="password"');
    expect(html).toContain('minlength="8"');
    expect(html).toContain('/api/auth/reset-password');
    // success state deep-links back to the app's sign-in
    expect(html).toContain(`href="${SIGN_IN_DEEP_LINK}"`);
    expect(SIGN_IN_DEEP_LINK.startsWith('spotseek://')).toBe(true);
    expect(html).toContain('#00e5ff'); // High-Energy Action palette
  });

  it('HTML-escapes a hostile token and never reflects it raw', async () => {
    const evil = `"><script>alert(1)</script>'&`;
    const res = await SELF.fetch(`${BASE}/reset-password?token=${encodeURIComponent(evil)}`);
    const html = await res.text();
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain(evil);
    expect(html).toContain('data-token="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&#39;&amp;"');
  });

  it('inline JS contains no token or secret (token comes from the DOM)', async () => {
    const res = await SELF.fetch(`${BASE}/reset-password?token=sekrettoken999`);
    const html = await res.text();
    const script = html.slice(html.indexOf('<script>'), html.indexOf('</script>'));
    expect(script).not.toContain('sekrettoken999');
    expect(script).not.toMatch(/secret|api[_-]?key|Bearer/i);
  });

  it('shows an invalid-link state (no form) when the token is missing', async () => {
    const res = await SELF.fetch(`${BASE}/reset-password`);
    const html = await res.text();
    expect(html).toContain('Link invalid');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<script>');
  });
});

describe('password reset email layout', () => {
  const url = resetUrl('https://api.example.test/', 'tok en/1');

  afterEach(() => vi.unstubAllGlobals());

  it('sendResetEmail links to PUBLIC_BASE_URL, not BETTER_AUTH_URL', async () => {
    let body: { html: string; text: string } | undefined;
    vi.stubGlobal('fetch', async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response('{}', { status: 200 });
    });
    const env = {
      RESEND_API_KEY: 're_test', PUBLIC_BASE_URL: 'https://public.example.test',
      BETTER_AUTH_URL: 'https://auth.example.test',
    } as unknown as Env;
    await sendResetEmail(env, { email: 'a@b.co' }, 'tok1');
    expect(body!.text).toContain('https://public.example.test/reset-password?token=tok1');
    expect(body!.html).not.toContain('auth.example.test');
  });

  it('builds the link from the base URL with an encoded token', () => {
    expect(url).toBe('https://api.example.test/reset-password?token=tok%20en%2F1');
  });

  it('renders the RESET YOUR PASSWORD headline and CTA, not VIEW EVENT', () => {
    const html = renderEmailHtml({
      type: 'password_reset', title: 'Reset your password', body: 'Body', ctaLabel: 'RESET PASSWORD', ctaUrl: url,
      footer: "If you didn't ask for this, ignore it.",
    });
    expect(html).toContain('RESET YOUR PASSWORD');
    expect(html).toContain('RESET PASSWORD');
    expect(html).toContain('href="https://api.example.test/reset-password?token=tok%20en%2F1"');
    expect(html).not.toContain('VIEW EVENT');
    expect(html).toContain('ignore it.');
    expect(html).not.toContain('manage email notifications');
    expect(renderEmailText({ title: 't', body: 'Body', ctaLabel: 'RESET PASSWORD', ctaUrl: url })).toContain(`RESET PASSWORD: ${url}`);
  });

  it('leaves existing event emails unchanged', () => {
    const html = renderEmailHtml({ type: 'rsvp', title: 't', body: 'b', eventId: 'e1' });
    expect(html).toContain('VIEW EVENT');
    expect(html).toContain('manage email notifications');
  });
});
