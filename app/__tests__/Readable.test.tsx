import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

let mockWindow = { width: 393, height: 852 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  const Ctx = R.createContext(null);
  return {
    SafeAreaInsetsContext: Ctx,
    // Outer (system) insets unless a provider overrides them.
    useSafeAreaInsets: () => R.useContext(Ctx) ?? { top: 0, bottom: 0, left: 0, right: 84 },
  };
});

import { Readable } from '../components/Readable';
import { tabBarLayout } from '../lib/readableWidth';

function Probe({ report }: { report: (right: number) => void }) {
  report(useSafeAreaInsets().right);
  return null;
}
function render(opts: { disabled?: boolean } = {}) {
  const out: { right?: number } = {};
  let t: { toJSON: () => unknown } | undefined;
  act(() => { t = TestRenderer.create(<Readable {...opts}><Probe report={(r) => { out.right = r; }} /></Readable>); });
  return { out, t: t! };
}

describe('Readable', () => {
  it('leaves phone widths alone (strip inset kept)', () => {
    mockWindow = { width: 466, height: 678 };
    expect(render().out.right).toBe(84);
  });

  it('caps wide windows and drops the strip inset the margin clears', () => {
    mockWindow = { width: 951, height: 669 };
    const { out, t } = render();
    expect(out.right).toBe(0);
    expect(JSON.stringify(t.toJSON())).toContain('640');
  });

  it('can be disabled (Discover split)', () => {
    mockWindow = { width: 951, height: 669 };
    const { out, t } = render({ disabled: true });
    expect(out.right).toBe(84);
    expect(JSON.stringify(t.toJSON())).not.toContain('640');
  });
});

describe('tabBarLayout', () => {
  it('centres and caps on wide windows', () => {
    expect(tabBarLayout(1194, 834, 16, 16, true)).toEqual({ maxWidth: 640, align: 'center' });
    expect(tabBarLayout(669, 951, 16, 16, false)).toEqual({ maxWidth: 640, align: 'center' });
  });
  it('keeps every tab clear of the Duo fold in wide landscape', () => {
    const { maxWidth, align } = tabBarLayout(951, 669, 16, 16, false);
    expect(align).toBe('flex-start');
    expect(16 + maxWidth).toBeLessThanOrEqual(951 / 2 - 16);
  });
  it('is unconstrained in practice on phones', () => {
    expect(tabBarLayout(393, 852, 16, 16, false).maxWidth).toBeGreaterThanOrEqual(393);
  });
});
