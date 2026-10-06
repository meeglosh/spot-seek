import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Text } from './Text';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radius, elevation, type as t } from '../lib/theme';
import { Badge, Btn, Press } from './ui';

import { API_BASE } from '../lib/api';
import { formatEventDateTime } from '../lib/dateFormat';

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
  venueTimezone?: string | null;
  coverImageUrl?: string | null;
  sponsorCount?: number;
  topSponsor?: string | null;
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
  const { t: tr } = useTranslation('discover');

  const { dateStr, timeStr } = event.startsAt
    ? formatEventDateTime(event.startsAt, event.venueTimezone ?? null)
    : { dateStr: null, timeStr: null };

  const coverSrc = event.coverImageUrl
    ? { uri: event.coverImageUrl.startsWith('/') ? `${API_BASE}${event.coverImageUrl}` : event.coverImageUrl }
    : null;

  const today = startsToday(event.startsAt);
  const goTo = () => router.push({ pathname: '/(tabs)/discover/[id]', params: { id: event.id } });

  const sponsorTag = event.topSponsor
    ? (event.sponsorCount ?? 1) > 1
      ? tr('card.sponsorTagMore', { name: event.topSponsor, count: (event.sponsorCount ?? 1) - 1 })
      : tr('card.sponsorTag', { name: event.topSponsor })
    : null;

  const badges = (
    <View style={s.badgeRow}>
      {today && <Badge label={tr('card.today')} tone="live" />}
      <Badge label={event.broadcastSubject} tone="neutral" dot={false} />
      {sponsorTag && <Badge label={sponsorTag} tone="confirmed" icon="live" />}
    </View>
  );

  return (
    // Outer view: opaque surface + soft shadow. Inner view: clips the cover to
    // the rounded corners (iOS drops a shadow on an overflow:hidden view).
    <Press style={s.card} onPress={goTo} accessibilityRole="button">
      <View style={s.clip}>
      {/* Full-bleed cover, dimmed with the scrim token for legibility */}
      {coverSrc && !compact && (
        <View style={s.coverWrap}>
          <Image source={coverSrc} style={s.cover} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, s.mediaDim]} />
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
              <Text style={[t.labelMd, s.venueText]} numberOfLines={1}>
                {event.isPrivateLocation ? tr('card.privateLocation', { venue: event.venueName }) : event.venueName}
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
              <Text style={[t.label, { color: colors.textPrimary }]}>
                {tr('card.goingCount', { count: event.goingCount })}
              </Text>
            )}
            {event.hostName && (
              <Text style={[t.labelSm, { color: colors.textTertiary }]} numberOfLines={1}>
                {tr('card.hostedBy', { name: event.hostName })}
              </Text>
            )}
          </View>
          <Btn label={tr('card.join')} variant="secondary" small onPress={goTo} />
        </View>
      </View>
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  card: { ...elevation(1), borderRadius: radius.card },
  clip: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface1 },
  coverWrap: { width: '100%', height: 160 },
  cover: { width: '100%', height: '100%' },
  mediaDim: { backgroundColor: colors.mediaDim },
  coverBadges: { position: 'absolute', top: spacing.md, left: spacing.md },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  bodyCompact: { paddingTop: spacing.md },
  venueText: { color: colors.textPrimary },
  meta: { gap: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  footerLeft: { flex: 1, gap: 2, paddingRight: spacing.md },
});
