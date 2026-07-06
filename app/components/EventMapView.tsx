import React, { useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, useColorScheme, Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { light, dark, fonts, spacing, radius, palette } from '../lib/theme';
import type { EventItem } from './EventCard';

// ─── Monochrome map styles ─────────────────────────────────────────────────────
// Strips all colour from the map so it matches the app's B&W palette.

const LIGHT_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];

const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

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
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const isDark = scheme === 'dark';

  const [selected, setSelected] = useState<EventItem | null>(null);
  const slideAnim = useRef(new Animated.Value(200)).current;

  // Events that have coordinates.
  const mappable = events.filter((e) => e.venueLat != null && e.venueLng != null);

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
        style={s.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        customMapStyle={isDark ? DARK_STYLE : LIGHT_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        onPress={() => selected && dismiss()}
      >
        {mappable.map((event) => (
          <Marker
            key={event.id}
            coordinate={{
              latitude: event.venueLat!,
              longitude: event.venueLng!,
            }}
            onPress={() => selectEvent(event)}
            tracksViewChanges={false}
          >
            {/* Custom marker — black pill with broadcast subject */}
            <View style={[
              s.marker,
              selected?.id === event.id && s.markerSelected,
              isDark && s.markerDark,
              isDark && selected?.id === event.id && s.markerSelectedDark,
            ]}>
              <Text style={s.markerText}>{event.broadcastSubject}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* No-coordinates notice */}
      {mappable.length === 0 && (
        <View style={[s.emptyOverlay, { backgroundColor: c.card + 'EE', borderColor: c.cardBorder }]}>
          <Text style={[s.emptyText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
            No events with locations yet.{'\n'}Create an event with a venue to see it here.
          </Text>
        </View>
      )}

      {/* Event count badge */}
      {mappable.length > 0 && (
        <View style={[s.badge, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Text style={[s.badgeText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
            {mappable.length} event{mappable.length === 1 ? '' : 's'} on map
          </Text>
        </View>
      )}

      {/* Bottom card — slides up when a marker is tapped */}
      {selected && (
        <Animated.View
          style={[
            s.bottomCard,
            { backgroundColor: c.card, borderColor: c.cardBorder },
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={[s.dragHandle, { backgroundColor: c.cardBorder }]} />

          {/* Subject tag */}
          <View style={s.cardSubjectRow}>
            <View style={[s.subjectTag, { backgroundColor: c.bgSubtle }]}>
              <Text style={[s.subjectText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
                {selected.broadcastSubject}
              </Text>
            </View>
            <Pressable onPress={dismiss} hitSlop={12}>
              <Text style={[{ color: c.textTertiary, fontSize: 18 }]}>✕</Text>
            </Pressable>
          </View>

          {/* Event title */}
          <Text style={[s.cardTitle, { color: c.textPrimary, fontFamily: fonts.display }]} numberOfLines={2}>
            {selected.title}
          </Text>

          {/* Venue + date row */}
          <View style={s.cardMeta}>
            {selected.venueName && (
              <Text style={[s.cardMetaText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]} numberOfLines={1}>
                📍 {selected.isPrivateLocation ? `${selected.venueName} (private)` : selected.venueName}
              </Text>
            )}
            {selected.startsAt && (
              <Text style={[s.cardMetaText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
                📅 {new Date(selected.startsAt).toLocaleDateString('en-GB', {
                  weekday: 'short', day: 'numeric', month: 'short',
                })} · {new Date(selected.startsAt).toLocaleTimeString('en-GB', {
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            )}
            {typeof selected.goingCount === 'number' && (
              <Text style={[s.cardMetaText, { color: palette.green, fontFamily: fonts.sansMedium }]}>
                ✓ {selected.goingCount} going
              </Text>
            )}
          </View>

          {/* CTA */}
          <Pressable
            style={[s.viewBtn, { backgroundColor: c.fill }]}
            onPress={() => {
              dismiss();
              router.push({ pathname: '/(tabs)/discover/[id]', params: { id: selected.id } });
            }}
          >
            <Text style={[s.viewBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>
              View event
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  // Markers
  marker: {
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  markerSelected: {
    backgroundColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    transform: [{ scale: 1.1 }],
  },
  markerDark: { backgroundColor: '#FAFAFA' },
  markerSelectedDark: { backgroundColor: '#FFFFFF' },
  markerText: {
    color: '#FAFAFA',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Count badge
  badge: {
    position: 'absolute', top: spacing.xl, left: spacing.xl,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: radius.full, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  badgeText: { fontSize: 12 },

  // Empty overlay
  emptyOverlay: {
    position: 'absolute', bottom: spacing['3xl'], left: spacing.xl, right: spacing.xl,
    borderRadius: radius.lg, borderWidth: 1,
    padding: spacing.lg, alignItems: 'center',
  },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Bottom card
  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    padding: spacing.xl, paddingTop: spacing.md, gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  dragHandle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: spacing.sm,
  },
  cardSubjectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subjectTag: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  subjectText: { fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' },
  cardTitle: { fontSize: 26, lineHeight: 30 },
  cardMeta: { gap: 4 },
  cardMetaText: { fontSize: 13, lineHeight: 20 },
  viewBtn: {
    height: 48, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.xs,
  },
  viewBtnText: { fontSize: 15 },
});
