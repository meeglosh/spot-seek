import { sidePadding, trailingOffset } from '../lib/safeArea';

describe('safeArea helpers', () => {
  it('is a no-op when insets are zero (normal iPhone)', () => {
    expect(sidePadding(16, { left: 0, right: 0 })).toEqual({ paddingLeft: 16, paddingRight: 16 });
    expect(trailingOffset(12, { left: 0, right: 0 })).toBe(12);
  });

  it('adds the Duo right inset (84pt) to trailing spacing', () => {
    expect(sidePadding(16, { left: 0, right: 84 })).toEqual({ paddingLeft: 16, paddingRight: 100 });
    expect(trailingOffset(12, { left: 0, right: 84 })).toBe(96);
  });

  it('honours a left inset too', () => {
    expect(sidePadding(16, { left: 47, right: 0 })).toEqual({ paddingLeft: 63, paddingRight: 16 });
  });
});
