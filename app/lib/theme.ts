import { Platform } from 'react-native';

export const palette = {
  black:   '#0A0A0A',
  gray900: '#141414',
  gray800: '#1F1F1F',
  gray700: '#2C2C2C',
  gray600: '#3D3D3D',
  gray500: '#666666',
  gray400: '#888888',
  gray300: '#B0B0B0',
  gray200: '#D4D4D4',
  gray100: '#E8E8E8',
  gray50:  '#F5F5F5',
  white:   '#FAFAFA',
  pureWhite: '#FFFFFF',

  // Semantic accents — used sparingly
  green:  '#16A34A',   // going / confirmed
  amber:  '#D97706',   // waitlisted
  red:    '#DC2626',   // cancelled
} as const;

export const light = {
  bg:          palette.pureWhite,
  bgSubtle:    palette.gray50,
  card:        palette.pureWhite,
  cardBorder:  palette.gray100,
  textPrimary: palette.black,
  textSecondary: palette.gray500,
  textTertiary:  palette.gray400,
  separator:   palette.gray100,
  tabBar:      palette.pureWhite,
  tabBarBorder: palette.gray100,
  fill:        palette.black,       // primary button bg
  fillText:    palette.pureWhite,   // primary button text
  fillSubtle:  palette.gray100,     // secondary button bg
  fillSubtleText: palette.black,
  overlay:     'rgba(10,10,10,0.5)',
} as const;

export const dark = {
  bg:          palette.black,
  bgSubtle:    palette.gray900,
  card:        palette.gray900,
  cardBorder:  palette.gray800,
  textPrimary: palette.white,
  textSecondary: palette.gray400,
  textTertiary:  palette.gray500,
  separator:   palette.gray800,
  tabBar:      palette.gray900,
  tabBarBorder: palette.gray800,
  fill:        palette.white,
  fillText:    palette.black,
  fillSubtle:  palette.gray800,
  fillSubtleText: palette.white,
  overlay:     'rgba(10,10,10,0.7)',
} as const;

export type Colors = {
  bg: string; bgSubtle: string; card: string; cardBorder: string;
  textPrimary: string; textSecondary: string; textTertiary: string;
  separator: string; tabBar: string; tabBarBorder: string;
  fill: string; fillText: string; fillSubtle: string; fillSubtleText: string;
  overlay: string;
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

// Font family references — loaded in root _layout.tsx
export const fonts = {
  display: Platform.select({ ios: 'DMSerifDisplay_400Regular', android: 'DMSerifDisplay_400Regular', default: 'DMSerifDisplay_400Regular' }),
  sansRegular: 'DMSans_400Regular',
  sansMedium:  'DMSans_500Medium',
  sansSemiBold: 'DMSans_600SemiBold',
  sansBold:    'DMSans_700Bold',
} as const;
