import React, { useEffect, useRef, useState } from 'react';
import {
  View, Pressable, StyleSheet, Animated, ScrollView, Platform, Alert,
} from 'react-native';
import { Text } from './Text';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, mapPalette as mp, radius, spacing, TAP, type as t } from '../lib/theme';
import { HardShadow, HardPressable } from './ui';
import { Icon } from './icons';
import { Badge, Btn } from './ui';
import type { EventItem } from './EventCard';
import { formatEventDateTime } from '../lib/dateFormat';

// ─── Night map style ───────────────────────────────────────────────────────────
// Built from `mapPalette` in lib/theme.ts (neutral near-black land, cool grey
// roads) so the map shares the app's palette instead of an off-palette teal.
// Only applies on the Google provider; on Apple Maps the map keeps
// its native tiles while the neon chrome and pins still render on top.

const NEON_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: mp.land }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: mp.label }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: mp.labelStroke }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: mp.boundary }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: mp.labelPlace }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: mp.park }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: mp.road }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: mp.roadStroke }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: mp.label }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: mp.arterial }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: mp.highway }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: mp.highwayStroke }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: mp.water }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: mp.labelWater }] },
];

// Live-soon: event starts within the next ~3 hours (or kicked off in the last
// 3 hours) — these pins burn neon orange instead of cyan.
const LIVE_SOON_MS = 3 * 60 * 60 * 1000;

function isLiveSoon(startsAt?: string | null): boolean {
  if (!startsAt) return false;
  const diff = new Date(startsAt).getTime() - Date.now();
  return diff <= LIVE_SOON_MS && diff > -LIVE_SOON_MS;
}

// ─── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  events: EventItem[];
  userLocation?: { latitude: number; longitude: number } | null;
  initialRegion?: {
    latitude: number; longitude: number;
    latitudeDelta: number; longitudeDelta: number;
  };
};

