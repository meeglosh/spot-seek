import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, useColorScheme, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth';
import { fetchEvent, rsvpToEvent, cancelRsvp, type ApiEvent, type ApiRsvp } from '../../../lib/api';
import { light, dark, fonts, spacing, radius, palette, type Colors } from '../../../lib/theme';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const auth = useAuth();

  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [loading, setLoading] = useState(true); // true = show spinner on initial load
  const [error, setError] = useState('');
  const [rsvp, setRsvp] = useState<ApiRsvp | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpError, setRsvpError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchEvent(id)
      .then(setEvent)
      .catch(() => setError('Could not load event.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleRsvp() {
    if (auth.status !== 'authenticated') {
      router.push('/(auth)/sign-in');
      return;
    }
    if (!event) return;

    setRsvpLoading(true);
    setRsvpError('');
    try {
      if (rsvp && rsvp.state !== 'cancelled') {
        await cancelRsvp(rsvp.id);
        setRsvp({ ...rsvp, state: 'cancelled' });
      } else {
        const newRsvp = await rsvpToEvent(event.id);
        setRsvp(newRsvp);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'already_rsvpd') setRsvpError('You already have an RSVP for this event.');
      else if (msg === 'unauthorized') router.push('/(auth)/sign-in');
      else setRsvpError('Something went wrong. Please try again.');
    } finally {
      setRsvpLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.container, s.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.textSecondary} />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={[s.container, s.center, { backgroundColor: c.bg }]}>
        <Text style={[{ color: c.textSecondary, fontFamily: fonts.sansRegular, fontSize: 15 }]}>
          {error || 'Event not found'}
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[{ color: c.textPrimary, fontFamily: fonts.sansMedium, fontSize: 14, marginTop: spacing.md }]}>
            ← Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  const dateStr = event.startsAt
    ? new Date(event.startsAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;
  const timeStr = event.startsAt
    ? new Date(event.startsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const rsvpState = rsvp?.state;
  const isGoing = rsvpState === 'going';
  const isWaitlisted = rsvpState === 'waitlisted';
  const isActive = isGoing || isWaitlisted;

  const rsvpBg = isGoing ? palette.green : isWaitlisted ? palette.amber : c.fill;
  const rsvpText = isGoing ? '✓ Going' : isWaitlisted ? '⏳ Waitlisted' : 'RSVP to this event';

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.backBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={[s.backBtn, { backgroundColor: c.bgSubtle }]}>
          <Text style={[{ color: c.textPrimary, fontFamily: fonts.sansMedium, fontSize: 14 }]}>← Back</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Hero */}
        <View style={[s.hero, { backgroundColor: c.bgSubtle }]}>
          <View style={[s.subjectTag, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <Text style={[s.subjectText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
              {event.broadcastSubject}
            </Text>
          </View>
          <Text style={[s.heroTitle, { color: c.textPrimary, fontFamily: fonts.display }]}>
            {event.title}
          </Text>
        </View>

        <View style={[s.content, { paddingHorizontal: spacing.xl }]}>
          {/* Info card */}
          <View style={[s.infoCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            {dateStr && (
              <InfoRow icon="📅" label={[dateStr, timeStr].filter(Boolean).join(' · ')} c={c} />
            )}
            {event.venueName && (
              <InfoRow
                icon="📍"
                label={
                  event.isPrivateLocation
                    ? `${event.venueName} · Private location${isActive ? '' : ' (shown after RSVP)'}`
                    : [event.venueName, event.venueAddress].filter(Boolean).join(' · ')
                }
                c={c}
              />
            )}
            {event.capacity != null && (
              <InfoRow icon="🎟" label={`Capacity: ${event.capacity} people`} c={c} />
            )}
          </View>

          {/* Description */}
          {event.description && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>
                About
              </Text>
              <Text style={[s.description, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
                {event.description}
              </Text>
            </View>
          )}

          {/* Auth nudge */}
          {auth.status !== 'authenticated' && (
            <Pressable
              style={[s.authNudge, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}
              onPress={() => router.push('/(auth)/sign-in')}
            >
              <Text style={[{ color: c.textSecondary, fontFamily: fonts.sansRegular, fontSize: 14 }]}>
                Sign in to RSVP and see full venue details →
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* RSVP bar */}
      <View style={[s.rsvpBar, { backgroundColor: c.bg, borderTopColor: c.cardBorder, paddingBottom: insets.bottom + spacing.md }]}>
        {rsvpError ? (
          <Text style={[s.rsvpError, { fontFamily: fonts.sansRegular }]}>{rsvpError}</Text>
        ) : null}
        <Pressable
          style={[s.rsvpBtn, { backgroundColor: rsvpBg, opacity: rsvpLoading ? 0.6 : 1 }]}
          onPress={handleRsvp}
          disabled={rsvpLoading}
        >
          {rsvpLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[s.rsvpBtnText, { fontFamily: fonts.sansSemiBold, color: isActive ? '#fff' : c.fillText }]}>
              {rsvpText}
            </Text>
          )}
        </Pressable>
        {isActive && (
          <Pressable onPress={handleRsvp} disabled={rsvpLoading}>
            <Text style={[s.cancelText, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>
              Cancel RSVP
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function InfoRow({ icon, label, c }: { icon: string; label: string; c: Colors }) {
  return (
    <View style={ir.row}>
      <Text style={ir.icon}>{icon}</Text>
      <Text style={[ir.label, { color: c.textSecondary, fontFamily: fonts.sansRegular }]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const ir = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  icon: { fontSize: 16, width: 20, textAlign: 'center', marginTop: 1 },
  label: { flex: 1, fontSize: 14, lineHeight: 20 },
});

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  backBar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  backBtn: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full },
  hero: { paddingHorizontal: spacing.xl, paddingVertical: spacing['3xl'], gap: spacing.md },
  subjectTag: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1 },
  subjectText: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  heroTitle: { fontSize: 36, lineHeight: 40 },
  content: { paddingTop: spacing.xl, gap: spacing.xl },
  infoCard: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 15 },
  description: { fontSize: 15, lineHeight: 22 },
  authNudge: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  rsvpBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md,
    borderTopWidth: 1, gap: spacing.sm,
  },
  rsvpBtn: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rsvpBtnText: { fontSize: 16 },
  rsvpError: { fontSize: 13, color: palette.red, textAlign: 'center' },
  cancelText: { fontSize: 13, textAlign: 'center' },
});
