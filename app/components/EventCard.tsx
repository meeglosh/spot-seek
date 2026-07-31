import React from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, palette, spacing, type as t } from '../lib/theme';
import { Badge, Btn } from './ui';

import { API_BASE } from '../lib/api';

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
  venueLat?: number | null;
  venueLng?: number | null;
  coverImageUrl?: string | null;
};

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

export function EventCard({ event, compact = false }: { event: EventItem; compact?: boolean }) {
  const router = useRouter();

  const dateStr = event.startsAt
    ? new Date(event.startsAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : null;
  const timeStr = event.startsAt
    ? new Date(event.startsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  const coverSrc = event.coverImageUrl
    ? { uri: event.coverImageUrl.startsWith('/') ? `${API_BASE}${event.coverImageUrl}` : event.coverImageUrl }
    : null;

  const today = startsToday(event.startsAt);
  const goTo = () => router.push({ pathname: '/(tabs)/discover/[id]', params: { id: event.id } });

  const badges = (
    <View style={s.badgeRow}>
      {today && <Badge label="Today" tone="live" />}
      <Badge label={event.broadcastSubject} tone="accent" dot={false} />
    </View>
  );

  return (
    <Pressable style={s.card} onPress={goTo}>
      {/* Full-bleed cover with dark duotone treatment */}
      {coverSrc && !compact && (
        <View style={s.coverWrap}>
          <Image source={coverSrc} style={s.cover} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, s.duoDark]} />
          <View style={[StyleSheet.absoluteFill, s.duoBlue]} />
          <View style={s.coverBadges}>{badges}</View>
        </View>
      )}

      <View style={[s.body, compact && s.bodyCompact]}>
        {(!coverSrc || compact) && badges}

        {/* Title */}
        <Text
          style={[compact ? t.headlineSm : t.headlineMd, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {event.title}
        </Text>

        {/* Venue + time */}
        {!compact && (
          <View style={s.meta}>
            {event.venueName && (
              <Text style={[t.monoData, s.venueText]} numberOfLines={1}>
                {event.isPrivateLocation ? `${event.venueName} — private` : event.venueName}
              </Text>
            )}
            {(dateStr || timeStr) && (
              <Text style={[t.monoData, { color: colors.textSecondary }]}>
                {[dateStr, timeStr].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.footerLeft}>
            {typeof event.goingCount === 'number' && (
              <Text style={[t.labelCaps, { color: colors.textPrimary }]}>
                {event.goingCount} going
              </Text>
            )}
            {event.hostName && (
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]} numberOfLines={1}>
                Hosted by {event.hostName}
              </Text>
            )}
          </View>
          <Btn label="Join" variant="secondary" small onPress={goTo} />
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: palette.surfaceLow,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    borderTopWidth: 2,
    borderTopColor: colors.accent,
    overflow: 'hidden',
  },
  coverWrap: { width: '100%', height: 160 },
  cover: { width: '100%', height: '100%' },
  duoDark: { backgroundColor: 'rgba(15,15,18,0.45)' },
  duoBlue: { backgroundColor: 'rgba(0,101,117,0.18)' },
  coverBadges: { position: 'absolute', top: spacing.md, left: spacing.md },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  bodyCompact: { paddingTop: spacing.md },
  venueText: { color: colors.accent, textTransform: 'uppercase' },
  meta: { gap: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  footerLeft: { flex: 1, gap: 2, paddingRight: spacing.md },
});
