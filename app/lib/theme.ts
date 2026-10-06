// SpotSeek "Soft Brutalist" design system (redesign/soft-v1), dark-only.
//
// DIRECTION. Same brand as the hard-brutalist v2 (near-black canvas, cyan as
// the one action colour, orange = live, lime = confirmed, Anton display) but
// warmer and more refined: an agency-grade product rather than a poster.
// Brutalism survives in the structure (flat colour, big type, honest hierarchy,
// no gradients, no glassy effects); the softness comes from corners, depth,
// motion and case. Decisions, by area:
//
//  KEPT      #101014 canvas · cyan action · orange only for live · lime only
//            for confirmed · Anton for display (screen titles, event names) ·
//            the 34-icon SVG set · 44pt tap targets · no kickers, no arrows.
//  CORNERS   A radius lock BY ROLE (see `radius`): controls 10, cards 14,
//            sheets 20, chips and badges fully pill, circles for avatars/pins.
//            Nested radii shrink by the padding (inner = outer - inset).
//  DEPTH     No hard offset shadow. A real elevation ladder (see `elevation`):
//            canvas < surface1 (cards) < surface2 (raised) < surface3 (sheets,
//            drawer). Each rung is LIGHTER and carries a soft, blurred,
//            low-opacity black shadow plus matching Android `elevation`.
//            Every shadow sits on a view with an OPAQUE background (the helper
//            always returns one). Never put a shadow on a translucent view:
//            iOS then shadows the child text (brutalist-v2 rendered selected
//            chips' labels twice). Also: iOS clips shadows on a view with
//            `overflow: hidden`, so clip in an inner view and shadow the outer.
//            Primary buttons carry NO shadow: colour and weight carry them.
//  PRESS     scale ~0.97 plus an opacity dip over 120ms (`press` + `<Press>`
//            in components/ui.tsx); scale is dropped under Reduce Motion, the
//            opacity dip stays.
//  BORDERS   Mostly gone. Surface contrast separates things. `borderSubtle` is
//            a low-contrast 1px hairline, used only where two same-level
//            surfaces meet; `borderStrong` is a 1px focus/selected edge.
//  TYPE      Anton shrinks (hero 48, XL 34, L 28, M 21, S 17) and goes mixed
//            case except hero/XL. Buttons and labels are sentence case Space
//            Grotesk Medium (`button`, `label`, `labelSm`). ALL CAPS is
//            reserved for the tiny tracked `tag` role (LIVE, TONIGHT).
//  COLOUR    Warmer, slightly desaturated greys; `actionMuted` is a softer cyan
//            for secondary emphasis. Every text pair is contrast-tested >= 4.5
//            in __tests__/App.test.tsx.
//  SPACING   More generous: scale lg 20 / xl 28 / 2xl 36, and headings get more
//            room above than below (`space.headingAbove` / `headingBelow`).
//  ICONS     Same paths, 2px stroke, ROUND caps and joins (`iconStroke`).
//  MAP       Re-tuned to the warm neutrals (`mapPalette`).

const palette = {
  // Warm neutrals
  sunken:   '#0c0c0e',
  canvas:   '#101014',
  level1:   '#1b1a1b',
  level2:   '#242224',
  level3:   '#2e2c2d',
  paper:    '#efebe6',
  mist:     '#c6c0ba',
  slate:    '#9b958f',
  black:    '#0a0a0c',
  white:    '#ffffff',
  // Accents
  cyan:     '#00e5ff',
  cyanSoft: '#7fd4de',
  orange:   '#ff5e07',
  lime:     '#b4e100',
  rose:     '#ffb4ab',
  roseDeep: '#93000a',
} as const;

