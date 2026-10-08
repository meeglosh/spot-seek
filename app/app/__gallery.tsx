import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, TextInput, StyleSheet, ActionSheetIOS, Alert, Platform, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import { AppHeader } from '../components/AppHeader';
import { EventCard, type EventItem } from '../components/EventCard';
import { EventRsvpArea } from '../components/EventRsvpArea';
import { Icon, ICON_NAMES } from '../components/icons';
import { YoureIn } from '../components/YoureIn';
import { ReportForm, ReportSheet } from '../components/ReportSheet';
import { ModerationBanner } from '../components/ModerationBanner';
import { BlockedRow } from './blocked';
import {
  Btn, Chip, Badge, SegmentedControl, SegmentBar, SectionTitle, FieldLabel,
  LiveDot, Press, Toggle, Skeleton, EventCardSkeleton, RowSkeleton, EmptyState, ErrorState, SoonTag,
  inputStyle, inputFocusedStyle,
} from '../components/ui';
import {
  colors, radius, spacing, TAP, elevation, press, type as t,
} from '../lib/theme';

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY component gallery (visual QA for the Soft Brutalist system).
//
// GATING. This route is unreachable in Release builds:
//   1. The screen returns <Redirect href="/" /> unless `__DEV__` is true.
//   2. app/index.tsx only redirects here when `__DEV__` is true AND the
//      EXPO_PUBLIC_START_ROUTE env var names a route, e.g.
//        EXPO_PUBLIC_START_ROUTE=/__gallery npx expo start --port 8081
//      Without the var (or in Release) the root redirect is unchanged.
//   No auth or deep link is needed. `?y=<px>` scrolls the gallery to an offset
//   (e.g. EXPO_PUBLIC_START_ROUTE="/__gallery?y=900") so every section can be
//   screenshotted from the simulator without touch automation. `&sheet=1`
//   opens the filter form sheet on mount (same reason).
// ─────────────────────────────────────────────────────────────────────────────

// A frozen "pressed" frame: the same scale + opacity dip <Press> animates to.
function Pressed({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ opacity: press.dip, transform: [{ scale: press.scale }] }}>{children}</View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.block}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </View>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.cell}>
      <Text style={[t.labelSm, { color: colors.textTertiary }]}>{label}</Text>
      {children}
    </View>
  );
}

const SAMPLE_EVENT: EventItem = {
  id: 'gallery-1',
  title: 'Arsenal v Spurs: North London Derby',
  broadcastSubject: 'Premier League',
  startsAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
  venueName: 'The Gunners Arms',
  status: 'published',
  hostName: 'Maya',
  goingCount: 42,
  sponsorCount: 2,
  topSponsor: 'Volt Cola',
  venueTimezone: 'Europe/London',
};

const SAMPLE_QUIET: EventItem = {
  ...SAMPLE_EVENT,
  id: 'gallery-2',
  title: 'Quiet one: Sunday league recap',
  startsAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
  topSponsor: null,
  sponsorCount: 0,
};

// Phase variants (visual QA for the ended / on-now / upcoming states). The
// cover is a bundled asset so the dimmed "ended" cover can be judged.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GALLERY_COVER = Image.resolveAssetSource(require('../assets/onboarding/onboarding-host.jpg')).uri;
const HOUR = 3600_000;
const SAMPLE_UPCOMING: EventItem = {
  ...SAMPLE_EVENT, id: 'gallery-up', title: 'Upcoming: Champions League night',
  startsAt: new Date(Date.now() + 2 * 86400_000).toISOString(), coverImageUrl: GALLERY_COVER,
};
const SAMPLE_LIVE: EventItem = {
  ...SAMPLE_EVENT, id: 'gallery-live', title: 'On now: Arsenal v Spurs',
  startsAt: new Date(Date.now() - HOUR).toISOString(),
  endsAt: new Date(Date.now() + 2 * HOUR).toISOString(), coverImageUrl: GALLERY_COVER,
};
const SAMPLE_PAST: EventItem = {
  ...SAMPLE_EVENT, id: 'gallery-past', title: 'Ended: Cup final watch party',
  startsAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
  endsAt: new Date(Date.now() - 3 * 86400_000 + 3 * HOUR).toISOString(), coverImageUrl: GALLERY_COVER,
};

