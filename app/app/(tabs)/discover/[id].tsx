import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Image, Linking, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth';
import {
  fetchEvent, rsvpToEvent, cancelRsvp, API_BASE, type ApiEvent, type ApiRsvp,
} from '../../../lib/api';
import { colors, palette, spacing, type as t, hardShadow } from '../../../lib/theme';
import { AppHeader } from '../../../components/AppHeader';
import { Badge, SectionTitle } from '../../../components/ui';
import { AuthGateSheet } from '../../../components/AuthGate';

function startsToday(startsAt?: string | null): boolean {
  if (!startsAt) return false;
  const d = new Date(startsAt);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();

  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [loading, setLoading] = useState(true); // true = show spinner on initial load
  const [error, setError] = useState('');
  const [rsvp, setRsvp] = useState<ApiRsvp | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpError, setRsvpError] = useState('');
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchEvent(id)
      .then(setEvent)
      .catch(() => setError('Could not load event.'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleRsvp() {
    if (auth.status !== 'authenticated') {
      setGateOpen(true);
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
      else if (msg === 'unauthorized') setGateOpen(true);
      else setRsvpError('Something went wrong. Please try again.');
    } finally {
      setRsvpLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={[s.container, s.center]}>
        <Text style={[t.bodySm, { color: colors.textSecondary }]}>
          {error || 'Event not found'}
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[t.labelCaps, { color: colors.accent, marginTop: spacing.md }]}>
            ← Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  const dateStr = event.startsAt
    ? new Date(event.startsAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : null;
  const timeStr = event.startsAt
    ? new Date(event.startsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const rsvpState = rsvp?.state;
  const isGoing = rsvpState === 'going';
  const isWaitlisted = rsvpState === 'waitlisted';
  const isActive = isGoing || isWaitlisted;

  const rsvpBg = isGoing ? colors.volt : isWaitlisted ? colors.live : colors.fill;
  const rsvpLabel = isGoing ? 'Going' : isWaitlisted ? 'Waitlisted' : 'Join Party';

  const coverSrc = event.coverImageUrl
    ? { uri: event.coverImageUrl.startsWith('/') ? `${API_BASE}${event.coverImageUrl}` : event.coverImageUrl }
    : null;

  const liveTonight = startsToday(event.startsAt);

  // STATUS tile — only real data: the viewer's own RSVP state, else capacity.
  const statusValue = isGoing
    ? 'Going'
    : isWaitlisted
      ? 'Waitlisted'
      : event.capacity != null
        ? `Cap ${event.capacity}`
        : null;
  const statusColor = isGoing ? colors.volt : isWaitlisted ? colors.live : colors.accent;

  // Venue address masking — private locations never reveal the address here.
  const venueDetail = event.venueName
    ? event.isPrivateLocation
      ? `Private location${isActive ? '' : ' (shown after RSVP)'}`
      : event.venueAddress
    : null;

  const hasDirectionTarget =
    (event.venueLat != null && event.venueLng != null) || !!event.venueAddress;
  const canShowDirections =
    hasDirectionTarget && (!event.isPrivateLocation || isActive);

  function openDirections() {
    if (!event) return;
    let url: string;
    if (event.venueLat != null && event.venueLng != null) {
      url = Platform.select({
        ios: `http://maps.apple.com/?daddr=${event.venueLat},${event.venueLng}`,
        default: `https://www.google.com/maps/dir/?api=1&destination=${event.venueLat},${event.venueLng}`,
      });
    } else if (event.venueAddress) {
      const q = encodeURIComponent(event.venueAddress);
      url = Platform.select({
        ios: `http://maps.apple.com/?daddr=${q}`,
        default: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
      });
    } else {
      return;
    }
    Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={s.container}>
      <AppHeader back />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}>
        {/* Hero — cover photo with dark duotone treatment */}
        <View style={s.hero}>
          {coverSrc && (
            <Image source={coverSrc} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          <View style={[StyleSheet.absoluteFill, s.duoDark]} />
          <View style={[StyleSheet.absoluteFill, s.duoBlue]} />
          <View style={s.heroContent}>
            <View style={s.heroBadges}>
              {liveTonight && <Badge label="Live Tonight" tone="live" />}
              <Badge label={event.broadcastSubject} tone="accent" dot={false} />
            </View>
            <Text style={[t.headlineLg, { color: palette.white }]}>{event.title}</Text>
          </View>
        </View>

        <View style={s.content}>
          {/* Meta tile grid */}
          <View style={s.tileRow}>
            <View style={s.tile}>
              <Text style={[t.labelCapsSm, { color: colors.textSecondary }]}>Date & Time</Text>
              <Text style={[t.monoData, s.tileValue]}>
                {dateStr ? `${dateStr}${timeStr ? `\n${timeStr}` : ''}` : 'TBA'}
              </Text>
            </View>
            {statusValue && (
              <View style={[s.tile, s.tileStatus]}>
                <Text style={[t.labelCapsSm, { color: colors.accent }]}>Status</Text>
                <Text style={[t.headlineMd, { color: statusColor }]} numberOfLines={1} adjustsFontSizeToFit>
                  {statusValue}
                </Text>
              </View>
            )}
          </View>

          {/* Venue card */}
          {event.venueName && (
            <View style={s.venueCard}>
              <Text style={[t.labelCapsSm, { color: colors.textSecondary }]}>Venue</Text>
              <Text style={[t.bodyLg, { color: colors.textPrimary }]}>{event.venueName}</Text>
              {venueDetail && (
                <Text style={[t.monoData, { color: colors.textSecondary }]}>{venueDetail}</Text>
              )}
              {canShowDirections && (
                <Pressable
                  style={({ pressed }) => [s.directionsBtn, pressed && s.pressed]}
                  onPress={openDirections}
                >
                  <Text style={[t.labelCaps, { color: colors.accent }]}>Get Directions</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* The Breakdown */}
          {event.description && (
            <View style={s.section}>
              <SectionTitle>The Breakdown</SectionTitle>
              <Text style={[t.bodyMd, { color: colors.textSecondary }]}>
                {event.description}
              </Text>
            </View>
          )}

          {/* Auth nudge */}
          {auth.status !== 'authenticated' && (
            <Pressable style={s.authNudge} onPress={() => setGateOpen(true)}>
              <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                Sign in to RSVP and see full venue details →
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* RSVP bar */}
      <View style={[s.rsvpBar, { paddingBottom: insets.bottom + spacing.md }]}>
        {rsvpError ? (
          <Text style={[t.bodySm, s.rsvpError]}>{rsvpError}</Text>
        ) : null}
        <Pressable
          style={[
            s.rsvpBtn,
            { backgroundColor: rsvpBg, opacity: rsvpLoading ? 0.6 : 1 },
            !isActive && !rsvpLoading && hardShadow(palette.secondary, 4),
          ]}
          onPress={handleRsvp}
          disabled={rsvpLoading}
        >
          {rsvpLoading ? (
            <ActivityIndicator color={palette.black} />
          ) : (
            <Text style={[t.headlineSm, { color: palette.black }]}>{rsvpLabel}</Text>
          )}
        </Pressable>
        {isActive && (
          <Pressable onPress={handleRsvp} disabled={rsvpLoading}>
            <Text style={[t.labelCapsSm, s.cancelText]}>Cancel RSVP</Text>
          </Pressable>
        )}
      </View>

      <AuthGateSheet
        visible={gateOpen}
        onClose={() => setGateOpen(false)}
        message="Sign in to RSVP, join the guest list, and see full venue details."
        redirect={id ? `/(tabs)/discover/${id}` : undefined}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Hero
  hero: {
    minHeight: 260,
    backgroundColor: palette.surfaceMid,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    justifyContent: 'flex-end',
  },
  duoDark: { backgroundColor: 'rgba(15,15,18,0.5)' },
  duoBlue: { backgroundColor: 'rgba(0,101,117,0.18)' },
  heroContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing['3xl'], gap: spacing.md },
  heroBadges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.xl },

  // Meta tile grid
  tileRow: { flexDirection: 'row', gap: spacing.xs },
  tile: {
    flex: 1,
    backgroundColor: palette.surfaceMid,
    borderWidth: 1,
    borderColor: palette.surfaceHighest,
    padding: spacing.lg,
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  tileStatus: {
    backgroundColor: `${colors.accent}14`,
    borderColor: colors.accent,
  },
  tileValue: { color: colors.textPrimary, textTransform: 'uppercase' },

  // Venue card
  venueCard: {
    backgroundColor: palette.surfaceMid,
    borderWidth: 1,
    borderColor: palette.surfaceHighest,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  directionsBtn: {
    marginTop: spacing.sm,
    borderWidth: 2,
    borderColor: colors.accent,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  pressed: { opacity: 0.82 },

  section: { gap: spacing.sm },

  authNudge: {
    backgroundColor: palette.surfaceMid,
    borderWidth: 1,
    borderColor: palette.surfaceHighest,
    padding: spacing.lg,
  },

  // RSVP bar
  rsvpBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1, borderTopColor: colors.separator,
    gap: spacing.sm,
  },
  rsvpBtn: { height: 56, alignItems: 'center', justifyContent: 'center' },
  rsvpError: { color: colors.danger, textAlign: 'center' },
  cancelText: { color: colors.textTertiary, textAlign: 'center' },
});
