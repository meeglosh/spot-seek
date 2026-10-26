import { Platform, type PlatformIOSStatic } from 'react-native';
import { isSplitLayout } from './splitLayout';
import type { SideInsets } from './safeArea';

// Main content is capped to a phone-ish column on wide windows (iPad, iPhone
// Duo inner display) so lines and buttons never stretch edge to edge. Every
// normal iPhone (and the Duo outer display) is narrower than the cap, so the
// helpers below are no-ops there.
export const READABLE_MAX_WIDTH = 640;

/** True on iPad (interface idiom); the Duo runs the iPhone idiom. */
export function isPadDevice(): boolean {
  return Platform.OS === 'ios' && (Platform as PlatformIOSStatic).isPad === true;
}

/** Width of the centred content column for a window of `width`. */
export function readableWidth(width: number, max: number = READABLE_MAX_WIDTH): number {
  return Math.min(width, max);
}

/** Space left on each side of the centred column. */
export function readableMargin(width: number, max: number = READABLE_MAX_WIDTH): number {
  return Math.max(0, (width - max) / 2);
}

/**
 * Side insets as seen from inside the centred column. A system inset (the
 * Duo's 84pt status strip) only matters to the part of it the column actually
 * overlaps; with a 155pt margin the strip is entirely outside.
 */
export function insetsWithinColumn(insets: SideInsets, width: number, max: number = READABLE_MAX_WIDTH): SideInsets {
  const margin = readableMargin(width, max);
  return { left: Math.max(0, insets.left - margin), right: Math.max(0, insets.right - margin) };
}

/**
 * iPhone Duo inner display in landscape, the only place a vertical fold sits
 * at the window's centre. iPad shares the window size but has no fold, and
 * Platform.isPad (interface idiom) tells them apart; the Duo runs the iPhone
 * idiom. React Native can't read the real fold (UIHingeInteraction is
 * native-only and reports status/angle, not geometry), so this is a size
 * heuristic: it applies whether or not the device is actually folded.
 */
export function isFoldedSplit(width: number, height: number, isPad: boolean = isPadDevice()): boolean {
  return !isPad && isSplitLayout(width, height);
}

/** Left and right half widths for the two panes either side of a centred fold. */
export function foldPane(width: number, gutter: number): number {
  return Math.max(0, width / 2 - gutter);
}

/**
 * Floating tab bar sizing. Normal windows: full width (no cap needed below
 * READABLE_MAX_WIDTH). Wide: capped and centred. Duo landscape: confined to the
 * left half, since three equal tabs would otherwise put the middle one on the
 * fold. `edge` is the bar's side padding, `gutter` the clearance left of the fold.
 */
export function tabBarLayout(
  width: number, height: number, edge: number, gutter: number, isPad: boolean = isPadDevice(),
): { maxWidth: number; align: 'center' | 'flex-start' } {
  if (isFoldedSplit(width, height, isPad)) {
    return { maxWidth: Math.max(0, width / 2 - edge - gutter), align: 'flex-start' };
  }
  return { maxWidth: READABLE_MAX_WIDTH, align: 'center' };
}

/** Clearance kept on each side of the fold, in points. */
export const FOLD_GUTTER = 16;

/**
 * Left-pane column for a screen in the folded split: the readable cap, but
 * never wider than the left half minus the gutter, so nothing (content or a
 * sticky bar) crosses the vertical fold at the window's centre.
 */
export function paneColumnWidth(width: number, gutter: number = FOLD_GUTTER, max: number = READABLE_MAX_WIDTH): number {
  return Math.min(max, foldPane(width, gutter));
}

/** Side insets for a column of `colWidth` pinned to the left edge. */
export function insetsWithinLeftPane(insets: SideInsets, width: number, colWidth: number): SideInsets {
  return { left: insets.left, right: Math.max(0, insets.right - (width - colWidth)) };
}

/** Smallest window width treated as a foldable's inner display in portrait. */
export const FOLDED_PORTRAIT_MIN_WIDTH = 600;

/**
 * iPhone Duo inner display in portrait: the fold is horizontal, across the
 * window's vertical centre (the hinge notches sit mid-height on the side
 * edges). No iPhone is this wide in portrait; iPad is excluded by idiom. Same
 * size heuristic as isFoldedSplit: RN can't read the real fold.
 */
export function isFoldedPortrait(width: number, height: number, isPad: boolean = isPadDevice()): boolean {
  return !isPad && width >= FOLDED_PORTRAIT_MIN_WIDTH && height > width;
}

/**
 * Extra top margin that moves a block (at window-relative `top`, `blockHeight`
 * tall) clear of a horizontal fold at the window's vertical centre. Blocks that
 * already sit wholly above or below the fold zone get 0. Only valid at the
 * scroll origin: scrolled content moves under the fold regardless.
 */
export function clearHorizontalFold(
  top: number, blockHeight: number, windowHeight: number, gutter: number = FOLD_GUTTER,
): number {
  const foldTop = windowHeight / 2 - gutter;
  const foldBottom = windowHeight / 2 + gutter;
  if (blockHeight <= 0 || top + blockHeight <= foldTop || top >= foldBottom) return 0;
  return foldBottom - top;
}
