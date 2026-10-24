// Post-RSVP "Want a reminder before it starts?" card.
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import React from 'react';
import { Platform } from 'react-native';

const store: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { store[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete store[k]; }),
}));
const mockGetPerms = jest.fn();
const mockRequestPerms = jest.fn();
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: () => mockGetPerms(),
  requestPermissionsAsync: () => mockRequestPerms(),
  getDevicePushTokenAsync: jest.fn(async () => ({ data: 'tok' })),
}));
jest.mock('react-i18next', () => {
  const t = (key: string) => key;
  return { initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t }) };
});
const mockFetchPrefs = jest.fn();
const mockUpdatePrefs = jest.fn();
jest.mock('../lib/api', () => ({
  fetchNotificationPrefs: () => mockFetchPrefs(),
  updateNotificationPrefs: (...a: unknown[]) => mockUpdatePrefs(...a),
  registerPushToken: jest.fn(async () => {}),
  deletePushToken: jest.fn(),
}));

import { PushReminderCard } from '../components/PushReminderCard';
import { Press } from '../components/ui';

type Mounted = { root: { findAllByType: (t: unknown) => Array<{ props: Record<string, unknown> }> }; toJSON: () => unknown; unmount: () => void };
const mounted: Mounted[] = [];
afterEach(async () => {
  await act(async () => { mounted.splice(0).forEach((r) => r.unmount()); });
});

async function mount(signedIn = true) {
  let r: Mounted | undefined;
  await act(async () => { r = TestRenderer.create(<PushReminderCard signedIn={signedIn} />); });
  mounted.push(r as Mounted);
  return r as Mounted;
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

async function tap(r: Mounted, index: number) {
  const presses = r.root.findAllByType(Press);
  await act(async () => { (presses[index].props.onPress as () => void)(); });
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  Platform.OS = 'ios';
  mockGetPerms.mockReset().mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true });
  mockRequestPerms.mockReset().mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true });
  mockFetchPrefs.mockReset().mockResolvedValue({ pushEnabled: false });
  mockUpdatePrefs.mockReset().mockResolvedValue({ pushEnabled: true });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PushReminderCard', () => {
  it('shows when signed in, push is off, permission is not denied and Not now was never tapped', async () => {
    const r = await mount();
    expect(text(r.toJSON())).toContain('notifications.pushPromptTitle');
  });

  it('shows when the OS permission is granted but push is not enabled for the user', async () => {
    mockGetPerms.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true });
    const r = await mount();
    expect(text(r.toJSON())).toContain('notifications.pushPromptTitle');
  });

  it.each([
    ['guest', async () => mount(false)],
    ['push already enabled', async () => { mockFetchPrefs.mockResolvedValue({ pushEnabled: true }); return mount(); }],
    ['OS permission denied', async () => { mockGetPerms.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false }); return mount(); }],
    ['Not now tapped before', async () => { store.spotseek_push_offer_dismissed = '1'; return mount(); }],
    ['prefs unavailable', async () => { mockFetchPrefs.mockResolvedValue(null); return mount(); }],
    ['not iOS', async () => { Platform.OS = 'android'; return mount(); }],
  ])('stays hidden: %s', async (_name, run) => {
    const r = await run();
    expect(text(r.toJSON())).toBe('');
  });

  it('"Not now" hides the card and persists so it never returns', async () => {
    const r = await mount();
    await tap(r, 0);
    expect(text(r.toJSON())).toBe('');
    expect(store.spotseek_push_offer_dismissed).toBe('1');
    const again = await mount();
    expect(text(again.toJSON())).toBe('');
  });

  it('"Turn on" runs the enable flow and swaps to a confirmation', async () => {
    const r = await mount();
    await tap(r, 1);
    expect(mockRequestPerms).toHaveBeenCalled();
    expect(mockUpdatePrefs).toHaveBeenCalledWith({ pushEnabled: true });
    expect(text(r.toJSON())).toContain('notifications.pushPromptDone');
    expect(text(r.toJSON())).not.toContain('notifications.pushPromptEnable');
  });

  it('hides quietly when the OS prompt is denied, without remembering a dismissal', async () => {
    mockRequestPerms.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false });
    const r = await mount();
    await tap(r, 1);
    expect(text(r.toJSON())).toBe('');
    expect(mockUpdatePrefs).not.toHaveBeenCalled();
    expect(store.spotseek_push_offer_dismissed).toBeUndefined();
  });
});