export const colors = {
  // Canvas + surface elevation ladder (higher = lighter)
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

  // Borders: hairlines, translucent on purpose (they never carry a shadow)
  borderSubtle:  'rgba(239,235,230,0.08)',
  borderStrong:  'rgba(239,235,230,0.22)',

  // Action = interactive/primary only
  action:        palette.cyan,
  actionMuted:   palette.cyanSoft,    // secondary emphasis: ghost buttons, links
  actionWash:    'rgba(0,229,255,0.10)',
  // Live = live / now / urgent only
  live:          palette.orange,
  liveWash:      'rgba(255,94,7,0.12)',
  // Confirmed = going / confirmed / sponsored only
  confirmed:     palette.lime,
  confirmedWash: 'rgba(180,225,0,0.12)',
  // Danger
  danger:        palette.rose,
  dangerFill:    palette.roseDeep,
  dangerWash:    'rgba(255,180,171,0.12)',

  // Overlay / scrim tokens
  scrim:         'rgba(8,8,10,0.62)',    // drawer / modal backdrop
  scrimSoft:     'rgba(14,14,17,0.28)',  // light veil over full-bleed art
  mediaDim:      'rgba(16,16,20,0.45)',  // darkens cover photos for legibility
  mediaChip:     'rgba(16,16,20,0.60)',  // control chip floating on a photo
  panelOnMedia:  'rgba(27,26,27,0.94)',  // content panel over full-bleed art
  mapPin:        '#0d0d10',              // map pin body: OPAQUE (it carries a shadow)

  // Shadow ink (always black: soft shadows read as darkness, not as a glow)
  shadow:        '#000000',
} as const;

export type Colors = typeof colors;

// Dark-only: both scheme exports point at the same object so any legacy
// `scheme === 'dark' ? dark : light` picks identical values.
export const dark: Colors = colors;
export const light: Colors = colors;

// Map style palette, derived from the warm neutrals.
export const mapPalette = {
  land:         '#161415',
  park:         '#191718',
  water:        '#0c0b0c',
  road:         '#242123',
  roadStroke:   '#161415',
  arterial:     '#2e2a2d',
  highway:      '#3d393b',
  highwayStroke: '#191718',
  boundary:     '#2e2a2d',
  label:        '#8d8782',
  labelStroke:  '#161415',
  labelPlace:   '#c6c0ba',
  labelWater:   '#4a4648',
} as const;

// Rhythm: more generous than v2 (lg 16 -> 20, xl 24 -> 28).
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  '2xl': 36,
  '3xl': 52,
  '4xl': 72,
} as const;

// Semantic gaps: headings sit further from what is above them than from the
// content they introduce.
export const space = {
  item: 12,         // between sibling items in a group
  group: 28,        // between groups
  headingAbove: 32,
  headingBelow: 12,
} as const;

// Radius lock BY ROLE. Pick the role, never a number.
//   control  buttons, inputs, segmented tracks, icon buttons
//   card     event cards, tiles, panels
//   sheet    drawer, bottom sheets, modals
//   pill     chips, badges, progress segments' ends
//   round    true circles: avatars, map pins, the live dot
export const radius = {
  none: 0,
  control: 10,
  card: 14,
  sheet: 20,
  pill: 999,
  round: 999,
} as const;

// Minimum tap target (iOS HIG 44pt). Use with `hitSlop` for small visuals.
export const TAP = 44;

// Icon stroke settings: same 24-unit paths, softened by round caps and joins.
// Use `<Icon caps="square" />` to opt a single glyph back to the hard look.
export const iconStroke = {
  width: 2,
  cap: 'round' as 'round' | 'square',
  join: 'round' as 'round' | 'miter',
} as const;

