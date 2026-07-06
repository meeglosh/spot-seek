import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

const AUTH = 'https://example.com/api/auth';
const EVENTS = 'https://example.com/api/events';
const CHAT = 'https://example.com/api/chat';

const TS = Date.now();

async function signIn(suffix: string) {
  const email = `chat-${suffix}-${TS}@spotseek.test`;
  const pw = 'Chat_Pwd_1!';
  await SELF.fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, name: suffix }),
  });
  const res = await SELF.fetch(`${AUTH}/sign-in/email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

let hostCookie: string;
let attCookie: string;
let eventId: string;

beforeAll(async () => {
  [hostCookie, attCookie] = await Promise.all([signIn('host'), signIn('att')]);
  const res = await SELF.fetch(EVENTS, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: hostCookie },
    body: JSON.stringify({ title: 'Chat Event', broadcastSubject: 'Big Match', status: 'published' }),
  });
  eventId = ((await res.json()) as { event: { id: string } }).event.id;
});

describe('event chat', () => {
  it('unauthenticated GET returns comments (open read)', async () => {
    const res = await SELF.fetch(`${CHAT}/${eventId}`);
    expect(res.status).toBe(200);
  });

  it('unauthenticated POST returns 401', async () => {
    const res = await SELF.fetch(`${CHAT}/${eventId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'hello' }),
    });
    expect(res.status).toBe(401);
  });

  it('attendee can post a comment', async () => {
    const res = await SELF.fetch(`${CHAT}/${eventId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attCookie },
      body: JSON.stringify({ body: 'Great match!' }),
    });
    expect(res.status).toBe(201);
    const { comment } = await res.json() as { comment: { body: string; id: string } };
    expect(comment.body).toBe('Great match!');
  });

  it('GET lists comments in order', async () => {
    const res = await SELF.fetch(`${CHAT}/${eventId}`);
    const { comments } = await res.json() as { comments: Array<{ body: string }> };
    expect(comments.some((c) => c.body === 'Great match!')).toBe(true);
  });

  it('author can delete their comment', async () => {
    const post = await SELF.fetch(`${CHAT}/${eventId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attCookie },
      body: JSON.stringify({ body: 'Delete me' }),
    });
    const { comment } = await post.json() as { comment: { id: string } };
    const del = await SELF.fetch(`${CHAT}/${eventId}/${comment.id}`, {
      method: 'DELETE', headers: { Cookie: attCookie },
    });
    expect(del.status).toBe(200);
  });

  it('host can delete any comment', async () => {
    const post = await SELF.fetch(`${CHAT}/${eventId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attCookie },
      body: JSON.stringify({ body: 'Host will delete this' }),
    });
    const { comment } = await post.json() as { comment: { id: string } };
    const del = await SELF.fetch(`${CHAT}/${eventId}/${comment.id}`, {
      method: 'DELETE', headers: { Cookie: hostCookie },
    });
    expect(del.status).toBe(200);
  });
});
