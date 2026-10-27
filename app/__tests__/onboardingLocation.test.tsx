// First-run location step (App Review 5.1.1(iv)): one Continue button that
// always goes to the system prompt; any answer moves on.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import React from 'react';

const mockReplace = jest.fn();
const mockScreen = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  Stack: { Screen: (props: unknown) => { mockScreen(props); return null; } },
}));
const mockRequest = jest.fn();
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => mockRequest(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SafeAreaInsetsContext: require('react').createContext(null),
}));
jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}));

import OnboardingLocationScreen from '../app/onboarding-location';
import { Press } from '../components/ui';

async function mount() {
  let r: { root: { findAllByType: (t: unknown) => Array<{ props: Record<string, unknown> }> }; toJSON: () => unknown; unmount: () => void } | undefined;
  await act(async () => { r = TestRenderer.create(<OnboardingLocationScreen />); });
  return r!;
}
function text(json: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    walk((n as { children?: unknown }).children);
  };
  walk(json);
  return out.join('|');
}

beforeEach(() => {
  mockReplace.mockReset();
  mockScreen.mockReset();
  mockRequest.mockReset().mockResolvedValue({ status: 'granted' });
});

describe('onboarding location screen', () => {
  it('has exactly one button, Continue', async () => {
    const r = await mount();
    const presses = r.root.findAllByType(Press);
    expect(presses).toHaveLength(1);
    expect(presses[0].props.accessibilityRole).toBe('button');
    const t = text(r.toJSON());
    expect(t).toContain('location.allow');
    expect(t).not.toContain('location.skip');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('turns off swipe-back so the request cannot be bypassed', async () => {
    await mount();
    expect(mockScreen).toHaveBeenCalledWith({ options: { gestureEnabled: false } });
  });

  it('Continue calls the system location request and moves on when granted', async () => {
    const r = await mount();
    await act(async () => { (r.root.findAllByType(Press)[0].props.onPress as () => void)(); });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/interests');
  });

  it('still navigates onward when the user denies', async () => {
    mockRequest.mockResolvedValue({ status: 'denied' });
    const r = await mount();
    await act(async () => { (r.root.findAllByType(Press)[0].props.onPress as () => void)(); });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/interests');
  });

  it('still navigates onward when the request throws', async () => {
    mockRequest.mockRejectedValue(new Error('boom'));
    const r = await mount();
    await act(async () => { (r.root.findAllByType(Press)[0].props.onPress as () => void)(); });
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/interests');
  });
});
