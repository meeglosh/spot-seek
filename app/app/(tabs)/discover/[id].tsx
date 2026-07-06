import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, useColorScheme,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { light, dark, fonts, spacing, radius, palette, type Colors } from '../../../lib/theme';

// Sample data matching IDs from discover feed
const EVENTS_BY_ID: Record<string, {
  id: string; title: string; broadcastSubject: string;
  startsAt?: string; venueName?: string; venueAddress?: string;
  isPrivateLocation?: boolean; capacity?: number; description?: string;
  hostName: string; goingCount: number; status: string;
}> = {
  '1': { id: '1', title: 'Arsenal v Spurs North London Derby', broadcastSubject: 'Premier League', startsAt: new Date(Date.now() + 3600000 * 24).toISOString(), venueName: 'The Red Lion', venueAddress: '123 Islington High St', capacity: 30, description: 'The biggest North London derby of the season. Come early to secure a seat, we\'ll have the main screen plus two side screens.', hostName: 'Marcus T.', goingCount: 24, status: 'published' },
  '2': { id: '2', title: 'NFL Sunday RedZone', broadcastSubject: 'NFL', startsAt: new Date(Date.now() + 3600000 * 48).toISOString(), venueName: 'Sports Bar NYC', venueAddress: '456 W 44th St', description: 'All the action, all at once. RedZone from kickoff.', hostName: 'Sarah K.', goingCount: 18, status: 'published' },
};

type RsvpState = 'none' | 'going' | 'waitlisted';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const [rsvp, setRsvp] = useState<RsvpState>('none');

  const event = EVENTS_BY_ID[id ?? ''];

  if (!event) {
    return (
      <View style={[s.container, { backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[{ color: c.textSecondary, fontFamily: fonts.sansRegular }]}>Event not found</Text>
      </View>
    );
  }

  const dateStr = event.startsAt
    ? new Date(event.startsAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;
  const timeStr = event.startsAt
    ? new Date(event.startsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const isFull = event.capacity ? event.goingCount >= event.capacity : false;

  function handleRsvp() {
    if (rsvp !== 'none') { setRsvp('none'); return; }
    setRsvp(isFull ? 'waitlisted' : 'going');
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Back button */}
      <View style={[s.backBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={[s.backBtn, { backgroundColor: c.bgSubtle }]}>
          <Text style={[{ color: c.textPrimary, fontFamily: fonts.sansMedium, fontSize: 14 }]}>← Back</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
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
          {/* Key info */}
          <View style={[s.infoCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            {dateStr && (
              <InfoRow icon="📅" label={[dateStr, timeStr].filter(Boolean).join(' · ')} c={c} />
            )}
            {event.venueName && (
              <InfoRow
                icon="📍"
                label={event.isPrivateLocation
                  ? `${event.venueName} · Private location (shown after RSVP)`
                  : `${event.venueName}${event.venueAddress ? ` · ${event.venueAddress}` : ''}`
                }
                c={c}
              />
            )}
            <InfoRow icon="👤" label={`Hosted by ${event.hostName}`} c={c} />
            <InfoRow
              icon="🎟"
              label={event.capacity
                ? `${event.goingCount} going · ${event.capacity - event.goingCount} spots left`
                : `${event.goingCount} going · Unlimited capacity`
              }
              c={c}
            />
          </View>

          {/* Description */}
          {event.description && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>
                About this event
              </Text>
              <Text style={[s.description, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
                {event.description}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* RSVP bar */}
      <View style={[s.rsvpBar, { backgroundColor: c.bg, borderTopColor: c.cardBorder, paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          style={[
            s.rsvpBtn,
            rsvp === 'going' && { backgroundColor: palette.green },
            rsvp === 'waitlisted' && { backgroundColor: palette.amber },
            rsvp === 'none' && { backgroundColor: c.fill },
          ]}
          onPress={handleRsvp}
        >
          <Text style={[s.rsvpBtnText, { fontFamily: fonts.sansSemiBold, color: rsvp === 'none' ? c.fillText : '#fff' }]}>
            {rsvp === 'going' ? '✓ Going' : rsvp === 'waitlisted' ? '⏳ Waitlisted' : isFull ? 'Join waitlist' : 'RSVP'}
          </Text>
        </Pressable>
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
  backBar: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  backBtn: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full },
  hero: { paddingHorizontal: spacing.xl, paddingVertical: spacing['3xl'], gap: spacing.md },
  subjectTag: {
    alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.full, borderWidth: 1,
  },
  subjectText: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  heroTitle: { fontSize: 36, lineHeight: 40 },
  content: { paddingTop: spacing.xl, gap: spacing.xl },
  infoCard: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 15 },
  description: { fontSize: 15, lineHeight: 22 },
  rsvpBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  rsvpBtn: {
    height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
  },
  rsvpBtnText: { fontSize: 16 },
});
