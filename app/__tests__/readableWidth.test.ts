import {
  readableWidth, readableMargin, insetsWithinColumn, isFoldedSplit, foldPane, READABLE_MAX_WIDTH,
  paneColumnWidth, insetsWithinLeftPane, isFoldedPortrait, clearHorizontalFold, FOLD_GUTTER,
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

describe('left pane column (folded landscape)', () => {
  it('stays inside the left half, clear of the fold', () => {
    expect(paneColumnWidth(951)).toBe(951 / 2 - FOLD_GUTTER);
    expect(paneColumnWidth(951) + FOLD_GUTTER).toBeLessThanOrEqual(951 / 2);
  });

  it('never exceeds the readable cap', () => {
    expect(paneColumnWidth(1600)).toBe(READABLE_MAX_WIDTH);
  });

  it('drops the right status-strip inset once the pane clears it', () => {
    const col = paneColumnWidth(951);
    expect(insetsWithinLeftPane({ left: 0, right: 84 }, 951, col)).toEqual({ left: 0, right: 0 });
    expect(insetsWithinLeftPane({ left: 12, right: 84 }, 951, col).left).toBe(12);
  });
});

describe('horizontal fold (inner portrait)', () => {
  it('detects iPhone-idiom wide portrait only', () => {
    expect(isFoldedPortrait(669, 951, false)).toBe(true);
    expect(isFoldedPortrait(669, 951, true)).toBe(false); // iPad
    expect(isFoldedPortrait(393, 852, false)).toBe(false); // normal iPhone
    expect(isFoldedPortrait(466, 1014, false)).toBe(false); // Duo outer display
    expect(isFoldedPortrait(951, 669, false)).toBe(false); // landscape
  });

  it('leaves blocks wholly above or below the fold zone alone', () => {
    expect(clearHorizontalFold(100, 100, 951)).toBe(0);
    expect(clearHorizontalFold(600, 100, 951)).toBe(0);
    expect(clearHorizontalFold(100, 0, 951)).toBe(0);
  });

  it('moves a block that straddles or touches the fold below it', () => {
    const fold = 951 / 2;
    const push = clearHorizontalFold(430, 100, 951);
    expect(430 + push).toBe(fold + FOLD_GUTTER);
    expect(clearHorizontalFold(fold - 5, 40, 951) + fold - 5).toBe(fold + FOLD_GUTTER);
  });
});
