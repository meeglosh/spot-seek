// SpotSeek "FotMob structure, SpotSeek brand" design system (redesign/fotmob),
// dark-only.
//
// DIRECTION. A flat, content-first sports-app look (FotMob's layout and calm)
// wearing the spotseek.app brand: the brand-ink canvas #0F0F12 with quiet
// dark-grey cards stepping up from it, big bold system-font titles in sentence case, generous
// rounded corners and almost no shadows. Colour roles are unchanged: cyan is
// the one action/selected colour, orange means live only, lime means confirmed
// only. Decisions, by area:
//
//  SURFACES  canvas #0F0F12 (brand ink) < surface1 (cards, rows, tab bar) #1c1c1c < surface2
//            #242424 < surface3 (raised: pressed, chips, icon wells) #2c2c2c.
//            Items are separated by surface contrast and spacing, not by
//            borders or shadows. `borderSubtle` is a hairline used only inside
//            grouped cards.
//  CORNERS   Radius lock BY ROLE (see `radius`): controls 12, cards/rows 18,
//            tiles and media 22, sheets 28 (top), chips/badges/search fully
//            pill, icon buttons and avatars circular. `cta` (10) is reserved
//            for the call-to-action buttons, which keep their original look.
//  DEPTH     Flat. `elevation()` keeps its ladder of surfaces but only level 3
//            (drawer, modals) carries a shadow. Every shadow sits on a view
//            with an OPAQUE background; never shadow a translucent view (iOS
//            then shadows the child text), and clip with an inner view because
//            iOS clips shadows on `overflow: hidden`.
//  TYPE      The iOS system font (SF Pro) everywhere, weight via fontWeight,
//            sentence case. Anton is ONLY the SpotSeek wordmark (`type.wordmark`).
//            Space Grotesk is ONLY the CTA buttons (`type.button`) and the
//            tiny tracked-caps status tag (`type.tag`: LIVE, TONIGHT): the
//            one place caps live, a landing-page signature. No gradients.
//  CTA       Call-to-action buttons (`Btn`) match the spotseek.app landing
//            page and keep their original shape, colours, font and case: see
//            `cta`, a frozen copy of the values they use.
//  PRESS     scale ~0.97 plus an opacity dip over 120ms (`press` + `<Press>`
//            in components/ui.tsx); scale is dropped under Reduce Motion.
//  COLOUR    Every text pair is contrast-tested >= 4.5 in __tests__/App.test.tsx.
//  ICONS     Same paths, 2px stroke, ROUND caps and joins (`iconStroke`).
//  MAP       Re-tuned to neutral greys (`mapPalette`).

const palette = {
  // Neutrals
  sunken:   '#0a0a0c',
  canvas:   '#0f0f12',
  level1:   '#1c1c1c',
  level2:   '#242424',
  level3:   '#2c2c2c',
  paper:    '#f2f1ec',
  mist:     '#c7c7cc',
  slate:    '#9a9a9f',
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
  borderSubtle:  'rgba(242,241,236,0.08)',
  borderStrong:  'rgba(242,241,236,0.22)',

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
  scrimSoft:     'rgba(15,15,18,0.28)',  // light veil over full-bleed art
  mediaDim:      'rgba(15,15,18,0.45)',  // darkens cover photos for legibility
  mediaChip:     'rgba(15,15,18,0.60)',  // control chip floating on a photo
  panelOnMedia:  'rgba(28,28,28,0.94)',  // content panel over full-bleed art
  mapPin:        '#0d0d10',              // map pin body: OPAQUE (it carries a shadow)

  // Shadow ink (always black: soft shadows read as darkness, not as a glow)
  shadow:        '#000000',
} as const;

export type Colors = typeof colors;

// Dark-only: both scheme exports point at the same object so any legacy
// `scheme === 'dark' ? dark : light` picks identical values.
export const dark: Colors = colors;
export const light: Colors = colors;

// Map style palette, derived from the neutral greys.
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

// Rhythm: comfortable density.
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
//   control  inputs and small controls
//   card     list rows, cards, panels
//   tile     big tiles and media (images have no borders)
//   sheet    drawer, bottom sheets, modals (top corners)
//   pill     chips, badges, search field, tab bar
//   round    true circles: icon buttons, avatars, map pins, the live dot
//   cta      call-to-action buttons ONLY (their original look)
export const radius = {
  none: 0,
  cta: 10,
  control: 12,
  card: 18,
  tile: 22,
  sheet: 28,
  pill: 999,
  round: 999,
} as const;

