import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Worker health', () => {
  it('GET / returns status ok', async () => {
    const response = await SELF.fetch('https://example.com/');
    expect(response.status).toBe(200);
    const body = await response.json() as { status: string };
    expect(body.status).toBe('ok');
  });
});
