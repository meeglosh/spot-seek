/**
 * Stored-XSS regression: cover upload must only accept real raster images,
 * and /api/images/* must never serve an arbitrary stored Content-Type.
 */
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const TS = Date.now();
const HOST = { email: `host-img-${TS}@spotseek.test`, password: 'Host_Pwd_789!' };

let cookie = '';
let eventId = '';

beforeAll(async () => {
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...HOST, name: 'Img Host' }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(HOST),
  });
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  const ev = await SELF.fetch(EVENTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ title: 'Img Party', broadcastSubject: 'The Big Game', status: 'published' }),
  });
  eventId = ((await ev.json()) as { event: { id: string } }).event.id;
});

afterAll(async () => {
  const listed = await env.SPOTSEEK_IMAGES.list({ prefix: `events/${eventId}/` });
  if (listed.objects.length) await env.SPOTSEEK_IMAGES.delete(listed.objects.map((o) => o.key));
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(bytes: BlobPart, type: string, name: string) {
  const fd = new FormData();
  fd.append('image', new File([bytes], name, { type }));
  return SELF.fetch(`${EVENTS}/${eventId}/cover`, { method: 'POST', headers: { Cookie: cookie }, body: fd });
}

describe('POST /api/events/:id/cover', () => {
  it('rejects html declared as text/html', async () => {
    const r = await upload('<script>alert(1)</script>', 'text/html', 'x.html');
    expect(r.status).toBe(415);
    await r.arrayBuffer();
  });
  it('rejects svg', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>';
    const r = await upload(svg, 'image/svg+xml', 'x.svg');
    expect(r.status).toBe(415);
    await r.arrayBuffer();
  });
  it('rejects html disguised as image/png (magic bytes mismatch)', async () => {
    const r = await upload('<script>alert(1)</script>', 'image/png', 'x.png');
    expect(r.status).toBe(415);
    await r.arrayBuffer();
  });
  it('rejects a png whose declared type disagrees', async () => {
    const r = await upload(PNG, 'text/html', 'x.png');
    expect(r.status).toBe(415);
    await r.arrayBuffer();
  });
  it('accepts a real png and stores a server-chosen content type and key', async () => {
    const res = await upload(PNG, 'image/png', 'evil.html');
    expect(res.status).toBe(200);
    await res.arrayBuffer();
    const obj = await env.SPOTSEEK_IMAGES.get(`events/${eventId}/cover.png`);
    expect(obj?.httpMetadata?.contentType).toBe('image/png');
    await obj?.arrayBuffer();
  });
});

describe('GET /api/images/*', () => {
  it('serves a legacy text/html object as a nosniff attachment', async () => {
    const key = `events/${eventId}/legacy.html`;
    await env.SPOTSEEK_IMAGES.put(key, '<script>alert(1)</script>', { httpMetadata: { contentType: 'text/html' } });
    const res = await SELF.fetch(`https://example.com/api/images/${key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toBe('attachment');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    await res.arrayBuffer();
  });
  it('serves svg as an attachment too', async () => {
    const key = `events/${eventId}/legacy.svg`;
    await env.SPOTSEEK_IMAGES.put(key, '<svg/>', { httpMetadata: { contentType: 'image/svg+xml' } });
    const res = await SELF.fetch(`https://example.com/api/images/${key}`);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    await res.arrayBuffer();
  });
  it('serves a png inline with hardening headers', async () => {
    const key = `events/${eventId}/ok.png`;
    await env.SPOTSEEK_IMAGES.put(key, PNG, { httpMetadata: { contentType: 'image/png' } });
    const res = await SELF.fetch(`https://example.com/api/images/${key}`);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    await res.arrayBuffer();
  });
});
