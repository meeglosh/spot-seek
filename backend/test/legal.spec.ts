import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

function get(path: string) {
  return worker.fetch(new Request(`https://spotseek.app${path}`), env as Env, createExecutionContext());
}

const BANNER = /Draft, last updated \d{4}-\d{2}-\d{2}\. Not yet reviewed by counsel\./;

describe('legal pages', () => {
  for (const [path, heading] of [
    ['/privacy', 'Privacy policy'],
    ['/terms', 'Terms of service'],
  ] as const) {
    it(`${path} serves HTML with the draft banner and cross links`, async () => {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toMatch(BANNER);
      expect(html).toContain(heading);
      expect(html).toContain('hello@spotseek.app');
      expect(html).toContain('GAPCO Limited Liability Company');
      expect(html).toContain('href="https://spotseek.app/privacy"');
      expect(html).toContain('href="https://spotseek.app/terms"');
      expect(html).toContain('href="https://spotseek.app/guidelines"');
      expect(html).not.toContain('—');
      expect(html.toLowerCase()).not.toContain('reviewed by counsel and');
    });
  }

  it('privacy policy covers the processors and the payment-record exception', async () => {
    const html = await (await get('/privacy')).text();
    for (const p of ['Cloudflare', 'Neon', 'Resend', 'Stripe', 'Apple', 'Photon']) expect(html).toContain(p);
    expect(html).toContain('Deleted host');
    expect(html).toContain('We do not sell your data');
  });

  it('has no unfilled bracketed placeholders', async () => {
    for (const path of ['/privacy', '/terms']) {
      const html = await (await get(path)).text();
      expect(html).not.toContain('class="ph"');
      expect(html).not.toMatch(/>\s*\[[^\]]+\]\s*</);
      expect(html).not.toMatch(/\[[^\]<>]*(owner|counsel|decision|confirm|address)[^\]<>]*\]/i);
    }
  });

  it('privacy has a California section and the 16+ wording', async () => {
    const html = await (await get('/privacy')).text();
    expect(html).toContain('California residents');
    expect(html).toContain('CCPA/CPRA');
    expect(html).toContain('We do not sell personal information');
    expect(html).toContain('within 30 days');
    expect(html).toContain('aged 16 or older');
    expect(html).toContain('under 16');
    expect(html).toContain('132 S Rodeo Dr, Beverly Hills, CA 90212');
    expect(html).toContain('Standard Contractual Clauses');
  });

  it('terms require age 16+, name California law and cap liability', async () => {
    const html = await (await get('/terms')).text();
    expect(html).toContain('at least 16 years old');
    expect(html).toContain('16 or older to create an account');
    expect(html).toContain('the State of California');
    expect(html).toContain('Los Angeles County');
    expect(html).toContain('the greater of US$100 or the fees you paid to SpotSeek in the 12 months before the claim');
    expect(html).toContain('test mode');
  });

  it('terms state the 15% fee and link the guidelines', async () => {
    const html = await (await get('/terms')).text();
    expect(html).toContain('15%');
    expect(html).toContain('24 hour dispute window');
  });

  it('guidelines page carries the shared footer linking terms and privacy', async () => {
    const html = await (await get('/guidelines')).text();
    expect(html).toContain('href="https://spotseek.app/terms"');
    expect(html).toContain('href="https://spotseek.app/privacy"');
  });

  it('landing footer, sitemap and robots include the legal pages', async () => {
    const home = await (await get('/')).text();
    expect(home).toContain('href="/terms"');
    expect(home).toContain('href="/privacy"');
    const sitemap = await (await get('/sitemap.xml')).text();
    for (const p of ['/privacy', '/terms', '/guidelines']) expect(sitemap).toContain(`<loc>https://spotseek.app${p}</loc>`);
    const robots = await (await get('/robots.txt')).text();
    expect(robots).toContain('Allow: /privacy');
    expect(robots).toContain('Allow: /terms');
  });
});
