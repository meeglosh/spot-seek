import React, { useState, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, TextInput,
} from 'react-native';
import { Text } from '../../../components/Text';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { colors, radius, spacing, type as t } from '../../../lib/theme';
import { Btn, Chip, Badge, FieldLabel, RowSkeleton, EmptyState, ErrorState, inputStyle } from '../../../components/ui';
import { GuestGate } from '../../../components/AuthGate';
import { useAuth } from '../../../lib/auth';
import {
  fetchEvent, fetchSponsors, requestSponsorship,
  type ApiEvent, type ApiSponsorProfile,
} from '../../../lib/api';

function fmtUsd(cents: number): string {
  const str = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `$${str}`;
}

const SORTS = ['sponsored', 'budget', 'name'] as const;
type SortKey = typeof SORTS[number];

function sortSponsors(list: ApiSponsorProfile[], sort: SortKey): ApiSponsorProfile[] {
  const sorted = [...list];
  if (sort === 'sponsored') {
    sorted.sort((a, b) => (b.sponsorshipCount ?? 0) - (a.sponsorshipCount ?? 0));
  } else if (sort === 'budget') {
    // Sponsors with no budget listed sort last rather than tying with $0.
    sorted.sort((a, b) => (b.budgetMaxCents ?? -1) - (a.budgetMaxCents ?? -1));
  } else {
    sorted.sort((a, b) => a.companyName.localeCompare(b.companyName));
  }
  return sorted;
}

