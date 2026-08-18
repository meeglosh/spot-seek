import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '../../../components/AppHeader';
import { colors, palette, spacing, fonts, type as t } from '../../../lib/theme';
import { Btn, Badge, FieldLabel, SectionTitle, inputStyle, inputFocusedStyle } from '../../../components/ui';
import { GuestGate } from '../../../components/AuthGate';
import { useAuth } from '../../../lib/auth';
import {
  fetchEvent, fetchMyBids, placeSponsorBid, updateBidStatus, resolveImageUrl, paySponsorship,
  type ApiEvent, type ApiSponsorBid, type SponsorshipStatus,
} from '../../../lib/api';
import { formatEventDateTime } from '../../../lib/dateFormat';

const PLATFORM_FEE_RATE = 0.15;

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

function fmtEventDate(iso: string | null, tr: (key: string) => string, venueTimezone: string | null = null): string {
  if (!iso) return tr('browse.dateTbc');
  const { dateStr, timeStr } = formatEventDateTime(iso, venueTimezone);
  return `${dateStr} · ${timeStr}`.toUpperCase();
}

const DEAL_POINT_KEYS = ['yourBid', 'platformFee', 'hostDecision', 'payment'] as const;

export default function SponsorshipDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const auth = useAuth();
  const { t: tr } = useTranslation('sponsorship');
  const { t: trCommon } = useTranslation('common');

  const DEAL_POINTS = DEAL_POINT_KEYS.map((key) => ({
    title: tr(`bid.dealPoints.${key}.title`),
    body: tr(`bid.dealPoints.${key}.body`),
  }));

  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [bids, setBids] = useState<ApiSponsorBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [notSponsor, setNotSponsor] = useState(false);

  // Payment (Stripe Connect, test mode — see PAYMENTS.md). Keyed by bid id so
  // more than one open bid can be paid independently without shared state.
  const [payingBidId, setPayingBidId] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoadError('');
    try {
      const [ev, myBids] = await Promise.all([
        fetchEvent(eventId),
        fetchMyBids().catch(() => [] as ApiSponsorBid[]),
      ]);
      setEvent(ev);
      setBids(myBids.filter((b) => b.eventId === eventId)
        .sort((a, c) => c.createdAt.localeCompare(a.createdAt)));
    } catch {
      setLoadError(tr('bid.loadError'));
    } finally {
      setLoading(false);
    }
  }, [eventId, tr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // A sponsor can have more than one open bid on the same event (e.g. a
  // pending bid on top of one already accepted) — surface every open bid
  // rather than picking one and hiding the rest. Active bids sort first so
  // the accepted deal always leads.
  const openBids = bids
    .filter((b) => b.status === 'pending' || b.status === 'active')
    .sort((a, c) => (a.status === c.status ? 0 : a.status === 'active' ? -1 : 1));
  const lastClosedBid = openBids.length === 0 ? bids[0] ?? null : null;

  const amountCents = (() => {
    const n = Number(amount.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  })();
  const feeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

  async function handlePlaceBid() {
    if (!eventId || amountCents <= 0) return;
    setSubmitting(true);
    setFormError('');
    try {
      await placeSponsorBid(eventId, amountCents, note.trim() || undefined);
      setAmount('');
      setNote('');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'not_a_sponsor') setNotSponsor(true);
      else if (msg === 'unauthorized') setFormError(tr('bid.errors.signIn'));
      else setFormError(tr('bid.errors.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayNow(bidId: string) {
    setPayingBidId(bidId);
    setPaymentNotice((prev) => ({ ...prev, [bidId]: '' }));
    try {
      const result = await paySponsorship(bidId);
      if (!result) {
        setPaymentNotice((prev) => ({ ...prev, [bidId]: tr('bid.payment.notLiveYet') }));
        return;
      }
      // No PaymentSheet in this pass (see PAYMENTS.md Phase 2) — a successful
      // call just confirms the PaymentIntent exists server-side. Refresh so
      // the card's paymentStatus reflects requires_payment → whatever the
      // backend moved it to.
      await load();
    } catch {
      setPaymentNotice((prev) => ({ ...prev, [bidId]: tr('bid.payment.payError') }));
    } finally {
      setPayingBidId(null);
    }
  }

  async function handleCancelBid(bidId: string) {
    setSubmitting(true);
    setFormError('');
    try {
      await updateBidStatus(bidId, 'cancelled');
      await load();
    } catch {
      setFormError(tr('bid.errors.cancelFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Not signed in: bidding is members-only ─────────────────────────────────
  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader back />
        <GuestGate
          title={tr('bid.guestGate.title')}
          message={tr('bid.guestGate.message')}
          redirect={eventId ? `/(tabs)/sponsorship/${eventId}` : '/(tabs)/sponsorship'}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s.container}>
        <AppHeader back />
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      </View>
    );
  }

  if (loadError !== '' || !event) {
    return (
      <View style={s.container}>
        <AppHeader back />
        <View style={s.center}>
          <Text style={[t.bodyMd, { color: colors.textSecondary }]}>
            {loadError || tr('bid.eventNotFound')}
          </Text>
          <Btn label={trCommon('retry')} variant="secondary" small onPress={() => { setLoading(true); load(); }} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader back />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing['2xl'] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <View style={s.coverWrap}>
          {event.coverImageUrl ? (
            <>
              <Image source={{ uri: resolveImageUrl(event.coverImageUrl)! }} style={s.coverImg} resizeMode="cover" />
              <View style={s.coverTint} />
            </>
          ) : (
            <Text style={[s.coverFallback, { fontFamily: fonts.display }]} numberOfLines={1}>
              {event.broadcastSubject.toUpperCase()}
            </Text>
          )}
        </View>

        <View style={s.body}>
          <Badge label={tr('bid.openForBids')} tone="accent" />
          <Text style={[t.headlineLg, { color: colors.accent }]}>{event.title}</Text>
          {event.description != null && event.description !== '' && (
            <Text style={[t.bodyMd, { color: colors.textSecondary }]}>{event.description}</Text>
          )}

          {/* ── Event facts ──────────────────────────────────────────────── */}
          <View style={s.factsCard}>
            <View style={s.factRow}>
              <Text style={[t.labelCaps, s.factLabel]}>{tr('bid.facts.date')}</Text>
              <Text style={[t.monoData, s.factValue]}>{fmtEventDate(event.startsAt, tr, event.venueTimezone)}</Text>
            </View>
            <View style={s.factDivider} />
            <View style={s.factRow}>
              <Text style={[t.labelCaps, s.factLabel]}>{tr('bid.facts.venue')}</Text>
              <Text style={[t.monoData, s.factValue]} numberOfLines={1}>
                {event.isPrivateLocation
                  ? tr('bid.facts.privateVenue')
                  : (event.venueName ?? tr('bid.facts.venueTbc')).toUpperCase()}
              </Text>
            </View>
            {event.capacity != null && (
              <>
                <View style={s.factDivider} />
                <View style={s.factRow}>
                  <Text style={[t.labelCaps, s.factLabel]}>{tr('bid.facts.capacity')}</Text>
                  <Text style={[t.monoData, s.factValue]}>{event.capacity}</Text>
                </View>
              </>
            )}
          </View>

          {/* ── The deal (real auction mechanics) ────────────────────────── */}
          <SectionTitle>{tr('bid.dealTitle')}</SectionTitle>
          <View style={s.dealList}>
            {DEAL_POINTS.map((p) => (
              <View key={p.title} style={s.dealRow}>
                <Text style={[t.labelCaps, { color: colors.volt }]}>{p.title}</Text>
                <Text style={[t.bodySm, { color: colors.textSecondary }]}>{p.body}</Text>
              </View>
            ))}
          </View>

          {/* ── Bid status / bid form ────────────────────────────────────── */}
          <SectionTitle accent={colors.live}>{tr('bid.statusTitle')}</SectionTitle>

          {openBids.length > 0 ? (
            openBids.map((bid) => (
              <View key={bid.id} style={s.statusCard}>
                <View style={s.statusHead}>
                  <Text style={[t.labelCaps, { color: colors.textSecondary }]}>{tr('bid.yourBid')}</Text>
                  <Badge label={tr(`statusLabels.${bid.status}`)} tone={BID_TONE[bid.status]} />
                </View>
                <Text style={[t.headlineLg, { color: colors.textPrimary }]}>
                  {fmtUsd(bid.amountCents)}
                </Text>
                <View style={s.statusRow}>
                  <Text style={[t.labelCapsSm, s.factLabel]}>{tr('bid.platformFee')}</Text>
                  <Text style={[t.monoData, { color: colors.live }]}>{fmtUsd(bid.platformFeeCents)}</Text>
                </View>
                <View style={s.statusRow}>
                  <Text style={[t.labelCapsSm, s.factLabel]}>{tr('bid.hostReceives')}</Text>
                  <Text style={[t.monoData, { color: colors.volt }]}>
                    {fmtUsd(bid.amountCents - bid.platformFeeCents)}
                  </Text>
                </View>
                <View style={s.statusRow}>
                  <Text style={[t.labelCapsSm, s.factLabel]}>{tr('bid.placed')}</Text>
                  <Text style={[t.monoData, s.factValue]}>
                    {new Date(bid.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
                  </Text>
                </View>
                {bid.note != null && bid.note !== '' && (
                  <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                    {tr('bid.note', { note: bid.note })}
                  </Text>
                )}
                {bid.status === 'pending' ? (
                  <Btn label={tr('bid.cancelBid')} variant="danger" disabled={submitting} onPress={() => handleCancelBid(bid.id)} />
                ) : (
                  <Text style={[t.bodySm, { color: colors.volt }]}>
                    {tr('bid.hostAccepted')}
                  </Text>
                )}
                {bid.status === 'active' && (
                  <View style={s.paymentBlock}>
                    {bid.paymentStatus === 'paid' ? (
                      <Text style={[t.bodySm, { color: colors.volt }]}>{tr('bid.payment.paid')}</Text>
                    ) : bid.paymentStatus === 'released' ? (
                      <Text style={[t.bodySm, { color: colors.volt }]}>{tr('bid.payment.released')}</Text>
                    ) : bid.paymentStatus === 'refunded' ? (
                      <Text style={[t.bodySm, { color: colors.textSecondary }]}>{tr('bid.payment.refunded')}</Text>
                    ) : (
                      <>
                        <Text style={[t.bodySm, { color: colors.live }]}>{tr('bid.payment.due')}</Text>
                        <Btn
                          label={payingBidId === bid.id ? '…' : tr('bid.payment.payNow')}
                          small
                          disabled={payingBidId === bid.id}
                          onPress={() => handlePayNow(bid.id)}
                        />
                      </>
                    )}
                    {paymentNotice[bid.id] ? (
                      <Text style={[t.bodySm, { color: colors.textSecondary }]}>{paymentNotice[bid.id]}</Text>
                    ) : null}
                  </View>
                )}
                {formError !== '' && (
                  <Text style={[t.bodySm, { color: colors.danger }]}>{formError}</Text>
                )}
                <Text style={[t.bodySm, s.testNote]}>
                  {tr('bid.testNoteAccepted')}
                </Text>
              </View>
            ))
          ) : notSponsor ? (
            <View style={s.statusCard}>
              <Text style={[t.headlineSm, { color: colors.live }]}>{tr('bid.sponsorProfileNeeded.title')}</Text>
              <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                {tr('bid.sponsorProfileNeeded.body')}
              </Text>
              <Btn
                label={tr('bid.sponsorProfileNeeded.cta')}
                variant="secondary"
                onPress={() => router.push('/(tabs)/sponsorship' as never)}
              />
            </View>
          ) : (
            <View style={s.statusCard}>
              {lastClosedBid && (
                <Badge
                  label={tr('bid.lastBid', { amount: fmtUsd(lastClosedBid.amountCents), status: tr(`statusLabels.${lastClosedBid.status}`) })}
                  tone={BID_TONE[lastClosedBid.status]}
                />
              )}
              <View>
                <FieldLabel>{tr('bid.bidAmountLabel')}</FieldLabel>
                <TextInput
                  style={[inputStyle, focusedField === 'amount' && inputFocusedStyle]}
                  placeholder={tr('bid.bidAmountPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  onFocus={() => setFocusedField('amount')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              <View>
                <FieldLabel>{tr('bid.noteLabel')}</FieldLabel>
                <TextInput
                  style={[inputStyle, s.noteInput, focusedField === 'note' && inputFocusedStyle]}
                  placeholder={tr('bid.notePlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  onFocus={() => setFocusedField('note')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              {amountCents > 0 && (
                <Text style={[t.monoData, { color: colors.accent }]}>
                  {tr('bid.feeSummary', { fee: fmtUsd(feeCents), host: fmtUsd(amountCents - feeCents) })}
                </Text>
              )}
              {formError !== '' && (
                <Text style={[t.bodySm, { color: colors.danger }]}>{formError}</Text>
              )}
              <Btn
                label={tr('bid.placeBid')}
                disabled={amountCents <= 0 || submitting}
                onPress={handlePlaceBid}
              />
              <Text style={[t.bodySm, s.testNote]}>
                {tr('bid.testNotePending')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },

  coverWrap: {
    height: 190,
    backgroundColor: palette.black,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderBottomWidth: 2,
    borderBottomColor: colors.accentDim,
  },
  coverImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  coverTint: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  coverFallback: { fontSize: 40, color: palette.surfaceHighest, paddingHorizontal: spacing.lg },

  body: { padding: spacing.lg, gap: spacing.lg },

  factsCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    padding: spacing.lg,
    gap: spacing.md,
  },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  factLabel: { color: colors.textSecondary },
  factValue: { color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },
  factDivider: { height: 1, backgroundColor: colors.separator },

  dealList: { gap: spacing.md },
  dealRow: {
    backgroundColor: colors.card,
    borderLeftWidth: 4,
    borderLeftColor: colors.volt,
    padding: spacing.lg,
    gap: spacing.xs,
  },

  statusCard: {
    backgroundColor: palette.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.accentDim,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  statusHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentBlock: { gap: spacing.sm },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  testNote: { color: colors.textTertiary },
});
