import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, useColorScheme,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth';
import { fetchFollowCounts, fetchMyRsvps, fetchFavourites, type ApiRsvp, type ApiFavourite } from '../../../lib/api';
import { light, dark, fonts, spacing, radius, palette } from '../../../lib/theme';

const STATE_COLOR: Record<string, string> = {
  going:      palette.green,
  waitlisted: palette.amber,
  interested: palette.gray400,
  cancelled:  palette.red,
};

type ProfileData = {
  followers: number;
  following: number;
  rsvps: ApiRsvp[];
  favourites: ApiFavourite[];
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const auth = useAuth();

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (auth.status !== 'authenticated') { setLoading(false); return; }
    try {
      const [counts, rsvps, favourites] = await Promise.all([
        fetchFollowCounts(auth.user.id),
        fetchMyRsvps(),
        fetchFavourites(),
      ]);
      setData({ followers: counts.followers, following: counts.following, rsvps, favourites });
    } catch {
      // non-fatal — show what we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, [auth.status]));
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [auth.status]);

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (auth.status !== 'authenticated') {
    return (
      <View style={[s.container, { backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <Text style={[s.unauthTitle, { color: c.textPrimary, fontFamily: fonts.display }]}>Your profile</Text>
        <Text style={[s.unauthBody, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
          Sign in to track your RSVPs and host events.
        </Text>
        <Pressable style={[s.signInBtn, { backgroundColor: c.fill }]} onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={[{ color: c.fillText, fontFamily: fonts.sansSemiBold, fontSize: 15 }]}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const { user } = auth;
  const activeRsvps = data?.rsvps.filter((r) => r.state !== 'cancelled') ?? [];
  const upcomingRsvps = activeRsvps.filter((r) => {
    if (!r.event?.startsAt) return true;
    return new Date(r.event.startsAt) >= new Date();
  });

  return (
    <ScrollView
      style={[s.container, { backgroundColor: c.bg }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textTertiary} />}
    >
      {/* Avatar + name */}
      <View style={[s.profileHeader, { paddingTop: insets.top + spacing.lg }]}>
        <View style={[s.avatar, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
          <Text style={[s.avatarInitial, { color: c.textPrimary, fontFamily: fonts.display }]}>
            {user.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[s.name, { color: c.textPrimary, fontFamily: fonts.display }]}>{user.name}</Text>
        <Text style={[s.email, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>{user.email}</Text>

        {/* Social stats */}
        {loading ? (
          <ActivityIndicator color={c.textTertiary} style={{ marginTop: spacing.md }} />
        ) : (
          <View style={s.stats}>
            {[
              { label: 'Following', val: data?.following ?? 0 },
              { label: 'Followers', val: data?.followers ?? 0 },
            ].map(({ label, val }) => (
              <View key={label} style={s.stat}>
                <Text style={[s.statVal, { color: c.textPrimary, fontFamily: fonts.sansBold }]}>{val}</Text>
                <Text style={[s.statLabel, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>{label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* My RSVPs */}
      <View style={[s.section, { paddingHorizontal: spacing.xl }]}>
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>
            Upcoming RSVPs
          </Text>
          <Text style={[s.sectionCount, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>
            {upcomingRsvps.length}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={c.textTertiary} />
        ) : upcomingRsvps.length === 0 ? (
          <Pressable
            style={[s.emptyCard, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}
            onPress={() => router.push('/(tabs)/discover')}
          >
            <Text style={[s.emptyCardText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
              No upcoming RSVPs. Browse events →
            </Text>
          </Pressable>
        ) : (
          <View style={s.rsvpList}>
            {upcomingRsvps.map((r) => {
              const event = r.event;
              const dateStr = event?.startsAt
                ? new Date(event.startsAt).toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'short',
                  })
                : null;
              return (
                <Pressable
                  key={r.id}
                  style={[s.rsvpCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}
                  onPress={() => event && router.push({ pathname: '/(tabs)/discover/[id]', params: { id: event.id } })}
                >
                  <View style={s.rsvpInfo}>
                    {event?.broadcastSubject && (
                      <Text style={[s.rsvpSubject, { color: c.textTertiary, fontFamily: fonts.sansMedium }]}>
                        {event.broadcastSubject}
                      </Text>
                    )}
                    <Text style={[s.rsvpTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]} numberOfLines={1}>
                      {event?.title ?? 'Unknown event'}
                    </Text>
                    {dateStr && (
                      <Text style={[s.rsvpDate, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>{dateStr}</Text>
                    )}
                  </View>
                  <View style={[s.statePill, { backgroundColor: (STATE_COLOR[r.state] ?? palette.gray400) + '20' }]}>
                    <Text style={[s.stateText, { color: STATE_COLOR[r.state] ?? palette.gray400, fontFamily: fonts.sansMedium }]}>
                      {r.state}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Past RSVPs toggle */}
      {!loading && data && data.rsvps.length > upcomingRsvps.length && (
        <View style={[s.section, { paddingHorizontal: spacing.xl }]}>
          <Text style={[s.sectionTitle, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
            {data.rsvps.length - upcomingRsvps.length} past or cancelled
          </Text>
        </View>
      )}

      {/* Interests */}
      {!loading && (
        <View style={[s.section, { paddingHorizontal: spacing.xl }]}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>Interests</Text>
            <Pressable onPress={() => router.push('/(auth)/interests')}>
              <Text style={[{ color: c.textSecondary, fontFamily: fonts.sansMedium, fontSize: 13 }]}>Edit</Text>
            </Pressable>
          </View>
          {(data?.favourites ?? []).length === 0 ? (
            <Pressable
              style={[s.emptyCard, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}
              onPress={() => router.push('/(auth)/interests')}
            >
              <Text style={[s.emptyCardText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
                Add your favourite sports and teams →
              </Text>
            </Pressable>
          ) : (
            <View style={s.interestChips}>
              {(data?.favourites ?? []).slice(0, 12).map((f) => (
                <View key={f.id} style={[s.interestChip, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
                  <Text style={[s.interestChipText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
                    {f.type === 'sport' ? '⚽ ' : ''}{f.value}
                  </Text>
                </View>
              ))}
              {(data?.favourites ?? []).length > 12 && (
                <View style={[s.interestChip, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
                  <Text style={[s.interestChipText, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>
                    +{(data?.favourites ?? []).length - 12} more
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Sign out */}
      <View style={[s.section, { paddingHorizontal: spacing.xl }]}>
        <Pressable
          style={[s.signOutBtn, { borderColor: c.cardBorder }]}
          onPress={() => { auth.signOut(); router.replace('/(auth)'); }}
        >
          <Text style={[s.signOutText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  profileHeader: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'], gap: spacing.sm },
  avatar: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  avatarInitial: { fontSize: 32 },
  name: { fontSize: 28 },
  email: { fontSize: 14 },
  stats: { flexDirection: 'row', gap: spacing['3xl'], marginTop: spacing.md },
  stat: { alignItems: 'center', gap: 2 },
  statVal: { fontSize: 20 },
  statLabel: { fontSize: 12 },
  section: { gap: spacing.md, marginBottom: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15 },
  sectionCount: { fontSize: 13 },
  emptyCard: {
    borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg,
    alignItems: 'center',
  },
  emptyCardText: { fontSize: 14 },
  rsvpList: { gap: spacing.sm },
  rsvpCard: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, gap: spacing.md,
  },
  rsvpInfo: { flex: 1, gap: 2 },
  rsvpSubject: { fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' },
  rsvpTitle: { fontSize: 14 },
  rsvpDate: { fontSize: 12 },
  statePill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full },
  stateText: { fontSize: 11 },
  interestChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  interestChip: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.full, borderWidth: 1 },
  interestChipText: { fontSize: 12 },
  signOutBtn: {
    height: 48, borderRadius: radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  signOutText: { fontSize: 15 },
  unauthTitle: { fontSize: 32, marginBottom: spacing.sm },
  unauthBody: { fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 280, marginBottom: spacing.xl },
  signInBtn: { paddingHorizontal: spacing['3xl'], paddingVertical: spacing.md, borderRadius: radius.md },
});
