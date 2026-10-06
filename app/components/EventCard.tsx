import React, { useState } from 'react';
import { View, StyleSheet, Image, Platform, Share } from 'react-native';
import { Text } from './Text';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radius, elevation, type as t } from '../lib/theme';
import { Badge, Btn, Press } from './ui';
import { ReportSheet } from './ReportSheet';
import { useAuthGate } from './AuthGate';
import { useAuth } from '../lib/auth';
import { useBlockHost } from '../lib/useBlockHost';

import { API_BASE } from '../lib/api';
import { eventShareUrl } from '../lib/shareLinks';
import { useOpenDirections, hasDirectionsTarget } from '../lib/directions';
import { formatEventDateTime } from '../lib/dateFormat';

export type EventItem = {
  id: string;
  hostId?: string;
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
  const { t: trMod } = useTranslation('moderation');
  const auth = useAuth();
  const { requireAuth, gateSheet } = useAuthGate();
  const blockHost = useBlockHost();
  const [reportOpen, setReportOpen] = useState(false);

  const { dateStr, timeStr } = event.startsAt
    ? formatEventDateTime(event.startsAt, event.venueTimezone ?? null)
    : { dateStr: null, timeStr: null };

  const coverSrc = event.coverImageUrl
    ? { uri: event.coverImageUrl.startsWith('/') ? `${API_BASE}${event.coverImageUrl}` : event.coverImageUrl }
    : null;

  const today = startsToday(event.startsAt);
  const goTo = () => router.push({ pathname: '/(tabs)/discover/[id]', params: { id: event.id } });
  const openDirectionsSheet = useOpenDirections();

  // Long-press menu actions reuse the same logic as the detail screen.
  const canDirections =
    !event.isPrivateLocation &&
    hasDirectionsTarget({ lat: event.venueLat, lng: event.venueLng, address: event.venueAddress });
  const shareEvent = () => {
    const link = eventShareUrl(event.id);
    const when = [dateStr, timeStr].filter(Boolean).join(' ');
    const message = [event.title, when].filter(Boolean).join('\n');
    Share.share(Platform.OS === 'ios' ? { message, url: link } : { message: `${message}\n${link}` }).catch(() => {});
  };
  const getDirections = () => openDirectionsSheet({
    lat: event.venueLat, lng: event.venueLng, name: event.venueName, address: event.venueAddress,
  });

  // Report: hidden on your own party. Guests see it and get the sign-up sheet.
  const isOwn = auth.status === 'authenticated' && auth.user.id === event.hostId;
  const canReport = !isOwn;
  const reportParty = () => {
    if (requireAuth({ kind: 'report', eventId: event.id })) setReportOpen(true);
  };
  const blockAfterReport = () => {
    setReportOpen(false);
    if (event.hostId) setTimeout(() => blockHost({ id: event.hostId!, name: event.hostName }), 400);
  };

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

  // iOS: wrapped in an expo-router Link so a long press opens the NATIVE
  // context menu (Share, Get directions) and a tap navigates through the Link.
  // The Link supplies onPress, so the card carries none of its own there.
  // Elsewhere the card is a plain Press.
  const native = Platform.OS === 'ios';

  const card = (
    // Outer view: opaque surface + soft shadow. Inner view: clips the cover to
    // the rounded corners (iOS drops a shadow on an overflow:hidden view).
    <Press style={s.card} onPress={native ? undefined : goTo} accessibilityRole="button">
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

  const safety = canReport ? (
    <>
      {reportOpen && (
        <ReportSheet
          visible
          eventId={event.id}
          onClose={() => setReportOpen(false)}
          onBlockHost={event.hostId ? blockAfterReport : undefined}
        />
      )}
      {gateSheet}
    </>
  ) : null;

  if (!native) return <>{card}{safety}</>;
  return (
    <>
    <Link href={{ pathname: '/(tabs)/discover/[id]', params: { id: event.id } }} asChild>
      <Link.Trigger>{card}</Link.Trigger>
      <Link.Menu>
        <Link.MenuAction icon="square.and.arrow.up" onPress={shareEvent}>{tr('card.menu.share')}</Link.MenuAction>
        {canDirections && (
          <Link.MenuAction icon="location" onPress={getDirections}>{tr('card.menu.directions')}</Link.MenuAction>
        )}
        {canReport && (
          <Link.MenuAction icon="flag" destructive onPress={reportParty}>{trMod('menu.report')}</Link.MenuAction>
        )}
      </Link.Menu>
    </Link>
    {safety}
    </>
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
