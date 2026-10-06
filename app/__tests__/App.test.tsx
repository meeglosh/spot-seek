import { light, dark, colors, radius, fonts, type, hardShadow, pressStyle, TAP } from '../lib/theme';

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
  it('hardShadow is a solid offset: zero blur, full opacity, elevation parity', () => {
    const sh = hardShadow(4);
    expect(sh.shadowRadius).toBe(0);
    expect(sh.shadowOpacity).toBe(1);
    expect(sh.shadowOffset).toEqual({ width: 4, height: 4 });
    expect(sh.elevation).toBe(4);
    expect(sh.shadowColor).toBe(colors.shadow);
  });

  it('pressStyle collapses the shadow and translates by the offset', () => {
    expect(pressStyle(false)).toBeNull();
    const pressed = pressStyle(true, 3);
    expect(pressed).toMatchObject({ shadowOpacity: 0, elevation: 0 });
    expect(pressed?.transform).toEqual([{ translateX: 3 }, { translateY: 3 }]);
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
