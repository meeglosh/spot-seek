import {
  light, dark, colors, radius, spacing, space, fonts, type, TAP, elevation, elevationLevels,
  press, iconStroke, mapPalette,
} from '../lib/theme';

// ── helpers ─────────────────────────────────────────────────────────────────
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const L = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const isOpaqueHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

describe('theme (Soft Brutalist, dark-only, semantic roles)', () => {
  it('uses the warm near-black canvas', () => {
    expect(colors.canvas).toBe('#101014');
  });

  it('is dark-only: light and dark resolve to the same palette', () => {
    expect(light).toBe(colors);
    expect(dark).toBe(colors);
  });

  it('locks radius by role: control 10, card 14, sheet 20, pill/round fully round', () => {
    expect(radius.control).toBe(10);
    expect(radius.card).toBe(14);
    expect(radius.sheet).toBe(20);
    expect(radius.pill).toBeGreaterThanOrEqual(999);
    expect(radius.round).toBeGreaterThanOrEqual(999);
    expect(radius.none).toBe(0);
    expect(Object.keys(radius).sort()).toEqual(['card', 'control', 'none', 'pill', 'round', 'sheet']);
    // the scale rises with the size of the surface
    expect(radius.control).toBeLessThan(radius.card);
    expect(radius.card).toBeLessThan(radius.sheet);
  });

  it('maps display type to Anton and labels to Space Grotesk', () => {
    expect(fonts.display).toBe('Anton_400Regular');
    expect(fonts.label).toContain('SpaceGrotesk');
    expect(fonts.sansRegular).toContain('ArchivoNarrow');
  });

  it('has a more generous spacing rhythm, with more space above headings than below', () => {
    expect(spacing.lg).toBeGreaterThanOrEqual(20);
    expect(spacing.xl).toBeGreaterThanOrEqual(28);
    expect(space.group).toBeGreaterThanOrEqual(28);
    expect(space.headingAbove).toBeGreaterThan(space.headingBelow);
  });

  it('softens icons with round caps and joins at a 2px stroke', () => {
    expect(iconStroke.width).toBe(2);
    expect(iconStroke.cap).toBe('round');
    expect(iconStroke.join).toBe('round');
  });
});

