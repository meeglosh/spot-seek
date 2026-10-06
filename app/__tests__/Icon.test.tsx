import React from 'react';
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import { Icon, ICON_NAMES, ICON_PATHS } from '../components/icons';
import { colors } from '../lib/theme';

// @testing-library/react-native 14 needs the `test-renderer` peer, which this
// repo does not install; react-test-renderer (already present) is enough to
// prove every icon mounts and carries its props.
async function mount(el: React.ReactElement) {
  let root: { toJSON: () => unknown } | undefined;
  await act(async () => { root = TestRenderer.create(el); });
  return root as { toJSON: () => unknown };
}

describe('Icon', () => {
  it('ships the full SpotSeek icon set', () => {
    for (const n of [
      'discover', 'parties', 'profile', 'bell', 'filter', 'locate', 'share', 'menu', 'back', 'forward',
      'chevronRight', 'live', 'settings', 'signOut', 'wallet', 'sponsorship', 'calendar', 'pin', 'users',
      'plus', 'close', 'check', 'search', 'map', 'list',
    ]) {
      expect(ICON_NAMES).toContain(n);
    }
  });

  it.each(ICON_NAMES)('renders "%s" without crashing', async (name) => {
    const root = await mount(<Icon name={name} />);
    expect(root.toJSON()).not.toBeNull();
  });

  it('keeps every absolute path inside the 24-unit grid and free of curves-by-accident', () => {
    for (const name of ICON_NAMES) {
      for (const seg of ICON_PATHS[name]) {
        expect(seg.d).toMatch(/^[MmLlHhVvAaZz0-9.\s-]+$/);
        if (!/[a-z]/.test(seg.d.replace(/[zZ]/g, ''))) {
          const nums = (seg.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
          for (const n of nums) expect(n >= 0 && n <= 24).toBe(true);
        }
      }
    }
  });

  it('accepts size and colour props', async () => {
    const root = await mount(<Icon name="check" size={32} color={colors.action} />);
    const json = JSON.stringify(root.toJSON());
    // RNSVG serialises colours to ARGB ints: #00e5ff -> 0xFF00E5FF.
    expect(colors.action).toBe('#00e5ff');
    expect(json).toContain(String(0xff00e5ff));
    expect(json).toContain('"width":32');
  });
});
