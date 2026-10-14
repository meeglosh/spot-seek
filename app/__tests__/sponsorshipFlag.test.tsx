import React from 'react';
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

// The flag is read from expo-constants (app.json extra.features.sponsorship).
let mockExtra: Record<string, unknown> | undefined;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { get expoConfig() { return { extra: mockExtra }; } },
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  const Stack = Object.assign(({ children }: { children?: React.ReactNode }) => R.createElement('Stack', null, children), {
    Screen: () => null,
  });
  return {
    Stack,
    Redirect: ({ href }: { href: string }) => R.createElement('Redirect', { href }),
    Link: Object.assign(
      ({ children }: { children?: React.ReactNode }) => R.createElement(R.Fragment, null, children),
      {
        Trigger: ({ children }: { children?: React.ReactNode }) => R.createElement(R.Fragment, null, children),
        Menu: () => null,
        MenuAction: () => null,
      },
    ),
    useRouter: () => ({ push: jest.fn() }),
  };
});
jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key}:${opts.name}` : key),
  }),
}));
jest.mock('../lib/auth', () => ({ useAuth: () => ({ status: 'unauthenticated' }) }));
jest.mock('../components/AuthGate', () => ({ useAuthGate: () => ({ requireAuth: () => true, gateSheet: null }) }));
jest.mock('../components/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('../lib/useBlockHost', () => ({ useBlockHost: () => jest.fn() }));
jest.mock('../lib/directions', () => ({ useOpenDirections: () => jest.fn(), hasDirectionsTarget: () => false }));

import {
  readSponsorshipFlag, isSponsorshipEnabled, isSponsorNotificationType, SPONSORSHIP_FALLBACK_ROUTE,
} from '../lib/features';
import { routeFor } from '../lib/notificationRoutes';
import { sponsorMenuItems } from '../components/AppHeader';
import { EventCard, type EventItem } from '../components/EventCard';
import SponsorshipLayout from '../app/(tabs)/sponsorship/_layout';
import appJson from '../app.json';

const ON = { features: { sponsorship: true } };
const OFF = { features: { sponsorship: false } };

type Mounted = {
  toJSON: () => unknown;
  unmount: () => void;
  root: { findAllByType: (t: string) => { props: Record<string, unknown> }[] };
};
const mounted: Mounted[] = [];
afterEach(async () => {
  await act(async () => { mounted.splice(0).forEach((r) => r.unmount()); });
  mockExtra = undefined;
});
async function mount(el: React.ReactElement) {
  let root: Mounted | undefined;
  await act(async () => { root = TestRenderer.create(el); });
  mounted.push(root as Mounted);
  return root as Mounted;
}

const event: EventItem = {
  id: 'e1', title: 'Cup Final', broadcastSubject: 'Soccer', status: 'published',
  topSponsor: 'Volt Cola', sponsorCount: 2,
};

describe('feature flag', () => {
  it('app.json ships with sponsorship OFF', () => {
    expect(readSponsorshipFlag(appJson.expo.extra as never)).toBe(false);
  });
  it('defaults to off when missing or not exactly true', () => {
    expect(readSponsorshipFlag(undefined)).toBe(false);
    expect(readSponsorshipFlag({})).toBe(false);
    expect(readSponsorshipFlag({ features: { sponsorship: 'true' } })).toBe(false);
    expect(readSponsorshipFlag(ON)).toBe(true);
  });
  it('isSponsorshipEnabled follows expo config', () => {
    mockExtra = ON;
    expect(isSponsorshipEnabled()).toBe(true);
    mockExtra = OFF;
    expect(isSponsorshipEnabled()).toBe(false);
  });
});

describe('notification routing', () => {
  const sponsorTypes = ['sponsor_bid', 'sponsorship_request', 'payment_due', 'payment_received', 'payment_refunded', 'payout_sent'];
  it('flag off: every sponsor type goes to Discover, even without an event', () => {
    mockExtra = OFF;
    for (const type of sponsorTypes) {
      expect(isSponsorNotificationType(type)).toBe(true);
      expect(routeFor(type, 'e1')).toBe(SPONSORSHIP_FALLBACK_ROUTE);
      expect(routeFor(type, null)).toBe(SPONSORSHIP_FALLBACK_ROUTE);
    }
  });
  it('flag off: non-sponsor types are unchanged', () => {
    mockExtra = OFF;
    expect(routeFor('rsvp', 'e1')).toBe('/(tabs)/parties/dashboard');
    expect(routeFor('reminder_1h', 'e1')).toBe('/(tabs)/discover/e1');
    expect(routeFor('rsvp', null)).toBeNull();
  });
  it('flag on: existing behaviour is unchanged', () => {
    mockExtra = ON;
    expect(routeFor('sponsor_bid', 'e1')).toBe('/(tabs)/parties/dashboard');
    expect(routeFor('payment_received', 'e1')).toBe('/(tabs)/parties/dashboard');
    expect(routeFor('sponsorship_request', 'e1')).toBe('/(tabs)/sponsorship');
    expect(routeFor('payment_due', 'e1')).toBe('/(tabs)/sponsorship/e1');
    expect(routeFor('payment_refunded', 'e1')).toBe('/(tabs)/sponsorship/e1');
    expect(routeFor('payout_sent', null)).toBeNull();
  });
});

describe('drawer items', () => {
  const tr = (k: string) => k;
  it('flag off: no Sponsorships or Wallet', () => {
    mockExtra = OFF;
    expect(sponsorMenuItems(tr, jest.fn())).toEqual([]);
  });
  it('flag on: Sponsorships and Wallet are present', () => {
    mockExtra = ON;
    expect(sponsorMenuItems(tr, jest.fn()).map((i) => i.label)).toEqual(['shell.menu.sponsorships', 'shell.menu.wallet']);
  });
});

describe('EventCard sponsor chip', () => {
  const texts = (json: unknown): string[] => {
    const out: string[] = [];
    const walk = (n: unknown) => {
      if (n == null) return;
      if (typeof n === 'string') { out.push(n); return; }
      if (Array.isArray(n)) { n.forEach(walk); return; }
      walk((n as { children?: unknown }).children);
    };
    walk(json);
    return out;
  };
  it('flag off: no sponsor tag is rendered', async () => {
    mockExtra = OFF;
    const r = await mount(<EventCard event={event} />);
    const all = texts(r.toJSON());
    expect(all.some((x) => x.includes('sponsorTag'))).toBe(false);
    expect(all).toContain('Cup Final');
  });
  it('flag on: the sponsor tag is rendered', async () => {
    mockExtra = ON;
    const r = await mount(<EventCard event={event} />);
    expect(texts(r.toJSON()).some((x) => x.includes('card.sponsorTagMore:Volt Cola'))).toBe(true);
  });
});

describe('sponsorship route guard', () => {
  it('flag off: redirects to Discover', async () => {
    mockExtra = OFF;
    const r = await mount(<SponsorshipLayout />);
    const redirects = r.root.findAllByType('Redirect');
    expect(redirects).toHaveLength(1);
    expect(redirects[0].props.href).toBe('/(tabs)/discover');
    expect(r.root.findAllByType('Stack')).toHaveLength(0);
  });
  it('flag on: renders the sponsorship stack', async () => {
    mockExtra = ON;
    const r = await mount(<SponsorshipLayout />);
    expect(r.root.findAllByType('Redirect')).toHaveLength(0);
    expect(r.root.findAllByType('Stack')).toHaveLength(1);
  });
});
