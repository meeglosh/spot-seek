import React from 'react';
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import {
  DEFAULT_EVENT_DURATION_MS, eventPhase, effectiveEndMs, hasEnded, presentationFor, canLeaveReview,
  newestFirst, soonestFirst,
} from '../lib/eventTime';
import { EventRsvpArea } from '../components/EventRsvpArea';
import { colors } from '../lib/theme';

const NOW = Date.parse('2026-10-08T20:00:00Z');
const H = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('eventPhase', () => {
  it('the default party length is a named 4 hours', () => {
    expect(DEFAULT_EVENT_DURATION_MS).toBe(4 * H);
  });

  it('no endsAt: live inside the 4h default, ended after it', () => {
    expect(eventPhase({ startsAt: iso(-1 * H) }, NOW)).toBe('live');
    expect(eventPhase({ startsAt: iso(-3 * H), endsAt: null }, NOW)).toBe('live');
    expect(eventPhase({ startsAt: iso(-5 * H), endsAt: null }, NOW)).toBe('ended');
  });

  it('exact boundaries: the instant of endsAt (or start + 4h) is still live; one ms later it has ended', () => {
    expect(eventPhase({ startsAt: iso(-3 * H), endsAt: iso(0) }, NOW)).toBe('live');
    expect(eventPhase({ startsAt: iso(-3 * H), endsAt: iso(-1) }, NOW)).toBe('ended');
    expect(eventPhase({ startsAt: iso(-4 * H) }, NOW)).toBe('live');
    expect(eventPhase({ startsAt: iso(-4 * H - 1) }, NOW)).toBe('ended');
  });

  it('a start instant exactly now is live; one ms ahead is upcoming', () => {
    expect(eventPhase({ startsAt: iso(0) }, NOW)).toBe('live');
    expect(eventPhase({ startsAt: iso(1) }, NOW)).toBe('upcoming');
  });

  it('in progress with an endsAt in the future is live', () => {
    expect(eventPhase({ startsAt: iso(-2 * H), endsAt: iso(2 * H) }, NOW)).toBe('live');
  });

  it('an explicit endsAt wins over the 4h default (a long party stays live past 4h)', () => {
    expect(eventPhase({ startsAt: iso(-6 * H), endsAt: iso(1 * H) }, NOW)).toBe('live');
  });

  it('an undated party is never ended', () => {
    expect(eventPhase({ startsAt: null, endsAt: null }, NOW)).toBe('upcoming');
    expect(eventPhase({}, NOW)).toBe('upcoming');
    expect(effectiveEndMs({})).toBeNull();
  });

  it('compares instants: the venue timezone cannot move the answer', () => {
    // 2026-10-08 23:30 in New York is 03:30Z the next day. Same instant, same phase.
    const startsAt = '2026-10-09T03:30:00Z';
    const sameInstantOffset = '2026-10-08T23:30:00-04:00';
    const now = Date.parse('2026-10-09T05:00:00Z');
    expect(eventPhase({ startsAt }, now)).toBe('live');
    expect(eventPhase({ startsAt: sameInstantOffset }, now)).toBe('live');
    expect(eventPhase({ startsAt }, now + 4 * H)).toBe('ended');
  });

  it('accepts a Date for now and ignores unparseable dates', () => {
    expect(eventPhase({ startsAt: iso(-9 * H) }, new Date(NOW))).toBe('ended');
    expect(eventPhase({ startsAt: 'not a date' }, NOW)).toBe('upcoming');
    expect(hasEnded({ startsAt: iso(-9 * H) }, NOW)).toBe(true);
    expect(hasEnded({ startsAt: iso(9 * H) }, NOW)).toBe(false);
  });

  it('newestFirst and soonestFirst put undated parties last', () => {
    const a = { startsAt: iso(-5 * H) };
    const b = { startsAt: iso(-1 * H) };
    const none = { startsAt: null };
    expect([a, none, b].sort(newestFirst)).toEqual([b, a, none]);
    expect([none, b, a].sort(soonestFirst)).toEqual([a, b, none]);
  });
});

