/**
 * Horizontal safe-area helpers.
 *
 * Most iPhones report 0 for left/right insets in portrait, so these are no-ops
 * there. On iPhone Duo iOS draws the status info (time, wifi, camera) as a
 * vertical strip down the top-right edge and reports it as a right inset
 * (84pt on iOS 27.1, outer portrait and inner landscape). Anything pinned to
 * the trailing edge near the top must add the inset, or it sits under the strip.
 */
export type SideInsets = { left: number; right: number };

/** Horizontal padding of `base` plus the reported left/right insets. */
export function sidePadding(base: number, insets: SideInsets): { paddingLeft: number; paddingRight: number } {
  return { paddingLeft: base + insets.left, paddingRight: base + insets.right };
}

/** Offset from the trailing edge of `base` plus the reported right inset. */
export function trailingOffset(base: number, insets: SideInsets): number {
  return base + insets.right;
}
