import {
  readableWidth, readableMargin, insetsWithinColumn, isFoldedSplit, foldPane, READABLE_MAX_WIDTH,
} from '../lib/readableWidth';

describe('readableWidth', () => {
  it('is a no-op on phone widths', () => {
    expect(readableWidth(393)).toBe(393);
    expect(readableWidth(466)).toBe(466);
    expect(readableMargin(466)).toBe(0);
    expect(insetsWithinColumn({ left: 0, right: 84 }, 466)).toEqual({ left: 0, right: 84 });
  });

  it('caps and centres on wide windows', () => {
    expect(readableWidth(951)).toBe(READABLE_MAX_WIDTH);
    expect(readableMargin(951)).toBe((951 - 640) / 2);
    expect(readableWidth(820)).toBe(640);
  });

  it('drops the status-strip inset once the margin clears it', () => {
    expect(insetsWithinColumn({ left: 0, right: 84 }, 951)).toEqual({ left: 0, right: 0 });
    // a narrower wide window (700) leaves a 30pt margin: 54pt of strip remains
    expect(insetsWithinColumn({ left: 0, right: 84 }, 700)).toEqual({ left: 0, right: 54 });
  });
});

describe('fold heuristics', () => {
  it('applies on iPhone-idiom wide landscape only', () => {
    expect(isFoldedSplit(951, 669, false)).toBe(true);
    expect(isFoldedSplit(951, 669, true)).toBe(false); // iPad
    expect(isFoldedSplit(669, 951, false)).toBe(false); // inner portrait
    expect(isFoldedSplit(466, 678, false)).toBe(false); // outer
  });
  it('leaves a gutter either side of the centre', () => {
    expect(foldPane(951, 16)).toBe(459.5);
  });
});