// Font family references, loaded in root _layout.tsx.
// display = Anton: screen titles, event names, true display moments ONLY
// body    = Archivo Narrow: all reading text
// label   = Space Grotesk Medium: buttons, labels, data (tabular numerals)
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
  // Display (Anton). Only hero and XL keep caps.
  displayHero: { fontFamily: fonts.display, fontSize: 48, lineHeight: 60, textTransform: 'uppercase' as const },
  displayXl:   { fontFamily: fonts.display, fontSize: 34, lineHeight: 44, letterSpacing: -0.3, textTransform: 'uppercase' as const },
  headlineLg:  { fontFamily: fonts.display, fontSize: 28, lineHeight: 36, letterSpacing: 0.2 },
  headlineMd:  { fontFamily: fonts.display, fontSize: 21, lineHeight: 28, letterSpacing: 0.3 },
  headlineSm:  { fontFamily: fonts.display, fontSize: 17, lineHeight: 24, letterSpacing: 0.3 },
  // Body (Archivo Narrow)
  bodyLg:       { fontFamily: fonts.sansMedium,  fontSize: 18, lineHeight: 27, letterSpacing: 0.1 },
  bodyMd:       { fontFamily: fonts.sansRegular, fontSize: 16, lineHeight: 25, letterSpacing: 0.15 },
  bodyMdStrong: { fontFamily: fonts.sansMedium,  fontSize: 16, lineHeight: 25, letterSpacing: 0.15 },
  bodySm:       { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 21, letterSpacing: 0.2 },
  // Buttons and labels (Space Grotesk Medium, sentence/title case)
  button:      { fontFamily: fonts.label, fontSize: 15, lineHeight: 20, letterSpacing: 0.1 },
  buttonSm:    { fontFamily: fonts.label, fontSize: 14, lineHeight: 18, letterSpacing: 0.1 },
  label:       { fontFamily: fonts.label, fontSize: 14, lineHeight: 20, letterSpacing: 0.1, fontVariant: tnum },
  labelSm:     { fontFamily: fonts.label, fontSize: 12, lineHeight: 16, letterSpacing: 0.2, fontVariant: tnum },
  labelMd:     { fontFamily: fonts.label, fontSize: 13, lineHeight: 18, letterSpacing: 0.2, fontVariant: tnum },
  // The ONLY caps role: tiny tracked metadata tags (LIVE, TONIGHT, sport).
  tag:         { fontFamily: fonts.labelBold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' as const, fontVariant: tnum },
  // Data: times, counts, money (tabular numerals so columns do not jitter)
  monoData:    { fontFamily: fonts.label,     fontSize: 14, lineHeight: 20, fontVariant: tnum },
  dataMd:      { fontFamily: fonts.labelBold, fontSize: 20, lineHeight: 24, fontVariant: tnum },
  dataLg:      { fontFamily: fonts.labelBold, fontSize: 24, lineHeight: 30, fontVariant: tnum },
} as const;

// ─── Depth: the elevation ladder ─────────────────────────────────────────────
// level 0 canvas (flat) · 1 cards/tab bar · 2 raised: selected, popovers ·
// 3 sheets: drawer, modals. In dark mode a higher level is a LIGHTER surface
// plus a softer, wider shadow. `elevation()` always returns an OPAQUE
// backgroundColor so iOS never shadows the child text (see header). Android
// gets the matching `elevation`. Primary buttons take no elevation at all.
export type ElevationLevel = 0 | 1 | 2 | 3;

export const elevationLevels = {
  0: { bg: colors.canvas,   y: 0,  blur: 0,  opacity: 0,    android: 0 },
  1: { bg: colors.surface1, y: 2,  blur: 8,  opacity: 0.28, android: 2 },
  2: { bg: colors.surface2, y: 6,  blur: 16, opacity: 0.34, android: 6 },
  3: { bg: colors.surface3, y: 14, blur: 28, opacity: 0.45, android: 12 },
} as const;

export function elevation(level: ElevationLevel) {
  const l = elevationLevels[level];
  return {
    backgroundColor: l.bg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: l.y },
    shadowOpacity: l.opacity,
    shadowRadius: l.blur,
    elevation: l.android,
  } as const;
}

// ─── Press feedback ──────────────────────────────────────────────────────────
export const press = {
  scale: 0.97,
  dip: 0.85,       // opacity while pressed
  duration: 120,   // ms
} as const;
