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
  it('GET / serves the landing page as HTML with canonical, JSON-LD and short caching', async () => {
    const response = await req('https://spotseek.app/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    const html = await response.text();
    expect(html).toContain('NEVER WATCH');
    expect(html).toContain('ALONE.');
    expect(html).toContain('<link rel="canonical" href="https://spotseek.app/">');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"@type":"WebSite"');
    expect(html).toContain('hello@spotseek.app');
    // CSS is inlined. Scripts: the JSON-LD block plus exactly one small inline enhancement script
    // (scroll moments + next-up date). No external JS, no src=, nothing else.
    expect(html).toContain('<style>');
    expect(html).not.toContain('styles.css');
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(html.match(/<script/g)!.length).toBe(scripts.length);
    const inline = scripts.filter((m) => !/ld\+json/.test(m[1]!));
    expect(inline).toHaveLength(1);
    expect(inline[0]![1]).toBe('');
    expect(inline[0]![2]!.length).toBeLessThan(4096);
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
  });

  it('og:image and twitter:image are absolute, hashed and follow PUBLIC_BASE_URL', async () => {
    const html = await (await req('https://spotseek.app/')).text();
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/spotseek\.app\/site\/og\.[0-9a-f]{8}\.jpg">/);
    expect(html).toMatch(/<meta name="twitter:image" content="https:\/\/spotseek\.app\/site\/og\.[0-9a-f]{8}\.jpg">/);
    const other = await (await req('https://spotseek.app/', { PUBLIC_BASE_URL: 'https://other.example.test' })).text();
    expect(other).toContain('<link rel="canonical" href="https://other.example.test/">');
    expect(other).toContain('content="https://other.example.test/site/og.');
  });

  it('every /site/ asset the page references exists in Static Assets (public/site)', async () => {
    const html = await (await req('https://spotseek.app/')).text();
    const urls = [...new Set([...html.matchAll(/\/site\/[A-Za-z0-9._-]+\.(?:webp|png|jpg)/g)].map((m) => m[0]))];
    expect(urls.length).toBeGreaterThanOrEqual(7);
    for (const u of urls) {
      const res = await env.ASSETS.fetch(`https://spotseek.app${u}`);
      expect(res.status, u).toBe(200);
      expect(res.headers.get('cache-control'), u).toBe('public, max-age=31536000, immutable');
      expect((await res.arrayBuffer()).byteLength, u).toBeGreaterThan(1000);
    }
  });

  it('the venue story references bar, living room and rooftop photos (1536w + 800w) and each resolves via ASSETS', async () => {
    const html = await (await req('https://spotseek.app/')).text();
    const frame = html.match(/<div class="host__frame">([\s\S]*?)<\/div>/)![1]!;
    for (const k of ['bar', 'home', 'roof']) expect(frame, k).toContain(`hp hp--${k}`);
    for (const name of ['bar', 'living-room', 'rooftop']) {
      const urls = [...frame.matchAll(new RegExp(`/site/${name}-(1536|800)\\.[0-9a-f]{8}\\.webp`, 'g'))].map((m) => m[0]);
      expect(new Set(urls).size, name).toBe(2);
      for (const u of new Set(urls)) expect((await env.ASSETS.fetch(`https://spotseek.app${u}`)).status, u).toBe(200);
    }
    // one pinned stage plus a scroll runway; the chips are the single source of state
    expect(html).toContain('class="host__stage"');
    expect(html.match(/class="host__rn"/g)).toHaveLength(1);
    expect(html).not.toContain('class="host__s"');
    expect(html).toContain('A bar near you');
    expect(html).toContain('Same party. Any room.');
  });

  it('Worker-owned paths are unaffected by the assets binding', async () => {
    const logo = await req('https://spotseek.app/static/email-logo.png');
    expect(logo.status).toBe(200);
    expect(logo.headers.get('content-type')).toBe('image/png');
    expect((await req('https://spotseek.app/robots.txt')).status).toBe(200);
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
