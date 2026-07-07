import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, useColorScheme,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth';
import { fetchDashboard, type ApiDashboardEvent } from '../../../lib/api';
import { light, dark, fonts, spacing, radius, palette } from '../../../lib/theme';

const STATUS_COLOR: Record<string, string> = {
  published: palette.green,
  draft:     palette.gray400,
  cancelled: palette.red,
  completed: palette.gray400,
};

export default function HostDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const auth = useAuth();

  const [events, setEvents] = useState<ApiDashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function load(silent = false) {
    if (auth.status !== 'authenticated') {
      setLoading(false);
      return;
    }
    if (!silent) setError('');
    try {
      const data = await fetchDashboard();
      setEvents(data);
    } catch (err) {
      if (!silent) setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Reload when this tab comes into focus (so newly created events appear).
  useFocusEffect(useCallback(() => { load(); }, [auth.status]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [auth.status]);

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (auth.status !== 'authenticated') {
    return (
      <View style={[s.container, { backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <Text style={[s.emptyTitle, { color: c.textPrimary, fontFamily: fonts.display }]}>Host an event</Text>
        <Text style={[s.emptyBody, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
          Sign in to create and manage your watch parties.
        </Text>
        <Pressable style={[s.primaryBtn, { backgroundColor: c.fill }]} onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={[{ color: c.fillText, fontFamily: fonts.sansSemiBold, fontSize: 15 }]}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={[s.title, { color: c.textPrimary, fontFamily: fonts.display }]}>Your events</Text>
        <Pressable
          style={[s.createBtn, { backgroundColor: c.fill }]}
          onPress={() => router.push('/(tabs)/host/create')}
        >
          <Text style={[s.createBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>+ New event</Text>
        </Pressable>
      </View>

      {/* Loading */}
      {loading && !refreshing ? (
        <View style={s.center}>
          <ActivityIndicator color={c.textSecondary} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={[{ color: c.textSecondary, fontFamily: fonts.sansRegular, fontSize: 15 }]}>{error}</Text>
          <Pressable style={[s.retryBtn, { backgroundColor: c.fillSubtle }]} onPress={() => load()}>
            <Text style={[{ color: c.fillSubtleText, fontFamily: fonts.sansMedium, fontSize: 14 }]}>Retry</Text>
          </Pressable>
        </View>
      ) : events.length === 0 ? (
        <View style={s.center}>
          <Text style={[s.emptyTitle, { color: c.textPrimary, fontFamily: fonts.display }]}>Host your first event</Text>
          <Text style={[s.emptyBody, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
            Create a watch party and invite people to join.
          </Text>
          <Pressable
            style={[s.primaryBtn, { backgroundColor: c.fill }]}
            onPress={() => router.push('/(tabs)/host/create')}
          >
            <Text style={[{ color: c.fillText, fontFamily: fonts.sansSemiBold, fontSize: 15 }]}>Create an event</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.xl }]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textTertiary} />}
          renderItem={({ item: e }) => {
            const dateStr = e.startsAt
              ? new Date(e.startsAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              : 'No date set';
            const { going, waitlisted, interested } = e.rsvpCounts;
            return (
              <Pressable
                style={[s.eventCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}
                onPress={() => router.push({ pathname: '/(tabs)/host/create', params: { eventId: e.id } })}
              >
                <View style={s.cardTop}>
                  <View style={s.cardMeta}>
                    <Text style={[s.cardSubject, { color: c.textTertiary, fontFamily: fonts.sansMedium }]}>
                      {e.broadcastSubject}
                    </Text>
                    <Text style={[s.cardTitle, { color: c.textPrimary, fontFamily: fonts.display }]} numberOfLines={2}>
                      {e.title}
                    </Text>
                    <Text style={[s.cardDate, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>{dateStr}</Text>
                  </View>
                  <View style={s.cardRight}>
                    <View style={[s.statusPill, { backgroundColor: (STATUS_COLOR[e.status] ?? palette.gray400) + '20' }]}>
                      <Text style={[s.statusText, { color: STATUS_COLOR[e.status] ?? palette.gray400, fontFamily: fonts.sansMedium }]}>
                        {e.status}
                      </Text>
                    </View>
                    <Text style={[s.editHint, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>Edit →</Text>
                  </View>
                </View>

                {/* RSVP stats */}
                <View style={[s.statsRow, { borderTopColor: c.separator }]}>
                  {[
                    { label: 'Going',      val: going,      color: palette.green },
                    { label: 'Waitlisted', val: waitlisted, color: palette.amber },
                    { label: 'Interested', val: interested, color: c.textSecondary },
                  ].map(({ label, val, color }) => (
                    <View key={label} style={s.stat}>
                      <Text style={[s.statVal, { color, fontFamily: fonts.sansBold }]}>{val}</Text>
                      <Text style={[s.statLabel, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.lg,
  },
  title: { fontSize: 28 },
  createBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: radius.full },
  createBtnText: { fontSize: 14 },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  eventCard: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', padding: spacing.lg, gap: spacing.md },
  cardMeta: { flex: 1, gap: 3 },
  cardSubject: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  cardTitle: { fontSize: 20, lineHeight: 24 },
  cardDate: { fontSize: 13 },
  cardRight: { alignItems: 'flex-end', gap: spacing.xs },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full },
  statusText: { fontSize: 11 },
  editHint: { fontSize: 11 },
  statsRow: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 22 },
  statLabel: { fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'], gap: spacing.lg },
  emptyTitle: { fontSize: 28, textAlign: 'center' },
  emptyBody: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  primaryBtn: { paddingHorizontal: spacing['3xl'], paddingVertical: spacing.md, borderRadius: radius.md },
  retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
});
