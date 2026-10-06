// SpotSeek "High-Energy Action" design system, v2 (semantic roles).
// Cyber-brutalist: near-black canvas, three accents with ONE job each, sharp
// 0px corners, Anton display caps, hard solid shadows. Dark-only by design.
//
// ─── Colour roles (screens import `colors`, never raw hex) ──────────────────
//  canvas / surface*   Elevation ladder. In dark mode, higher = lighter:
//                      sunken (chrome: header, tab bar, drawer)  <  canvas
//                      < surface1 (cards) < surface2 (inputs, wells)
//                      < surface3 (pressed, selected fill, track-off).
//  text*               primary / secondary / tertiary (all >= 4.5:1 on canvas)
//  border*             subtle = 1px separation, strong = 2px interactive.
//  action   (cyan)     ONLY interactive/primary: buttons, links, active tab,
//                      input focus underline, selected state.
//  live     (orange)   ONLY live / now / urgent / waitlist / needs-attention.
//  confirmed(lime)     ONLY going / confirmed / sponsored / success.
//  danger              destructive and errors.
//  scrim*, media*      overlay tokens (drawer scrim, cover dimming, panels).
//  shadow              the hard-shadow ink; paper-white because black is
//                      invisible on a near-black canvas. It is NOT `live`.
//
// ─── Depth model ────────────────────────────────────────────────────────────
//  The hard shadow (solid offset, zero blur) means exactly one thing:
//  "pressable primary, or currently selected/active". Used on: primary Btn,
//  the selected Chip / selected card, the active tab indicator, the RSVP
//  button. Nothing else carries a shadow. Pressed = the content translates by
//  the offset onto the stationary shadow block: it reads as pushed in.
//
// ─── Shape & border grammar ─────────────────────────────────────────────────
//  Corners are 0 everywhere. `radius.round` is the single documented
//  exception, reserved for true circles: avatars, map pins, the live dot.
//  1px border = separation. 2px border = interactive or selected.

const palette = {
  // Neutrals (tinted slightly cool, matching the cyan accent)
  sunken:   '#0b0b0d',
  canvas:   '#0F0F12',
  level1:   '#18181c',
  level2:   '#212126',
  level3:   '#2c2c32',
  lineSoft: '#34343a',
  lineHard: '#7c8a8d',
  paper:    '#e4e1e6',
  mist:     '#bac9cc',
  slate:    '#849396',
  black:    '#000000',
  white:    '#ffffff',
  // Accents
  cyan:     '#00e5ff',
  orange:   '#ff5e07',
  lime:     '#b4e100',
  rose:     '#ffb4ab',
  roseDeep: '#93000a',
} as const;

// Flatten an rgba() wash over an opaque #rrggbb base into an opaque #rrggbb.
export function compositeOver(rgba: string, base: string): string {
  const m = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) throw new Error(`compositeOver: bad rgba ${rgba}`);
  const a = Number(m[4]);
  const hex = (i: number) => parseInt(base.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2]
    .map((i) => Math.round(Number(m[i + 1]) * a + hex(i) * (1 - a)).toString(16).padStart(2, '0'))
    .join('');
}

export const colors = {
  // Canvas + surface elevation ladder
  surfaceSunken: palette.sunken,
  canvas:        palette.canvas,
  surface1:      palette.level1,
  surface2:      palette.level2,
  surface3:      palette.level3,

  // Text
  textPrimary:   palette.paper,
  textSecondary: palette.mist,
  textTertiary:  palette.slate,
  textOnFill:    palette.black, // on any saturated accent fill
  textOnMedia:   palette.white, // over cover photos

  // Borders
  borderSubtle:  palette.lineSoft,
  borderStrong:  palette.lineHard,

  // Action = interactive/primary only
  action:        palette.cyan,
  actionWash:    'rgba(0,229,255,0.08)',
  // Opaque composites of the washes over `canvas`: a selected control sits on
  // these (a hard-shadow block needs an opaque face).
  actionSelectedFill:    compositeOver('rgba(0,229,255,0.08)', palette.canvas),
  // Live = live / now / urgent only
  live:          palette.orange,
  liveWash:      'rgba(255,94,7,0.10)',
  liveSelectedFill:      compositeOver('rgba(255,94,7,0.10)', palette.canvas),
  // Confirmed = going / confirmed / sponsored only
  confirmed:     palette.lime,
  confirmedWash: 'rgba(180,225,0,0.10)',
  confirmedSelectedFill: compositeOver('rgba(180,225,0,0.10)', palette.canvas),
  // Danger
  danger:        palette.rose,
  dangerFill:    palette.roseDeep,
  dangerWash:    'rgba(147,0,10,0.20)',

  // Overlay / scrim tokens
  scrim:         'rgba(15,15,18,0.72)',  // drawer / modal backdrop
  scrimSoft:     'rgba(14,14,17,0.28)',  // light veil over full-bleed art
  mediaDim:      'rgba(15,15,18,0.50)',  // darkens cover photos for legibility
  mediaChip:     'rgba(15,15,18,0.55)',  // control chip floating on a photo
  panelOnMedia:  'rgba(24,24,28,0.92)',  // content panel over full-bleed art
  mapPin:        'rgba(11,11,13,0.92)',  // map pin body

  // Hard-shadow ink
  shadow:        palette.paper,
} as const;

