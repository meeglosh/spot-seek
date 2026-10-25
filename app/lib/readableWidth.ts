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
