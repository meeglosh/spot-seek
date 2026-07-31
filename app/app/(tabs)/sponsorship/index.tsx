import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { colors, palette, spacing, fonts, type as t } from '../../../lib/theme';
import { Btn, Chip, Badge, FieldLabel, SectionTitle, inputStyle, inputFocusedStyle } from '../../../components/ui';
import { GuestGate } from '../../../components/AuthGate';
import { useAuth } from '../../../lib/auth';
import {
  fetchMySponsorProfile, fetchSponsorAnalytics, fetchFeed, fetchMyBids, registerSponsor,
  type ApiSponsorProfile, type ApiSponsorAnalytics, type ApiEvent, type ApiSponsorBid,
  type SponsorshipStatus,
} from '../../../lib/api';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
] as const;
type FilterKey = typeof FILTERS[number]['key'];

const BID_TONE: Record<SponsorshipStatus, 'neutral' | 'volt' | 'live'> = {
  pending: 'neutral',
  active: 'volt',
  rejected: 'live',
  cancelled: 'neutral',
};

function fmtUsd(cents: number): string {
  const str = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${str.endsWith('.00') ? str.slice(0, -3) : str}`;
}

function fmtEventDate(iso: string | null): string {
  if (!iso) return 'DATE TBC';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`.toUpperCase();
}

function applyFilter(events: ApiEvent[], filter: FilterKey): ApiEvent[] {
  if (filter === 'all') return events;
  const now = new Date();
  const cutoff = new Date(now);
  if (filter === 'today') cutoff.setHours(23, 59, 59, 999);
  else cutoff.setDate(now.getDate() + 7);
  return events.filter((e) => {
    if (!e.startsAt) return false;
    const d = new Date(e.startsAt);
    return d >= now && d <= cutoff;
  });
}

