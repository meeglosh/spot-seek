import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Image, Linking, Platform, Share, ActionSheetIOS, Alert, type ImageSourcePropType,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../lib/auth';
import {
  fetchEvent, rsvpToEvent, cancelRsvp, fetchMyRsvps, API_BASE, EVENT_SHARE_BASE, type ApiEvent, type ApiRsvp,
} from '../../../lib/api';
import { formatEventDateTime } from '../../../lib/dateFormat';
import { colors, palette, spacing, type as t, hardShadow } from '../../../lib/theme';
import { AppHeader } from '../../../components/AppHeader';
import { Badge, SectionTitle } from '../../../components/ui';
import { AuthGateSheet } from '../../../components/AuthGate';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SHARE_ICON: ImageSourcePropType = require('../../../assets/icons/icon-share.png');

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
  const { t: tr } = useTranslation('discover');
  const { t: trCommon } = useTranslation('common');

  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [loading, setLoading] = useState(true); // true = show spinner on initial load
  const [error, setError] = useState('');
  const [rsvp, setRsvp] = useState<ApiRsvp | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpError, setRsvpError] = useState('');
  const [gateOpen, setGateOpen] = useState(false);

  // Reachable via replace() from the publish flow, where no history exists and
  // router.back() is a silent no-op — fall back to the feed so the back arrow
  // is never dead.
  const leaveDetail = useCallback(() => {
    if (router.canGoBack()) { router.back(); return; }
    router.replace('/(tabs)/discover' as never);
  }, [router]);

  useEffect(() => {
    if (!id) return;
    fetchEvent(id)
      .then(setEvent)
      .catch(() => setError(tr('detail.loadError')))
      .finally(() => setLoading(false));
  }, [id, tr]);

  // Load this user's existing RSVP so the button reflects reality on every
  // visit. Without this the screen always rendered "Join Party", so returning
  // to an event you'd already joined and tapping it hit a 409 instead of
  // offering to cancel.
  useEffect(() => {
    if (!id || auth.status !== 'authenticated') return;
    let cancelled = false;
    fetchMyRsvps()
      .then((rsvps) => {
        if (cancelled) return;
        const mine = rsvps.find((r) => r.eventId === id && r.state !== 'cancelled');
        if (mine) setRsvp(mine);
      })
      .catch(() => { /* non-fatal: falls back to the join state */ });
    return () => { cancelled = true; };
  }, [id, auth.status]);

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
      if (msg === 'already_rsvpd') {
        // Server says an RSVP exists but our state disagrees — resync rather
        // than leave the user staring at an error they can't act on.
        const mine = await fetchMyRsvps()
          .then((rsvps) => rsvps.find((r) => r.eventId === event.id && r.state !== 'cancelled'))
          .catch(() => undefined);
        if (mine) setRsvp(mine);
        else setRsvpError(tr('detail.alreadyRsvpd'));
      } else if (msg === 'unauthorized') {
        setGateOpen(true);
      } else {
        // Surface the real reason — a generic message here hid a
        // "Unsupported FormDataPart"-class bug on the cover upload for days.
        setRsvpError(msg || tr('detail.genericError'));
      }
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
          {error || tr('detail.notFound')}
        </Text>
        <Pressable onPress={leaveDetail}>
          <Text style={[t.labelCaps, { color: colors.accent, marginTop: spacing.md }]}>
            {tr('detail.goBack')}
          </Text>
        </Pressable>
      </View>
    );
  }

  const { dateStr, timeStr } = event.startsAt
    ? formatEventDateTime(event.startsAt, event.venueTimezone)
    : { dateStr: null, timeStr: null };

  const rsvpState = rsvp?.state;
  const isGoing = rsvpState === 'going';
  const isWaitlisted = rsvpState === 'waitlisted';
  const isActive = isGoing || isWaitlisted;

  const rsvpBg = isGoing ? colors.volt : isWaitlisted ? colors.live : colors.fill;
  const rsvpLabel = isGoing ? tr('detail.going') : isWaitlisted ? tr('detail.waitlisted') : tr('detail.joinParty');

  const coverSrc = event.coverImageUrl
    ? { uri: event.coverImageUrl.startsWith('/') ? `${API_BASE}${event.coverImageUrl}` : event.coverImageUrl }
    : null;

  const liveTonight = startsToday(event.startsAt);

  // STATUS tile — only real data: the viewer's own RSVP state, else capacity.
  const statusValue = isGoing
    ? tr('detail.going')
    : isWaitlisted
      ? tr('detail.waitlisted')
      : event.capacity != null
        ? tr('detail.capacity', { count: event.capacity })
        : null;
  const statusColor = isGoing ? colors.volt : isWaitlisted ? colors.live : colors.accent;

  // Venue address masking — private locations never reveal the address here.
  const venueDetail = event.venueName
    ? event.isPrivateLocation
      ? `${tr('detail.privateLocation')}${isActive ? '' : ` ${tr('detail.shownAfterRsvp')}`}`
      : event.venueAddress
    : null;

  const hasDirectionTarget =
    (event.venueLat != null && event.venueLng != null) || !!event.venueAddress;
  const canShowDirections =
    hasDirectionTarget && (!event.isPrivateLocation || isActive);

  async function openDirections() {
    if (!event) return;

    // Prefer lat/lng (all three apps take it directly); fall back to the
    // free-text address only when coordinates aren't set.
    const ll = event.venueLat != null && event.venueLng != null
      ? `${event.venueLat},${event.venueLng}`
      : null;
    const addr = event.venueAddress ? encodeURIComponent(event.venueAddress) : null;
    const daddr = ll ?? addr;
    if (!daddr) return;

    // Native app deep links, each with a web fallback that works even when
    // the app isn't installed (and canOpenURL — which needs the scheme
    // whitelisted in LSApplicationQueriesSchemes to ever return true on iOS
    // — can't confirm it either way).
    const googleApp = `comgooglemaps://?daddr=${daddr}&directionsmode=driving`;
    const googleWeb = `https://www.google.com/maps/dir/?api=1&destination=${daddr}`;
    const wazeApp = ll ? `waze://?ll=${ll}&navigate=yes` : `waze://?q=${daddr}&navigate=yes`;
    const wazeWeb = ll ? `https://waze.com/ul?ll=${ll}&navigate=yes` : `https://waze.com/ul?q=${daddr}&navigate=yes`;

    const [googleAvailable, wazeAvailable] = await Promise.all([
      Linking.canOpenURL(googleApp).catch(() => false),
      Linking.canOpenURL(wazeApp).catch(() => false),
    ]);

    const options = [
      { label: tr('detail.directions.appleMaps'), url: `http://maps.apple.com/?daddr=${daddr}` },
      { label: tr('detail.directions.googleMaps'), url: googleAvailable ? googleApp : googleWeb },
      { label: tr('detail.directions.waze'), url: wazeAvailable ? wazeApp : wazeWeb },
    ];

    const open = (url: string) => Linking.openURL(url).catch(() => {});

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options.map((o) => o.label), trCommon('cancel')], cancelButtonIndex: options.length },
        (index) => { if (index < options.length) open(options[index].url); },
      );
    } else {
      Alert.alert(
        tr('detail.getDirections'),
        undefined,
        [...options.map((o) => ({ text: o.label, onPress: () => open(o.url) })), { text: trCommon('cancel'), style: 'cancel' as const }],
      );
    }
  }

  function handleShare() {
    if (!event) return;
    // A real https link, not the spotseek:// scheme — Messages/etc. only
    // linkify and preview http(s) URLs, and only a Universal Link can fall
    // back to a web page (with an Open Graph preview) when the recipient
    // doesn't have the app installed yet. See backend/src/deeplinks.ts.
    const link = `${EVENT_SHARE_BASE}/e/${event.id}`;
    const when = dateStr ? `${dateStr}${timeStr ? ` ${tr('detail.share.at')} ${timeStr}` : ''}` : null;
    // On iOS, `url` already produces the rich link preview — keep it out of
    // `message` there, or Messages' link-detector previews it a second time.
    const iosMessage = [event.title, when].filter(Boolean).join('\n');
    const androidMessage = [event.title, when, link].filter(Boolean).join('\n');
    Share.share(Platform.OS === 'ios' ? { message: iosMessage, url: link } : { message: androidMessage })
      .catch(() => {});
  }

  return (
    <View style={s.container}>
      <AppHeader back onBack={leaveDetail} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}>
        {/* Hero — cover photo with dark duotone treatment */}
        <View style={s.hero}>
          {coverSrc && (
            <Image source={coverSrc} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          <View style={[StyleSheet.absoluteFill, s.duoDark]} />
          <View style={[StyleSheet.absoluteFill, s.duoBlue]} />
          <Pressable
            onPress={handleShare}
            hitSlop={12}
            style={({ pressed }) => [s.shareBtn, pressed && s.pressed]}
            accessibilityLabel={tr('detail.shareEvent')}
          >
            <Image source={SHARE_ICON} style={s.shareIcon} resizeMode="contain" />
          </Pressable>
          <View style={s.heroContent}>
            <View style={s.heroBadges}>
              {liveTonight && <Badge label={tr('detail.liveTonight')} tone="live" />}
              <Badge label={event.broadcastSubject} tone="accent" dot={false} />
            </View>
            <Text style={[t.headlineLg, { color: palette.white }]}>{event.title}</Text>
          </View>
        </View>

        <View style={s.content}>
          {/* Meta tile grid */}
          <View style={s.tileRow}>
            <View style={s.tile}>
              <Text style={[t.labelCapsSm, { color: colors.textSecondary }]}>{tr('detail.dateTime')}</Text>
              <Text style={[t.monoData, s.tileValue]}>
                {dateStr ? `${dateStr}${timeStr ? `\n${timeStr}` : ''}` : tr('detail.tba')}
              </Text>
            </View>
            {statusValue && (
              <View style={[s.tile, s.tileStatus]}>
                <Text style={[t.labelCapsSm, { color: colors.accent }]}>{tr('detail.status')}</Text>
                <Text style={[t.headlineMd, { color: statusColor }]} numberOfLines={1} adjustsFontSizeToFit>
                  {statusValue}
                </Text>
              </View>
            )}
          </View>

          {/* Venue card */}
          {event.venueName && (
            <View style={s.venueCard}>
              <Text style={[t.labelCapsSm, { color: colors.textSecondary }]}>{tr('detail.venue')}</Text>
              <Text style={[t.bodyLg, { color: colors.textPrimary }]}>{event.venueName}</Text>
              {venueDetail && (
                <Text style={[t.monoData, { color: colors.textSecondary }]}>{venueDetail}</Text>
              )}
              {canShowDirections && (
                <Pressable
                  style={({ pressed }) => [s.directionsBtn, pressed && s.pressed]}
                  onPress={openDirections}
                >
                  <Text style={[t.labelCaps, { color: colors.accent }]}>{tr('detail.getDirections')}</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* The Breakdown */}
          {event.description && (
            <View style={s.section}>
              <SectionTitle>{tr('detail.breakdown')}</SectionTitle>
              <Text style={[t.bodyMd, { color: colors.textSecondary }]}>
                {event.description}
              </Text>
            </View>
          )}

          {/* Auth nudge */}
          {auth.status !== 'authenticated' && (
            <Pressable style={s.authNudge} onPress={() => setGateOpen(true)}>
              <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                {tr('detail.authNudge')}
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
            <Text style={[t.labelCapsSm, s.cancelText]}>{tr('detail.cancelRsvp')}</Text>
          </Pressable>
        )}
      </View>

      <AuthGateSheet
        visible={gateOpen}
        onClose={() => setGateOpen(false)}
        message={tr('detail.authGateMessage')}
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
  shareBtn: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,15,18,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareIcon: { width: 20, height: 20, tintColor: palette.white },
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