export type Colors = typeof colors;

// Dark-only: both scheme exports point at the same object so any legacy
// `scheme === 'dark' ? dark : light` picks identical values. Kept because
// discover/_layout.tsx and the theme tests still import them.
export const dark: Colors = colors;
export const light: Colors = colors;

// Map style palette, derived from the theme (not hand-picked teal): neutrals
// for land/roads, `action` for the highway spine and place labels.
export const mapPalette = {
  land:         palette.sunken,
  park:         palette.canvas,
  water:        '#07070a',
  road:         palette.level2,
  roadStroke:   palette.sunken,
  arterial:     palette.level3,
  highway:      palette.lineSoft,
  highwayStroke: palette.canvas,
  boundary:     palette.level3,
  label:        palette.slate,
  labelStroke:  palette.sunken,
  labelPlace:   palette.mist,
  labelWater:   palette.level3,
} as const;

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

// Sharp by default. `round` is reserved for true circles (avatars, map pins,
// the live dot); nothing else may round.
export const radius = {
  none: 0,
  round: 999,
} as const;

// Minimum tap target (iOS HIG 44pt). Use with `hitSlop` for small visuals.
export const TAP = 44;

// Font family references, loaded in root _layout.tsx.
// display = Anton: screen titles, event names, true display moments ONLY
// body    = Archivo Narrow: all reading text
// label   = Space Grotesk: metadata / labels / data (tabular numerals)
export const fonts = {
  display:      'Anton_400Regular',
  sansRegular:  'ArchivoNarrow_400Regular',
  sansMedium:   'ArchivoNarrow_500Medium',
  sansSemiBold: 'ArchivoNarrow_600SemiBold',
  sansBold:     'ArchivoNarrow_700Bold',
  label:        'SpaceGrotesk_500Medium',
  labelBold:    'SpaceGrotesk_700Bold',
} as const;

// Dynamic Type: allowFontScaling stays ON everywhere; the caps below keep
// fixed chrome from breaking. `Text` (components/Text.tsx) picks the cap from
// the preset's font family.
export const maxFontScale = {
  display: 1.3, // Anton + Space Grotesk chrome/labels/data
  body: 1.6,    // Archivo Narrow reading text
} as const;

const tnum = ['tabular-nums' as const];

// Typography roles. Anton's cap-height runs much taller than its nominal font
// size, so every Anton preset carries a ~1.25-1.3x line height (a tight one
// clips glyph tops on iOS). Body gets extra line height and a touch of
// tracking to compensate for light-on-dark halation.
export const type = {
  // Display (Anton)
  displayHero: { fontFamily: fonts.display, fontSize: 56, lineHeight: 68, textTransform: 'uppercase' as const },
  displayXl:   { fontFamily: fonts.display, fontSize: 40, lineHeight: 52, letterSpacing: -0.5, textTransform: 'uppercase' as const },
  headlineLg:  { fontFamily: fonts.display, fontSize: 32, lineHeight: 40, textTransform: 'uppercase' as const },
  headlineMd:  { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, textTransform: 'uppercase' as const },
  headlineSm:  { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, textTransform: 'uppercase' as const },
  // Body (Archivo Narrow)
  bodyLg:       { fontFamily: fonts.sansMedium,  fontSize: 18, lineHeight: 27, letterSpacing: 0.1 },
  bodyMd:       { fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 25, letterSpacing: 0.15 },
  bodyMdStrong: { fontFamily: fonts.sansMedium,  fontSize: 16, lineHeight: 25, letterSpacing: 0.15 },
  bodySm:       { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, letterSpacing: 0.2 },
  // Labels / metadata (Space Grotesk)
  labelCaps:   { fontFamily: fonts.labelBold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2, textTransform: 'uppercase' as const, fontVariant: tnum },
  labelCapsSm: { fontFamily: fonts.labelBold, fontSize: 11, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' as const, fontVariant: tnum },
  labelMd:     { fontFamily: fonts.label, fontSize: 13, lineHeight: 18, letterSpacing: 0.4, fontVariant: tnum },
  // Data: times, counts, money (tabular numerals so columns do not jitter)
  monoData:    { fontFamily: fonts.label,     fontSize: 14, lineHeight: 20, fontVariant: tnum },
  dataMd:      { fontFamily: fonts.labelBold, fontSize: 20, lineHeight: 24, fontVariant: tnum },
  dataLg:      { fontFamily: fonts.labelBold, fontSize: 24, lineHeight: 30, fontVariant: tnum },
} as const;

// ─── Depth: the hard shadow ──────────────────────────────────────────────────
// Solid offset block, zero blur, full opacity. Means "pressable primary or
// selected". It is NOT a platform shadow: platform shadows are drawn from the
// alpha of the view's children, which doubles text on translucent fills and
// differs between iOS and Android. The block is a real View painted behind the
// content (see `HardShadow` in components/ui.tsx), so it renders identically
// everywhere. The content on top must have an OPAQUE background.
export const HARD_OFFSET = 4;
