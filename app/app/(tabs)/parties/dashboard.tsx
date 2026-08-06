import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  RefreshControl, ActivityIndicator, Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { Btn, SegmentBar } from '../../../components/ui';
import { GuestGate } from '../../../components/AuthGate';
import { useAuth } from '../../../lib/auth';
import {
  API_BASE, fetchDashboard, fetchHostAnalytics, fetchEventBids,
  type ApiDashboardEvent, type ApiHostAnalyticsEvent,
} from '../../../lib/api';
import { colors, palette, spacing, type as t } from '../../../lib/theme';
import { formatEventDateTime } from '../../../lib/dateFormat';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPast(e: ApiDashboardEvent): boolean {
  const ref = e.endsAt ?? e.startsAt;
  return ref != null && new Date(ref).getTime() < Date.now();
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function whenLabel(e: ApiDashboardEvent): string {
  if (!e.startsAt) return 'No date set';
  const { dateStr, timeStr } = formatEventDateTime(e.startsAt, e.venueTimezone);
  if (isToday(e.startsAt)) return `Tonight @ ${timeStr}`;
  return `${dateStr} @ ${timeStr}`;
}

function shortDate(iso: string, venueTimezone: string | null = null) {
  return formatEventDateTime(iso, venueTimezone).dateStr;
}

// $0 / $840 / $4.2K — real cents in, compact label out.
function fmtMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) {
    const k = dollars / 1000;
    const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    return `$${rounded}K`;
  }
  return `$${Math.round(dollars)}`;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CommandCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();

  const [events, setEvents] = useState<ApiDashboardEvent[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, ApiHostAnalyticsEvent>>({});
  const [pendingBidEvents, setPendingBidEvents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (auth.status !== 'authenticated') {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!silent) setError('');
    try {
      const [dash, hostAnalytics] = await Promise.all([
        fetchDashboard(),
        fetchHostAnalytics().catch(() => [] as ApiHostAnalyticsEvent[]),
      ]);
      setEvents(dash);
      setAnalytics(Object.fromEntries(hostAnalytics.map((e) => [e.id, e])));

      // Pending-sponsor status: real bids only, fetched per active event.
      const active = dash.filter((e) => e.status === 'published' && !isPast(e));
      const bids = await Promise.all(active.map((e) => fetchEventBids(e.id).catch(() => [])));
      setPendingBidEvents(Object.fromEntries(
        active.map((e, i) => [e.id, bids[i].some((b) => b.status === 'pending')]),
      ));
    } catch (err) {
      if (!silent) setError((err as Error).message || 'Could not load dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth.status]);

  // Reload when the screen regains focus so edits/creations show up.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  const edit = (eventId: string) =>
    router.push({ pathname: '/(tabs)/parties/create', params: { eventId, from: 'dashboard' } } as never);

  const findSponsors = (eventId: string) =>
    router.push({ pathname: '/(tabs)/sponsorship/browse', params: { eventId } } as never);

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader back />
        <GuestGate
          title="Command Center"
          message="Sign in to create and manage your watch parties."
          redirect="/(tabs)/parties/dashboard"
        />
      </View>
    );
  }

  const activeParties = events.filter((e) => e.status === 'published' && !isPast(e));
  const drafts = events.filter((e) => e.status === 'draft');
  const completed = events.filter((e) => e.status !== 'draft' && (isPast(e) || e.status === 'completed' || e.status === 'cancelled'));

  const totalRsvp = events.reduce((sum, e) => sum + e.rsvpCounts.going, 0);
  const sponsorRevCents = Object.values(analytics).reduce((sum, e) => sum + e.sponsorRevenueCents, 0);

  return (
    <View style={s.container}>
      <AppHeader back />

      {loading && !refreshing ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[t.labelCaps, { color: colors.textTertiary }]}>Loading</Text>
        </View>
      ) : error && events.length === 0 ? (
        <View style={s.center}>
          <Text style={[t.headlineMd, s.stateTitle]}>Signal lost</Text>
          <Text style={[t.bodyMd, s.stateBody]}>{error}</Text>
          <Btn label="Retry" variant="secondary" onPress={() => load()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing['4xl'] + spacing['2xl'] }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Header: eyebrow + headline + stat tiles */}
          <View style={s.headerBlock}>
            <Text style={[t.labelCaps, { color: colors.live }]}>Host Dashboard</Text>
            <Text style={[t.headlineLg, { color: colors.textPrimary }]}>Command Center</Text>

            <View style={s.statTiles}>
              <View style={s.statTile}>
                <Text style={[t.labelCapsSm, { color: colors.textSecondary }]}>Total RSVP</Text>
                <Text style={[t.monoData, s.statTileValue, { color: colors.accentDim }]}>
                  {totalRsvp.toLocaleString('en-US')}
                </Text>
              </View>
              <View style={s.statTile}>
                <Text style={[t.labelCapsSm, { color: colors.textSecondary }]}>Sponsor Rev</Text>
                <Text style={[t.monoData, s.statTileValue, { color: colors.volt }]}>
                  {fmtMoney(sponsorRevCents)}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Active parties ── */}
          <View style={s.sectionHeader}>
            <View style={s.liveDot} />
            <Text style={[t.headlineMd, { color: colors.textPrimary }]}>Active Parties</Text>
          </View>

          {activeParties.length === 0 ? (
            <Text style={[t.bodyMd, s.emptyLine]}>No live parties. Publish one to get on the board.</Text>
          ) : (
            activeParties.map((e) => {
              const stats = analytics[e.id];
              const sponsored = (stats?.activeSponsorships ?? 0) > 0;
              const pending = !sponsored && pendingBidEvents[e.id];
              const going = e.rsvpCounts.going;
              return (
                <View key={e.id} style={s.activeCard}>
                  {e.coverImageUrl && (
                    <Image
                      source={{ uri: `${API_BASE}${e.coverImageUrl}` }}
                      style={s.activeCover}
                      resizeMode="cover"
                    />
                  )}
                  <Text style={[t.headlineMd, { color: colors.textPrimary }]} numberOfLines={2}>
                    {e.title}
                  </Text>
                  <Text style={[t.monoData, { color: colors.textSecondary }]}>{whenLabel(e)}</Text>

                  <View style={s.rsvpRow}>
                    <Text style={[t.bodyMd, { color: colors.textPrimary }]}>RSVPs</Text>
                    <Text style={[t.monoData, { color: colors.accentDim }]}>
                      {e.capacity != null ? `${going} / ${e.capacity}` : `${going}`}
                    </Text>
                  </View>
                  {e.capacity != null && e.capacity > 0 && (
                    <SegmentBar value={going} max={e.capacity} tone={colors.accentDim} />
                  )}

                  <View style={s.activeFooter}>
                    {sponsored ? (
                      <Text style={[t.labelCaps, { color: colors.volt }]}>Sponsored</Text>
                    ) : pending ? (
                      <Text style={[t.labelCaps, { color: colors.textSecondary }]}>Pending Sponsor</Text>
                    ) : (
                      <Btn label="Find Sponsors" variant="ghost" small onPress={() => findSponsors(e.id)} />
                    )}
                    <Btn label="Manage" variant="secondary" small onPress={() => edit(e.id)} />
                  </View>
                </View>
              );
            })
          )}

          {/* ── Drafts ── */}
          <Text style={[t.headlineMd, s.dimSectionTitle]}>Drafts</Text>
          {drafts.length === 0 ? (
            <Text style={[t.bodyMd, s.emptyLine]}>No drafts on the bench.</Text>
          ) : (
            drafts.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => edit(e.id)}
                style={({ pressed }) => [s.rowCard, pressed && s.rowPressed]}
              >
                <View style={s.rowText}>
                  <Text style={[t.bodyLg, s.rowTitle]} numberOfLines={1}>{e.title}</Text>
                  <Text style={[t.monoData, { color: colors.textSecondary }]}>
                    Edited {shortDate(e.updatedAt)}
                  </Text>
                </View>
                <Text style={s.rowArrow}>→</Text>
              </Pressable>
            ))
          )}

          {/* ── Completed ── */}
          <Text style={[t.headlineMd, s.dimSectionTitle]}>Completed</Text>
          {completed.length === 0 ? (
            <Text style={[t.bodyMd, s.emptyLine]}>Nothing in the record books yet.</Text>
          ) : (
            completed.map((e) => {
              const stats = analytics[e.id];
              const sponsored = (stats?.activeSponsorships ?? 0) > 0;
              const attendees = stats?.confirmedAttendees ?? e.rsvpCounts.going;
              const endRef = e.endsAt ?? e.startsAt;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => edit(e.id)}
                  style={({ pressed }) => [s.rowCard, s.completedCard, pressed && s.rowPressed]}
                >
                  <View style={s.rowText}>
                    <Text style={[t.bodyLg, s.rowTitle, s.struck]} numberOfLines={1}>{e.title}</Text>
                    <Text style={[t.monoData, { color: colors.textSecondary }]}>
                      {e.status === 'cancelled'
                        ? 'Cancelled'
                        : endRef ? `Ended ${shortDate(endRef, e.venueTimezone)}` : 'Ended'}
                    </Text>
                  </View>
                  <View style={s.rowRight}>
                    {sponsored && <Text style={[t.labelCapsSm, { color: colors.volt }]}>Sponsored</Text>}
                    <Text style={[t.monoData, { color: colors.textSecondary }]}>{attendees} attendees</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Floating CREATE PARTY action */}
      {auth.status === 'authenticated' && !loading && (
        <View style={[s.fabWrap, { bottom: insets.bottom + spacing.xl }]}>
          <Btn
            label="+ Create Party"
            onPress={() => router.push({ pathname: '/(tabs)/parties/create', params: { from: 'dashboard' } } as never)}
          />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg },

  headerBlock: {
    gap: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: palette.surfaceHighest,
    paddingBottom: spacing.xl,
  },
  statTiles: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  statTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    backgroundColor: colors.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  statTileValue: { fontSize: 24, lineHeight: 30 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.live },
  dimSectionTitle: { color: colors.textSecondary, marginTop: spacing.xl },
  emptyLine: { color: colors.textTertiary },

  activeCard: {
    backgroundColor: palette.surfaceLowest,
    borderTopWidth: 1,
    borderTopColor: colors.accentDim,
    padding: spacing.lg,
    gap: spacing.md,
  },
  activeCover: {
    width: '100%',
    height: 128,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
  },
  rsvpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: palette.surfaceHighest,
    paddingBottom: spacing.sm,
  },
  activeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },

  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: palette.surfaceHighest,
    backgroundColor: colors.card,
    padding: spacing.lg,
  },
  rowPressed: { borderColor: colors.accentDim },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.textPrimary, textTransform: 'uppercase' },
  rowArrow: { color: colors.accentDim, fontSize: 20 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  completedCard: { opacity: 0.7, backgroundColor: palette.surfaceMid },
  struck: { textDecorationLine: 'line-through' },

  fabWrap: { position: 'absolute', right: spacing.lg },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    gap: spacing.lg,
  },
  stateTitle: { color: colors.textPrimary, textAlign: 'center' },
  stateBody: { color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
});
