import { useWindowDimensions } from 'react-native';

// Discover shows list and map side by side on wide landscape windows: the
// iPhone Duo inner display and iPad landscape. Below the breakpoint (every
// normal iPhone, iPad portrait) nothing changes.
export const SPLIT_MIN_WIDTH = 900;

export function isSplitLayout(width: number, height: number): boolean {
  return width >= SPLIT_MIN_WIDTH && width > height;
}

// Reactive: re-evaluates on rotation, folding and iPad window resizes.
export function useSplitLayout(): boolean {
  const { width, height } = useWindowDimensions();
  return isSplitLayout(width, height);
}
