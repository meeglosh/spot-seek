import React from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { light, dark, fonts, spacing, radius, palette } from '../lib/theme';

export type EventItem = {
  id: string;
  title: string;
  broadcastSubject: string;
  startsAt?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  isPrivateLocation?: boolean;
  capacity?: number | null;
  status: string;
  hostName?: string;
  goingCount?: number;
};

export function EventCard({ event, compact = false }: { event: EventItem; compact?: boolean }) {
  const router = useRouter();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  const dateStr = event.startsAt
    ? new Date(event.startsAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : null;
  const timeStr = event.startsAt
    ? new Date(event.startsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Pressable
      style={[s.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}
      onPress={() => router.push({ pathname: '/(tabs)/discover/[id]', params: { id: event.id } })}
    >
      {/* Subject tag */}
      <View style={[s.subjectRow]}>
        <View style={[s.subjectTag, { backgroundColor: c.bgSubtle }]}>
          <Text style={[s.subjectText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
            {event.broadcastSubject}
          </Text>
        </View>
        {event.status === 'published' && (
          <View style={[s.liveDot, { backgroundColor: palette.green }]} />
        )}
      </View>

      {/* Title */}
      <Text
        style={[s.title, { color: c.textPrimary, fontFamily: fonts.display }, compact && s.titleCompact]}
        numberOfLines={2}
      >
        {event.title}
      </Text>

      {/* Venue + time */}
      {!compact && (
        <View style={s.meta}>
          {(dateStr || timeStr) && (
            <Text style={[s.metaText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
              {[dateStr, timeStr].filter(Boolean).join(' · ')}
            </Text>
          )}
          {event.venueName && (
            <Text style={[s.metaText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]} numberOfLines={1}>
              {event.isPrivateLocation ? `📍 ${event.venueName} (private)` : `📍 ${event.venueName}`}
            </Text>
          )}
        </View>
      )}

      {/* Footer */}
      <View style={s.footer}>
        {event.hostName && (
          <Text style={[s.hostText, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>
            Hosted by {event.hostName}
          </Text>
        )}
        {typeof event.goingCount === 'number' && (
          <View style={[s.goingPill, { backgroundColor: c.bgSubtle }]}>
            <Text style={[s.goingText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
              {event.goingCount} going
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  subjectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subjectTag: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  subjectText: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  title: { fontSize: 22, lineHeight: 26 },
  titleCompact: { fontSize: 18, lineHeight: 22 },
  meta: { gap: 2 },
  metaText: { fontSize: 13, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  hostText: { fontSize: 12 },
  goingPill: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  goingText: { fontSize: 12 },
});
