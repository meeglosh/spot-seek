import React from 'react';
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

let mockWindow = { width: 393, height: 852 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  const LinkTrigger = ({ children, __href, __onPress }: { children: React.ReactElement; __href?: unknown; __onPress?: (e: unknown) => void }) =>
    R.cloneElement(children, {
      onPress: () => {
        const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        __onPress?.(e);
        if (!e.defaultPrevented) mockPush(__href);
      },
    });
  return {
    // Mirrors expo-router's Link asChild: its onPress runs first, then it
    // navigates unless the handler called preventDefault().
    Link: Object.assign(
      ({ children, href, onPress }: { children?: React.ReactNode; href?: unknown; onPress?: (e: unknown) => void }) =>
        R.createElement(R.Fragment, null, R.Children.map(children, (c: React.ReactElement) =>
          c && c.type === LinkTrigger ? R.cloneElement(c, { __href: href, __onPress: onPress }) : c)),
      {
        Trigger: LinkTrigger,
        Menu: () => null,
        MenuAction: () => null,
      },
    ),
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (cb: () => void) => { R.useEffect(cb, [cb]); },
  };
});
jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SafeAreaInsetsContext: require('react').createContext(null),
}));
jest.mock('../lib/auth', () => ({ useAuth: () => ({ status: 'unauthenticated' }) }));
jest.mock('../components/AuthGate', () => ({ useAuthGate: () => ({ requireAuth: () => true, gateSheet: null }) }));
jest.mock('../components/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('../components/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('../lib/useBlockHost', () => ({ useBlockHost: () => jest.fn() }));
jest.mock('../lib/directions', () => ({ useOpenDirections: () => jest.fn(), hasDirectionsTarget: () => false }));
jest.mock('../lib/moderation', () => ({ onBlocksChanged: () => () => {} }));
jest.mock('../lib/guestState', () => ({ getGuestInterests: async () => [] }));

const mockEvents = [
  { id: 'a', title: 'Alpha Final', broadcastSubject: 'Soccer', status: 'published', venueName: 'Bar A', venueLat: 51.5, venueLng: -0.1 },
  { id: 'b', title: 'Beta Derby', broadcastSubject: 'Soccer', status: 'published', venueName: 'Bar B', venueLat: 51.6, venueLng: -0.2 },
].map((e) => ({ ...e, hostId: 'h', startsAt: new Date(Date.now() + 3600_000).toISOString() }));
jest.mock('../lib/api', () => ({
  API_BASE: 'http://x',
  fetchFeed: jest.fn(async () => mockEvents),
  fetchFavourites: jest.fn(async () => []),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 1, longitude: 2 } })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  Accuracy: { Balanced: 3 },
}));

const mockAnimateCamera = jest.fn();
const mockFit = jest.fn();
jest.mock('react-native-maps', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  const MapView = R.forwardRef(({ children, onMapReady }: { children?: React.ReactNode; onMapReady?: () => void }, ref: React.Ref<unknown>) => {
    R.useImperativeHandle(ref, () => ({ animateCamera: mockAnimateCamera, animateToRegion: jest.fn(), fitToCoordinates: mockFit }));
    R.useEffect(() => { onMapReady?.(); }, [onMapReady]);
    return R.createElement('MapView', null, children);
  });
  return { __esModule: true, default: MapView, Marker: 'Marker', PROVIDER_DEFAULT: null };
});

import * as mockLocation from 'expo-location';
import DiscoverScreen from '../app/(tabs)/discover/index';

type Node = { type: unknown; props: Record<string, unknown> & { accessibilityLabel?: string; accessibilityHint?: string; onPress?: () => void; accessibilityState?: unknown; accessibilityRole?: string; label?: string } };
type Tree = {
  root: { findAll: (f: (n: Node) => boolean) => Node[]; findAllByType: (t: string) => Node[] };
  unmount: () => void;
  update: (el: React.ReactElement) => void;
};
const trees: Tree[] = [];
afterEach(async () => {
  await act(async () => { trees.splice(0).forEach((t) => t.unmount()); });
  jest.clearAllMocks();
  mockWindow = { width: 393, height: 852 };
});

