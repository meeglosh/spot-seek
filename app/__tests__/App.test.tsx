import { light, dark, colors, radius, fonts, type, compositeOver, HARD_OFFSET, TAP } from '../lib/theme';

describe('theme (High-Energy Action v2, dark-only, semantic roles)', () => {
  it('uses the near-black canvas', () => {
    expect(colors.canvas).toBe('#0F0F12');
  });

  it('is dark-only: light and dark resolve to the same palette', () => {
    expect(light).toBe(colors);
    expect(dark).toBe(colors);
  });

  it('has exactly one shape exception: radius.round for true circles', () => {
    expect(radius.none).toBe(0);
    expect(radius.round).toBeGreaterThan(0);
    expect(Object.keys(radius).sort()).toEqual(['none', 'round']);
  });

  it('maps display type to Anton and labels to Space Grotesk', () => {
    expect(fonts.display).toBe('Anton_400Regular');
    expect(fonts.label).toContain('SpaceGrotesk');
    expect(fonts.sansRegular).toContain('ArchivoNarrow');
  });
});

describe('colour roles', () => {
  it('keeps one job per accent: action cyan, live orange, confirmed lime', () => {
    expect(colors.action).toBe('#00e5ff');
    expect(colors.live).toBe('#ff5e07');
    expect(colors.confirmed).toBe('#b4e100');
    expect(new Set([colors.action, colors.live, colors.confirmed]).size).toBe(3);
  });

  it('never lets the shadow or the border colours steal an accent role', () => {
    expect(colors.shadow).not.toBe(colors.live);
    expect(colors.shadow).not.toBe(colors.action);
    expect(colors.borderStrong).not.toBe(colors.live);
  });

  it('orders the dark-mode elevation ladder from darker to lighter', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    const ladder = [
      colors.surfaceSunken, colors.canvas, colors.surface1, colors.surface2, colors.surface3,
    ].map(lum);
    expect([...ladder].sort((a, b) => a - b)).toEqual(ladder);
    expect(new Set(ladder).size).toBe(ladder.length);
  });

  it('exposes subtle and strong borders, and overlay tokens instead of rgba literals', () => {
    expect(colors.borderSubtle).not.toBe(colors.borderStrong);
    for (const k of ['scrim', 'scrimSoft', 'mediaDim', 'mediaChip', 'panelOnMedia', 'mapPin'] as const) {
      expect(colors[k]).toMatch(/^rgba\(/);
    }
  });

  it('keeps primary text readable on the canvas (>= 4.5:1)', () => {
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const L = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const fg of [colors.textPrimary, colors.textSecondary, colors.textTertiary]) {
      expect(ratio(fg, colors.canvas)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(fg, colors.surface2)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('depth model', () => {
  it('has a positive hard-shadow offset and an opaque shadow ink', () => {
    expect(HARD_OFFSET).toBeGreaterThan(0);
    expect(colors.shadow).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('selected fills are opaque composites of the washes over the canvas', () => {
    for (const fill of [colors.actionSelectedFill, colors.liveSelectedFill, colors.confirmedSelectedFill]) {
      expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(compositeOver('rgba(0,229,255,0.08)', '#0F0F12')).toBe('#0e2025');
    expect(colors.actionSelectedFill).toBe('#0e2025');
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
    expect(type.labelCapsSm.fontSize).toBeGreaterThanOrEqual(11);
  });

  it('defines a 44pt tap target', () => {
    expect(TAP).toBe(44);
  });
});
