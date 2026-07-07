import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
  useColorScheme, TextInput, ActivityIndicator, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { EventCard, type EventItem } from '../../../components/EventCard';
import { EventMapView } from '../../../components/EventMapView';
import { light, dark, fonts, spacing, radius } from '../../../lib/theme';
import { fetchFeed, fetchFavourites, type ApiEvent, type ApiFavourite } from '../../../lib/api';
import { useDiscoverFilters, activeFilterCount } from '../../../lib/discover-filters';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const { filters } = useDiscoverFilters();
  const filterCount = activeFilterCount(filters);
  const [favourites, setFavourites] = useState<ApiFavourite[]>([]);

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
      const f = filters;
      const params: Parameters<typeof fetchFeed>[0] = {};
      if (coords) { params.lat = coords.latitude; params.lng = coords.longitude; params.radiusKm = 25; }
      if (f.sport) params.sport = f.sport;
      if (f.after) params.after = f.after;
      if (f.before) params.before = f.before;
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

  // Reload when filters change (filter screen sets them and navigates back)
  useFocusEffect(useCallback(() => {
    loadFeed(filter === 'Near me' ? userLocation : null);
    fetchFavourites().then(setFavourites).catch(() => {});
  }, [filters, filter, userLocation]));

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

  // Client-side: apply venue filter + team filter (server already applied sport/date)
  const favTeams = favourites.filter((f) => f.type === 'team').map((f) => f.value);
  const displayed = filterByTime(allEvents, filter).filter((e) => {
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.broadcastSubject.toLowerCase().includes(search.toLowerCase())) return false;
    if (filters.venue && !e.venueName?.toLowerCase().includes(filters.venue.toLowerCase())) return false;
    if (filters.teams && filters.teams.length > 0) {
      const haystack = `${e.title} ${e.broadcastSubject}`.toLowerCase();
      if (!filters.teams.some((t) => haystack.includes(t.toLowerCase()))) return false;
    }
    if (filters.useFavourites && favTeams.length > 0) {
      const haystack = `${e.title} ${e.broadcastSubject}`.toLowerCase();
      if (!favTeams.some((t) => haystack.includes(t.toLowerCase()))) return false;
    }
    return true;
  });

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

          <View style={s.titleActions}>
            {/* Filter button */}
            <Pressable
              style={[s.filterBtn, { backgroundColor: filterCount > 0 ? c.fill : c.bgSubtle, borderColor: filterCount > 0 ? c.fill : c.cardBorder }]}
              onPress={() => router.push('/(tabs)/discover/filter')}
            >
              <Text style={[s.filterBtnText, { color: filterCount > 0 ? c.fillText : c.textSecondary, fontFamily: fonts.sansMedium }]}>
                {filterCount > 0 ? `Filters · ${filterCount}` : 'Filters'}
              </Text>
            </Pressable>

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

        {/* Active filter summary chips */}
        {filterCount > 0 && (
          <View style={s.activeFilters}>
            {filters.sport && (
              <View style={[s.activeFChip, { backgroundColor: c.fill }]}>
                <Text style={[s.activeFChipText, { color: c.fillText, fontFamily: fonts.sansMedium }]}>⚽ {filters.sport}</Text>
              </View>
            )}
            {filters.teams?.slice(0, 2).map((t) => (
              <View key={t} style={[s.activeFChip, { backgroundColor: c.fill }]}>
                <Text style={[s.activeFChipText, { color: c.fillText, fontFamily: fonts.sansMedium }]}>{t}</Text>
              </View>
            ))}
            {(filters.teams?.length ?? 0) > 2 && (
              <View style={[s.activeFChip, { backgroundColor: c.fill }]}>
                <Text style={[s.activeFChipText, { color: c.fillText, fontFamily: fonts.sansMedium }]}>+{(filters.teams?.length ?? 0) - 2} teams</Text>
              </View>
            )}
            {filters.venue && (
              <View style={[s.activeFChip, { backgroundColor: c.fill }]}>
                <Text style={[s.activeFChipText, { color: c.fillText, fontFamily: fonts.sansMedium }]}>📍 {filters.venue}</Text>
              </View>
            )}
            {filters.useFavourites && (
              <View style={[s.activeFChip, { backgroundColor: c.fill }]}>
                <Text style={[s.activeFChipText, { color: c.fillText, fontFamily: fonts.sansMedium }]}>⭐ Your teams</Text>
              </View>
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
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full, borderWidth: 1 },
  filterBtnText: { fontSize: 13 },
  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  activeFChip: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs, borderRadius: radius.full },
  activeFChipText: { fontSize: 12 },

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
