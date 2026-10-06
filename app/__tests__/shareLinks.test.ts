import { eventShareUrl, EVENT_SHARE_BASE } from '../lib/shareLinks';

describe('eventShareUrl', () => {
  it('builds the public spotseek.app event link', () => {
    expect(eventShareUrl('abc123')).toBe('https://spotseek.app/e/abc123');
  });
  it('uses spotseek.app, not the workers.dev host', () => {
    expect(EVENT_SHARE_BASE).toBe('https://spotseek.app');
    expect(eventShareUrl('x')).not.toContain('workers.dev');
  });
});
