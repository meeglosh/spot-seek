// Host publish: a server-hidden (held for review) party shows the "in review"
// success screen instead of "your party's live".
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
  const params = {};
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
jest.mock('../components/BroadcastSubjectInput', () => ({
  // Fills the required subject on mount so the publish button enables.
  BroadcastSubjectInput: ({ onChange }: { onChange: (v: string) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(() => { onChange('World Cup'); }, []);
    return null;
  },
}));
jest.mock('../components/AddressAutocompleteInput', () => ({ AddressAutocompleteInput: () => null }));
jest.mock('../components/DateTimePicker', () => ({ DateTimePicker: () => null }));

const mockCreateEvent = jest.fn();
jest.mock('../lib/api', () => ({
  API_BASE: 'http://api.test',
  ApiError: class extends Error {},
  createEvent: (...a: unknown[]) => mockCreateEvent(...a),
  updateEvent: jest.fn(),
  uploadEventCover: jest.fn(),
  fetchEvent: jest.fn(),
  cancelEvent: jest.fn(),
  deleteEvent: jest.fn(),
}));

import CreateParty from '../app/(tabs)/parties/create';

type Node = { props: Record<string, unknown>; children: unknown[]; findAll: (p: (n: Node) => boolean) => Node[] };
function textOf(n: unknown): string {
  if (typeof n === 'string') return n;
  return ((n as Node).children ?? []).map(textOf).join('');
}
const buttons = (r: { root: Node }) =>
  r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
const labels = (r: { root: Node }) => buttons(r).map((b) => textOf(b));
const hasText = (r: { root: Node }, s: string) =>
  r.root.findAll(() => true).some((n) => n.children.some((c) => c === s));

async function publish(moderationStatus: string) {
  mockCreateEvent.mockResolvedValue({ id: 'new1', status: 'published', moderationStatus });
  let r!: { root: Node };
  await act(async () => { r = TestRenderer.create(<CreateParty />); });
  const input = r.root.findAll((n) => typeof n.props.onChangeText === 'function')[0];
  await act(async () => { (input.props.onChangeText as (v: string) => void)('Final night'); });
  const btn = buttons(r).find((b) => textOf(b) === 'create.actions.publishParty');
  if (!btn) throw new Error(`no publish button in [${labels(r).join(', ')}]`);
  await act(async () => { await (btn.props.onPress as () => unknown)(); });
  return r;
}

beforeEach(() => mockCreateEvent.mockReset());

describe('create: publish outcome', () => {
  it('shows the in-review screen without Share when the server returns hidden', async () => {
    const r = await publish('hidden');
    expect(hasText(r, 'create.outcome.inReview.title')).toBe(true);
    expect(hasText(r, 'create.outcome.published.title')).toBe(false);
    expect(labels(r)).toContain('create.outcome.viewParty');
    expect(labels(r)).not.toContain('create.outcome.shareParty');
  });

  it('shows the normal live screen with Share when the server returns ok', async () => {
    const r = await publish('ok');
    expect(hasText(r, 'create.outcome.published.title')).toBe(true);
    expect(hasText(r, 'create.outcome.inReview.title')).toBe(false);
    expect(labels(r)).toContain('create.outcome.shareParty');
  });
});