describe('colour roles', () => {
  it('keeps one job per accent: action cyan, live orange, confirmed lime', () => {
    expect(colors.action).toBe('#00e5ff');
    expect(colors.live).toBe('#ff5e07');
    expect(colors.confirmed).toBe('#b4e100');
    expect(new Set([colors.action, colors.live, colors.confirmed, colors.actionMuted]).size).toBe(4);
  });

  it('adds a softer actionMuted that stays in the cyan family (hue between 170 and 200)', () => {
    const [r, g, b] = rgb(colors.actionMuted);
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(r);
    expect(colors.actionMuted).not.toBe(colors.action);
  });

  it('never lets the shadow ink or the border colours steal an accent role', () => {
    expect(colors.shadow).toBe('#000000');
    expect(colors.borderStrong).not.toBe(colors.live);
    expect(colors.borderSubtle).not.toBe(colors.borderStrong);
  });

  it('orders the dark-mode elevation ladder from darker to lighter', () => {
    const ladder = [
      colors.surfaceSunken, colors.canvas, colors.surface1, colors.surface2, colors.surface3,
    ].map(L);
    expect([...ladder].sort((a, b) => a - b)).toEqual(ladder);
    expect(new Set(ladder).size).toBe(ladder.length);
  });

  it('keeps surfaces slightly warm: red >= blue on every neutral surface above the canvas', () => {
    for (const c of [colors.surface1, colors.surface2, colors.surface3]) {
      const [r, , b] = rgb(c);
      expect(r).toBeGreaterThanOrEqual(b);
    }
  });

  it('exposes overlay tokens as rgba, except the opaque map pin', () => {
    for (const k of ['scrim', 'scrimSoft', 'mediaDim', 'mediaChip', 'panelOnMedia'] as const) {
      expect(colors[k]).toMatch(/^rgba\(/);
    }
    expect(isOpaqueHex(colors.mapPin)).toBe(true);
  });

  it('keeps every reading text pair at >= 4.5:1', () => {
    const surfaces = [colors.canvas, colors.surface1, colors.surface2, colors.surface3];
    for (const bg of surfaces) {
      expect(ratio(colors.textPrimary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colors.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colors.action, bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colors.actionMuted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colors.live, bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colors.confirmed, bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colors.danger, bg)).toBeGreaterThanOrEqual(4.5);
    }
    // tertiary text sits on the canvas and the two lowest surfaces only
    for (const bg of [colors.canvas, colors.surface1, colors.surface2]) {
      expect(ratio(colors.textTertiary, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps text on accent fills at >= 4.5:1 (primary button, live/confirmed fills)', () => {
    for (const fill of [colors.action, colors.live, colors.confirmed]) {
      expect(ratio(colors.textOnFill, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the map palette in the warm neutral family', () => {
    for (const c of Object.values(mapPalette)) {
      const [r, , b] = rgb(c);
      expect(r).toBeGreaterThanOrEqual(b - 2);
    }
  });
});

describe('depth model: the elevation ladder', () => {
  it('returns an OPAQUE background at every level (never shadow a translucent view)', () => {
    for (const lvl of [0, 1, 2, 3] as const) {
      expect(isOpaqueHex(elevation(lvl).backgroundColor)).toBe(true);
    }
  });

  it('gets lighter, softer and more blurred as it rises', () => {
    const lums = ([0, 1, 2, 3] as const).map((l) => L(elevation(l).backgroundColor));
    expect([...lums].sort((a, b) => a - b)).toEqual(lums);
    expect(new Set(lums).size).toBe(4);
    for (const lvl of [1, 2, 3] as const) {
      const lo = elevation((lvl - 1) as 0 | 1 | 2);
      const hi = elevation(lvl);
      expect(hi.shadowRadius).toBeGreaterThan(lo.shadowRadius);
      expect(hi.elevation).toBeGreaterThan(lo.elevation);
      expect(hi.shadowOffset.height).toBeGreaterThanOrEqual(lo.shadowOffset.height);
    }
  });

  it('uses soft black shadows: blurred, low opacity, never a hard offset', () => {
    expect(elevation(0).shadowOpacity).toBe(0);
    for (const lvl of [1, 2, 3] as const) {
      const sh = elevation(lvl);
      expect(sh.shadowColor).toBe('#000000');
      expect(sh.shadowRadius).toBeGreaterThanOrEqual(8);
      expect(sh.shadowOpacity).toBeGreaterThan(0);
      expect(sh.shadowOpacity).toBeLessThanOrEqual(0.5);
      expect(sh.shadowOffset.width).toBe(0);
    }
  });

  it('matches its surface to the colour ladder', () => {
    expect(elevationLevels[1].bg).toBe(colors.surface1);
    expect(elevationLevels[2].bg).toBe(colors.surface2);
    expect(elevationLevels[3].bg).toBe(colors.surface3);
  });
});

describe('press feedback', () => {
  it('is a gentle ~0.97 scale with an opacity dip over ~120ms', () => {
    expect(press.scale).toBeCloseTo(0.97, 2);
    expect(press.dip).toBeLessThan(1);
    expect(press.duration).toBe(120);
  });
});

describe('type roles', () => {
  it('uses Anton only for display roles', () => {
    for (const [name, role] of Object.entries(type)) {
      const isDisplay = /^(display|headline)/.test(name);
      expect(role.fontFamily === fonts.display).toBe(isDisplay);
    }
  });

  it('uses tabular numerals on data roles and generous body line height', () => {
    expect(type.monoData.fontVariant).toContain('tabular-nums');
    expect(type.dataLg.fontVariant).toContain('tabular-nums');
    expect(type.bodyMd.lineHeight / type.bodyMd.fontSize).toBeGreaterThanOrEqual(1.5);
    expect(type.tag.fontSize).toBeGreaterThanOrEqual(11);
  });

  it('reserves ALL CAPS for the tiny tracked tag role (and hero/XL display)', () => {
    const caps = Object.entries(type)
      .filter(([, r]) => 'textTransform' in r && r.textTransform === 'uppercase')
      .map(([n]) => n)
      .sort();
    expect(caps).toEqual(['displayHero', 'displayXl', 'tag']);
    expect(type.tag.letterSpacing).toBeGreaterThanOrEqual(1);
    for (const k of ['button', 'buttonSm', 'label', 'labelSm', 'labelMd'] as const) {
      expect('textTransform' in type[k]).toBe(false);
      expect(type[k].fontFamily).toBe(fonts.label); // Space Grotesk Medium
    }
  });

  it('shrinks Anton below the v2 sizes so display stops shouting', () => {
    expect(type.headlineLg.fontSize).toBeLessThanOrEqual(28);
    expect(type.headlineMd.fontSize).toBeLessThanOrEqual(21);
    expect(type.displayHero.fontSize).toBeLessThanOrEqual(48);
  });

  it('defines a 44pt tap target', () => {
    expect(TAP).toBe(44);
  });
});
