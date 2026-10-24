import { isSplitLayout, SPLIT_MIN_WIDTH } from '../lib/splitLayout';

describe('isSplitLayout', () => {
  it('splits on the Duo inner display in landscape', () => {
    expect(isSplitLayout(951, 669)).toBe(true);
  });
  it('splits on iPad landscape', () => {
    expect(isSplitLayout(1194, 834)).toBe(true);
    expect(isSplitLayout(1366, 1024)).toBe(true);
  });
  it('does not split on iPad or Duo portrait', () => {
    expect(isSplitLayout(834, 1194)).toBe(false);
    expect(isSplitLayout(669, 951)).toBe(false);
  });
  it('does not split on an iPhone in portrait or a small landscape window', () => {
    expect(isSplitLayout(393, 852)).toBe(false);
    expect(isSplitLayout(874, 402)).toBe(false);
  });
  it('needs width >= 900 and width > height', () => {
    expect(SPLIT_MIN_WIDTH).toBe(900);
    expect(isSplitLayout(899, 400)).toBe(false);
    expect(isSplitLayout(900, 400)).toBe(true);
    expect(isSplitLayout(900, 900)).toBe(false);
    expect(isSplitLayout(1000, 1100)).toBe(false);
  });
});
