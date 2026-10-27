// Discover "Near me" (App Review 5.1.1(iv)): tapping the chip is a direct user
// action that goes straight to the system prompt; if location is denied the
// feed keeps working and a short message links to Settings.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import React from 'react';
import { Linking } from 'react-native';

let mockWindow = { width: 393, height: 852 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void) => { const R = require('react'); R.useEffect(() => { cb(); }, []); }, // eslint-disable-line @typescript-eslint/no-require-imports
}));
const mockGetPerm = jest.fn();
const mockRequest = jest.fn();
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: () => mockGetPerm(),
  requestForegroundPermissionsAsync: () => mockRequest(),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 1, longitude: 2 } })),
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
jest.mock('../lib/api', () => ({
  fetchFeed: jest.fn(async () => []),
  fetchFavourites: jest.fn(async () => []),
}));
jest.mock('../lib/auth', () => ({ useAuth: () => ({ status: 'unauthenticated' }) }));
jest.mock('../components/AuthGate', () => ({ useAuthGate: () => ({ requireAuth: () => true, gateSheet: null }) }));
jest.mock('../lib/guestState', () => ({ getGuestInterests: jest.fn(async () => []) }));
jest.mock('../lib/moderation', () => ({ onBlocksChanged: () => () => {} }));
jest.mock('../components/EventMapView', () => ({ EventMapView: () => null }));
jest.mock('../components/AppHeader', () => ({ AppHeader: () => null }));

import DiscoverScreen from '../app/(tabs)/discover/index';
import { Chip, Btn } from '../components/ui';

type Node = { props: Record<string, unknown> };
type Mounted = { root: { findAllByType: (t: unknown) => Node[]; findAll: (f: (n: Node) => boolean) => Node[] }; toJSON: () => unknown; unmount: () => void };

async function mount() {
  let r: Mounted | undefined;
  await act(async () => { r = TestRenderer.create(<DiscoverScreen />); });
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
async function tapNearMe(r: Mounted) {
  const chip = r.root.findAllByType(Chip).find((c) => c.props.label === 'feed.filterNearMe')!;
  await act(async () => { await (chip.props.onPress as () => Promise<void>)(); });
}

beforeEach(() => {
  mockGetPerm.mockReset().mockResolvedValue({ status: 'undetermined' });
  mockRequest.mockReset().mockResolvedValue({ status: 'denied' });
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  mockWindow = { width: 393, height: 852 };
  (Linking.openSettings as jest.Mock).mockClear?.();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('Discover Near me', () => {
  it('does not ask for location until the person taps Near me', async () => {
    const r = await mount();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(text(r.toJSON())).not.toContain('feed.nearMeDenied');
  });

  it('tapping Near me goes straight to the system request (no pre-prompt)', async () => {
    const r = await mount();
    await tapNearMe(r);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('when denied, the feed still renders and the Settings message and button appear', async () => {
    const r = await mount();
    await tapNearMe(r);
    const t = text(r.toJSON());
    expect(t).toContain('feed.nearMeDenied');
    expect(t).toContain('feed.openSettings');
    // The other filters are still there.
    expect(t).toContain('feed.filterThisWeek');
    const btn = r.root.findAllByType(Btn).find((b) => b.props.label === 'feed.openSettings')!;
    await act(async () => { (btn.props.onPress as () => void)(); });
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it('switching to another filter hides the message', async () => {
    const r = await mount();
    await tapNearMe(r);
    const chip = r.root.findAllByType(Chip).find((c) => c.props.label === 'feed.filterAll')!;
    await act(async () => { await (chip.props.onPress as () => Promise<void>)(); });
    expect(text(r.toJSON())).not.toContain('feed.nearMeDenied');
  });

  it('when granted there is no denied message', async () => {
    mockRequest.mockResolvedValue({ status: 'granted' });
    const r = await mount();
    await tapNearMe(r);
    expect(text(r.toJSON())).not.toContain('feed.nearMeDenied');
  });

  it('in the split (list + map) layout the denied message and Settings button still appear', async () => {
    mockWindow = { width: 951, height: 669 };
    const r = await mount();
    await tapNearMe(r);
    const t = text(r.toJSON());
    expect(t).toContain('feed.nearMeDenied');
    expect(t).toContain('feed.openSettings');
    const btn = r.root.findAllByType(Btn).find((b) => b.props.label === 'feed.openSettings')!;
    await act(async () => { (btn.props.onPress as () => void)(); });
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });
});
