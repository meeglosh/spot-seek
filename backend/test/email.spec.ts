import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderEmailHtml, DEFAULT_PUBLIC_BASE_URL } from '../src/email';
import { sendEmail } from '../src/reminders';
import { __setEmailGuardTestHooks } from '../src/email-guard';

const EVENT_ID = '11111111-2222-3333-4444-555555555555';

afterEach(() => vi.restoreAllMocks());

describe('renderEmailHtml', () => {
  it('renders brand layout, headline, and CTA when eventId is given', () => {
    const html = renderEmailHtml({ type: 'rsvp', title: 'Alex is going', body: 'Hello', eventId: EVENT_ID });
    expect(html).toContain('New RSVP');
    expect(html).toContain('#0F0F12');
    expect(html).toContain('View party');
    expect(html).toContain(`${DEFAULT_PUBLIC_BASE_URL}/e/${EVENT_ID}`);
    expect(html).toContain('/static/email-logo.png');
    expect(html).toContain('manage email notifications in Settings');
  });

  it('omits the CTA without an eventId', () => {
    expect(renderEmailHtml({ title: 't', body: 'b' })).not.toContain('View party');
  });

  it('escapes HTML in titles and bodies', () => {
    const html = renderEmailHtml({ title: '<script>alert(1)</script> & "x"', body: '<img src=x onerror=1>' });
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  });
});

describe('sendEmail', () => {
  // Fixture recipients are @b.test; these tests cover the Resend payload, not the
  // guard (see email-guard.spec.ts), and must never touch the real send counter.
  beforeEach(() => __setEmailGuardTestHooks({ allowTestDomains: true, reserve: async () => 1 }));
  afterEach(() => __setEmailGuardTestHooks(null));

  it('posts html, text and reply_to to Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail('a@b.test', 'Subj', 'Body text', 'key', { type: 'rsvp', eventId: EVENT_ID });
    vi.unstubAllGlobals();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const payload = JSON.parse(init.body);
    expect(payload.reply_to).toBe('hello@spotseek.app');
    expect(payload.html).toContain('View party');
    expect(payload.text).toContain('Body text');
    expect(payload.text).toContain(`/e/${EVENT_ID}`);
  });

  it('logs non-2xx responses and does not throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad domain', { status: 422 })));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendEmail('a@b.test', 'S', 'B', 'key')).resolves.toBeUndefined();
    vi.unstubAllGlobals();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('422'));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('bad domain'));
  });
});

describe('GET /static/email-logo.png', () => {
  it('serves a PNG', async () => {
    const res = await SELF.fetch('https://example.com/static/email-logo.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  });
});
