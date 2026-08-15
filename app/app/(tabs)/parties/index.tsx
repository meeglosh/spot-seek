import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
  ActivityIndicator, Image, Linking, Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '../../../components/AppHeader';
import { Btn, Badge } from '../../../components/ui';
import { GuestGate } from '../../../components/AuthGate';
import { useAuth } from '../../../lib/auth';
import {
  API_BASE, fetchMyRsvps, fetchDashboard,
  type ApiRsvp, type ApiEvent, type ApiDashboardEvent,
} from '../../../lib/api';
import { colors, palette, spacing, type as t } from '../../../lib/theme';
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

// Maps deep link for GET DIRECTIONS — coords win, address is the fallback.
function directionsUrl(e: ApiEvent): string | null {
  if (e.venueLat != null && e.venueLng != null) {
    const dest = `${e.venueLat},${e.venueLng}`;
    return Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${dest}`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  }
  if (e.venueAddress) {
    const dest = encodeURIComponent(e.venueAddress);
    return Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${dest}`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  }
  return null;
}

// ─── Cards ───────────────────────────────────────────────────────────────────

function AttendingCard({ rsvp }: { rsvp: ApiRsvp }) {
  const { t: tr } = useTranslation('parties');
  const e = rsvp.event as ApiEvent;
  const tonight = !!e.startsAt && isToday(e.startsAt);
  const waitlisted = rsvp.state === 'waitlisted';
  const maps = directionsUrl(e);
  const topColor = waitlisted ? colors.live : tonight ? colors.accent : palette.outlineVariant;

  return (
    <View style={[s.card, { borderTopColor: topColor }]}>
      {e.coverImageUrl && (
        <Image source={{ uri: `${API_BASE}${e.coverImageUrl}` }} style={s.cardCover} resizeMode="cover" />
      )}
      <View style={s.cardBody}>
        <View style={s.badgeRow}>
          {waitlisted && <Badge label={tr('myParties.waitlisted')} tone="live" />}
          <Badge
            label={tonight ? tr('myParties.tonight') : tr('myParties.upcoming')}
            tone={tonight ? 'accent' : 'neutral'}
            dot={tonight}
          />
        </View>

        <View style={s.titleRow}>
          <Text style={[t.headlineMd, s.cardTitle]} numberOfLines={3}>{e.title}</Text>
          <View style={s.timeCol}>
            <Text style={[t.monoData, { color: colors.live }]}>
              {e.startsAt ? timeLabel(e.startsAt, e.venueTimezone) : tr('myParties.tbd')}
            </Text>
            {e.startsAt && (
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>{dateLabel(e.startsAt, e.venueTimezone)}</Text>
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

        {maps && (
          <View style={s.cardFooter}>
            <Btn label={tr('myParties.getDirections')} variant="secondary" small onPress={() => Linking.openURL(maps)} />
          </View>
        )}
      </View>
    </View>
  );
}

function HostingCard({ event, onManage }: { event: ApiDashboardEvent; onManage: () => void }) {
  const { t: tr } = useTranslation('parties');
  const { going, waitlisted, interested } = event.rsvpCounts;
  return (
    <View style={[s.card, { borderTopColor: colors.accentDim }]}>
      <View style={s.cardBody}>
        <View style={s.badgeRow}>
          <Badge
            label={tr(`myParties.statusLabels.${event.status}`, { defaultValue: event.status })}
            tone={event.status === 'published' ? 'volt' : 'neutral'}
            dot={event.status === 'published'}
          />
        </View>

        <View style={s.titleRow}>
          <Text style={[t.headlineMd, s.cardTitle]} numberOfLines={3}>{event.title}</Text>
          <View style={s.timeCol}>
            <Text style={[t.monoData, { color: colors.live }]}>
              {event.startsAt ? timeLabel(event.startsAt, event.venueTimezone) : tr('myParties.tbd')}
            </Text>
            {event.startsAt && (
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>{dateLabel(event.startsAt, event.venueTimezone)}</Text>
            )}
          </View>
        </View>

        <View style={s.statsRow}>
          {[
            { label: tr('myParties.stats.going'), val: going, color: colors.volt },
            { label: tr('myParties.stats.waitlist'), val: waitlisted, color: colors.live },
            { label: tr('myParties.stats.interested'), val: interested, color: colors.textSecondary },
          ].map(({ label, val, color }) => (
            <View key={label} style={s.stat}>
              <Text style={[t.monoData, s.statVal, { color }]}>{val}</Text>
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={s.cardFooter}>
          <Btn label={tr('myParties.manage')} variant="secondary" small onPress={onManage} />
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
        <Text style={[t.headlineLg, { color: colors.accent }]}>{tr('myParties.title')}</Text>

        {/* Brutalist two-button segmented toggle */}
        <View style={s.tabs}>
          {(['attending', 'hosting'] as const).map((key) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[s.tabBtn, active && { backgroundColor: colors.fill }]}
              >
                <Text style={[t.labelCaps, { color: active ? colors.fillText : colors.textPrimary }]}>
                  {tr(`myParties.tabs.${key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {needsAuth ? (
        <GuestGate
          title={tr('myParties.guestGate.title')}
          message={tr('myParties.guestGate.message')}
          redirect="/(tabs)/parties"
        />
      ) : showSpinner ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[t.labelCaps, { color: colors.textTertiary }]}>{tr('myParties.loading')}</Text>
        </View>
      ) : error && activeData === null ? (
        <View style={s.center}>
          <Text style={[t.headlineMd, s.stateTitle]}>{tr('myParties.signalLost')}</Text>
          <Text style={[t.bodyMd, s.stateBody]}>{error}</Text>
          <Btn label={trCommon('retry')} variant="secondary" onPress={() => load(tab)} />
        </View>
      ) : tab === 'attending' ? (
        <FlatList
          data={attendingItems}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing['2xl'] }]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={[t.headlineMd, s.stateTitle]}>{tr('myParties.emptyAttending.title')}</Text>
              <Text style={[t.bodyMd, s.stateBody]}>
                {tr('myParties.emptyAttending.body')}
              </Text>
              <Btn label={tr('myParties.emptyAttending.cta')} onPress={() => router.push('/(tabs)/discover')} />
            </View>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={[t.headlineMd, s.stateTitle]}>{tr('myParties.emptyHosting.title')}</Text>
              <Text style={[t.bodyMd, s.stateBody]}>
                {tr('myParties.emptyHosting.body')}
              </Text>
              <Btn label={tr('myParties.emptyHosting.cta')} onPress={() => router.push('/(tabs)/parties/create' as never)} />
            </View>
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
  container: { flex: 1, backgroundColor: colors.bg },

  headerBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.lg,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceHigh,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    padding: spacing.xs,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },

  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },

  card: {
    backgroundColor: colors.card,
    borderTopWidth: 2,
    overflow: 'hidden',
  },
  cardCover: { width: '100%', height: 150 },
  cardBody: { padding: spacing.lg, gap: spacing.md },
  badgeRow: { flexDirection: 'row', gap: spacing.sm },
  titleRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  cardTitle: { flex: 1, color: colors.textPrimary },
  timeCol: { alignItems: 'flex-end' },

  venueRow: {
    borderLeftWidth: 2,
    borderLeftColor: palette.outlineVariant,
    paddingLeft: spacing.md,
  },

  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 20, lineHeight: 24 },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.md,
  },

  footerBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.separator,
  },
  footerBtn: { width: '100%' },

  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    gap: spacing.lg,
  },
  stateTitle: { color: colors.textPrimary, textAlign: 'center' },
  stateBody: { color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
});
