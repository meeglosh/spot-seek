// SpotSeek icon set: path data on a 24-unit grid.
//
// Grammar: 2-unit stroke, square caps, mitered joins, straight segments and
// chamfered corners (the chamfer is the set's signature, echoing the
// clipped-corner chip). Live area is 3..21 so every glyph has the same optical
// size. No fills except where the meaning needs it: the locate dot, the pin
// dot, and the filled star (rating).
//
// Each icon is a list of path segments; `fill: true` fills that segment with
// the icon colour in addition to stroking it.

export type IconSegment = { d: string; fill?: boolean };

export const ICON_PATHS = {
  // Navigation / chrome
  menu:         [{ d: 'M3 6h18 M3 12h12 M3 18h18' }],
  back:         [{ d: 'M20 12H4 M10 6l-6 6 6 6' }],
  forward:      [{ d: 'M4 12h16 M14 6l6 6-6 6' }],
  chevronRight: [{ d: 'M9 5l7 7-7 7' }],
  chevronDown:  [{ d: 'M5 9l7 7 7-7' }],
  chevronUp:    [{ d: 'M5 15l7-7 7 7' }],
  close:        [{ d: 'M5 5l14 14 M19 5L5 19' }],
  check:        [{ d: 'M4 12l5 5L20 6' }],
  plus:         [{ d: 'M12 4v16 M4 12h16' }],
  search:       [{ d: 'M4 4h11v11H4z M15 15l6 6' }],
  filter:       [{ d: 'M3 5h18l-7.5 8.5V20l-3-2v-4.5z' }],
  map:          [{ d: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14' }],
  list:         [{ d: 'M8 6h13 M8 12h13 M8 18h13 M3 6h2 M3 12h2 M3 18h2' }],

  // Tabs
  discover: [{ d: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M15.5 8.5L13 13l-4.5 2.5L11 11z' }],
  parties:  [{ d: 'M3 6h18v4l-2 2 2 2v4H3v-4l2-2-2-2z M15 6v12' }],
  profile:  [{ d: 'M9 3h6l1 1v6l-1 1H9l-1-1V4z M4 21v-3l4-4h8l4 4v3z' }],

  // Actions
  bell:     [{ d: 'M5 18h14 M7 18v-8l2-5h6l2 5v8 M10 21h4' }],
  locate:   [
    { d: 'M12 6l6 6-6 6-6-6z M12 1v3 M12 20v3 M1 12h3 M20 12h3' },
    { d: 'M11 11h2v2h-2z', fill: true },
  ],
  share:    [{ d: 'M12 16V4 M7 9l5-5 5 5 M4 13v8h16v-8' }],
  settings: [{ d: 'M3 7h11 M18 7h3 M3 17h3 M10 17h11 M14 4h4v6h-4z M6 14h4v6H6z' }],
  signOut:  [{ d: 'M10 4H4v16h6 M9 12h12 M16 7l5 5-5 5' }],
  signIn:   [{ d: 'M14 4h6v16h-6 M3 12h12 M10 7l5 5-5 5' }],
  live:     [{ d: 'M13 2L4 14h7l-1 8 9-12h-7z' }],

  // Objects / meaning
  wallet:      [{ d: 'M3 7h18v13H3z M3 7l3-3h12v3 M15 12h6v5h-6z' }],
  sponsorship: [{ d: 'M5 21V3 M5 4h14l-3 4.5 3 4.5H5' }],
  calendar:    [{ d: 'M3 5h18v16H3z M3 10h18 M8 2v5 M16 2v5' }],
  pin: [
    { d: 'M12 22L6 13V8l3-5h6l3 5v5z' },
    { d: 'M10.5 8.5h3v3h-3z', fill: true },
  ],
  users:       [{ d: 'M5 4h5v5H5z M2 21v-3l2-4h6l2 4v3z M15 5h3v4h-3z M17 14h3l2 4v3h-5' }],
  grid:        [{ d: 'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z' }],
  star:        [{ d: 'M12 3l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.7 6.1 21l1.3-6.5L2.5 9.9l6.6-.8z' }],
  starFilled:  [{ d: 'M12 3l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.7 6.1 21l1.3-6.5L2.5 9.9l6.6-.8z', fill: true }],

  // Broadcast-subject kinds (league / team / sport)
  trophy: [{ d: 'M6 3h12v6l-3 4H9L6 9z M12 13v5 M8 21h8 M6 5H3v3l3 2 M18 5h3v3l-3 2' }],
  shield: [{ d: 'M12 3l8 3v7l-8 8-8-8V6z' }],
  ball:   [{ d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8l4 3-1.5 5h-5L8 11z' }],
} as const satisfies Record<string, readonly IconSegment[]>;

export type IconName = keyof typeof ICON_PATHS;
export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];
