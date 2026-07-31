// SpotSeek "High-Energy Action" design system.
// Cyber-brutalist: near-black surfaces, electric cyan / neon orange / voltage
// lime accents, sharp 0px corners, Anton display type. Dark-only by design.

export const palette = {
  // Surfaces (darkest → lightest)
  bg:            '#0F0F12',
  surfaceLowest: '#0e0e11',
  surface:       '#131316',
  surfaceLow:    '#1b1b1e',
  surfaceMid:    '#1f1f22',
  surfaceHigh:   '#2a2a2d',
  surfaceHighest:'#353438',

  // Text
  onSurface:        '#e4e1e6',
  onSurfaceVariant: '#bac9cc',
  outline:          '#849396',
  outlineVariant:   '#3b494c',

  // Electric Blue — primary actions, active states
  primary:            '#00e5ff',
  primaryBright:      '#c3f5ff',
  primaryDim:         '#00daf3',
  onPrimary:          '#00363d',
  primaryContainerOn: '#00626e',

  // Neon Orange — live indicators, urgency, highlights
  secondary:       '#ff5e07',
  secondaryBright: '#ffb59a',
  onSecondary:     '#5a1b00',

  // Voltage Green — success / VIP / sponsored
  tertiary:       '#b4e100',
  tertiaryBright: '#cdff13',
  onTertiary:     '#283500',

  // Error
  error:       '#ffb4ab',
  errorDim:    '#93000a',
  onErrorDim:  '#ffdad6',

  black: '#000000',
  white: '#ffffff',

  // Semantic status colours (going / waitlisted / cancelled), mapped onto the
  // HEA accents. Names kept from the previous theme for continuity.
  green:   '#b4e100',
  amber:   '#ff5e07',
  red:     '#ffb4ab',
  gray400: '#849396',
} as const;

// Semantic colour roles used by every screen.
export const colors = {
  bg:            palette.bg,
  bgSubtle:      palette.surfaceLow,
  card:          palette.surfaceLow,
  cardBorder:    palette.surfaceHighest,
  textPrimary:   palette.onSurface,
  textSecondary: palette.onSurfaceVariant,
  textTertiary:  palette.outline,
  separator:     palette.surfaceHigh,
  tabBar:        palette.surfaceLowest,
  tabBarBorder:  palette.surfaceHigh,

  // Primary CTA: electric blue block w/ black text
  fill:          palette.primary,
  fillText:      palette.black,
  fillSubtle:    palette.surfaceHigh,
  fillSubtleText: palette.onSurface,

  overlay: 'rgba(10,10,12,0.72)',

  // Accents
  accent:        palette.primary,        // electric blue
  accentDim:     palette.primaryDim,
  accentBright:  palette.primaryBright,
  live:          palette.secondary,      // neon orange — LIVE / urgent
  liveBright:    palette.secondaryBright,
  volt:          palette.tertiary,       // lime — success / sponsored
  voltBright:    palette.tertiaryBright,
  danger:        palette.error,
  dangerDim:     palette.errorDim,
} as const;

export type Colors = typeof colors;

// Dark-only: both scheme exports point at the same palette so any legacy
// `scheme === 'dark' ? dark : light` picks identical values.
export const dark: Colors = colors;
export const light: Colors = colors;

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

// Sharp and aggressive: 0px corners across all primary components.
// `full` is kept for the rare dot/avatar that must stay circular.
export const radius = {
  sm: 0,
  md: 0,
  lg: 0,
  xl: 0,
  full: 999,
} as const;

// Font family references — loaded in root _layout.tsx.
// display  = Anton (headlines, ALL CAPS)
// body     = Archivo Narrow (content, stats, tickers)
// label    = Space Grotesk (functional labels, caps w/ letterspacing)
export const fonts = {
  display:      'Anton_400Regular',
  sansRegular:  'ArchivoNarrow_400Regular',
  sansMedium:   'ArchivoNarrow_500Medium',
  sansSemiBold: 'ArchivoNarrow_600SemiBold',
  sansBold:     'ArchivoNarrow_700Bold',
  label:        'SpaceGrotesk_500Medium',
  labelBold:    'SpaceGrotesk_700Bold',
} as const;

// Typography presets matching the design spec.
// Anton's cap-height runs much taller than its nominal font size — a tight
// lineHeight clips glyph tops on iOS and undersizes the box below the real
// ink, which also throws off `gap` spacing above these headlines. Use a
// generous ~1.25-1.35x multiplier on every Anton preset.
export const type = {
  displayXl:  { fontFamily: fonts.display, fontSize: 44, lineHeight: 56, letterSpacing: -0.5, textTransform: 'uppercase' as const },
  headlineLg: { fontFamily: fonts.display, fontSize: 32, lineHeight: 40, textTransform: 'uppercase' as const },
  headlineMd: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, textTransform: 'uppercase' as const },
  headlineSm: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, textTransform: 'uppercase' as const },
  bodyLg:     { fontFamily: fonts.sansMedium, fontSize: 18, lineHeight: 26 },
  bodyMd:     { fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 24 },
  bodySm:     { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20 },
  labelCaps:  { fontFamily: fonts.labelBold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  labelCapsSm:{ fontFamily: fonts.labelBold, fontSize: 10, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' as const },
  monoData:   { fontFamily: fonts.label, fontSize: 14, lineHeight: 20 },
} as const;

// Hard drop shadow — 100% opacity, 4px offset, no blur (comic-book pop).
export function hardShadow(color: string = palette.secondary, offset = 4) {
  return {
    shadowColor: color,
    shadowOffset: { width: offset, height: offset },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  } as const;
}
