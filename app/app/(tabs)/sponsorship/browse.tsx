import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { colors, palette, spacing, type as t } from '../../../lib/theme';
import { Btn, Chip, Badge, FieldLabel, inputStyle } from '../../../components/ui';
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

export default function BrowseSponsorsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();

  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [sponsors, setSponsors] = useState<ApiSponsorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setError('Could not load sponsors.');
    } finally {
      setLoading(false);
    }
  }, [eventId, auth.status]);

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
      setSendError('Enter a valid amount.');
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
      setSendError((err as Error).message || 'Could not send request.');
    } finally {
      setSending(false);
    }
  }

  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader back />
        <GuestGate
          title="Find Sponsors"
          message="Sign in to browse sponsors and request sponsorship for your event."
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
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>Find Sponsors</Text>
        <Text style={[t.bodyMd, s.subtitle]} numberOfLines={1}>
          {event ? `For "${event.title}"` : 'Loading event…'}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing['2xl'] }} />
        ) : error ? (
          <Text style={[t.bodySm, { color: colors.danger }]}>{error}</Text>
        ) : sponsors.length === 0 ? (
          <Text style={[t.bodySm, { color: colors.textTertiary }]}>
            No sponsors have registered yet — check back later.
          </Text>
        ) : (
          sponsors.map((sp) => {
            const isOpen = openId === sp.id;
            const wasSent = sentIds.has(sp.id);
            return (
              <View key={sp.id} style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={[t.headlineSm, { color: colors.textPrimary }]} numberOfLines={1}>
                    {sp.companyName}
                  </Text>
                  {(sp.sponsorshipCount ?? 0) > 0 && (
                    <Badge label={`${sp.sponsorshipCount} sponsored`} tone="accent" dot={false} />
                  )}
                </View>
                {sp.website && (
                  <Text style={[t.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>{sp.website}</Text>
                )}
                {(sp.budgetMinCents != null || sp.budgetMaxCents != null) && (
                  <Text style={[t.monoData, { color: colors.textSecondary }]}>
                    Budget: {sp.budgetMinCents != null ? fmtUsd(sp.budgetMinCents) : '$0'}
                    {' – '}
                    {sp.budgetMaxCents != null ? fmtUsd(sp.budgetMaxCents) : '+'}
                  </Text>
                )}
                {sp.categories && sp.categories.length > 0 && (
                  <View style={s.categoryRow}>
                    {sp.categories.map((cat) => <Chip key={cat} label={cat} />)}
                  </View>
                )}

                {wasSent ? (
                  <Badge label="Request sent" tone="volt" />
                ) : isOpen ? (
                  <View style={s.requestForm}>
                    <View style={s.field}>
                      <FieldLabel>Proposed Amount ($)</FieldLabel>
                      <TextInput
                        style={inputStyle}
                        placeholder="500"
                        placeholderTextColor={colors.textTertiary}
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={s.field}>
                      <FieldLabel>Note (Optional)</FieldLabel>
                      <TextInput
                        style={[inputStyle, s.noteInput]}
                        placeholder="Why this event is a good fit…"
                        placeholderTextColor={colors.textTertiary}
                        value={note}
                        onChangeText={setNote}
                        multiline
                      />
                    </View>
                    {sendError !== '' && <Text style={[t.bodySm, { color: colors.danger }]}>{sendError}</Text>}
                    <View style={s.requestActions}>
                      <Btn label="Cancel" variant="ghost" small style={s.requestBtn} onPress={() => setOpenId(null)} disabled={sending} />
                      <Btn
                        label={sending ? '…' : 'Send Request'}
                        small
                        style={s.requestBtn}
                        onPress={() => handleSend(sp.id)}
                        disabled={sending}
                      />
                    </View>
                  </View>
                ) : (
                  <Btn label="Request Sponsorship" variant="secondary" small onPress={() => openRequest(sp.id)} />
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
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  subtitle: { color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.xl },

  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  requestForm: { gap: spacing.md, marginTop: spacing.xs },
  field: { gap: 0 },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  requestActions: { flexDirection: 'row', gap: spacing.sm },
  requestBtn: { flex: 1 },
});