const SWATCHES: ReadonlyArray<[string, string]> = [
  ['canvas', colors.canvas], ['surface1', colors.surface1], ['surface2', colors.surface2],
  ['surface3', colors.surface3], ['action', colors.action], ['actionMuted', colors.actionMuted],
  ['live', colors.live], ['confirmed', colors.confirmed], ['danger', colors.danger],
];

export default function Gallery() {
  const insets = useSafeAreaInsets();
  const { t: trMod } = useTranslation('moderation');
  const { y, sheet, moment: momentParam, report, block } = useLocalSearchParams<{
    y?: string; sheet?: string; moment?: string; report?: string; block?: string;
  }>();
  const [reportOpen, setReportOpen] = useState(false);
  // The block confirmation, with the exact copy useBlockHost shows (name: Maya).
  const showBlockConfirm = React.useCallback(() => {
    const title = trMod('block.title', { name: 'Maya' });
    const message = trMod('block.message');
    const confirm = trMod('block.confirm', { name: 'Maya' });
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, message, options: [confirm, trMod('cancel')], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        () => {},
      );
    } else {
      Alert.alert(title, message, [{ text: trMod('cancel'), style: 'cancel' }, { text: confirm, style: 'destructive' }]);
    }
  }, [trMod]);
  // `&report=1` opens the real report page sheet and `&block=1` the block
  // confirmation, both 2.5s after mount, so simulator screenshots can catch them.
  useEffect(() => {
    if (!__DEV__) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (report === '1') timers.push(setTimeout(() => setReportOpen(true), 2500));
    if (block === '1') timers.push(setTimeout(showBlockConfirm, 2500));
    return () => timers.forEach(clearTimeout);
  }, [report, block, showBlockConfirm]);
  const [moment, setMoment] = useState<'going' | 'waitlisted' | null>(null);
  // `&moment=going|waitlisted` replays the "You're in." moment every 4s from
  // 3s after mount, so a burst of simulator screenshots can catch any frame.
  useEffect(() => {
    if (!__DEV__ || (momentParam !== 'going' && momentParam !== 'waitlisted')) return;
    const play = () => { setMoment(null); setTimeout(() => setMoment(momentParam), 150); };
    const first = setTimeout(play, 3000);
    const every = setInterval(play, 4000);
    return () => { clearTimeout(first); clearInterval(every); };
  }, [momentParam]);
  const router = useRouter();
  const scroller = useRef<ScrollView>(null);
  const [seg, setSeg] = useState<'list' | 'map'>('list');
  const [seg2, setSeg2] = useState<'a' | 'b' | 'c'>('b');
  const [time, setTime] = useState('Tonight');
  const [focus, setFocus] = useState<string | null>(null);
  const [name, setName] = useState('Derby day at the Arms');
  const [search, setSearch] = useState('');
  const [notify, setNotify] = useState(true);
  const [venue, setVenue] = useState(false);

  // The filter is a form sheet over the Discover feed, so the feed has to be
  // underneath it: open Discover first, then present the sheet on top.
  const openSheet = React.useCallback(() => {
    router.push('/(tabs)/discover' as never);
    setTimeout(() => router.push('/(tabs)/discover/filter' as never), 1200);
  }, [router]);

  useEffect(() => {
    if (__DEV__ && sheet === '1') openSheet();
  }, [sheet, openSheet]);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <View style={s.container}>
      <AppHeader />
      <ScrollView
        ref={scroller}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing['4xl'] }]}
        onContentSizeChange={() => {
          const offset = Number(y);
          if (offset > 0) scroller.current?.scrollTo({ y: offset, animated: false });
        }}
      >
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>Component gallery</Text>
        <Text style={[t.bodySm, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          Dev only. Soft Brutalist system: states are default, selected, pressed, disabled.
        </Text>

        <Block title="Colour and elevation">
          <View style={s.swatchRow}>
            {SWATCHES.map(([n, c]) => (
              <View key={n} style={s.swatchWrap}>
                <View style={[s.swatch, { backgroundColor: c }]} />
                <Text style={[t.labelSm, { color: colors.textSecondary }]}>{n}</Text>
              </View>
            ))}
          </View>
          <View style={s.ladder}>
            {([0, 1, 2, 3] as const).map((lvl) => (
              <View key={lvl} style={[s.ladderStep, elevation(lvl)]}>
                <Text style={[t.label, { color: colors.textPrimary }]}>Level {lvl}</Text>
              </View>
            ))}
          </View>
        </Block>

        <Block title="Type">
          <Text style={[t.displayHero, { color: colors.textPrimary }]}>Hero</Text>
          <Text style={[t.displayXl, { color: colors.textPrimary }]}>Display XL</Text>
          <Text style={[t.headlineLg, { color: colors.textPrimary }]}>Headline large</Text>
          <Text style={[t.headlineMd, { color: colors.textPrimary }]}>Headline medium</Text>
          <Text style={[t.headlineSm, { color: colors.textPrimary }]}>Headline small</Text>
          <Text style={[t.bodyLg, { color: colors.textPrimary }]}>Body large, Archivo Narrow Medium</Text>
          <Text style={[t.bodyMd, { color: colors.textSecondary }]}>Body medium for reading, warm grey on the canvas.</Text>
          <Text style={[t.button, { color: colors.textPrimary }]}>Button label, sentence case</Text>
          <Text style={[t.label, { color: colors.textSecondary }]}>Label, Space Grotesk Medium</Text>
          <Text style={[t.tag, { color: colors.textTertiary }]}>Tag, tonight</Text>
          <Text style={[t.monoData, { color: colors.textPrimary }]}>19:45 · 42 going · £1,250</Text>
        </Block>

        <Block title="Buttons">
          {(['primary', 'secondary', 'ghost', 'danger'] as const).map((v) => (
            <View key={v} style={s.stateRow}>
              <Cell label={`${v}: default`}><Btn label="Join the party" variant={v} /></Cell>
              <Cell label="pressed"><Pressed><Btn label="Join the party" variant={v} /></Pressed></Cell>
              <Cell label="disabled"><Btn label="Join the party" variant={v} disabled /></Cell>
            </View>
          ))}
          <Cell label="small"><View style={s.inline}><Btn label="Join" small /><Btn label="Details" small variant="secondary" /></View></Cell>
        </Block>

        <Block title="Chips">
          <Cell label="default / selected / pressed">
            <View style={s.inline}>
              <Chip label="Tonight" onPress={() => {}} />
              <Chip label="Tonight" active onPress={() => {}} />
              <Pressed><Chip label="Tonight" onPress={() => {}} /></Pressed>
              <Pressed><Chip label="Tonight" active onPress={() => {}} /></Pressed>
            </View>
          </Cell>
          <Cell label="tones, selected">
            <View style={s.inline}>
              <Chip label="Action" active tone="action" onPress={() => {}} />
              <Chip label="Live now" active tone="live" onPress={() => {}} />
              <Chip label="Going" active tone="confirmed" onPress={() => {}} />
              <Chip label="Neutral" active tone="neutral" onPress={() => {}} />
            </View>
          </Cell>
          <Cell label="static tag / removable">
            <View style={s.inline}>
              <Chip label="Premier League" />
              <Chip label="Arsenal" active trailingIcon="close" onPress={() => {}} />
            </View>
          </Cell>
          <Cell label="disabled (dimmed wrapper)">
            <View style={[s.inline, { opacity: 0.4 }]} pointerEvents="none">
              <Chip label="Near me" onPress={() => {}} />
              <Chip label="Near me" active onPress={() => {}} />
            </View>
          </Cell>
        </Block>

        <Block title="Badges">
          <View style={s.inline}>
            <Badge label="Live" tone="live" />
            <Badge label="Tonight" tone="live" dot={false} />
            <Badge label="Going" tone="confirmed" />
            <Badge label="Open" tone="action" />
            <Badge label="Premier League" tone="neutral" dot={false} />
            <Badge label="Volt Cola" tone="confirmed" icon="live" />
          </View>
          <View style={s.inline}><LiveDot /><Text style={[t.labelSm, { color: colors.textSecondary }]}>Live dot pulse (static under Reduce Motion)</Text></View>
        </Block>

        <Block title="Segmented control">
          <Cell label="hug (default), 2 options">
            <SegmentedControl
              value={seg}
              onChange={setSeg}
              options={[
                { key: 'list', label: 'List', icon: 'list' },
                { key: 'map', label: 'Map', icon: 'map' },
              ]}
            />
          </Cell>
          <Cell label="fill, 3 options">
            <SegmentedControl
              fill
              value={seg2}
              onChange={setSeg2}
              options={[{ key: 'a', label: 'Today' }, { key: 'b', label: 'This week' }, { key: 'c', label: 'Later' }]}
            />
          </Cell>
          <Cell label="narrow container (240pt): must not overflow">
            <View style={{ width: 240, backgroundColor: colors.surface1, padding: 8, borderRadius: radius.card }}>
              <SegmentedControl
                value={seg}
                onChange={setSeg}
                options={[
                  { key: 'list', label: 'List view', icon: 'list' },
                  { key: 'map', label: 'Map view', icon: 'map' },
                ]}
              />
            </View>
          </Cell>
        </Block>

        <Block title="Progress">
          <SegmentBar value={6} max={10} />
          <SegmentBar value={9} max={10} tone={colors.confirmed} />
        </Block>

        <Block title="Discover header controls">
          <Text style={[t.headlineLg, { color: colors.textPrimary }]}>Discover</Text>
          <View style={s.controlsRow}>
            <SegmentedControl
              value={seg}
              onChange={setSeg}
              options={[
                { key: 'list', label: 'List', icon: 'list', accessibilityLabel: 'List view' },
                { key: 'map', label: 'Map', icon: 'map', accessibilityLabel: 'Map view' },
              ]}
            />
            <View style={s.searchRow}>
              <Icon name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={s.searchInput}
                placeholder="Search events"
                placeholderTextColor={colors.textTertiary}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            <Press style={[s.filterBtn, s.filterBtnActive]} accessibilityRole="button" accessibilityLabel="Filters">
              <Icon name="filter" size={20} color={colors.action} />
              <View style={s.filterBadge}><Text style={[t.labelSm, { color: colors.textOnFill }]}>2</Text></View>
            </Press>
          </View>
          <View style={s.inline}>
            {['Tonight', 'This week', 'Near me', 'All'].map((f) => (
              <Chip key={f} label={f} active={time === f} onPress={() => setTime(f)} />
            ))}
          </View>
        </Block>

        <Block title="Event card">
          <EventCard event={SAMPLE_EVENT} />
          <EventCard event={SAMPLE_QUIET} compact />
        </Block>

        <Block title="Event card: upcoming, on now, ended">
          <EventCard event={SAMPLE_UPCOMING} />
          <EventCard event={SAMPLE_LIVE} />
          <EventCard event={SAMPLE_PAST} />
          <EventCard event={{ ...SAMPLE_PAST, id: 'gallery-past-c', coverImageUrl: null }} compact />
        </Block>

        <Block title="Detail RSVP area: upcoming, on now, ended">
          <Cell label="upcoming">
            <View style={s.rsvpFrame}>
              <EventRsvpArea phase="upcoming" rsvpLabel="RSVP" rsvpColor={colors.action} style={s.rsvpStatic} />
            </View>
          </Cell>
          <Cell label="on now (RSVP stays available)">
            <View style={s.rsvpFrame}>
              <EventRsvpArea phase="live" rsvpLabel="Going" rsvpColor={colors.confirmed} isActive style={s.rsvpStatic} />
            </View>
          </Cell>
          <Cell label="ended, viewer was going">
            <View style={s.rsvpFrame}>
              <EventRsvpArea phase="ended" rsvpLabel="" rsvpColor={colors.action} dateLabel="Sat, Oct 4" canReview style={s.rsvpStatic} />
            </View>
          </Cell>
          <Cell label="ended, viewer was not going">
            <View style={s.rsvpFrame}>
              <EventRsvpArea phase="ended" rsvpLabel="" rsvpColor={colors.action} dateLabel="Sat, Oct 4" style={s.rsvpStatic} />
            </View>
          </Cell>
        </Block>

        <Block title="Moderation: report sheet">
          <Btn label={trMod('menu.report')} variant="secondary" onPress={() => setReportOpen(true)} />
          <Cell label="form, reason picked (inline preview of the page sheet)">
            <View style={s.stateCard}>
              <View style={{ padding: spacing.lg }}>
                <ReportForm
                  eventId="gallery-1"
                  initialReason="harassment"
                  onClose={() => {}}
                  submitReport={async () => ({ duplicate: false })}
                />
              </View>
            </View>
          </Cell>
          <Cell label="confirmation, with the Block this host follow-up">
            <View style={s.stateCard}>
              <View style={{ padding: spacing.lg }}>
                <ReportForm eventId="gallery-1" initialStep="sent" onClose={() => {}} onBlockHost={() => {}} />
              </View>
            </View>
          </Cell>
        </Block>

        <Block title="Moderation: block host">
          <Text style={[t.bodyMd, { color: colors.textSecondary }]}>
            {trMod('block.title', { name: 'Maya' })} {trMod('block.message')}
          </Text>
          <Btn label={trMod('block.confirm', { name: 'Maya' })} variant="danger" onPress={showBlockConfirm} />
          <Cell label="Settings, Blocked people: row">
            <BlockedRow person={{ displayName: 'Maya Okafor', avatarUrl: null }} onUnblock={() => {}} />
          </Cell>
          <Cell label="Settings, Blocked people: empty">
            <View style={s.stateCard}>
              <EmptyState icon="users" title={trMod('blocked.emptyTitle')} body={trMod('blocked.empty')} />
            </View>
          </Cell>
        </Block>

        <Block title="Moderation: host banners">
          <Cell label="hidden (under review)"><ModerationBanner kind="hidden" /></Cell>
          <Cell label="removed"><ModerationBanner kind="removed" /></Cell>
        </Block>

        <Block title="Skeletons (opaque shimmer, static under Reduce Motion)">
          <EventCardSkeleton />
          <RowSkeleton />
          <View style={s.inline}>
            <Skeleton width={56} height={56} radius={radius.round} />
            <Skeleton width={160} height={18} />
          </View>
        </Block>

        <Block title="Empty and error states">
          <View style={s.stateCard}>
            <EmptyState
              icon="calendar"
              title="No events yet"
              body="Nothing is published for this window."
              actionLabel="Host a party"
              onAction={() => {}}
            />
          </View>
          <View style={s.stateCard}>
            <ErrorState
              title="Couldn't load events"
              message="Check your connection and try again."
              retryLabel="Retry"
              onRetry={() => {}}
            />
          </View>
        </Block>

        <Block title="Native controls">
          <View style={s.toggleRow}>
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>Email reminders (on)</Text>
            <Toggle value={notify} onValueChange={setNotify} />
          </View>
          <View style={s.toggleRow}>
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>Add a venue (off)</Text>
            <Toggle value={venue} onValueChange={setVenue} />
          </View>
          <View style={s.toggleRow}>
            <Text style={[t.bodyMd, { color: colors.textTertiary }]}>Wallet</Text>
            <SoonTag label="Soon" />
          </View>
          <Btn
            label="Open the filter sheet"
            variant="secondary"
            onPress={openSheet}
          />
        </Block>

        <Block title="Sample form">
          <View style={s.form}>
            <View>
              <FieldLabel>Event name</FieldLabel>
              <TextInput
                style={[inputStyle, focus === 'name' && inputFocusedStyle]}
                value={name}
                onChangeText={setName}
                onFocus={() => setFocus('name')}
                onBlur={() => setFocus(null)}
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View>
              <FieldLabel>Venue (focused look)</FieldLabel>
              <TextInput
                style={[inputStyle, inputFocusedStyle]}
                value="The Gunners Arms"
                editable={false}
              />
            </View>
            <View>
              <FieldLabel>Capacity (placeholder)</FieldLabel>
              <TextInput
                style={inputStyle}
                placeholder="Leave empty for unlimited"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View style={s.inline}>
              <Btn label="Save draft" variant="secondary" style={{ flex: 1 }} />
              <Btn label="Publish" style={{ flex: 1 }} />
            </View>
          </View>
        </Block>

        <Block title="You're in (phase 5 moment)">
          <View style={s.inline}>
            <Btn label="Play: going" onPress={() => setMoment('going')} />
            <Btn label="Play: waitlisted" variant="secondary" onPress={() => setMoment('waitlisted')} />
          </View>
        </Block>

        <Block title="Icons (round caps and joins, 2px)">
          <View style={s.iconGrid}>
            {ICON_NAMES.map((n) => (
              <View key={n} style={s.iconCell}>
                <Icon name={n} size={24} color={colors.textPrimary} />
                <Text style={[t.labelSm, { color: colors.textTertiary }]} numberOfLines={1}>{n}</Text>
              </View>
            ))}
          </View>
        </Block>
      </ScrollView>
      <ReportSheet
        visible={reportOpen}
        eventId="gallery-1"
        onClose={() => setReportOpen(false)}
        onBlockHost={() => setReportOpen(false)}
      />
      {moment && (
        <YoureIn
          visible
          state={moment}
          title={SAMPLE_EVENT.title}
          when="Sat 14 Mar at 17:30"
          canGetDirections
          onShare={() => setMoment(null)}
          onDirections={() => setMoment(null)}
          onDone={() => setMoment(null)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  block: { gap: spacing.md, marginBottom: spacing.sm },
  cell: { gap: spacing.xs + 2 },
  rsvpFrame: { backgroundColor: colors.canvas, borderRadius: radius.card, overflow: 'hidden' },
  rsvpStatic: { position: 'relative', paddingBottom: spacing.lg },
  stateRow: { gap: spacing.md },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },

  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatchWrap: { gap: 4, width: 78 },
  swatch: { height: 44, borderRadius: radius.control, borderWidth: 1, borderColor: colors.borderSubtle },
  ladder: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  ladderStep: { flex: 1, height: 84, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },

  controlsRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: { ...t.labelMd, flex: 1, color: colors.textPrimary, minHeight: TAP - 4, paddingVertical: spacing.sm },
  filterBtn: {
    width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2, borderRadius: radius.control, borderWidth: 1, borderColor: 'transparent',
  },
  filterBtnActive: { borderColor: colors.action },
  filterBadge: {
    position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, paddingHorizontal: 4,
    backgroundColor: colors.textPrimary, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
  },

  form: { gap: spacing.lg },
  stateCard: { backgroundColor: colors.surface1, borderRadius: radius.card },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TAP },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  iconCell: { width: 72, alignItems: 'center', gap: 4 },
});
