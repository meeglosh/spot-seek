import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text } from '../../../components/Text';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '../../../lib/auth';
import {
  fetchProfile, fetchFollowCounts, fetchMyRsvps, fetchFavourites, fetchDashboard, fetchHostReviews,
  type ApiProfile, type ApiRsvp, type ApiFavourite, type ApiDashboardEvent, type ApiHostReviews,
} from '../../../lib/api';
import { AppHeader } from '../../../components/AppHeader';
import { colors, spacing, radius, TAP, type as t } from '../../../lib/theme';
import { Icon } from '../../../components/icons';
import { Btn, Chip, Badge, SegmentBar, SectionTitle, Press, Skeleton, RowSkeleton, EmptyState } from '../../../components/ui';
import { GuestGate } from '../../../components/AuthGate';
import { StarRating } from '../../../components/Stars';
import { SPORTS } from '../../../lib/sports-data';
import { formatEventDateTime } from '../../../lib/dateFormat';

type ProfileData = {
  profile: ApiProfile | null;
  followers: number;
  following: number;
  rsvps: ApiRsvp[];
  favourites: ApiFavourite[];
  hosted: ApiDashboardEvent[];
  reviews: ApiHostReviews;
};

// Favourite teams are stored by name (see (auth)/interests.tsx) — resolve the
// league so team cards can show real context from the sports catalogue.
function resolveTeam(name: string): { shortName: string; leagueName: string } | null {
  for (const sport of SPORTS) {
    for (const league of sport.leagues) {
      const team = league.teams.find((tm) => tm.name === name);
      if (team) return { shortName: team.shortName, leagueName: league.name };
    }
  }
  return null;
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function fmtEventDate(
  iso: string | null,
  tr: TFunction<'profile'>,
  venueTimezone: string | null = null,
): string {
  if (!iso) return tr('saved.dateTbc');
  const { dateStr, timeStr } = formatEventDateTime(iso, venueTimezone);
  return `${dateStr} · ${timeStr}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  // Scoped to 'profile' — see settings.tsx / lib/i18n.ts for the key-naming
  // convention this follows.
  const { t: tr } = useTranslation('profile');
  const { t: trCommon } = useTranslation('common');

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userId = auth.status === 'authenticated' ? auth.user.id : null;

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const [profile, counts, rsvps, favourites, hosted, reviews] = await Promise.all([
      fetchProfile(userId).catch(() => null),
      fetchFollowCounts(userId).catch(() => ({ followers: 0, following: 0 })),
      fetchMyRsvps().catch(() => [] as ApiRsvp[]),
      fetchFavourites().catch(() => [] as ApiFavourite[]),
      fetchDashboard().catch(() => [] as ApiDashboardEvent[]),
      fetchHostReviews(userId).catch(() => ({ avg: 0, count: 0, recent: [] }) as ApiHostReviews),
    ]);
    setData({ profile, followers: counts.followers, following: counts.following, rsvps, favourites, hosted, reviews });
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader />
        <GuestGate
          title={tr('guestGate.title')}
          message={tr('guestGate.message')}
          redirect="/(tabs)/profile"
        />
      </View>
    );
  }

  const { user } = auth;
  const now = new Date();

  const rsvps = data?.rsvps ?? [];
  const attended = rsvps.filter(
    (r) => r.state === 'going' && r.event?.startsAt && new Date(r.event.startsAt) < now,
  ).length;
  const milestone = Math.floor(attended / 10) * 10 + 10; // next multiple of 10

  const upcoming = rsvps
    .filter((r) =>
      (r.state === 'going' || r.state === 'waitlisted') &&
      (!r.event?.startsAt || new Date(r.event.startsAt) >= now))
    .sort((a, b) => (a.event?.startsAt ?? '9999').localeCompare(b.event?.startsAt ?? '9999'));

  const hostedPast = (data?.hosted ?? [])
    .filter((e) => e.startsAt && new Date(e.startsAt) < now)
    .sort((a, b) => (b.startsAt ?? '').localeCompare(a.startsAt ?? ''));

  const teamFavs = (data?.favourites ?? []).filter((f) => f.type === 'team');
  const sportFavs = (data?.favourites ?? []).filter((f) => f.type === 'sport');

  return (
    <View style={s.container}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
      >
        <Text style={[t.headlineLg, s.pageTitle]}>{tr('title')}</Text>

        {loading ? (
          <View style={{ gap: spacing.lg }} accessibilityLabel={trCommon('loading')}>
            <View style={s.heroCard}>
              <View style={s.heroTop}>
                <Skeleton width={72} height={72} radius={radius.round} />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Skeleton width="60%" height={22} />
                  <Skeleton width="80%" height={14} />
                </View>
              </View>
              <Skeleton height={36} radius={radius.pill} />
            </View>
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : (
          <>
            {/* ── Hero card: avatar / name / chips / milestone ─────────────── */}
            <View style={s.heroCard}>
              <View style={s.heroTop}>
                <View style={s.avatar}>
                  <Text style={[t.displayXl, s.avatarInitial]}>
                    {user.name.trim().charAt(0).toUpperCase() || 'S'}
                  </Text>
                </View>
                <View style={s.heroId}>
                  <Text style={[t.headlineMd, { color: colors.textPrimary }]}>{user.name}</Text>
                  <Text style={[t.bodySm, { color: colors.textTertiary }]}>{user.email}</Text>
                  {!!data?.reviews && data.reviews.count > 0 && (
                    <StarRating
                      value={data.reviews.avg}
                      size={14}
                      label={tr('reviews.ratingSummary', { avg: data.reviews.avg.toFixed(1), count: data.reviews.count })}
                    />
                  )}
                </View>
              </View>

              <View style={s.chipRow}>
                {data?.profile?.isVerified && <Chip label={tr('hero.verifiedHost')} active tone="confirmed" />}
                <Chip label={tr('hero.followers', { count: data?.followers ?? 0 })} tone="neutral" />
                <Chip label={tr('hero.following', { count: data?.following ?? 0 })} tone="neutral" />
                {data?.profile?.createdAt && (
                  <Chip
                    label={tr('hero.since', { year: new Date(data.profile.createdAt).getFullYear() })}
                    tone="neutral"
                  />
                )}
              </View>

              <View style={s.milestone}>
                <View style={s.milestoneHead}>
                  <Text style={[t.label, { color: colors.textSecondary }]}>{tr('hero.partiesAttended')}</Text>
                  <Text style={[t.monoData, { color: colors.textPrimary }]}>{attended} / {milestone}</Text>
                </View>
                <SegmentBar value={attended} max={milestone} segments={10} />
                <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                  {tr('hero.nextMilestone', { count: milestone })}
                </Text>
              </View>
            </View>

            {/* ── HOST A PARTY CTA ─────────────────────────────────────────── */}
            <View style={s.hostCta}>
              <View style={s.hostPlus}>
                <Icon name="plus" size={28} color={colors.action} />
              </View>
              <Text style={[t.headlineMd, { color: colors.textPrimary }]}>{tr('hostCta.title')}</Text>
              <Text style={[t.bodyMd, s.hostBody]}>{tr('hostCta.body')}</Text>
              <Btn
                label={tr('hostCta.button')}
                style={s.hostBtn}
                onPress={() => router.push('/(tabs)/parties/create' as never)}
              />
            </View>

            {/* ── MY TEAMS (FAVORITES) ─────────────────────────────────────── */}
            <SectionTitle>{tr('teams.sectionTitle')}</SectionTitle>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.teamRow}
              style={s.teamScroll}
            >
              {teamFavs.map((f) => {
                const resolved = resolveTeam(f.value);
                return (
                  <View key={f.id} style={s.teamCard}>
                    <View style={s.teamLogo}>
                      <Text style={[t.headlineSm, { color: colors.textPrimary }]}>{monogram(f.value)}</Text>
                    </View>
                    <Text style={[t.label, s.teamName]} numberOfLines={2}>
                      {(resolved?.shortName ?? f.value)}
                    </Text>
                    <Text style={[t.labelSm, { color: colors.textSecondary }]}>
                      {resolved?.leagueName ?? f.sport ?? tr('teams.fallbackLeague')}
                    </Text>
                  </View>
                );
              })}
              <Press
                style={({ pressed }) => [s.teamAdd, pressed && { borderColor: colors.action }]}
                onPress={() => router.push('/(auth)/interests')}
              >
                <Icon name="plus" size={24} color={colors.textSecondary} />
                <Text style={[t.labelSm, { color: colors.textSecondary }]}>{tr('teams.findTeams')}</Text>
              </Press>
            </ScrollView>
            {sportFavs.length > 0 && (
              <View style={s.sportChips}>
                {sportFavs.map((f) => <Chip key={f.id} label={f.value} active tone="neutral" />)}
              </View>
            )}

            {/* ── SAVED PARTIES ────────────────────────────────────────────── */}
            <SectionTitle>{tr('saved.sectionTitle')}</SectionTitle>
            {upcoming.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={tr('saved.emptyTitle')}
                body={tr('saved.empty')}
                actionLabel={tr('saved.emptyCta')}
                onAction={() => router.push('/(tabs)/discover')}
                style={s.emptyCard}
              />
            ) : (
              <View style={s.list}>
                {upcoming.map((r) => (
                  <Press
                    key={r.id}
                    accessibilityRole="button"
                    style={({ pressed }) => [s.savedRow, pressed && { backgroundColor: colors.surface2 }]}
                    onPress={() => r.event &&
                      router.push({ pathname: '/(tabs)/discover/[id]', params: { id: r.event.id } })}
                  >
                    <View style={s.rowBody}>
                      <Text style={[t.label, s.rowTitle]} numberOfLines={1}>
                        {(r.event?.title ?? tr('saved.unknownEvent'))}
                      </Text>
                      <Text style={[t.labelSm, { color: colors.textSecondary }]}>
                        {fmtEventDate(r.event?.startsAt ?? null, tr, r.event?.venueTimezone ?? null)}
                      </Text>
                    </View>
                    {r.state === 'waitlisted' ? (
                      <Badge label={tr('saved.waitlist')} tone="live" />
                    ) : (
                      <Icon name="chevronRight" size={20} color={colors.textTertiary} />
                    )}
                  </Press>
                ))}
              </View>
            )}

            {/* ── HOSTING HISTORY ──────────────────────────────────────────── */}
            <SectionTitle>{tr('hosting.sectionTitle')}</SectionTitle>
            {hostedPast.length === 0 ? (
              <EmptyState
                icon="parties"
                title={tr('hosting.emptyTitle')}
                body={tr('hosting.empty')}
                actionLabel={tr('hosting.emptyCta')}
                onAction={() => router.push('/(tabs)/parties/create' as never)}
                style={s.emptyCard}
              />
            ) : (
              <View style={s.list}>
                {hostedPast.map((e) => (
                  <View key={e.id} style={s.historyRow}>
                    <View style={s.historyIcon}>
                      <Icon name="grid" size={20} color={colors.textSecondary} />
                    </View>
                    <View style={s.rowBody}>
                      <Text style={[t.label, s.rowTitle]} numberOfLines={1}>
                        {e.title}
                      </Text>
                      <Text style={[t.labelSm, { color: colors.textSecondary }]}>
                        {tr('hosting.attendee', { count: e.rsvpCounts.going })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── RECENT REVIEWS ───────────────────────────────────────────── */}
            {(data?.reviews.recent.length ?? 0) > 0 && (
              <>
                <SectionTitle>{tr('reviews.sectionTitle')}</SectionTitle>
                <View style={s.list}>
                  {data!.reviews.recent.map((r) => (
                    <View key={r.id} style={s.reviewRow}>
                      <View style={s.reviewHead}>
                        <Text style={[t.label, s.rowTitle]}>{r.reviewerName}</Text>
                        <Text style={[t.labelSm, { color: colors.textTertiary }]}>
                          {new Date(r.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <StarRating value={r.hostRating} size={13} />
                      {r.comment && (
                        <Text style={[t.bodySm, { color: colors.textSecondary }]}>{r.comment}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── Sign out ─────────────────────────────────────────────────── */}
            <Btn
              label={tr('signOut')}
              variant="danger"
              small
              style={{ marginTop: spacing.xl }}
              onPress={() => { auth.signOut(); router.replace('/(auth)'); }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  unauthBody: { color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },

  pageTitle: { color: colors.textPrimary, marginBottom: spacing.lg },

  // Hero
  heroCard: {
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing.xl,
    borderRadius: radius.card,
  },
  heroTop: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  avatar: {
    width: 88, height: 88, borderRadius: radius.round,
    borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: colors.textPrimary, paddingTop: 4 },
  heroId: { flex: 1, gap: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  milestone: { gap: spacing.sm },
  milestoneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },

  // Host CTA
  hostCta: {
    backgroundColor: colors.surface1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing['2xl'],
    borderRadius: radius.card,
  },
  hostPlus: {
    width: 56, height: 56,
    borderWidth: 1, borderColor: colors.action,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
    borderRadius: radius.control,
  },
  hostBody: { color: colors.textSecondary, textAlign: 'center' },
  hostBtn: { alignSelf: 'stretch', marginTop: spacing.md },

  // Teams
  teamScroll: { marginHorizontal: -spacing.lg, marginBottom: spacing.md },
  teamRow: { gap: spacing.md, paddingHorizontal: spacing.lg },
  teamCard: {
    width: 148,
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.card,
  },
  teamLogo: {
    width: 64, height: 64, borderRadius: radius.round,
    backgroundColor: colors.surface3,
    alignItems: 'center', justifyContent: 'center',
  },
  teamName: { color: colors.textPrimary, textAlign: 'center' },
  teamAdd: {
    width: 148,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSunken,
    padding: spacing.lg,
    minHeight: TAP,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.card,
  },
  sportChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },

  // Lists
  list: { gap: spacing.md, marginBottom: spacing.xl },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    borderRadius: radius.card,
  },
  rowBody: { flex: 1, gap: spacing.xs },
  rowTitle: { color: colors.textPrimary },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    opacity: 0.85,
    borderRadius: radius.card,
  },
  historyIcon: {
    width: 44, height: 44,
    backgroundColor: colors.surface3,
    borderRadius: radius.control,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: colors.surface1,
    marginBottom: spacing.xl,
    borderRadius: radius.card,
  },

  // Recent reviews
  reviewRow: {
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radius.card,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