// Frozen values of the call-to-action buttons (`Btn`), which keep their
// original look (matches the spotseek.app landing page) regardless of the
// restyle of the surrounding UI.
export const cta = {
  radius: 10,
  secondaryBg: '#2e2c2d',
  textPrimary: '#efebe6',
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
// display = Anton: the SpotSeek wordmark ONLY
// label   = Space Grotesk: CTA buttons and the tracked-caps tag ONLY
// sans*   = the iOS system font (SF Pro); weight comes from fontWeight
export const fonts = {
  display:      'Anton_400Regular',
  sansRegular:  'System',
  sansMedium:   'System',
  sansSemiBold: 'System',
  sansBold:     'System',
  label:        'SpaceGrotesk_500Medium',
  labelBold:    'SpaceGrotesk_700Bold',
} as const;

// Dynamic Type: allowFontScaling stays ON everywhere; the caps below keep
// fixed chrome from breaking. `Text` (components/Text.tsx) picks the cap from
// the preset's font family and size.
export const maxFontScale = {
  display: 1.3, // wordmark, CTA labels and large titles
  body: 1.6,    // reading text
} as const;

const tnum = ['tabular-nums' as const];

// Typography roles: system font, sentence case, weight via fontWeight.
export const type = {
  // Titles
  displayHero: { fontSize: 40, lineHeight: 46, fontWeight: '800' as const, letterSpacing: -0.5 },
  displayXl:   { fontSize: 34, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -0.4 }, // screen title
  headlineLg:  { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.3 },
  headlineMd:  { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.2 }, // section header
  headlineSm:  { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },                       // detail-screen title, card title
  // The SpotSeek logotype: the only Anton role.
  wordmark:    { fontFamily: fonts.display, fontSize: 22, lineHeight: 30, letterSpacing: 1 },
  // Body
  bodyLg:       { fontSize: 17, lineHeight: 24, fontWeight: '400' as const },
  bodyMd:       { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyMdStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  bodySm:       { fontSize: 14, lineHeight: 21, fontWeight: '400' as const },
  // CTA buttons (Space Grotesk): unchanged, see `cta`
  button:      { fontFamily: fonts.label, fontSize: 15, lineHeight: 20, letterSpacing: 0.1 },
  buttonSm:    { fontFamily: fonts.label, fontSize: 14, lineHeight: 18, letterSpacing: 0.1 },
  // Labels and data (system font, tabular numerals so columns do not jitter)
  label:       { fontSize: 14, lineHeight: 20, fontWeight: '600' as const, fontVariant: tnum },
  labelSm:     { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, fontVariant: tnum },
  labelMd:     { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, fontVariant: tnum },
  // The ONLY caps role: tiny tracked status tags (LIVE, TONIGHT), as on spotseek.app.
  tag:         { fontFamily: fonts.labelBold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' as const, fontVariant: tnum },
  monoData:    { fontSize: 14, lineHeight: 20, fontWeight: '500' as const, fontVariant: tnum },
  dataMd:      { fontSize: 20, lineHeight: 24, fontWeight: '700' as const, fontVariant: tnum },
  dataLg:      { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, fontVariant: tnum },
} as const;

// ─── Depth: flat surfaces ────────────────────────────────────────────────────
// level 0 canvas · 1 cards/rows/tab bar · 2 raised: selected · 3 sheets:
// drawer, modals. A higher level is a LIGHTER surface; only level 3 casts a
// shadow. `elevation()` always returns an OPAQUE backgroundColor so iOS never
// shadows the child text. Primary buttons take no elevation at all.
export type ElevationLevel = 0 | 1 | 2 | 3;

export const elevationLevels = {
  0: { bg: colors.canvas,   y: 0,  blur: 0,  opacity: 0,    android: 0 },
  1: { bg: colors.surface1, y: 0,  blur: 0,  opacity: 0,    android: 0 },
  2: { bg: colors.surface2, y: 0,  blur: 0,  opacity: 0,    android: 0 },
  3: { bg: colors.surface3, y: 10, blur: 24, opacity: 0.5,  android: 10 },
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