export default function SponsorshipHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();

  const [sponsor, setSponsor] = useState<ApiSponsorProfile | null>(null);
  const [analytics, setAnalytics] = useState<ApiSponsorAnalytics | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [bids, setBids] = useState<ApiSponsorBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  // Registration form
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState('');

  const load = useCallback(async () => {
    const [sp, feed, myBids] = await Promise.all([
      fetchMySponsorProfile().catch(() => null),
      fetchFeed().catch(() => [] as ApiEvent[]),
      fetchMyBids().catch(() => [] as ApiSponsorBid[]),
    ]);
    setSponsor(sp);
    setEvents(feed);
    setBids(myBids);
    setAnalytics(sp ? await fetchSponsorAnalytics().catch(() => null) : null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  async function handleRegister() {
    const name = companyName.trim();
    if (!name) { setRegError('Company name is required.'); return; }
    setRegistering(true);
    setRegError('');
    try {
      await registerSponsor(name, website.trim() || undefined);
      setCompanyName('');
      setWebsite('');
      await load();
    } catch (err) {
      setRegError(
        err instanceof Error && err.message === 'unauthorized'
          ? 'Sign in first to register as a sponsor.'
          : 'Registration failed. Try again.',
      );
    } finally {
      setRegistering(false);
    }
  }

  // Latest of my bids per event, so cards can show real bid state.
  const latestBidByEvent = new Map<string, ApiSponsorBid>();
  for (const b of [...bids].sort((a, c) => a.createdAt.localeCompare(c.createdAt))) {
    latestBidByEvent.set(b.eventId, b);
  }

  const shown = applyFilter(events, filter);
  const summary = analytics?.summary;

  // ── Not signed in: sponsor tools are members-only ───────────────────────────
  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader />
        <GuestGate
          title="Sponsorship Hub"
          message="Sign in to register your brand, browse high-engagement watch parties, and bid on sponsorships."
          redirect="/(tabs)/sponsorship"
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <AppHeader />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
      >
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>Sponsorship Hub</Text>
        <Text style={[t.bodyMd, s.subtitle]}>High-yield targeting opportunities.</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing['2xl'] }} />
        ) : (
          <>
            {/* ── Sponsor identity / registration ─────────────────────────── */}
            {sponsor === null ? (
              <View style={s.registerCard}>
                <Text style={[t.headlineSm, { color: colors.accent }]}>Become a Sponsor</Text>
                <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                  Register your company to bid on watch parties. Hosts accept or reject
                  each bid — a 15% platform fee applies to accepted bids.
                </Text>
                <View style={s.field}>
                  <FieldLabel>Company Name</FieldLabel>
                  <TextInput
                    style={[inputStyle, focusedField === 'company' && inputFocusedStyle]}
                    placeholder="e.g. Voltage Drinks Co."
                    placeholderTextColor={colors.textTertiary}
                    value={companyName}
                    onChangeText={setCompanyName}
                    onFocus={() => setFocusedField('company')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View style={s.field}>
                  <FieldLabel>Website (Optional)</FieldLabel>
                  <TextInput
                    style={[inputStyle, focusedField === 'website' && inputFocusedStyle]}
                    placeholder="https://…"
                    placeholderTextColor={colors.textTertiary}
                    value={website}
                    onChangeText={setWebsite}
                    autoCapitalize="none"
                    keyboardType="url"
                    onFocus={() => setFocusedField('website')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                {regError !== '' && (
                  <Text style={[t.bodySm, { color: colors.danger }]}>{regError}</Text>
                )}
                <Btn label="Register as Sponsor" onPress={handleRegister} disabled={registering} />
              </View>
            ) : (
              <View style={s.sponsorBlock}>
                <Text style={[t.labelCaps, { color: colors.volt }]}>
                  Sponsor · {sponsor.companyName}
                </Text>
                {summary && (
                  <View style={s.tileGrid}>
                    <View style={s.tile}>
                      <Text style={[t.labelCapsSm, s.tileLabel]}>Total Bids</Text>
                      <Text style={[t.headlineMd, { color: colors.textPrimary }]}>{summary.totalBids}</Text>
                    </View>
                    <View style={s.tile}>
                      <Text style={[t.labelCapsSm, s.tileLabel]}>Active</Text>
                      <Text style={[t.headlineMd, { color: colors.volt }]}>{summary.activeBids}</Text>
                    </View>
                    <View style={s.tile}>
                      <Text style={[t.labelCapsSm, s.tileLabel]}>Total Spend</Text>
                      <Text style={[t.headlineMd, { color: colors.accent }]}>{fmtUsd(summary.totalSpendCents)}</Text>
                    </View>
                    <View style={s.tile}>
                      <Text style={[t.labelCapsSm, s.tileLabel]}>Reach</Text>
                      <Text style={[t.headlineMd, { color: colors.textPrimary }]}>{summary.totalReach}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── Marketplace ──────────────────────────────────────────────── */}
            <SectionTitle>Open for Sponsorship</SectionTitle>
            <View style={s.filterRow}>
              {FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  active={filter === f.key}
                  onPress={() => setFilter(f.key)}
                />
              ))}
            </View>

            {shown.length === 0 ? (
              <Text style={[t.bodySm, { color: colors.textTertiary }]}>
                No published events match this filter.
              </Text>
            ) : (
              shown.map((ev) => {
                const myBid = latestBidByEvent.get(ev.id);
                return (
                  <View key={ev.id} style={s.eventCard}>
                    <View style={s.coverWrap}>
                      {ev.coverImageUrl ? (
                        <>
                          <Image source={{ uri: ev.coverImageUrl }} style={s.coverImg} resizeMode="cover" />
                          <View style={s.coverTint} />
                        </>
                      ) : (
                        <Text style={[s.coverFallback, { fontFamily: fonts.display }]} numberOfLines={1}>
                          {ev.broadcastSubject.toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={s.eventBody}>
                      <Text style={[t.headlineMd, { color: colors.accent }]}>{ev.title}</Text>
                      <Text style={[t.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>
                        ◈ {ev.isPrivateLocation
                          ? 'Private location — revealed after RSVP'
                          : ev.venueName ?? 'Venue TBC'}
                      </Text>
                      <View style={s.eventTiles}>
                        <View style={s.eventTile}>
                          <Text style={[t.labelCapsSm, s.tileLabel]}>Date</Text>
                          <Text style={[t.monoData, { color: colors.textPrimary }]}>
                            {fmtEventDate(ev.startsAt)}
                          </Text>
                        </View>
                        {ev.capacity != null && (
                          <View style={s.eventTile}>
                            <Text style={[t.labelCapsSm, s.tileLabel]}>Capacity</Text>
                            <Text style={[t.monoData, { color: colors.textPrimary }]}>{ev.capacity}</Text>
                          </View>
                        )}
                      </View>
                      {myBid && (
                        <Badge
                          label={`Your bid · ${fmtUsd(myBid.amountCents)} · ${myBid.status}`}
                          tone={BID_TONE[myBid.status]}
                        />
                      )}
                      <Btn
                        label="Review for Sponsorship"
                        onPress={() => router.push(`/(tabs)/sponsorship/${ev.id}` as never)}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  subtitle: { color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xl },

  registerCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentDim,
    padding: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  field: { gap: 0 },

  sponsorBlock: { gap: spacing.md, marginBottom: spacing['2xl'] },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: palette.surfaceMid,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tileLabel: { color: colors.textSecondary },

  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },

  eventCard: {
    backgroundColor: colors.card,
    borderTopWidth: 2,
    borderTopColor: colors.accentDim,
    marginBottom: spacing.xl,
  },
  coverWrap: {
    height: 150,
    backgroundColor: palette.black,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  coverTint: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  coverFallback: { fontSize: 34, color: palette.surfaceHighest, paddingHorizontal: spacing.lg },
  eventBody: { padding: spacing.lg, gap: spacing.md },
  eventTiles: { flexDirection: 'row', gap: spacing.md },
  eventTile: {
    flex: 1,
    backgroundColor: palette.surfaceLowest,
    borderWidth: 1,
    borderColor: palette.surfaceHighest,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