const DEFAULT_REGION = {
  latitude: 51.5074,   // London — change to wherever makes sense for your users
  longitude: -0.1278,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function EventMapView({ events, userLocation, initialRegion }: Props) {
  const router = useRouter();
  const { t: tr } = useTranslation('discover');

  const [selected, setSelected] = useState<EventItem | null>(null);
  const [liveOnly, setLiveOnly] = useState(false);
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const slideAnim = useRef(new Animated.Value(200)).current;
  const mapRef = useRef<MapView>(null);
  const prevUserLocation = useRef(userLocation);

  // The map only reads `initialRegion` at mount, so when the permission
  // prompt resolves *after* the map has already mounted (the common case —
  // the map mounts on first switch to map mode, then the OS prompt resolves
  // a moment later), the new coordinates would otherwise never be applied
  // without an unmount/remount. Animate to it, but only on the null→value
  // transition — not on every subsequent location refresh — and not while
  // the user has a bottom card open, since that reads as active engagement
  // with the current view.
  useEffect(() => {
    const had = prevUserLocation.current;
    prevUserLocation.current = userLocation;
    if (!had && userLocation && !selected) {
      mapRef.current?.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 350);
    }
  }, [userLocation, selected]);

  async function centerOnMyLocation() {
    if (locating) return;
    setLocating(true);
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== 'granted') {
        Alert.alert(tr('map.locationPermission'));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 350);
    } catch (err) {
      console.error('Failed to center map on current location', err);
    } finally {
      setLocating(false);
    }
  }

  // Events that have coordinates.
  const mappable = events.filter((e) => e.venueLat != null && e.venueLng != null);

  // Sport chips derived from the events actually on the map — no invented data.
  const subjects = Array.from(new Set(mappable.map((e) => e.broadcastSubject))).slice(0, 5);

  // Shared filter predicate — reused by both the render-time `shown` list and
  // the chip handlers below (which need to know what *will* match before the
  // state update lands, so they can frame the map for it).
  function matchingEvents(liveOnlyVal: boolean, sportFilterVal: string | null) {
    return mappable.filter((e) => {
      if (liveOnlyVal && !isLiveSoon(e.startsAt)) return false;
      if (sportFilterVal && e.broadcastSubject !== sportFilterVal) return false;
      return true;
    });
  }

  const shown = matchingEvents(liveOnly, sportFilter);

  // Snap the map to frame whatever the new filter selection matches. Called
  // directly from the chip press handlers (not a useEffect) so the animation
  // only fires on an actual filter change, never on unrelated re-renders.
  function animateToMatches(matches: EventItem[]) {
    if (matches.length === 0) return;
    if (matches.length === 1) {
      mapRef.current?.animateToRegion({
        latitude: matches[0].venueLat!,
        longitude: matches[0].venueLng!,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 350);
      return;
    }
    mapRef.current?.fitToCoordinates(
      matches.map((e) => ({ latitude: e.venueLat!, longitude: e.venueLng! })),
      {
        edgePadding: { top: 120, right: 60, bottom: 220, left: 60 },
        animated: true,
      },
    );
  }

  function selectEvent(event: EventItem) {
    setSelected(event);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }

  function dismiss() {
    Animated.timing(slideAnim, {
      toValue: 200,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelected(null));
  }

  const region = userLocation
    ? { ...userLocation, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    : initialRegion ?? DEFAULT_REGION;

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        // PROVIDER_DEFAULT is Apple Maps on iOS (no Google Maps SDK linked),
        // where this JSON style array is already documented as a no-op —
        // don't even send it through the native bridge there.
        customMapStyle={Platform.OS === 'android' ? NEON_MAP_STYLE : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        // Double-tapping a MapView on iOS 26 is a known, unresolved
        // react-native-maps bug that freezes the entire app, not just the
        // map (react-native-maps/react-native-maps#5679) — not something
        // fixable from this codebase. zoomTapEnabled disables exactly the
        // double-tap-to-zoom gesture that triggers it; pinch-to-zoom and
        // pan are unaffected.
        zoomTapEnabled={false}
        onPress={() => selected && dismiss()}
      >
        {shown.map((event) => {
          const live = isLiveSoon(event.startsAt);
          const tone = live ? colors.live : colors.action;
          const isSel = selected?.id === event.id;
          return (
            <Marker
              key={event.id}
              coordinate={{
                latitude: event.venueLat!,
                longitude: event.venueLng!,
              }}
              onPress={() => selectEvent(event)}
              tracksViewChanges={false}
            >
              {/* Pin — action by default, live orange when live-soon; selected = hard shadow */}
              <View style={s.pinWrap}>
                <HardShadow
                  offset={2}
                  active={isSel}
                  round
                  fill={false}
                  style={[s.pinSlot, isSel && s.pinSlotSelected]}
                  contentStyle={[s.pin, { borderColor: tone }, isSel && { backgroundColor: colors.surfaceSunken }]}
                >
                  <View style={[s.pinCore, { backgroundColor: tone }]} />
                </HardShadow>
                <View style={[s.pinStem, { backgroundColor: tone }]} />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Filter chips — LIVE NOW + sport chips over the map */}
      <View style={s.chipBar} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          <MapChip
            label={tr('map.liveNow')}
            tone={colors.live}
            active={liveOnly}
            onPress={() => {
              const next = !liveOnly;
              setLiveOnly(next);
              animateToMatches(matchingEvents(next, sportFilter));
            }}
          />
          {subjects.map((sub) => (
            <MapChip
              key={sub}
              label={sub}
              tone={colors.action}
              active={sportFilter === sub}
              onPress={() => {
                const next = sportFilter === sub ? null : sub;
                setSportFilter(next);
                animateToMatches(matchingEvents(liveOnly, next));
              }}
            />
          ))}
        </ScrollView>
      </View>

      {/* No-coordinates notice */}
      {mappable.length === 0 && (
        <View style={s.emptyOverlay}>
          <Text style={[t.bodySm, s.emptyText]}>
            {tr('map.noEventsText')}
          </Text>
        </View>
      )}

      {/* Locate-me control — bottom-right, lifted clear of the bottom card
          while it's open so the two never overlap. */}
      <Pressable
        style={[
          s.locateBtn,
          selected && s.locateBtnLifted,
          locating && s.locateBtnDisabled,
        ]}
        onPress={centerOnMyLocation}
        disabled={locating}
        accessibilityRole="button"
        accessibilityLabel={tr('map.locateLabel')}
      >
        <Icon name="locate" size={22} color={colors.textPrimary} />
      </Pressable>

      {/* Event count badge */}
      {mappable.length > 0 && (
        <View style={s.countBadge}>
          <Text style={[t.labelCapsSm, { color: colors.textSecondary }]}>
            {tr('map.countBadge', { shown: shown.length, total: mappable.length })}
          </Text>
        </View>
      )}

      {/* Bottom card — slides up when a marker is tapped */}
      {selected && (
        <Animated.View
          style={[s.bottomCard, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* Subject tag */}
          <View style={s.cardSubjectRow}>
            <View style={s.cardBadges}>
              {isLiveSoon(selected.startsAt) && <Badge label={tr('map.liveSoon')} tone="live" />}
              <Badge label={selected.broadcastSubject} tone="neutral" dot={false} />
            </View>
            <Pressable onPress={dismiss} style={s.closeBtn} accessibilityRole="button">
              <Icon name="close" size={20} color={colors.textTertiary} />
            </Pressable>
          </View>

          {/* Event title */}
          <Text style={[t.headlineMd, { color: colors.textPrimary }]} numberOfLines={2}>
            {selected.title}
          </Text>

          {/* Venue + date row */}
          <View style={s.cardMeta}>
            {selected.venueName && (
              <Text style={[t.labelMd, s.cardVenue]} numberOfLines={1}>
                {selected.isPrivateLocation ? tr('card.privateLocation', { venue: selected.venueName }) : selected.venueName}
              </Text>
            )}
            {selected.startsAt && (() => {
              const { dateStr, timeStr } = formatEventDateTime(selected.startsAt, selected.venueTimezone ?? null);
              return (
                <Text style={[t.monoData, { color: colors.textSecondary }]}>
                  {dateStr} · {timeStr}
                </Text>
              );
            })()}
            {typeof selected.goingCount === 'number' && (
              <Text style={[t.labelCapsSm, { color: colors.confirmed }]}>
                {tr('card.goingCount', { count: selected.goingCount })}
              </Text>
            )}
          </View>

          {/* CTA */}
          <Btn
            label={tr('map.viewEvent')}
            onPress={() => {
              dismiss();
              router.push({ pathname: '/(tabs)/discover/[id]', params: { id: selected.id } });
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}

// Solid dark chip over the map — needs an opaque body so it reads on tiles.
function MapChip({
  label, tone, active, onPress,
}: {
  label: string;
  tone: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <HardPressable
      onPress={onPress}
      hitSlop={{ top: 7, bottom: 7 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      active={active}
      offset={3}
      contentStyle={[s.mapChip, active && { borderColor: tone }]}
    >
      <Text style={[t.labelCapsSm, { color: active ? tone : colors.textSecondary }]}>{label}</Text>
    </HardPressable>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  map: { flex: 1 },

  // Pins are true circles (radius.round); the selected pin is the only one
  // that carries the hard shadow.
  pinWrap: { alignItems: 'center' },
  pin: {
    width: 22,
    height: 22,
    borderRadius: radius.round,
    borderWidth: 2,
    backgroundColor: colors.mapPin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // marginLeft balances the 2px shadow gutter so the pin stays centred on its stem.
  pinSlot: { marginLeft: 2 },
  pinSlotSelected: { transform: [{ scale: 1.3 }] },
  pinCore: { width: 8, height: 8, borderRadius: radius.round },
  pinStem: { width: 2, height: 7 },

  // Chip bar over the map
  chipBar: { position: 'absolute', top: spacing.md, left: 0, right: 0 },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, flexDirection: 'row' },
  mapChip: {
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },

  // Locate-me control
  locateBtn: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  locateBtnLifted: { bottom: spacing.lg + 260 },
  locateBtnDisabled: { opacity: 0.5 },

  // Count badge
  countBadge: {
    position: 'absolute',
    top: spacing.md + 42,
    left: spacing.lg,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },

  // Empty overlay
  emptyOverlay: {
    position: 'absolute',
    bottom: spacing['3xl'],
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: { color: colors.textSecondary, textAlign: 'center' },

  // Bottom card — sharp sheet, 1px strong top edge
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface1,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    padding: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  cardSubjectRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardBadges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', flex: 1, paddingRight: spacing.md },
  closeBtn: { width: TAP, height: TAP, alignItems: 'flex-end', justifyContent: 'center', marginTop: -spacing.sm, marginRight: -spacing.sm },
  cardMeta: { gap: 4 },
  cardVenue: { color: colors.textPrimary, textTransform: 'uppercase' },
});
