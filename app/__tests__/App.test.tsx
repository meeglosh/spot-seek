import { light, dark } from '../lib/theme';

describe('theme', () => {
  it('light theme has a white background', () => {
    expect(light.bg).toBe('#FFFFFF');
  });

  it('dark theme has a dark background', () => {
    expect(dark.bg).toBe('#0A0A0A');
  });

  it('light and dark themes have the same keys', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  });
});
