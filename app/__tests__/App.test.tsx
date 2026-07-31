import { light, dark, colors, radius, fonts } from '../lib/theme';

describe('theme (High-Energy Action, dark-only)', () => {
  it('uses the HEA near-black background', () => {
    expect(colors.bg).toBe('#0F0F12');
  });

  it('is dark-only: light and dark resolve to the same palette', () => {
    expect(light).toBe(colors);
    expect(dark).toBe(colors);
  });

  it('uses sharp corners on all primary radii', () => {
    expect(radius.sm).toBe(0);
    expect(radius.md).toBe(0);
    expect(radius.lg).toBe(0);
    expect(radius.xl).toBe(0);
  });

  it('uses the HEA electric-blue primary accent', () => {
    expect(colors.accent).toBe('#00e5ff');
    expect(colors.live).toBe('#ff5e07');
  });

  it('maps display type to Anton and labels to Space Grotesk', () => {
    expect(fonts.display).toBe('Anton_400Regular');
    expect(fonts.label).toContain('SpaceGrotesk');
    expect(fonts.sansRegular).toContain('ArchivoNarrow');
  });
});