async function mount(): Promise<Tree> {
  let t: Tree | undefined;
  await act(async () => { t = TestRenderer.create(<DiscoverScreen />); });
  await act(async () => {});
  trees.push(t as Tree);
  return t as Tree;
}
// Cards are the composite Press elements carrying a selection hint (pins are host Markers).
const byLabel = (t: Tree, prefix: string) => t.root.findAll((n) => typeof n.type !== 'string' && !!n.props?.accessibilityHint && !!n.props.accessibilityLabel?.startsWith?.(prefix) && typeof n.props.onPress === 'function');
const hasSegmented = (t: Tree) => t.root.findAll((n) => n.props?.accessibilityLabel === 'feed.switchToMapView').length > 0;

describe('Discover split layout', () => {
  it('single pane on a portrait phone: toggle shown, no map, no select behaviour', async () => {
    const t = await mount();
    expect(hasSegmented(t)).toBe(true);
    expect(t.root.findAllByType('MapView')).toHaveLength(0);
    expect(byLabel(t, 'Alpha').length).toBe(0); // plain cards carry no selection label
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('single pane on iPad portrait', async () => {
    mockWindow = { width: 834, height: 1194 };
    const t = await mount();
    expect(hasSegmented(t)).toBe(true);
    expect(t.root.findAllByType('MapView')).toHaveLength(0);
  });

  it('wide landscape: list and map together, toggle hidden, no location prompt', async () => {
    mockWindow = { width: 951, height: 669 };
    const t = await mount();
    expect(hasSegmented(t)).toBe(false);
    expect(t.root.findAllByType('MapView')).toHaveLength(1);
    expect(t.root.findAllByType('Marker')).toHaveLength(2);
    expect(byLabel(t, 'Alpha').length).toBeGreaterThan(0);
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('tapping a card selects it and pans the map without navigating; tapping again opens it', async () => {
    mockWindow = { width: 951, height: 669 };
    const t = await mount();
    const press = (label: string) => act(async () => { byLabel(t, label)[0].props.onPress!(); });

    await press('Alpha');
    expect(mockPush).not.toHaveBeenCalled();
    expect(byLabel(t, 'Alpha')[0].props.accessibilityState).toEqual({ selected: true });
    expect(byLabel(t, 'Beta')[0].props.accessibilityState).toEqual({ selected: false });
    const pins = t.root.findAllByType('Marker');
    expect(pins[0].props.accessibilityState).toEqual({ selected: true });
    expect(pins[1].props.accessibilityState).toEqual({ selected: false });
    expect(mockAnimateCamera).toHaveBeenLastCalledWith({ center: { latitude: 51.5, longitude: -0.1 } }, { duration: 350 });

    await press('Alpha');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/discover/[id]', params: { id: 'a' } });
  });

  it('tapping a pin selects its event', async () => {
    mockWindow = { width: 951, height: 669 };
    const t = await mount();
    await act(async () => { t.root.findAllByType('Marker')[1].props.onPress!(); });
    expect(byLabel(t, 'Beta')[0].props.accessibilityState).toEqual({ selected: true });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps selection on rotate to single pane and back, and returns to list mode', async () => {
    mockWindow = { width: 951, height: 669 };
    let t!: Tree;
    await act(async () => { t = TestRenderer.create(<DiscoverScreen />); });
    await act(async () => {});
    trees.push(t);
    await act(async () => { byLabel(t, 'Beta')[0].props.onPress!(); });

    mockWindow = { width: 669, height: 951 };
    await act(async () => { t.update(<DiscoverScreen />); });
    expect(hasSegmented(t)).toBe(true);
    expect(t.root.findAllByType('MapView')).toHaveLength(0); // back on the list

    mockWindow = { width: 951, height: 669 };
    await act(async () => { t.update(<DiscoverScreen />); });
    expect(byLabel(t, 'Beta')[0].props.accessibilityState).toEqual({ selected: true });
  });

  it('first load with no selection frames every pin; a later selection does not refit', async () => {
    mockWindow = { width: 951, height: 669 };
    const t = await mount();
    expect(mockFit).toHaveBeenCalledTimes(1);
    expect(mockFit.mock.calls[0][0]).toEqual([
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.6, longitude: -0.2 },
    ]);
    await act(async () => { byLabel(t, 'Beta')[0].props.onPress!(); });
    expect(mockFit).toHaveBeenCalledTimes(1);
  });

  it('asks for location only when Near me is tapped', async () => {
    mockWindow = { width: 951, height: 669 };
    const t = await mount();
    expect(mockLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    const chip = t.root.findAll((n) => n.props?.label === 'feed.filterNearMe' && typeof n.props.onPress === 'function')[0];
    await act(async () => { chip.props.onPress!(); });
    expect(mockLocation.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});
