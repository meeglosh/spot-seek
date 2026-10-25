// Host edit screen: "Cancel party" action and the delete-409 "cancel instead" offer.
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import React from 'react';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SafeAreaInsetsContext: require('react').createContext(null),
}));
jest.mock('expo-router', () => {
  const router = { replace: jest.fn(), dismissTo: jest.fn(), canDismiss: () => false, push: jest.fn() };
  const params = { eventId: 'e1' };
  return { useRouter: () => router, useLocalSearchParams: () => params };
});
// `t` must be referentially stable: the screen lists it as an effect dependency.
jest.mock('react-i18next', () => {
  const t = (key: string) => key;
  return { initReactI18next: { type: '3rdParty', init: () => {} }, useTranslation: () => ({ t }) };
});
jest.mock('../lib/auth', () => {
  const auth = { status: 'authenticated', user: { id: 'host1' } };
  return { useAuth: () => auth };
});
jest.mock('../components/AuthGate', () => ({ GuestGate: () => null, goToAuth: jest.fn() }));
jest.mock('../components/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('../components/BroadcastSubjectInput', () => ({ BroadcastSubjectInput: () => null }));
jest.mock('../components/AddressAutocompleteInput', () => ({ AddressAutocompleteInput: () => null }));
jest.mock('../components/DateTimePicker', () => ({ DateTimePicker: () => null }));

const mockFetchEvent = jest.fn();
const mockCancelEvent = jest.fn();
const mockDeleteEvent = jest.fn();
jest.mock('../lib/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message?: string) {
      super(message ?? code);
      this.status = status;
      this.code = code;
    }
  }
  return {
    API_BASE: 'http://api.test',
    ApiError,
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    uploadEventCover: jest.fn(),
    fetchEvent: (...a: unknown[]) => mockFetchEvent(...a),
    cancelEvent: (...a: unknown[]) => mockCancelEvent(...a),
    deleteEvent: (...a: unknown[]) => mockDeleteEvent(...a),
  };
});

import CreateParty from '../app/(tabs)/parties/create';
import { ApiError } from '../lib/api';

const HOUR = 3600 * 1000;
const baseEvent = (over: Record<string, unknown> = {}) => ({
  id: 'e1', hostId: 'host1', title: 'Final', broadcastSubject: 'World Cup', description: null, capacity: null,
  startsAt: new Date(Date.now() + 24 * HOUR).toISOString(), endsAt: null,
  venueName: null, venueAddress: null, venueLat: null, venueLng: null,
  isPrivateLocation: false, coverImageUrl: null, status: 'published', moderationStatus: 'ok', ...over,
});

type Node = { props: Record<string, unknown>; children: unknown[]; findAll: (p: (n: Node) => boolean) => Node[] };
function textOf(n: unknown): string {
  if (typeof n === 'string') return n;
  const node = n as Node;
  return (node.children ?? []).map(textOf).join('');
}
async function mount() {
  let root!: { root: Node; toJSON: () => unknown };
  await act(async () => { root = TestRenderer.create(<CreateParty />); });
  return root;
}
const buttons = (r: { root: Node }) =>
  r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
const labels = (r: { root: Node }) => buttons(r).map((b) => textOf(b));
const press = async (r: { root: Node }, label: string) => {
  const btn = buttons(r).find((b) => textOf(b) === label);
  if (!btn) throw new Error(`no button "${label}" in [${labels(r).join(', ')}]`);
  await act(async () => { await (btn.props.onPress as () => unknown)(); });
};
const hasText = (r: { root: Node }, s: string) =>
  r.root.findAll(() => true).some((n) => n.children.some((c) => c === s));

beforeEach(() => {
  mockFetchEvent.mockReset();
  mockCancelEvent.mockReset();
  mockDeleteEvent.mockReset();
});

describe('Cancel party button', () => {
  it('shows for a published upcoming party', async () => {
    mockFetchEvent.mockResolvedValue(baseEvent());
    const r = await mount();
    expect(labels(r)).toContain('create.cancel.button');
  });

  it.each([
    ['a draft', { status: 'draft' }],
    ['an already cancelled party', { status: 'cancelled' }],
    ['a party that has ended', { startsAt: new Date(Date.now() - 48 * HOUR).toISOString() }],
  ])('is hidden for %s', async (_n, over) => {
    mockFetchEvent.mockResolvedValue(baseEvent(over));
    const r = await mount();
    expect(labels(r)).not.toContain('create.cancel.button');
  });

  it('a cancelled party is read-only: the notice shows and Save is disabled', async () => {
    mockFetchEvent.mockResolvedValue(baseEvent({ status: 'cancelled' }));
    const r = await mount();
    expect(hasText(r, 'create.cancel.alreadyCancelled')).toBe(true);
    const save = buttons(r).find((b) => textOf(b) === 'create.actions.saveChanges');
    expect((save!.props.accessibilityState as { disabled: boolean }).disabled).toBe(true);
  });

  it('confirm step then cancels the party and shows the outcome', async () => {
    mockFetchEvent.mockResolvedValue(baseEvent());
    mockCancelEvent.mockResolvedValue(baseEvent({ status: 'cancelled' }));
    const r = await mount();
    await press(r, 'create.cancel.button');
    expect(mockCancelEvent).not.toHaveBeenCalled();
    await press(r, 'create.cancel.yes');
    expect(mockCancelEvent).toHaveBeenCalledWith('e1');
    expect(hasText(r, 'create.cancel.outcome.title')).toBe(true);
  });

  it('shows an error when cancelling fails', async () => {
    mockFetchEvent.mockResolvedValue(baseEvent());
    mockCancelEvent.mockRejectedValue(new Error('boom'));
    const r = await mount();
    await press(r, 'create.cancel.button');
    await press(r, 'create.cancel.yes');
    expect(hasText(r, 'boom')).toBe(true);
    expect(hasText(r, 'create.cancel.outcome.title')).toBe(false);
  });
});

describe('delete refused with sponsorship history', () => {
  it('offers "Cancel party instead", which runs the cancel flow', async () => {
    mockFetchEvent.mockResolvedValue(baseEvent());
    mockDeleteEvent.mockRejectedValue(new ApiError(409, 'has_sponsorship_history', 'x'));
    mockCancelEvent.mockResolvedValue(baseEvent({ status: 'cancelled' }));
    const r = await mount();
    await press(r, 'create.actions.deleteParty');
    await press(r, 'create.actions.yesDelete');
    expect(hasText(r, 'create.deleteHasSponsorship')).toBe(true);
    await press(r, 'create.cancel.cancelInstead');
    await press(r, 'create.cancel.yes');
    expect(mockCancelEvent).toHaveBeenCalledWith('e1');
    expect(hasText(r, 'create.cancel.outcome.title')).toBe(true);
  });
});
