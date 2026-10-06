// DEV-ONLY visual-QA gallery: every ui.tsx component in default / selected /
// pressed / disabled states, plus the Discover header controls. Never imported
// from product code; reached only through app/__gallery.tsx (see its gate).
//
// Run (Debug build + Metro; a free port, 8081 is often taken):
//   cd app && EXPO_PUBLIC_GALLERY=1 EXPO_PUBLIC_START_ROUTE=__gallery \
//     [EXPO_PUBLIC_GALLERY_PAGER=1] npx expo run:ios --device <UDID> --port 8082
// Env vars are inlined at Metro start: restart Metro (and note CI=1 disables
// file watching) after changing code. Release builds never include this.
import React, { useEffect, useState } from 'react';
import { ScrollView, View, TextInput, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../Text';
import { Icon } from '../icons';
import {
  Badge, BackLink, Btn, Chip, FieldLabel, HardShadow, LiveDot, SectionTitle,
  SegmentBar, SegmentedControl, inputStyle,
} from '../ui';
import { colors, radius, spacing, TAP, type as t } from '../../lib/theme';

// With EXPO_PUBLIC_GALLERY_PAGER=1 only one block shows at a time (cycling every
// 5s, top-aligned): lets timed `simctl io screenshot` capture every block while
// a blocking system dialog covers the middle of the screen.
const PAGER = process.env.EXPO_PUBLIC_GALLERY_PAGER === '1';
const PageCtx = React.createContext<number>(-1);
const PAGES = 9;

function Block({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const page = React.useContext(PageCtx);
  if (PAGER && page !== n) return null;
  return (
    <View style={s.block}>
      <Text style={[t.labelCaps, { color: colors.textTertiary }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

// Static "pressed" replicas: the real components own their press state, so the
// pushed-in look is shown via HardShadow's `pressed` prop with the same faces.
function PressedChip({ label }: { label: string }) {
  return (
    <HardShadow offset={3} pressed contentStyle={[s.chipFace, { backgroundColor: colors.actionSelectedFill, borderColor: colors.action }]}>
      <Text style={[t.labelCapsSm, { color: colors.action }]}>{label}</Text>
    </HardShadow>
  );
}

function PressedBtn({ label }: { label: string }) {
  return (
    <HardShadow offset={4} pressed contentStyle={[s.btnFace, { backgroundColor: colors.action }]}>
      <Text style={[t.labelCaps, { color: colors.textOnFill }]}>{label}</Text>
    </HardShadow>
  );
}

function Tile({ label, sub, on }: { label: string; sub: string; on: boolean }) {
  return (
    <HardShadow
      offset={3}
      active={on}
      style={{ flex: 1 }}
      contentStyle={[s.tileFace, on && { borderColor: colors.action, backgroundColor: colors.actionSelectedFill }]}
    >
      <Text style={[t.labelCaps, { color: on ? colors.action : colors.textPrimary }]}>{label}</Text>
      <Text style={[t.bodySm, { color: colors.textSecondary }]}>{sub}</Text>
    </HardShadow>
  );
}

export default function Gallery() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [tab, setTab] = useState<'attending' | 'hosting'>('attending');
  const [when, setWhen] = useState('week');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (!PAGER) return undefined;
    const id = setInterval(() => setPage((p) => (p + 1) % PAGES), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <PageCtx.Provider value={page}>
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing['3xl'], paddingHorizontal: spacing.lg, gap: spacing.xl }}
      testID="gallery"
    >
      <Text style={[t.headlineLg, { color: colors.textPrimary }]}>UI GALLERY</Text>

      <Block n={0} title="DISCOVER HEADER (as shipped, This Week selected)">
        <View style={s.controlsRow}>
          <SegmentedControl
            iconOnly
            value={mode}
            onChange={setMode}
            options={[
              { key: 'list', label: 'List', icon: 'list' },
              { key: 'map', label: 'Map', icon: 'map' },
            ]}
          />
          <View style={s.searchRow}>
            <Icon name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={s.searchInput}
              placeholder="SEARCH EVENTS..."
              placeholderTextColor={colors.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <View style={s.filterBtn}>
            <Icon name="filter" size={20} color={colors.textSecondary} />
          </View>
        </View>
        <View style={s.chipRow}>
          {([['week', 'This week'], ['today', 'Today'], ['near', 'Near me'], ['all', 'All']] as const).map(([k, l]) => (
            <Chip key={k} label={l} active={when === k} onPress={() => setWhen(k)} />
          ))}
        </View>
      </Block>

      <Block n={1} title="SEGMENTED CONTROL, labelled (full width)">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[{ key: 'attending', label: 'Attending' }, { key: 'hosting', label: 'Hosting' }]}
        />
        <SegmentedControl
          value="list"
          onChange={() => {}}
          options={[{ key: 'list', label: 'List', icon: 'list' }, { key: 'map', label: 'Map', icon: 'map' }]}
        />
      </Block>

      <Block n={2} title="BTN: primary / pressed / disabled">
        <Btn label="Primary" onPress={() => {}} />
        <PressedBtn label="Primary (pressed)" />
        <Btn label="Primary disabled" disabled />
      </Block>
      <Block n={3} title="BTN: secondary / ghost / danger / small">
        <Btn label="Secondary" variant="secondary" onPress={() => {}} />
        <Btn label="Ghost" variant="ghost" onPress={() => {}} />
        <Btn label="Danger" variant="danger" onPress={() => {}} />
        <Row><Btn label="Small" small onPress={() => {}} /><Btn label="Small 2" small variant="secondary" onPress={() => {}} /></Row>
      </Block>

      <Block n={4} title="CHIP: default / selected (each tone) / pressed / static / trailing icon">
        <Row>
          <Chip label="Default" onPress={() => {}} />
          <Chip label="Selected" active onPress={() => {}} />
          <PressedChip label="Pressed" />
        </Row>
        <Row>
          <Chip label="Live" tone="live" active onPress={() => {}} />
          <Chip label="Confirmed" tone="confirmed" active onPress={() => {}} />
          <Chip label="Neutral" tone="neutral" active onPress={() => {}} />
        </Row>
        <Row>
          <Chip label="Static tag" />
          <Chip label="Static selected" active tone="confirmed" />
          <Chip label="Barcelona" trailingIcon="close" active onPress={() => {}} />
        </Row>
      </Block>

      <Block n={5} title="SELECTED CARDS (privacy tiles, interest row)">
        <Row><Tile label="Public" sub="Anyone can find it" on /><Tile label="Private" sub="Invite only" on={false} /></Row>
        <HardShadow
          offset={3}
          contentStyle={[s.rowFace, { borderColor: colors.action, backgroundColor: colors.actionSelectedFill }]}
        >
          <Text style={[t.labelCaps, { color: colors.action, flex: 1 }]}>Football</Text>
          <Icon name="chevronUp" size={18} color={colors.action} />
        </HardShadow>
        <HardShadow active={false} offset={3} contentStyle={[s.rowFace, { borderColor: colors.borderSubtle, backgroundColor: colors.surface2 }]}>
          <Text style={[t.labelCaps, { color: colors.textPrimary, flex: 1 }]}>Basketball</Text>
          <Icon name="chevronDown" size={18} color={colors.textTertiary} />
        </HardShadow>
      </Block>

      <Block n={6} title="MAP CHIPS + PINS (HardShadow round)">
        <Row>
          <HardShadow offset={3} contentStyle={[s.mapChip, { borderColor: colors.action }]}>
            <Text style={[t.labelCapsSm, { color: colors.action }]}>Live now</Text>
          </HardShadow>
          <HardShadow offset={3} active={false} contentStyle={s.mapChip}>
            <Text style={[t.labelCapsSm, { color: colors.textSecondary }]}>Football</Text>
          </HardShadow>
          <HardShadow offset={2} round fill={false} style={{ marginLeft: 2, transform: [{ scale: 1.3 }] }} contentStyle={[s.pin, { borderColor: colors.action, backgroundColor: colors.surfaceSunken }]}>
            <View style={[s.pinCore, { backgroundColor: colors.action }]} />
          </HardShadow>
          <HardShadow offset={2} active={false} round fill={false} style={{ marginLeft: 2 }} contentStyle={[s.pin, { borderColor: colors.live }]}>
            <View style={[s.pinCore, { backgroundColor: colors.live }]} />
          </HardShadow>
        </Row>
      </Block>

      <Block n={7} title="BADGE / LIVE DOT / SEGMENT BAR">
        <Row>
          <Badge label="Live soon" tone="live" />
          <Badge label="Going" tone="confirmed" />
          <Badge label="Open" tone="action" />
          <Badge label="Football" tone="neutral" dot={false} />
          <LiveDot />
        </Row>
        <SegmentBar value={6} max={10} />
      </Block>

      <Block n={8} title="BACK LINK / SECTION TITLE / FIELD LABEL / INPUT">
        <BackLink label="Back" onPress={() => {}} />
        <SectionTitle>Section title</SectionTitle>
        <FieldLabel>Field label</FieldLabel>
        <TextInput style={inputStyle} placeholder="Underlined input" placeholderTextColor={colors.textTertiary} />
      </Block>
    </ScrollView>
    </PageCtx.Provider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  block: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  searchRow: {
    flex: 1, minHeight: TAP, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2,
    borderBottomWidth: 2, borderBottomColor: colors.borderStrong, paddingHorizontal: spacing.md, gap: spacing.sm,
  },
  searchInput: { ...t.labelMd, flex: 1, color: colors.textPrimary, minHeight: TAP - 4, paddingVertical: spacing.sm },
  filterBtn: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.borderSubtle,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipFace: {
    borderWidth: 2, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  btnFace: { alignItems: 'center', justifyContent: 'center', minHeight: TAP + 8, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  tileFace: {
    minHeight: TAP, borderWidth: 2, borderColor: colors.borderSubtle, padding: spacing.lg, alignItems: 'center', gap: spacing.sm,
  },
  rowFace: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TAP, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderWidth: 2,
  },
  mapChip: {
    backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  pin: {
    width: 22, height: 22, borderRadius: radius.round, borderWidth: 2, backgroundColor: colors.mapPin,
    alignItems: 'center', justifyContent: 'center',
  },
  pinCore: { width: 8, height: 8, borderRadius: radius.round },
});
