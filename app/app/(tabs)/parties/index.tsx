import React, { useState, useCallback } from 'react';
import {
  View, FlatList, StyleSheet, RefreshControl, Image,
} from 'react-native';
import { Text } from '../../../components/Text';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '../../../components/AppHeader';
import { Btn, Badge, SegmentedControl, EventCardSkeleton, EmptyState, ErrorState } from '../../../components/ui';
import { GuestGate } from '../../../components/AuthGate';
import { useAuth } from '../../../lib/auth';
import {
  API_BASE, fetchMyRsvps, fetchDashboard,
  type ApiRsvp, type ApiEvent, type ApiDashboardEvent,
} from '../../../lib/api';
import { colors, radius, spacing, elevation, type as t } from '../../../lib/theme';
import { useOpenDirections, hasDirectionsTarget } from '../../../lib/directions';
import { formatEventDateTime } from '../../../lib/dateFormat';

type TabKey = 'attending' | 'hosting';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function timeLabel(iso: string, venueTimezone: string | null = null) {
  return formatEventDateTime(iso, venueTimezone).timeStr;
}

function dateLabel(iso: string, venueTimezone: string | null = null) {
  return formatEventDateTime(iso, venueTimezone).dateStr;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

function AttendingCard({ rsvp }: { rsvp: ApiRsvp }) {
  const { t: tr } = useTranslation('parties');
  const e = rsvp.event as ApiEvent;
  const tonight = !!e.startsAt && isToday(e.startsAt);
  const waitlisted = rsvp.state === 'waitlisted';
  const openDirections = useOpenDirections();
  const hasMaps = hasDirectionsTarget({ lat: e.venueLat, lng: e.venueLng, address: e.venueAddress });
  // Urgency (waitlisted / tonight) is carried by the live Badge, not a border.

  return (
    <View style={s.card}>
      <View style={s.cardClip}>
      {e.coverImageUrl && (
        <Image source={{ uri: `${API_BASE}${e.coverImageUrl}` }} style={s.cardCover} resizeMode="cover" />
      )}
      <View style={s.cardBody}>
        <View style={s.badgeRow}>
          {waitlisted && <Badge label={tr('myParties.waitlisted')} tone="live" />}
          <Badge
            label={tonight ? tr('myParties.tonight') : tr('myParties.upcoming')}
            tone={tonight ? 'live' : 'neutral'}
            dot={tonight}
          />
        </View>

        <View style={s.titleRow}>
          <Text style={[t.headlineMd, s.cardTitle]} numberOfLines={3}>{e.title}</Text>
          <View style={s.timeCol}>
            <Text style={[t.monoData, { color: tonight ? colors.live : colors.textPrimary }]}>
              {e.startsAt ? timeLabel(e.startsAt, e.venueTimezone) : tr('myParties.tbd')}
            </Text>
            {e.startsAt && (
              <Text style={[t.labelSm, { color: colors.textTertiary }]}>{dateLabel(e.startsAt, e.venueTimezone)}</Text>
            )}
          </View>
        </View>

        {(e.venueName || e.venueAddress) && (
          <View style={s.venueRow}>
            <Text style={[t.bodyMd, { color: colors.textSecondary }]} numberOfLines={2}>
              {[e.venueName, e.venueAddress].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}

        {hasMaps && (
          <View style={s.cardFooter}>
            <Btn label={tr('myParties.getDirections')} variant="secondary" small onPress={() => openDirections({ lat: e.venueLat, lng: e.venueLng, name: e.venueName, address: e.venueAddress })} />
          </View>
        )}
      </View>
      </View>
    </View>
  );
}

function HostingCard({ event, onManage }: { event: ApiDashboardEvent; onManage: () => void }) {
  const { t: tr } = useTranslation('parties');
  const { going, waitlisted, interested } = event.rsvpCounts;
  return (
    <View style={s.card}>
      <View style={s.cardClip}>
      <View style={s.cardBody}>
        <View style={s.badgeRow}>
          <Badge
            label={tr(`myParties.statusLabels.${event.status}`, { defaultValue: event.status })}
            tone={event.status === 'published' ? 'confirmed' : 'neutral'}
            dot={event.status === 'published'}
          />
        </View>

        <View style={s.titleRow}>
          <Text style={[t.headlineMd, s.cardTitle]} numberOfLines={3}>{event.title}</Text>
          <View style={s.timeCol}>
            <Text style={[t.monoData, { color: colors.textPrimary }]}>
              {event.startsAt ? timeLabel(event.startsAt, event.venueTimezone) : tr('myParties.tbd')}
            </Text>
            {event.startsAt && (
              <Text style={[t.labelSm, { color: colors.textTertiary }]}>{dateLabel(event.startsAt, event.venueTimezone)}</Text>
            )}
          </View>
        </View>

        <View style={s.statsRow}>
          {[
            { label: tr('myParties.stats.going'), val: going, color: colors.confirmed },
            { label: tr('myParties.stats.waitlist'), val: waitlisted, color: colors.live },
            { label: tr('myParties.stats.interested'), val: interested, color: colors.textSecondary },
          ].map(({ label, val, color }) => (
            <View key={label} style={s.stat}>
              <Text style={[t.dataMd, { color }]}>{val}</Text>
              <Text style={[t.labelSm, { color: colors.textTertiary }]}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={s.cardFooter}>
          <Btn label={tr('myParties.manage')} variant="secondary" small onPress={onManage} />
        </View>
      </View>
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MyPartiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { t: tr } = useTranslation('parties');
  const { t: trCommon } = useTranslation('common');

  const [tab, setTab] = useState<TabKey>('attending');
  const [rsvps, setRsvps] = useState<ApiRsvp[] | null>(null);
  const [hosted, setHosted] = useState<ApiDashboardEvent[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);

  const load = useCallback(async (which: TabKey) => {
    if (auth.status !== 'authenticated') {
      setNeedsAuth(true);
      setRefreshing(false);
      return;
    }
    setNeedsAuth(false);
    setError('');
    try {
      if (which === 'attending') setRsvps(await fetchMyRsvps());
      else setHosted(await fetchDashboard());
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'unauthorized') setNeedsAuth(true);
      else setError(msg || tr('myParties.loadError'));
    } finally {
      setRefreshing(false);
    }
  }, [auth.status, tr]);

  useFocusEffect(useCallback(() => { load(tab); }, [load, tab]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(tab);
  }, [load, tab]);

  const attendingItems = (rsvps ?? [])
    .filter((r) => r.event && r.state !== 'cancelled')
    .sort((a, b) => {
      const ta = a.event?.startsAt ? new Date(a.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.event?.startsAt ? new Date(b.event.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });

  const activeData = tab === 'attending' ? rsvps : hosted;
  const showSpinner = !needsAuth && activeData === null && !error;

  const showCreateFooter =
    tab === 'hosting' && !needsAuth && !showSpinner && (hosted?.length ?? 0) > 0;

  return (
    <View style={s.container}>
      <AppHeader />

      <View style={s.headerBlock}>
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>{tr('myParties.title')}</Text>

        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { key: 'attending', label: tr('myParties.tabs.attending') },
            { key: 'hosting', label: tr('myParties.tabs.hosting') },
          ]}
        />
      </View>

      {needsAuth ? (
        <GuestGate
          title={tr('myParties.guestGate.title')}
          message={tr('myParties.guestGate.message')}
          redirect="/(tabs)/parties"
        />
      ) : showSpinner ? (
        <View style={[s.list, { gap: spacing.lg }]} accessibilityLabel={tr('myParties.loading')}>
          <EventCardSkeleton />
          <EventCardSkeleton />
        </View>
      ) : error && activeData === null ? (
        <ErrorState
          title={tr('myParties.signalLost')}
          message={error}
          retryLabel={trCommon('retry')}
          onRetry={() => load(tab)}
        />
      ) : tab === 'attending' ? (
        <FlatList
          data={attendingItems}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing['2xl'] }]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.action} />}
          ListEmptyComponent={
            <EmptyState
              icon="ball"
              title={tr('myParties.emptyAttending.title')}
              body={tr('myParties.emptyAttending.body')}
              actionLabel={tr('myParties.emptyAttending.cta')}
              onAction={() => router.push('/(tabs)/discover')}
            />
          }
          renderItem={({ item }) => <AttendingCard rsvp={item} />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={hosted ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[
            s.list,
            // Extra clearance so the sticky Create Party footer never
            // covers the last card.
            {
              paddingBottom: showCreateFooter
                ? insets.bottom + spacing['4xl'] + spacing['2xl']
                : insets.bottom + spacing['2xl'],
            },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.action} />}
          ListEmptyComponent={
            <EmptyState
              icon="parties"
              title={tr('myParties.emptyHosting.title')}
              body={tr('myParties.emptyHosting.body')}
              actionLabel={tr('myParties.emptyHosting.cta')}
              onAction={() => router.push('/(tabs)/parties/create' as never)}
            />
          }
          renderItem={({ item }) => (
            <HostingCard event={item} onManage={() => router.push('/(tabs)/parties/dashboard' as never)} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Sticky CREATE PARTY footer — hosts already have parties here, so
          they shouldn't need to switch to the dashboard just to make another.
          Mirrors the sticky RSVP bar pattern on discover/[id].tsx. */}
      {showCreateFooter && (
        <View style={[s.footerBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Btn
            label={tr('myParties.createFooter')}
            onPress={() => router.push('/(tabs)/parties/create' as never)}
            style={s.footerBtn}
          />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },

  headerBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.lg,
  },

  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },

  // Outer = opaque surface + soft shadow; inner clips the cover (iOS drops a
  // shadow on an overflow:hidden view).
  card: { ...elevation(1), borderRadius: radius.card },
  cardClip: { overflow: 'hidden', borderRadius: radius.card, backgroundColor: colors.surface1 },
  cardCover: { width: '100%', height: 150 },
  cardBody: { padding: spacing.lg, gap: spacing.md },
  badgeRow: { flexDirection: 'row', gap: spacing.sm },
  titleRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  cardTitle: { flex: 1, color: colors.textPrimary },
  timeCol: { alignItems: 'flex-end' },

  venueRow: {},

  statsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md,
  },

  footerBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    ...elevation(1),
    shadowOffset: { width: 0, height: -2 },
  },
  footerBtn: { width: '100%' },
});
