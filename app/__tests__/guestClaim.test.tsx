// Guest RSVP claim deep link: /e/:id/claim/:token, plus the unchanged /e/:id forward.
import React from 'react';
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-i18next', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const en = require('../locales/en/discover.json');
  const get = (key: string): string => key.split('.').reduce((o: any, k) => o?.[k], en) ?? key; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t: get }) };
});
let mockStatus = 'authenticated';
jest.mock('../lib/auth', () => ({ useAuth: () => ({ status: mockStatus }) }));

const mockClaim = jest.fn();
jest.mock('../lib/api', () => ({
  ...jest.requireActual('../lib/api'),
  claimGuestRsvp: (...a: unknown[]) => mockClaim(...a),
}));

import { Alert } from 'react-native';
import ClaimScreen from '../app/e/[id]/claim/[token]';
import EventDeepLink from '../app/e/[id]/index';
import { claimGuestRsvp } from '../lib/api';
import { safeRedirect } from '../lib/safeRedirect';

const actualApi = jest.requireActual('../lib/api') as { claimGuestRsvp: typeof claimGuestRsvp };

function texts(r: { root: { findAll: (f: (n: unknown) => boolean) => unknown[] } }): string {
  return r.root.findAll(() => true)
    .map((n) => (n as { props: { children?: unknown } }).props.children)
    .filter((c): c is string => typeof c === 'string')
    .join('|');
}

async function render(el: React.ReactElement) {
  let r: ReturnType<typeof TestRenderer.create>;
  await act(async () => { r = TestRenderer.create(el); });
  return r!;
}

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockClaim.mockReset();
  mockStatus = 'authenticated';
  mockParams = { id: 'evt1', token: 'tok1' };
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('claim screen', () => {
  it('signed out: routes to sign-in with the claim path as redirect, no claim call', async () => {
    mockStatus = 'unauthenticated';
    await render(<ClaimScreen />);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/sign-in',
      params: { redirect: '/e/evt1/claim/tok1' },
    });
    expect(mockClaim).not.toHaveBeenCalled();
    expect(safeRedirect('/e/evt1/claim/tok1', '/x')).toBe('/e/evt1/claim/tok1');
  });

  it('signed in: claims once and replaces to the event with a confirmation', async () => {
    mockClaim.mockResolvedValue({ ok: true, rsvp: { id: 'r1', eventId: 'evt1', state: 'confirmed' } });
    const r = await render(<ClaimScreen />);
    await act(async () => { r.update(<ClaimScreen />); });
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(mockClaim).toHaveBeenCalledWith('evt1', 'tok1');
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/discover/evt1');
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('shows a loading state while the claim is in flight', async () => {
    mockClaim.mockReturnValue(new Promise(() => {}));
    const r = await render(<ClaimScreen />);
    expect(texts(r)).toContain('Linking your RSVP');
  });

  it.each([
    ['already_claimed', 'This RSVP is already linked to another account', true],
    ['not_confirmed', 'Confirm your RSVP from the email first', true],
    ['event_ended', 'This event has already ended', true],
    ['own_event', 'This is your own event', true],
    ['forbidden', "You can't join this event", true],
    ['not_found', "This link isn't valid", false],
    ['network', "This link isn't valid", false],
  ])('%s renders its message', async (code, message, hasEventButton) => {
    mockClaim.mockResolvedValue({ ok: false, error: code });
    const r = await render(<ClaimScreen />);
    const out = texts(r);
    expect(out).toContain(message);
    expect(out).toContain('Back to Discover');
    expect(out.includes('View event')).toBe(hasEventButton);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('claimGuestRsvp', () => {
  const respond = (status: number, body: unknown) => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: status >= 200 && status < 300, status, json: async () => body,
    }));
  };

  it('posts eventId and token in the body, not the path', async () => {
    respond(200, { ok: true, rsvp: { id: 'r1', eventId: 'e/1', state: 'confirmed' } });
    const res = await actualApi.claimGuestRsvp('e/1', 't?k');
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(String(url).endsWith('/api/rsvps/claim')).toBe(true);
    expect(JSON.parse(init.body)).toEqual({ eventId: 'e/1', token: 't?k' });
    expect(res).toEqual({ ok: true, rsvp: { id: 'r1', eventId: 'e/1', state: 'confirmed' } });
  });

  it.each([
    [401, {}, 'unauthorized'],
    [403, { error: 'forbidden' }, 'forbidden'],
    [404, { error: 'not_found' }, 'not_found'],
    [409, { error: 'already_claimed' }, 'already_claimed'],
    [409, { error: 'not_confirmed' }, 'not_confirmed'],
    [409, { error: 'event_ended' }, 'event_ended'],
    [409, { error: 'own_event' }, 'own_event'],
    [409, { error: 'surprise' }, 'not_found'],
    [500, {}, 'network'],
  ])('maps %s %j to %s', async (status, body, error) => {
    respond(status, body);
    expect(await actualApi.claimGuestRsvp('e', 't')).toEqual({ ok: false, error });
  });

  it('maps a thrown fetch to network', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => { throw new Error('offline'); });
    expect(await actualApi.claimGuestRsvp('e', 't')).toEqual({ ok: false, error: 'network' });
  });
});

describe('/e/:id forward', () => {
  it('still replaces to the discover detail screen', async () => {
    mockParams = { id: 'evt9' };
    await render(<EventDeepLink />);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/discover/evt9');
  });
});
