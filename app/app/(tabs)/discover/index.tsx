import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
  TextInput, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { EventCard, type EventItem } from '../../../components/EventCard';
import { EventMapView } from '../../../components/EventMapView';
import { AppHeader } from '../../../components/AppHeader';
import { Btn, Chip } from '../../../components/ui';
import { colors, fonts, palette, spacing, type as t } from '../../../lib/theme';
import { fetchFeed, fetchFavourites, type ApiEvent, type ApiFavourite } from '../../../lib/api';
import { useDiscoverFilters, activeFilterCount } from '../../../lib/discover-filters';

// 'This week' first — it's the default; 'All' last since it's the least-used option.
const FILTERS = ['This week', 'Today', 'Near me', 'All'] as const;
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
    venueTimezone: e.venueTimezone,
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

// Internal filter identifiers stay in English — they're compared against in
// filterByTime()/handleFilterPress() and used as the Filter type's values.
// Only the on-screen label is translated, via FILTER_LABEL_KEYS below.
const FILTER_LABEL_KEYS: Record<Filter, string> = {
  'This week': 'feed.filterThisWeek',
  Today: 'feed.filterToday',
  'Near me': 'feed.filterNearMe',
  All: 'feed.filterAll',
};

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation('discover');
  const { t: trCommon } = useTranslation('common');
  const { filters } = useDiscoverFilters();
  const filterCount = activeFilterCount(filters);
  const [favourites, setFavourites] = useState<ApiFavourite[]>([]);

  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('This week');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

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
      setError(tr('feed.loadError'));
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

  async function handleModePress(next: 'list' | 'map') {
    setViewMode(next);
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
      if (!filters.teams.some((tm) => haystack.includes(tm.toLowerCase()))) return false;
    }
    if (filters.useFavourites && favTeams.length > 0) {
      const haystack = `${e.title} ${e.broadcastSubject}`.toLowerCase();
      if (!favTeams.some((tm) => haystack.includes(tm.toLowerCase()))) return false;
    }
    return true;
  });

  const openFilters = () => router.push('/(tabs)/discover/filter');

  return (
    <View style={s.container}>
      <AppHeader />

      {/* Header */}
      <View style={s.header}>
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>{tr('feed.title')}</Text>

        {/* LIST | MAP toggle + search */}
        <View style={s.controlsRow}>
          <View style={s.segmented}>
            {(['list', 'map'] as const).map((mode) => {
              const on = viewMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[s.segmentBtn, on && s.segmentBtnActive]}
                  onPress={() => handleModePress(mode)}
                  accessibilityLabel={mode === 'list' ? tr('feed.switchToListView') : tr('feed.switchToMapView')}
                >
                  <Text style={[t.labelCaps, { color: on ? colors.fillText : colors.textSecondary }]}>
                    {mode === 'list' ? tr('feed.viewList') : tr('feed.viewMap')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {viewMode === 'list' && (
            <View style={s.searchRow}>
              <Text style={s.searchGlyph}>⌕</Text>
              <TextInput
                style={s.searchInput}
                placeholder={tr('feed.searchPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Text style={s.clearGlyph}>✕</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Single filters entry point — opens the full filter half-sheet */}
          <Pressable
            style={[s.filterIconBtn, filterCount > 0 && s.filterIconBtnActive]}
            onPress={openFilters}
            accessibilityLabel={tr('feed.filtersLabel')}
          >
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro static-asset require
              source={require('../../../assets/icons/icon-filter.png')}
              style={[s.filterIcon, { tintColor: filterCount > 0 ? colors.accent : colors.textSecondary }]}
              resizeMode="contain"
            />
            {filterCount > 0 && (
              <View style={s.filterBadge}>
                <Text style={s.filterBadgeText}>{filterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Active filter summary chips */}
        {filterCount > 0 && (
          <View style={s.activeFilters}>
            {filters.sport && <Chip label={filters.sport} active onPress={openFilters} />}
            {filters.teams?.slice(0, 2).map((tm) => (
              <Chip key={tm} label={tm} active onPress={openFilters} />
            ))}
            {(filters.teams?.length ?? 0) > 2 && (
              <Chip label={tr('feed.moreTeams', { count: (filters.teams?.length ?? 0) - 2 })} active onPress={openFilters} />
            )}
            {filters.venue && <Chip label={filters.venue} active onPress={openFilters} />}
            {filters.useFavourites && <Chip label={tr('feed.yourTeams')} active tone="volt" onPress={openFilters} />}
          </View>
        )}

        {/* Quick time filters */}
        <View style={s.filters}>
          {FILTERS.map((f) => (
            <Chip
              key={f}
              label={f === 'Near me' && locationLoading ? tr('feed.locating') : tr(FILTER_LABEL_KEYS[f])}
              active={filter === f}
              onPress={() => handleFilterPress(f)}
            />
          ))}
        </View>
      </View>

      {/* Map view */}
      {viewMode === 'map' && (
        loading ? (
          <View style={s.center}>
            <ActivityIndicator color={colors.accent} />
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
            <ActivityIndicator color={colors.accent} />
            <Text style={[t.bodySm, { color: colors.textTertiary }]}>
              {tr('feed.loadingEvents')}
            </Text>
          </View>
        ) : error ? (
          <View style={s.center}>
            <Text style={[t.bodySm, s.stateText]}>{error}</Text>
            <Btn label={trCommon('retry')} variant="ghost" small onPress={() => loadFeed()} />
          </View>
        ) : (
          <FlatList
            data={displayed}
            keyExtractor={(e) => e.id}
            contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.xl }]}
            ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
            }
            ListHeaderComponent={
              <Text style={[t.labelCaps, s.sectionLabel]}>
                {displayed.length === 0
                  ? tr('feed.noEventsFound')
                  : tr('feed.upcomingCount', { count: displayed.length })}
              </Text>
            }
            ListEmptyComponent={
              <View style={s.center}>
                <Text style={[t.bodySm, { color: colors.textTertiary, textAlign: 'center' }]}>
                  {search ? tr('feed.emptySearch') : tr('feed.emptyDefault')}
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
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },

  controlsRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },

  // Sharp segmented LIST | MAP toggle
  segmented: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceMid,
    borderWidth: 1,
    borderColor: palette.surfaceHighest,
    padding: 2,
  },
  segmentBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: { backgroundColor: colors.fill },

  // Underlined search input
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceMid,
    borderBottomWidth: 2,
    borderBottomColor: palette.outlineVariant,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchGlyph: { color: colors.textTertiary, fontSize: 18 },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: fonts.label,
    fontSize: 13,
    letterSpacing: 0.5,
    paddingVertical: spacing.sm,
  },
  clearGlyph: { color: colors.textTertiary, fontSize: 14 },

  // Single filters entry point — replaces the old Sport/Teams/Date/Venue row
  filterIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMid,
    borderWidth: 1,
    borderColor: palette.surfaceHighest,
  },
  filterIconBtnActive: {
    backgroundColor: `${colors.accent}20`,
    borderColor: `${colors.accent}80`,
  },
  filterIcon: { width: 18, height: 18 },
  filterBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.live,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { color: palette.black, fontSize: 11, fontFamily: fonts.labelBold },

  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  // Quick filters
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  // List
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sectionLabel: { color: colors.textSecondary, marginBottom: spacing.md },

  // States
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'], gap: spacing.lg },
  stateText: { color: colors.textSecondary, textAlign: 'center' },
});
