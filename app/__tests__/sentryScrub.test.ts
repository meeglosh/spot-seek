import { scrubEvent as scrub, scrubBreadcrumb } from '../lib/sentryScrub';

// Test fixtures carry fields beyond the scrubber's minimal structural type.
const scrubEvent = (e: object) => scrub(e as Parameters<typeof scrub>[0]);

describe('sentry scrub', () => {
  it('reduces user to id only and drops request data', () => {
    const e = scrubEvent({
      user: { id: 'u1', email: 'a@b.co', username: 'x', ip_address: '1.2.3.4' },
      request: { url: 'https://x', headers: { Authorization: 'Bearer t' }, cookies: 'a=b', data: '{"password":"p"}', query_string: 'a=1' },
      server_name: "Mike's iPhone",
    });
    expect(e.user).toEqual({ id: 'u1' });
    expect(e.request).toEqual({ url: 'https://x' });
    expect(e.server_name).toBeUndefined();
  });
  it('drops an id-less user entirely', () => {
    expect(scrubEvent({ user: { email: 'a@b.co' } }).user).toBeUndefined();
  });
  it('drops console crumbs and strips URL query strings', () => {
    expect(scrubBreadcrumb({ category: 'console' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'xhr', data: { url: 'https://api/x?token=abc' } })?.data?.url).toBe('https://api/x');
  });
});
