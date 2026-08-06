import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { colors, palette, spacing, fonts, type as t } from '../../../lib/theme';
import { Btn, Badge, FieldLabel, SectionTitle, inputStyle, inputFocusedStyle } from '../../../components/ui';
import { GuestGate } from '../../../components/AuthGate';
import { useAuth } from '../../../lib/auth';
import {
  fetchEvent, fetchMyBids, placeSponsorBid, updateBidStatus, resolveImageUrl,
  type ApiEvent, type ApiSponsorBid, type SponsorshipStatus,
} from '../../../lib/api';

const PLATFORM_FEE_RATE = 0.15;

const BID_BADGE: Record<SponsorshipStatus, { label: string; tone: 'neutral' | 'volt' | 'live' }> = {
  pending:   { label: 'Pending',   tone: 'neutral' },
  active:    { label: 'Active',    tone: 'volt' },
  rejected:  { label: 'Rejected',  tone: 'live' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

function fmtUsd(cents: number): string {
  const str = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${str.endsWith('.00') ? str.slice(0, -3) : str}`;
}

function fmtEventDate(iso: string | null): string {
  if (!iso) return 'DATE TBC';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  return `${date} · ${time}`.toUpperCase();
}

const DEAL_POINTS = [
  {
    title: 'Your Bid',
    body: 'Offer a sponsorship amount for this event. The host sees your bid and note.',
  },
  {
    title: 'Platform Fee — 15%',
    body: 'SpotSeek keeps 15% of an accepted bid. The host receives the remainder.',
  },
  {
    title: 'Host Decision',
    body: 'The host accepts or rejects your bid. You can cancel while it is pending.',
  },
  {
    title: 'Payment',
    body: 'Charged only after the host accepts. Payments are currently in test mode — no real money moves.',
  },
] as const;

export default function SponsorshipDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const auth = useAuth();

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
      setLoadError('Could not load this event.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openBid = bids.find((b) => b.status === 'pending' || b.status === 'active') ?? null;
  const lastClosedBid = openBid ? null : bids[0] ?? null;

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
      else if (msg === 'unauthorized') setFormError('Sign in to place a bid.');
      else setFormError('Bid failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelBid() {
    if (!openBid) return;
    setSubmitting(true);
    setFormError('');
    try {
      await updateBidStatus(openBid.id, 'cancelled');
      await load();
    } catch {
      setFormError('Could not cancel the bid. Try again.');
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
          title="Sponsor this party"
          message="Sign in to review sponsorship terms and place a bid on this watch party."
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
            {loadError || 'Event not found.'}
          </Text>
          <Btn label="Retry" variant="secondary" small onPress={() => { setLoading(true); load(); }} />
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
          <Badge label="Open for Bids" tone="accent" />
          <Text style={[t.headlineLg, { color: colors.accent }]}>{event.title}</Text>
          {event.description != null && event.description !== '' && (
            <Text style={[t.bodyMd, { color: colors.textSecondary }]}>{event.description}</Text>
          )}

          {/* ── Event facts ──────────────────────────────────────────────── */}
          <View style={s.factsCard}>
            <View style={s.factRow}>
              <Text style={[t.labelCaps, s.factLabel]}>Date</Text>
              <Text style={[t.monoData, s.factValue]}>{fmtEventDate(event.startsAt)}</Text>
            </View>
            <View style={s.factDivider} />
            <View style={s.factRow}>
              <Text style={[t.labelCaps, s.factLabel]}>Venue</Text>
              <Text style={[t.monoData, s.factValue]} numberOfLines={1}>
                {event.isPrivateLocation
                  ? 'PRIVATE — AFTER RSVP'
                  : (event.venueName ?? 'TBC').toUpperCase()}
              </Text>
            </View>
            {event.capacity != null && (
              <>
                <View style={s.factDivider} />
                <View style={s.factRow}>
                  <Text style={[t.labelCaps, s.factLabel]}>Capacity</Text>
                  <Text style={[t.monoData, s.factValue]}>{event.capacity}</Text>
                </View>
              </>
            )}
          </View>

          {/* ── The deal (real auction mechanics) ────────────────────────── */}
          <SectionTitle>The Deal</SectionTitle>
          <View style={s.dealList}>
            {DEAL_POINTS.map((p) => (
              <View key={p.title} style={s.dealRow}>
                <Text style={[t.labelCaps, { color: colors.volt }]}>{p.title}</Text>
                <Text style={[t.bodySm, { color: colors.textSecondary }]}>{p.body}</Text>
              </View>
            ))}
          </View>

          {/* ── Bid status / bid form ────────────────────────────────────── */}
          <SectionTitle accent={colors.live}>Sponsorship Status</SectionTitle>

          {openBid ? (
            <View style={s.statusCard}>
              <View style={s.statusHead}>
                <Text style={[t.labelCaps, { color: colors.textSecondary }]}>Your Bid</Text>
                <Badge label={BID_BADGE[openBid.status].label} tone={BID_BADGE[openBid.status].tone} />
              </View>
              <Text style={[t.headlineLg, { color: colors.textPrimary }]}>
                {fmtUsd(openBid.amountCents)}
              </Text>
              <View style={s.statusRow}>
                <Text style={[t.labelCapsSm, s.factLabel]}>Platform Fee (15%)</Text>
                <Text style={[t.monoData, { color: colors.live }]}>{fmtUsd(openBid.platformFeeCents)}</Text>
              </View>
              <View style={s.statusRow}>
                <Text style={[t.labelCapsSm, s.factLabel]}>Host Receives</Text>
                <Text style={[t.monoData, { color: colors.volt }]}>
                  {fmtUsd(openBid.amountCents - openBid.platformFeeCents)}
                </Text>
              </View>
              <View style={s.statusRow}>
                <Text style={[t.labelCapsSm, s.factLabel]}>Placed</Text>
                <Text style={[t.monoData, s.factValue]}>
                  {new Date(openBid.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
                </Text>
              </View>
              {openBid.note != null && openBid.note !== '' && (
                <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                  Note: {openBid.note}
                </Text>
              )}
              {openBid.status === 'pending' ? (
                <Btn label="Cancel Bid" variant="danger" disabled={submitting} onPress={handleCancelBid} />
              ) : (
                <Text style={[t.bodySm, { color: colors.volt }]}>
                  The host accepted this bid.
                </Text>
              )}
              {formError !== '' && (
                <Text style={[t.bodySm, { color: colors.danger }]}>{formError}</Text>
              )}
              <Text style={[t.bodySm, s.testNote]}>
                Payment is processed only after the host accepts — payments are in test
                mode, no real charges.
              </Text>
            </View>
          ) : notSponsor ? (
            <View style={s.statusCard}>
              <Text style={[t.headlineSm, { color: colors.live }]}>Sponsor Profile Needed</Text>
              <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                Only registered sponsors can bid. Register your company in the
                Sponsorship Hub, then come back to place a bid.
              </Text>
              <Btn
                label="Register in the Hub"
                variant="secondary"
                onPress={() => router.push('/(tabs)/sponsorship' as never)}
              />
            </View>
          ) : (
            <View style={s.statusCard}>
              {lastClosedBid && (
                <Badge
                  label={`Last bid · ${fmtUsd(lastClosedBid.amountCents)} · ${BID_BADGE[lastClosedBid.status].label}`}
                  tone={BID_BADGE[lastClosedBid.status].tone}
                />
              )}
              <View>
                <FieldLabel>Bid Amount (USD)</FieldLabel>
                <TextInput
                  style={[inputStyle, focusedField === 'amount' && inputFocusedStyle]}
                  placeholder="e.g. 250"
                  placeholderTextColor={colors.textTertiary}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  onFocus={() => setFocusedField('amount')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              <View>
                <FieldLabel>Note to Host (Optional)</FieldLabel>
                <TextInput
                  style={[inputStyle, s.noteInput, focusedField === 'note' && inputFocusedStyle]}
                  placeholder="What your brand brings to the party…"
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
                  PLATFORM FEE (15%): {fmtUsd(feeCents)} · HOST RECEIVES: {fmtUsd(amountCents - feeCents)}
                </Text>
              )}
              {formError !== '' && (
                <Text style={[t.bodySm, { color: colors.danger }]}>{formError}</Text>
              )}
              <Btn
                label="Place Bid"
                disabled={amountCents <= 0 || submitting}
                onPress={handlePlaceBid}
              />
              <Text style={[t.bodySm, s.testNote]}>
                Payment is processed only after the host accepts your bid — payments are
                in test mode, no real charges.
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
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  testNote: { color: colors.textTertiary },
});
