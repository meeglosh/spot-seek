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
    useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
    useLocalSearchParams: () => ({ id: 'e1' }),
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
jest.mock('../lib/moderation', () => ({ onBlocksChanged: () => () => {}, hostBannerKind: () => null, isRsvpForbidden: () => false }));
jest.mock('../lib/guestState', () => ({ getGuestInterests: async () => [], consumePendingIntent: async () => null }));


let mockEvent: Record<string, unknown> = {};
jest.mock('../lib/api', () => ({
  API_BASE: 'http://x',
  fetchEvent: jest.fn(async () => mockEvent),
  fetchMyRsvps: jest.fn(async () => []),
  fetchProfile: jest.fn(async () => null),
  fetchEventReviews: jest.fn(async () => ({ myReview: null, host: null, venue: null, reviews: [] })),
  rsvpToEvent: jest.fn(),
  cancelRsvp: jest.fn(),
  submitReview: jest.fn(),
}));
jest.mock('expo-haptics', () => ({}));
jest.mock('../components/YoureIn', () => ({ YoureIn: () => null }));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock('react-native-maps', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  const MapView = R.forwardRef(({ children }: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
    R.useImperativeHandle(ref, () => ({ animateCamera: jest.fn(), animateToRegion: jest.fn(), fitToCoordinates: jest.fn() }));
    return R.createElement('MapView', null, children);
  });
  return { __esModule: true, default: MapView, Marker: 'Marker', PROVIDER_DEFAULT: null };
});

import { Platform } from 'react-native';
import EventDetail from '../app/(tabs)/discover/[id]';

type Tree = {
  root: {
    findAll: (f: (n: { type: unknown; props: Record<string, unknown> }) => boolean) => { props: Record<string, unknown> }[];
    findAllByType: (t: string) => unknown[];
  };
  unmount: () => void;
};
const trees: Tree[] = [];
afterEach(async () => {
  await act(async () => { trees.splice(0).forEach((t) => t.unmount()); });
  mockWindow = { width: 393, height: 852 };
});

async function mount(event: Record<string, unknown>): Promise<Tree> {
  mockEvent = {
    id: 'e1', hostId: 'h', title: 'Derby', broadcastSubject: 'Soccer', status: 'published',
    startsAt: new Date(Date.now() + 86400_000).toISOString(),
    endsAt: new Date(Date.now() + 90000_000).toISOString(),
    capacity: 30, venueName: 'Bar A', venueAddress: '1 Main St', isPrivateLocation: false,
    venueLat: 51.5, venueLng: -0.1, venueTimezone: 'Europe/London', description: 'About it',
    ...event,
  };
  let t: Tree | undefined;
  await act(async () => { t = TestRenderer.create(<EventDetail />); });
  await act(async () => {});
  trees.push(t as Tree);
  return t as Tree;
}
const hasId = (t: Tree, id: string) => t.root.findAll((n) => n.props?.testID === id).length > 0;
const rsvpButtons = (t: Tree) => t.root.findAll((n) => n.props?.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && typeof n.type !== 'string').length;
const mapCount = (t: Tree) => t.root.findAllByType('MapView').length;

describe('Event detail two-pane layout (Duo inner landscape)', () => {
  it('no map pane on iPad landscape (same size, iPad idiom)', async () => {
    Object.defineProperty(Platform, 'isPad', { value: true, configurable: true });
    try {
      mockWindow = { width: 1194, height: 834 };
      const t = await mount({});
      expect(hasId(t, 'detail-map')).toBe(false);
    } finally {
      Object.defineProperty(Platform, 'isPad', { value: undefined, configurable: true });
    }
  });

  it('shows the map pane (single pin) in folded landscape', async () => {
    mockWindow = { width: 951, height: 669 };
    const t = await mount({});
    expect(hasId(t, 'detail-map')).toBe(true);
    expect(mapCount(t)).toBe(1);
    expect(t.root.findAllByType('Marker')).toHaveLength(1);
  });

  it('renders RSVP exactly once, in the right pane, in folded landscape', async () => {
    mockWindow = { width: 951, height: 669 };
    const split = rsvpButtons(await mount({}));
    mockWindow = { width: 393, height: 852 };
    const phone = rsvpButtons(await mount({}));
    expect(split).toBe(phone);
  });

  it('has no map box without coordinates, but keeps venue and RSVP', async () => {
    mockWindow = { width: 951, height: 669 };
    const t = await mount({ venueLat: null, venueLng: null });
    expect(hasId(t, 'detail-map')).toBe(false);
    expect(mapCount(t)).toBe(0);
    expect(t.root.findAll((n) => n.props?.children === 'Bar A').length).toBeGreaterThan(0);
    expect(rsvpButtons(t)).toBeGreaterThan(0);
  });

  it('has no map box for a party with no venue', async () => {
    mockWindow = { width: 951, height: 669 };
    const t = await mount({ venueName: null, venueAddress: null, venueLat: null, venueLng: null });
    expect(hasId(t, 'detail-map')).toBe(false);
  });

  it('hides the exact pin of a private location until the guest is going', async () => {
    mockWindow = { width: 951, height: 669 };
    const t = await mount({ isPrivateLocation: true });
    expect(hasId(t, 'detail-map')).toBe(false);
  });

  it.each([
    ['phone', { width: 393, height: 852 }],
    ['Duo outer display', { width: 466, height: 1014 }],
    ['Duo inner portrait', { width: 669, height: 951 }],
  ])('no map pane on %s', async (_name, size) => {
    mockWindow = size;
    const t = await mount({});
    expect(hasId(t, 'detail-map')).toBe(false);
    expect(mapCount(t)).toBe(0);
  });
});
