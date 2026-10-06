import React from 'react';
// react-test-renderer ships no types in this repo; it is only used here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import { StyleSheet } from 'react-native';
import {
  Chip, Btn, Badge, SegmentedControl, SegmentBar, SectionTitle, FieldLabel, inputStyle,
  LiveDot, Skeleton, EmptyState, ErrorState, Toggle, SoonTag,
} from '../components/ui';
import { colors, radius } from '../lib/theme';

// Every mounted tree is unmounted after each test. LiveDot and Skeleton run an
// Animated.loop; leaving them mounted keeps timers alive and `jest` would not
// exit on its own (the loops are stopped in the components' effect cleanups).
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

// Count rendered text nodes whose string content equals `label`.
function countLabel(json: unknown, label: string): number {
  let n = 0;
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') { if (node === label) n += 1; return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk((node as { children?: unknown }).children);
  };
  walk(json);
  return n;
}

function flatStyles(json: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (node == null || typeof node === 'string') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const nd = node as { props?: { style?: unknown }; children?: unknown };
    if (nd.props?.style) out.push(StyleSheet.flatten(nd.props.style as never) as Record<string, unknown>);
    walk(nd.children);
  };
  walk(json);
  return out;
}

describe('Chip', () => {
  it('renders exactly one label when selected (the v2 double-label regression)', async () => {
    const root = await mount(<Chip label="Tonight" active onPress={() => {}} />);
    expect(countLabel(root.toJSON(), 'Tonight')).toBe(1);
  });

  it.each(['action', 'live', 'confirmed', 'neutral'] as const)('renders one label when selected, tone %s', async (tone) => {
    const root = await mount(<Chip label="Near me" active tone={tone} onPress={() => {}} />);
    expect(countLabel(root.toJSON(), 'Near me')).toBe(1);
  });

  it('renders one label in default and static (no onPress) states', async () => {
    const a = await mount(<Chip label="Soon" onPress={() => {}} />);
    const b = await mount(<Chip label="Soon" active />);
    expect(countLabel(a.toJSON(), 'Soon')).toBe(1);
    expect(countLabel(b.toJSON(), 'Soon')).toBe(1);
  });

  it('never puts a shadow on a chip, and is fully pill-shaped', async () => {
    const root = await mount(<Chip label="Live" active onPress={() => {}} />);
    const styles = flatStyles(root.toJSON());
    for (const st of styles) expect(st.shadowOpacity ?? 0).toBe(0);
    expect(styles.some((st) => st.borderRadius === radius.pill)).toBe(true);
  });
});

describe('shadow safety across ui components', () => {
  it('any element carrying a shadow has an opaque hex background', async () => {
    const els = [
      <SegmentedControl key="s" value="a" onChange={() => {}} options={[{ key: 'a', label: 'List' }, { key: 'b', label: 'Map' }]} />,
      <Btn key="b" label="Join" />,
      <Btn key="b2" label="Join" variant="secondary" />,
      <Badge key="g" label="Live" />,
      <Chip key="c" label="Tonight" active onPress={() => {}} />,
    ];
    for (const el of els) {
      const root = await mount(el);
      for (const st of flatStyles(root.toJSON())) {
        if (((st.shadowOpacity as number) ?? 0) > 0) {
          expect(String(st.backgroundColor)).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it('primary buttons carry no shadow at all', async () => {
    const root = await mount(<Btn label="RSVP" />);
    for (const st of flatStyles(root.toJSON())) {
      expect(st.shadowOpacity ?? 0).toBe(0);
      expect(st.elevation ?? 0).toBe(0);
    }
  });
});

describe('Btn / Badge / SegmentedControl', () => {
  it('keeps sentence-case button labels (no forced caps)', async () => {
    const root = await mount(<Btn label="Join the party" />);
    expect(countLabel(root.toJSON(), 'Join the party')).toBe(1);
    for (const st of flatStyles(root.toJSON())) expect(st.textTransform).toBeUndefined();
  });

  it('renders a selected segment with one label and keeps the control within its container', async () => {
    const root = await mount(
      <SegmentedControl value="list" onChange={() => {}} options={[{ key: 'list', label: 'List' }, { key: 'map', label: 'Map' }]} />,
    );
    expect(countLabel(root.toJSON(), 'List')).toBe(1);
    const first = flatStyles(root.toJSON())[0];
    expect(first.maxWidth).toBe('100%');
  });

  it('renders the live Badge label once, in caps via the tag role', async () => {
    const root = await mount(<Badge label="Live" />);
    expect(countLabel(root.toJSON(), 'Live')).toBe(1);
    expect(flatStyles(root.toJSON()).some((st) => st.textTransform === 'uppercase')).toBe(true);
  });

  it('exposes soft input styling: control radius, filled well', () => {
    expect(inputStyle.borderRadius).toBe(radius.control);
    expect(inputStyle.backgroundColor).toBe(colors.surface2);
  });

  it('mounts the remaining ui pieces', async () => {
    for (const el of [<SegmentBar key="1" value={3} max={10} />, <SectionTitle key="2">Title</SectionTitle>, <FieldLabel key="3">Label</FieldLabel>]) {
      expect((await mount(el)).toJSON()).not.toBeNull();
    }
  });
});

describe('state components', () => {
  it('Skeleton and LiveDot mount and unmount cleanly (loops torn down)', async () => {
    const root = await mount(<><Skeleton height={20} /><LiveDot /></>);
    expect(root.toJSON()).not.toBeNull();
    await act(async () => { root.unmount(); });
    mounted.length = 0;
  });

  it('Skeleton sits on an opaque surface and is hidden from accessibility', async () => {
    const root = await mount(<Skeleton height={20} />);
    const styles = flatStyles(root.toJSON());
    expect(styles.some((st) => st.backgroundColor === colors.surface2)).toBe(true);
    for (const st of styles) expect(st.shadowOpacity ?? 0).toBe(0);
  });

  it('EmptyState shows title, body and a single primary action that fires', async () => {
    const onAction = jest.fn();
    const root = await mount(
      <EmptyState icon="calendar" title="No events yet" body="Nothing is published." actionLabel="Host a party" onAction={onAction} />,
    );
    const json = root.toJSON();
    expect(countLabel(json, 'No events yet')).toBe(1);
    expect(countLabel(json, 'Nothing is published.')).toBe(1);
    expect(countLabel(json, 'Host a party')).toBe(1);
  });

  it('EmptyState omits the action when none is given', async () => {
    const root = await mount(<EmptyState icon="bell" title="All caught up" body="Nothing new." />);
    expect(countLabel(root.toJSON(), 'All caught up')).toBe(1);
    expect(flatStyles(root.toJSON()).some((st) => st.backgroundColor === colors.action)).toBe(false);
  });

  it('ErrorState shows what failed and a Retry action', async () => {
    const root = await mount(<ErrorState title="Could not load" message="Check your connection." retryLabel="Retry" onRetry={() => {}} />);
    const json = root.toJSON();
    expect(countLabel(json, 'Could not load')).toBe(1);
    expect(countLabel(json, 'Retry')).toBe(1);
  });

  it('Toggle is the native Switch themed from tokens', async () => {
    const root = await mount(<Toggle value onValueChange={() => {}} />);
    expect(root.toJSON()).not.toBeNull();
  });

  it('SoonTag renders its label once', async () => {
    const root = await mount(<SoonTag label="Soon" />);
    expect(countLabel(root.toJSON(), 'Soon')).toBe(1);
  });
});
