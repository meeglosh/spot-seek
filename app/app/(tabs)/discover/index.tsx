import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
  useColorScheme, TextInput, ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { EventCard, type EventItem } from '../../../components/EventCard';
import { EventMapView } from '../../../components/EventMapView';
import { light, dark, fonts, spacing, radius } from '../../../lib/theme';
import { fetchFeed, type ApiEvent } from '../../../lib/api';

const FILTERS = ['All', 'Today', 'This week', 'Near me'] as const;
type Filter = typeof FILTERS[number];

function apiEventToItem(e: ApiEvent): EventItem {
  return {
    id: e.id,
    title: e.title,
    broadcastSubject: e.broadcastSubject,
    startsAt: e.startsAt,
    venueName: e.venueName,
    venueAddress: e.venueAddress,
    isPrivateLocation: e.isPrivateLocation,
    capacity: e.capacity,
    status: e.status,
    venueLat: e.venueLat ?? undefined,
    venueLng: e.venueLng ?? undefined,
    coverImageUrl: e.coverImageUrl,
  };
}

function filterByTime(events: EventItem[], filter: Filter): EventItem[] {
  if (filter === 'All' || filter === 'Near me') return events;
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + 7);

  return events.filter((e) => {
    if (!e.startsAt) return true;
    const d = new Date(e.startsAt);
    if (filter === 'Today') return d >= now && d <= endOfToday;
    if (filter === 'This week') return d >= now && d <= endOfWeek;
    return true;
  });
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // Animate the toggle pill indicator
  const toggleAnim = useRef(new Animated.Value(0)).current;

  async function requestLocation() {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLoading(false);
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(coords);
      setLocationLoading(false);
      return coords;
    } catch {
      setLocationLoading(false);
      return null;
    }
  }

  async function loadFeed(coords?: { latitude: number; longitude: number } | null) {
    setError('');
    try {
      const params = coords
        ? { lat: coords.latitude, lng: coords.longitude, radiusKm: 25 }
        : undefined;
      const events = await fetchFeed(params);
      setAllEvents(events.map(apiEventToItem));
    } catch (err) {
      setError('Could not load events. Is the backend running?');
      console.warn('[feed]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadFeed(); }, []);

  async function handleFilterPress(f: Filter) {
    setFilter(f);
    if (f === 'Near me') {
      const coords = userLocation ?? await requestLocation();
      if (coords) loadFeed(coords);
    }
  }

  async function handleMapToggle() {
    const next = viewMode === 'list' ? 'map' : 'list';
    setViewMode(next);
    Animated.spring(toggleAnim, {
      toValue: next === 'map' ? 1 : 0,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
    // Auto-grab location when switching to map mode
    if (next === 'map' && !userLocation) {
      await requestLocation();
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFeed(filter === 'Near me' ? userLocation : null);
  }, [filter, userLocation]);

  const displayed = filterByTime(allEvents, filter).filter((e) =>
    !search ||
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.broadcastSubject.toLowerCase().includes(search.toLowerCase())
  );

  // Toggle pill slide animation
  const pillTranslate = toggleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 34],
  });

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={s.titleRow}>
          <Text style={[s.wordmark, { color: c.textPrimary, fontFamily: fonts.display }]}>SpotSeek</Text>

          {/* List / Map toggle */}
          <Pressable
            style={[s.toggle, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}
            onPress={handleMapToggle}
            accessibilityLabel={viewMode === 'list' ? 'Switch to map view' : 'Switch to list view'}
          >
            <Animated.View
              style={[
                s.togglePill,
                { backgroundColor: c.fill },
                { transform: [{ translateX: pillTranslate }] },
              ]}
            />
            <View style={s.toggleOption}>
              <Text style={[s.toggleIcon, { opacity: viewMode === 'list' ? 1 : 0.45 }]}>☰</Text>
            </View>
            <View style={s.toggleOption}>
              <Text style={[s.toggleIcon, { opacity: viewMode === 'map' ? 1 : 0.45 }]}>◎</Text>
            </View>
          </Pressable>
        </View>

        {/* Search — list mode only */}
        {viewMode === 'list' && (
          <View style={[s.searchRow, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
            <Text style={[s.searchIcon, { color: c.textTertiary }]}>🔍</Text>
            <TextInput
              style={[s.searchInput, { color: c.textPrimary, fontFamily: fonts.sansRegular }]}
              placeholder="Search events or sports…"
              placeholderTextColor={c.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')}>
                <Text style={{ color: c.textTertiary, fontSize: 14, paddingRight: spacing.xs }}>✕</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Filter pills */}
        <View style={s.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              style={[s.filterPill, { backgroundColor: filter === f ? c.fill : c.bgSubtle, borderColor: c.cardBorder }]}
              onPress={() => handleFilterPress(f)}
            >
              {f === 'Near me' && locationLoading ? (
                <ActivityIndicator size="small" color={filter === f ? c.fillText : c.textSecondary} style={{ width: 16, height: 16 }} />
              ) : (
                <Text style={[s.filterText, { color: filter === f ? c.fillText : c.textSecondary, fontFamily: fonts.sansMedium }]}>
                  {f === 'Near me' ? `📍 ${f}` : f}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      {/* Map view */}
      {viewMode === 'map' && (
        loading ? (
          <View style={s.center}>
            <ActivityIndicator color={c.textSecondary} />
          </View>
        ) : (
          <EventMapView
            events={displayed}
            userLocation={userLocation}
          />
        )
      )}

      {/* List view */}
      {viewMode === 'list' && (
        loading && !refreshing ? (
          <View style={s.center}>
            <ActivityIndicator color={c.textSecondary} />
            <Text style={[s.stateText, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>
              Loading events…
            </Text>
          </View>
        ) : error ? (
          <View style={s.center}>
            <Text style={[s.stateText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>{error}</Text>
            <Pressable style={[s.retryBtn, { backgroundColor: c.fillSubtle }]} onPress={() => loadFeed()}>
              <Text style={[{ color: c.fillSubtleText, fontFamily: fonts.sansMedium, fontSize: 14 }]}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={displayed}
            keyExtractor={(e) => e.id}
            contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.xl }]}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textTertiary} />
            }
            ListHeaderComponent={
              <Text style={[s.sectionLabel, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
                {displayed.length === 0
                  ? 'No events found'
                  : `${displayed.length} upcoming event${displayed.length === 1 ? '' : 's'}`}
              </Text>
            }
            ListEmptyComponent={
              <View style={s.center}>
                <Text style={[s.stateText, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>
                  {search ? 'No events match your search.' : 'No published events yet.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => <EventCard event={item} />}
            showsVerticalScrollIndicator={false}
          />
        )
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontSize: 28 },

  // Toggle
  toggle: {
    flexDirection: 'row', width: 70, height: 32,
    borderRadius: radius.full, borderWidth: 1,
    alignItems: 'center', position: 'relative', overflow: 'hidden',
  },
  togglePill: {
    position: 'absolute', width: 32, height: 28,
    borderRadius: radius.full,
  },
  toggleOption: {
    flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  toggleIcon: { fontSize: 14 },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg,
    borderWidth: 1, paddingHorizontal: spacing.md, height: 44, gap: spacing.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 15 },

  // Filters
  filters: { flexDirection: 'row', gap: spacing.sm },
  filterPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full, borderWidth: 1 },
  filterText: { fontSize: 13 },

  // List
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  sectionLabel: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: spacing.md },

  // States
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'], gap: spacing.lg },
  stateText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
});
