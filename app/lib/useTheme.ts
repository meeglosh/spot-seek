import { colors, type Colors } from './theme';

// SpotSeek is dark-only ("High-Energy Action" design system).
export function useTheme(): { colors: Colors; isDark: boolean } {
  return { colors, isDark: true };
}