describe('past-state presentation', () => {
  it('ended: Ended tag, muted, no RSVP, no directions, no You\'re in, calm panel', () => {
    expect(presentationFor('ended')).toEqual({
      tag: 'ended', muted: true, canRsvp: false, showDirections: false, showYoureIn: false, detailPanel: 'ended',
    });
  });

  it('live: On now tag, not muted, RSVP stays available', () => {
    expect(presentationFor('live')).toEqual({
      tag: 'live', muted: false, canRsvp: true, showDirections: true, showYoureIn: true, detailPanel: 'rsvp',
    });
  });

  it('upcoming: no tag, full RSVP area', () => {
    const p = presentationFor('upcoming');
    expect(p.tag).toBeNull();
    expect(p.muted).toBe(false);
    expect(p.canRsvp).toBe(true);
  });

  it('review is offered only for an ended party the viewer was going to, never to the host', () => {
    expect(canLeaveReview('ended', true, false)).toBe(true);
    expect(canLeaveReview('ended', false, false)).toBe(false);
    expect(canLeaveReview('ended', true, true)).toBe(false);
    expect(canLeaveReview('live', true, false)).toBe(false);
    expect(canLeaveReview('upcoming', true, false)).toBe(false);
  });

  it('muted text stays AA: secondary text on the card, canvas and tag surfaces is at least 4.5:1', () => {
    const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const L = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const bg of [colors.surface1, colors.canvas, colors.surface2]) {
      expect(ratio(colors.textSecondary, bg)).toBeGreaterThanOrEqual(4.5);
    }
    // The neutral Ended tag: primary text on the surface3 pill.
    expect(ratio(colors.textPrimary, colors.surface3)).toBeGreaterThanOrEqual(4.5);
    // Never orange or lime for the ended state.
    expect(presentationFor('ended').tag).not.toBe('live');
  });
});

type Mounted = { toJSON: () => unknown; unmount: () => void };
const mounted: Mounted[] = [];
afterEach(async () => {
  await act(async () => { mounted.splice(0).forEach((r) => r.unmount()); });
});
async function mount(el: React.ReactElement) {
  let root: Mounted | undefined;
  await act(async () => { root = TestRenderer.create(el); });
  mounted.push(root as Mounted);
  return root as Mounted;
}
const texts = (json: unknown): string[] => {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk((node as { children?: unknown }).children);
  };
  walk(json);
  return out;
};

describe('EventRsvpArea', () => {
  // i18n is not initialised in unit tests, so t() returns the key.
  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('upcoming and on now show the RSVP button, never the ended panel', async () => {
    for (const phase of ['upcoming', 'live'] as const) {
      const r = await mount(<EventRsvpArea phase={phase} rsvpLabel="RSVP" rsvpColor={colors.action} />);
      const t = texts(r.toJSON());
      expect(t).toContain('RSVP');
      expect(t).not.toContain('detail.ended.title');
    }
  });

  it('an RSVP stays cancellable while the party is on', async () => {
    const r = await mount(<EventRsvpArea phase="live" rsvpLabel="Going" rsvpColor={colors.confirmed} isActive />);
    expect(texts(r.toJSON())).toContain('detail.cancelRsvp');
  });

  it('ended replaces the RSVP bar: no RSVP, no cancel, the date shown', async () => {
    const r = await mount(
      <EventRsvpArea phase="ended" rsvpLabel="RSVP" rsvpColor={colors.action} isActive dateLabel="Sat, Oct 4" />,
    );
    const t = texts(r.toJSON());
    expect(t).toContain('detail.ended.title');
    expect(t).toContain('detail.ended.date');
    expect(t).not.toContain('RSVP');
    expect(t).not.toContain('detail.cancelRsvp');
    expect(t).not.toContain('detail.ended.review');
  });

  it('ended offers Leave a review only to someone who was going, and Edit once reviewed', async () => {
    const was = await mount(<EventRsvpArea phase="ended" rsvpLabel="" rsvpColor={colors.action} canReview />);
    expect(texts(was.toJSON())).toContain('detail.ended.review');
    const edit = await mount(<EventRsvpArea phase="ended" rsvpLabel="" rsvpColor={colors.action} canReview hasReview />);
    expect(texts(edit.toJSON())).toContain('detail.ended.editReview');
  });
});
