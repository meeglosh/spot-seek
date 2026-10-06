import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import { renderEmailHtml } from '../src/email';

function req(url: string, overrides: Record<string, unknown> = {}, init?: RequestInit) {
  return worker.fetch(new Request(url, init), { ...env, ...overrides } as Env, createExecutionContext());
}

describe('Worker health', () => {
  it('GET /health returns status ok JSON', async () => {
    const response = await req('https://spotseek.app/health');
    expect(response.status).toBe(200);
    const body = await response.json() as { status: string; name: string };
    expect(body).toEqual({ status: 'ok', name: 'spot-seek-api' });
  });
});

describe('Home page', () => {
  it('GET / serves the marketing page with hero, canonical and JSON-LD', async () => {
    const response = await req('https://spotseek.app/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('FIND YOUR');
    expect(html).toContain('WATCH PARTY.');
    expect(html).toContain('<link rel="canonical" href="https://spotseek.app/">');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('application/ld+json');
    expect(html).toContain('/static/email-logo.png');
    expect(html).toContain('hello@spotseek.app');
    expect(html).toContain('COMING SOON TO THE APP STORE');
    // No external JS: the only <script> is the JSON-LD block.
    expect(html).not.toMatch(/<script(?![^>]*ld\+json)/);
  });

  it('shows the App Store link, HTML-escaped, when APP_STORE_URL is set', async () => {
    const html = await (await req('https://spotseek.app/', { APP_STORE_URL: 'https://apps.apple.com/app/x?a=1&b="2"' })).text();
    expect(html).toContain('href="https://apps.apple.com/app/x?a=1&amp;b=&quot;2&quot;"');
    expect(html).not.toContain('COMING SOON TO THE APP STORE');
  });

  it('canonical follows PUBLIC_BASE_URL', async () => {
    const html = await (await req('https://spotseek.app/', { PUBLIC_BASE_URL: 'https://other.example.test' })).text();
    expect(html).toContain('<link rel="canonical" href="https://other.example.test/">');
  });

  it('robots allows / and the sitemap lists it', async () => {
    const robots = await (await req('https://spotseek.app/robots.txt')).text();
    expect(robots).toContain('Allow: /\n');
    const sitemap = await (await req('https://spotseek.app/sitemap.xml')).text();
    expect(sitemap).toContain('<loc>https://spotseek.app/</loc>');
  });
});

describe('www redirect', () => {
  it('301s to the apex preserving path and query', async () => {
    const res = await req('https://www.spotseek.app/e/abc?x=1&y=2', {}, { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://spotseek.app/e/abc?x=1&y=2');
  });

  it('301s the www root', async () => {
    const res = await req('https://www.spotseek.app/');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://spotseek.app/');
  });

  it('does not redirect the apex', async () => {
    expect((await req('https://spotseek.app/health')).status).toBe(200);
  });
});

describe('AASA', () => {
  for (const host of ['spotseek.app', 'www.spotseek.app']) {
    it(`is served as application/json with no redirect on ${host}`, async () => {
      const res = await req(`https://${host}/.well-known/apple-app-site-association`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json');
      const body = await res.json() as { applinks: { details: { appID: string; paths: string[] }[] } };
      expect(body.applinks.details[0].paths).toContain('/e/*');
    });
  }
});

describe('public URLs derive from the base URL', () => {
  it('email CTAs use the apex domain when it is the base', () => {
    const html = renderEmailHtml({
      type: 'rsvp', title: 't', body: 'b', eventId: '11111111-2222-3333-4444-555555555555',
      baseUrl: 'https://spotseek.app',
    });
    expect(html).toContain('https://spotseek.app/e/11111111-2222-3333-4444-555555555555');
    expect(html).toContain('https://spotseek.app/static/email-logo.png');
    expect(html).not.toContain('workers.dev');
  });
});
