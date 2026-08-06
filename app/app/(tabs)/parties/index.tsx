import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
  ActivityIndicator, Image, Linking, Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
          {waitlisted && <Badge label="Waitlisted" tone="live" />}
          <Badge label={tonight ? 'Tonight' : 'Upcoming'} tone={tonight ? 'accent' : 'neutral'} dot={tonight} />
        </View>

        <View style={s.titleRow}>
          <Text style={[t.headlineMd, s.cardTitle]} numberOfLines={3}>{e.title}</Text>
          <View style={s.timeCol}>
            <Text style={[t.monoData, { color: colors.live }]}>
              {e.startsAt ? timeLabel(e.startsAt, e.venueTimezone) : 'TBD'}
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
            <Btn label="Get Directions" variant="secondary" small onPress={() => Linking.openURL(maps)} />
          </View>
        )}
      </View>
    </View>
  );
}

function HostingCard({ event, onManage }: { event: ApiDashboardEvent; onManage: () => void }) {
  const { going, waitlisted, interested } = event.rsvpCounts;
  return (
    <View style={[s.card, { borderTopColor: colors.accentDim }]}>
      <View style={s.cardBody}>
        <View style={s.badgeRow}>
          <Badge
            label={event.status}
            tone={event.status === 'published' ? 'volt' : 'neutral'}
            dot={event.status === 'published'}
          />
        </View>

        <View style={s.titleRow}>
          <Text style={[t.headlineMd, s.cardTitle]} numberOfLines={3}>{event.title}</Text>
          <View style={s.timeCol}>
            <Text style={[t.monoData, { color: colors.live }]}>
              {event.startsAt ? timeLabel(event.startsAt, event.venueTimezone) : 'TBD'}
            </Text>
            {event.startsAt && (
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>{dateLabel(event.startsAt, event.venueTimezone)}</Text>
            )}
          </View>
        </View>

        <View style={s.statsRow}>
          {[
            { label: 'Going', val: going, color: colors.volt },
            { label: 'Waitlist', val: waitlisted, color: colors.live },
            { label: 'Interested', val: interested, color: colors.textSecondary },
          ].map(({ label, val, color }) => (
            <View key={label} style={s.stat}>
              <Text style={[t.monoData, s.statVal, { color }]}>{val}</Text>
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={s.cardFooter}>
          <Btn label="Manage" variant="secondary" small onPress={onManage} />
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
      else setError(msg || 'Could not load your parties.');
    } finally {
      setRefreshing(false);
    }
  }, [auth.status]);

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

  return (
    <View style={s.container}>
      <AppHeader />

      <View style={s.headerBlock}>
        <Text style={[t.headlineLg, { color: colors.accent }]}>My Parties</Text>

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
                  {key}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {needsAuth ? (
        <GuestGate
          title="Get in the game"
          message="Sign in to track your RSVPs and run your own watch parties."
          redirect="/(tabs)/parties"
        />
      ) : showSpinner ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[t.labelCaps, { color: colors.textTertiary }]}>Loading</Text>
        </View>
      ) : error && activeData === null ? (
        <View style={s.center}>
          <Text style={[t.headlineMd, s.stateTitle]}>Signal lost</Text>
          <Text style={[t.bodyMd, s.stateBody]}>{error}</Text>
          <Btn label="Retry" variant="secondary" onPress={() => load(tab)} />
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
              <Text style={[t.headlineMd, s.stateTitle]}>No parties yet</Text>
              <Text style={[t.bodyMd, s.stateBody]}>
                RSVP to a watch party and it will show up here.
              </Text>
              <Btn label="Find a Party" onPress={() => router.push('/(tabs)/discover')} />
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
            // Extra clearance so the floating Create Party button never
            // covers the last card.
            { paddingBottom: insets.bottom + spacing['4xl'] + spacing['2xl'] },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={[t.headlineMd, s.stateTitle]}>Host your first party</Text>
              <Text style={[t.bodyMd, s.stateBody]}>
                Create a watch party and rally the squad.
              </Text>
              <Btn label="Create Party" onPress={() => router.push('/(tabs)/parties/create' as never)} />
            </View>
          }
          renderItem={({ item }) => (
            <HostingCard event={item} onManage={() => router.push('/(tabs)/parties/dashboard' as never)} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating CREATE PARTY action — hosts already have parties here, so
          they shouldn't need to switch to the dashboard just to make another. */}
      {tab === 'hosting' && !needsAuth && !showSpinner && (hosted?.length ?? 0) > 0 && (
        <View style={[s.fabWrap, { bottom: insets.bottom + spacing.xl }]}>
          <Btn label="+ Create Party" onPress={() => router.push('/(tabs)/parties/create' as never)} />
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

  fabWrap: { position: 'absolute', right: spacing.lg },

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