export default function BrowseSponsorsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { t: tr } = useTranslation('sponsorship');
  const { t: trCommon } = useTranslation('common');

  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [sponsors, setSponsors] = useState<ApiSponsorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('sponsored');

  // Which sponsor's request form is expanded, plus that form's local state.
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState('');

  const load = useCallback(async () => {
    if (!eventId || auth.status !== 'authenticated') { setLoading(false); return; }
    setError('');
    try {
      const [ev, list] = await Promise.all([fetchEvent(eventId), fetchSponsors()]);
      setEvent(ev);
      setSponsors(list);
    } catch {
      setError(tr('findSponsors.loadError'));
    } finally {
      setLoading(false);
    }
  }, [eventId, auth.status, tr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openRequest(sponsorId: string) {
    setOpenId(sponsorId);
    setAmount('');
    setNote('');
    setSendError('');
  }

  async function handleSend(sponsorId: string) {
    const cents = Math.round(Number(amount) * 100);
    if (!amount.trim() || !Number.isFinite(cents) || cents <= 0) {
      setSendError(tr('findSponsors.errorAmount'));
      return;
    }
    if (!eventId) return;
    setSending(true);
    setSendError('');
    try {
      await requestSponsorship(eventId, sponsorId, cents, note.trim() || undefined);
      setSentIds((prev) => new Set(prev).add(sponsorId));
      setOpenId(null);
    } catch (err) {
      setSendError((err as Error).message || tr('findSponsors.errorSend'));
    } finally {
      setSending(false);
    }
  }

  // Categories derived from whatever sponsors actually registered with —
  // no invented/predefined list here, same reasoning as EventMapView's
  // sport chips.
  const categories = Array.from(new Set(sponsors.flatMap((sp) => sp.categories ?? []))).sort();

  const q = query.trim().toLowerCase();
  const filtered = sponsors.filter((sp) => {
    if (category && !sp.categories?.includes(category)) return false;
    if (q && !sp.companyName.toLowerCase().includes(q)) return false;
    return true;
  });
  const visible = sortSponsors(filtered, sort);

  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader back />
        <GuestGate
          title={tr('findSponsors.title')}
          message={tr('findSponsors.guestMessage')}
          redirect={eventId ? `/(tabs)/sponsorship/browse?eventId=${eventId}` : '/(tabs)/sponsorship/browse'}
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <AppHeader back onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>{tr('findSponsors.title')}</Text>
        <Text style={[t.bodyMd, s.subtitle]} numberOfLines={1}>
          {event ? tr('findSponsors.forEvent', { title: event.title }) : trCommon('loading')}
        </Text>

        {!loading && !error && sponsors.length > 0 && (
          <>
            <TextInput
              style={[inputStyle, s.searchInput]}
              placeholder={tr('findSponsors.searchPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              returnKeyType="search"
            />

            {categories.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipRow}>
                <Chip label={tr('findSponsors.allCategories')} active={category === null} onPress={() => setCategory(null)} />
                {categories.map((cat) => (
                  <Chip key={cat} label={cat} active={category === cat} onPress={() => setCategory((prev) => (prev === cat ? null : cat))} />
                ))}
              </ScrollView>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll} contentContainerStyle={s.chipRow}>
              {SORTS.map((opt) => (
                <Chip key={opt} label={tr(`findSponsors.sort.${opt}`)} tone="action" active={sort === opt} onPress={() => setSort(opt)} />
              ))}
            </ScrollView>
          </>
        )}

        {loading ? (
          <View style={s.skeletons} accessibilityLabel={trCommon('loading')}>
            <RowSkeleton lines={3} />
            <RowSkeleton lines={3} />
            <RowSkeleton lines={3} />
          </View>
        ) : error ? (
          <ErrorState
            title={tr('findSponsors.errorTitle')}
            message={error}
            retryLabel={trCommon('retry')}
            onRetry={() => { setLoading(true); load(); }}
          />
        ) : sponsors.length === 0 ? (
          <EmptyState
            icon="sponsorship"
            title={tr('findSponsors.emptyTitle')}
            body={tr('findSponsors.empty')}
            style={s.emptyCard}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="search"
            title={tr('findSponsors.noMatchTitle')}
            body={tr('findSponsors.noMatch')}
            actionLabel={tr('findSponsors.clearSearch')}
            onAction={() => { setQuery(''); setCategory(null); }}
            style={s.emptyCard}
          />
        ) : (
          visible.map((sp) => {
            const isOpen = openId === sp.id;
            const wasSent = sentIds.has(sp.id);
            return (
              <View key={sp.id} style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={[t.headlineSm, { color: colors.textPrimary }]} numberOfLines={1}>
                    {sp.companyName}
                  </Text>
                  {(sp.sponsorshipCount ?? 0) > 0 && (
                    <Badge label={tr('findSponsors.sponsoredCount', { count: sp.sponsorshipCount })} tone="confirmed" dot={false} />
                  )}
                </View>
                {sp.website && (
                  <Text style={[t.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>{sp.website}</Text>
                )}
                {(sp.budgetMinCents != null || sp.budgetMaxCents != null) && (
                  <Text style={[t.monoData, { color: colors.textSecondary }]}>
                    {tr('findSponsors.budget', {
                      min: sp.budgetMinCents != null ? fmtUsd(sp.budgetMinCents) : '$0',
                      max: sp.budgetMaxCents != null ? fmtUsd(sp.budgetMaxCents) : tr('findSponsors.noCap'),
                    })}
                  </Text>
                )}
                {sp.categories && sp.categories.length > 0 && (
                  <View style={s.categoryRow}>
                    {sp.categories.map((cat) => <Chip key={cat} label={cat} />)}
                  </View>
                )}

                {wasSent ? (
                  <Badge label={tr('findSponsors.requestSent')} tone="confirmed" />
                ) : isOpen ? (
                  <View style={s.requestForm}>
                    <View style={s.field}>
                      <FieldLabel>{tr('findSponsors.amountLabel')}</FieldLabel>
                      <TextInput
                        style={inputStyle}
                        placeholder={tr('findSponsors.amountPlaceholder')}
                        placeholderTextColor={colors.textTertiary}
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={s.field}>
                      <FieldLabel>{tr('findSponsors.noteLabel')}</FieldLabel>
                      <TextInput
                        style={[inputStyle, s.noteInput]}
                        placeholder={tr('findSponsors.notePlaceholder')}
                        placeholderTextColor={colors.textTertiary}
                        value={note}
                        onChangeText={setNote}
                        multiline
                      />
                    </View>
                    {sendError !== '' && <Text style={[t.bodySm, { color: colors.danger }]}>{sendError}</Text>}
                    <View style={s.requestActions}>
                      <Btn label={trCommon('cancel')} variant="ghost" small style={s.requestBtn} onPress={() => setOpenId(null)} disabled={sending} />
                      <Btn
                        label={sending ? '…' : tr('findSponsors.send')}
                        small
                        style={s.requestBtn}
                        onPress={() => handleSend(sp.id)}
                        disabled={sending}
                      />
                    </View>
                  </View>
                ) : (
                  <Btn label={tr('findSponsors.request')} variant="secondary" small onPress={() => openRequest(sp.id)} />
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  subtitle: { color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xl },
  searchInput: { marginBottom: spacing.md },
  chipScroll: { marginBottom: spacing.md },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },

  skeletons: { gap: spacing.md, marginTop: spacing.lg },
  emptyCard: { backgroundColor: colors.surface1, borderRadius: radius.card },
  card: {
    backgroundColor: colors.surface1,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    borderRadius: radius.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  requestForm: { gap: spacing.md, marginTop: spacing.xs },
  field: { gap: 0 },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  requestActions: { flexDirection: 'row', gap: spacing.sm },
  requestBtn: { flex: 1 },
});
