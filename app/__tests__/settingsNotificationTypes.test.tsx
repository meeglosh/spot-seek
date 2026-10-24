// Settings > Notifications: per-type Push/Email toggles.
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import React from 'react';
import { Switch } from 'react-native';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  const router = { replace: jest.fn(), push: jest.fn() };
  return { useRouter: () => router, useFocusEffect: (cb: () => void) => { R.useEffect(cb, [cb]); } };
});
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0', extra: {} } } }));
jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })) }));
jest.mock('@react-native-community/slider', () => ({ __esModule: true, default: () => null }));
jest.mock('react-i18next', () => {
  const t = (key: string) => key;
  const i18n = { language: 'en' };
  return { initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t, i18n }) };
});
jest.mock('../lib/auth', () => {
  const auth = { status: 'authenticated', user: { id: 'u1' }, signOut: jest.fn() };
  return { useAuth: () => auth };
});
jest.mock('../lib/features', () => ({ isSponsorshipEnabled: () => false }));
jest.mock('../lib/i18n', () => ({ SUPPORTED_LOCALES: [], setAppLocale: jest.fn() }));
jest.mock('../lib/push', () => ({ enablePush: jest.fn(), disablePush: jest.fn() }));
jest.mock('../lib/moderation', () => ({ openGuidelines: jest.fn(), openTerms: jest.fn(), openPrivacy: jest.fn() }));
jest.mock('../components/AuthGate', () => ({ GuestGate: () => null }));
jest.mock('../components/AppHeader', () => ({ AppHeader: () => null }));

const mockFetchPrefs = jest.fn();
const mockUpdatePrefs = jest.fn();
jest.mock('../lib/api', () => ({
  NOTIFICATION_TYPE_KEYS: ['reminders', 'updates', 'hosting', 'nearby', 'reviews'],
  fetchNotificationPrefs: () => mockFetchPrefs(),
  updateNotificationPrefs: (...a: unknown[]) => mockUpdatePrefs(...a),
  deleteAccount: jest.fn(),
  DeleteAccountBlockedError: class extends Error {},
  getStoredLocale: jest.fn(async () => null),
  fetchConnectStatus: jest.fn(async () => null),
  startConnectOnboarding: jest.fn(),
}));

import SettingsScreen from '../app/settings';

const KEYS = ['reminders', 'updates', 'hosting', 'nearby', 'reviews'] as const;
type Prefs = {
  emailEnabled: boolean; pushEnabled: boolean; radiusMiles: number; lastLat: null; lastLng: null;
  types?: Record<string, { push: boolean; email: boolean }>;
};
function prefs(over: Partial<Prefs> = {}): Prefs {
  const types: Record<string, { push: boolean; email: boolean }> = {};
  for (const k of KEYS) types[k] = { push: true, email: true };
  return { emailEnabled: true, pushEnabled: true, radiusMiles: 50, lastLat: null, lastLng: null, types, ...over };
}

type Mounted = { root: { findAllByType: (t: unknown) => Array<{ props: Record<string, unknown> }> }; toJSON: () => unknown; unmount: () => void };
const mounted: Mounted[] = [];
afterEach(async () => {
  await act(async () => { mounted.splice(0).forEach((r) => r.unmount()); });
});

async function mount() {
  let r: Mounted | undefined;
  await act(async () => { r = TestRenderer.create(<SettingsScreen />); });
  mounted.push(r as Mounted);
  return r as Mounted;
}

function typeSwitch(r: Mounted, key: string, channel: 'push' | 'email') {
  const label = `notifications.types.${key}.title, notifications.${channel === 'push' ? 'channelPush' : 'channelEmail'}`;
  const sw = r.root.findAllByType(Switch).find((n) => n.props.accessibilityLabel === label);
  if (!sw) throw new Error(`no switch ${label}`);
  return sw;
}

function allText(json: unknown): string {
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
  mockFetchPrefs.mockReset();
  mockUpdatePrefs.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('settings notification types', () => {
  it('renders the five groups with a Push and an Email toggle each, plus the in-app note', async () => {
    mockFetchPrefs.mockResolvedValue(prefs());
    const r = await mount();
    const text = allText(r.toJSON());
    for (const k of KEYS) {
      expect(text).toContain(`notifications.types.${k}.title`);
      expect(text).toContain(`notifications.types.${k}.body`);
      expect(typeSwitch(r, k, 'push').props.value).toBe(true);
      expect(typeSwitch(r, k, 'email').props.value).toBe(true);
    }
    expect(text).toContain('notifications.typesNote');
  });

  it('shows saved values and treats a missing `types` (older backend) as all on', async () => {
    const p = prefs();
    p.types!.nearby.email = false;
    mockFetchPrefs.mockResolvedValue(p);
    let r = await mount();
    expect(typeSwitch(r, 'nearby', 'email').props.value).toBe(false);
    expect(typeSwitch(r, 'nearby', 'push').props.value).toBe(true);

    mockFetchPrefs.mockResolvedValue(prefs({ types: undefined }));
    r = await mount();
    for (const k of KEYS) expect(typeSwitch(r, k, 'push').props.value).toBe(true);
  });

  it('sends only the partial types payload and applies the server response', async () => {
    mockFetchPrefs.mockResolvedValue(prefs());
    const updated = prefs();
    updated.types!.nearby.email = false;
    mockUpdatePrefs.mockResolvedValue(updated);
    const r = await mount();
    await act(async () => { (typeSwitch(r, 'nearby', 'email').props.onValueChange as (v: boolean) => void)(false); });
    expect(mockUpdatePrefs).toHaveBeenCalledWith({ types: { nearby: { email: false } } });
    expect(typeSwitch(r, 'nearby', 'email').props.value).toBe(false);
    expect(typeSwitch(r, 'nearby', 'push').props.value).toBe(true);
  });

  it('flips optimistically, then rolls back and shows an error when the save fails', async () => {
    mockFetchPrefs.mockResolvedValue(prefs());
    let reject: (e: Error) => void = () => {};
    mockUpdatePrefs.mockReturnValue(new Promise((_, rej) => { reject = rej; }));
    const r = await mount();
    await act(async () => { (typeSwitch(r, 'hosting', 'push').props.onValueChange as (v: boolean) => void)(false); });
    expect(typeSwitch(r, 'hosting', 'push').props.value).toBe(false);
    await act(async () => { reject(new Error('500')); });
    expect(typeSwitch(r, 'hosting', 'push').props.value).toBe(true);
    expect(allText(r.toJSON())).toContain('notifications.typeError');
  });

  it('disables the per-type Push toggles when the Push master is off, and Email when Email is off', async () => {
    mockFetchPrefs.mockResolvedValue(prefs({ pushEnabled: false }));
    let r = await mount();
    for (const k of KEYS) {
      expect(typeSwitch(r, k, 'push').props.disabled).toBe(true);
      expect(typeSwitch(r, k, 'email').props.disabled).toBe(false);
    }

    mockFetchPrefs.mockResolvedValue(prefs({ emailEnabled: false }));
    r = await mount();
    for (const k of KEYS) {
      expect(typeSwitch(r, k, 'email').props.disabled).toBe(true);
      expect(typeSwitch(r, k, 'push').props.disabled).toBe(false);
    }
  });
});
