import { useColorScheme } from 'react-native';
import { light, dark, type Colors } from './theme';

export function useTheme(): { colors: Colors; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { colors: isDark ? dark : light, isDark };
}
