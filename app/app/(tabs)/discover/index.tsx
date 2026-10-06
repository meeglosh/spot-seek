import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { Text } from '../../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { EventCard, type EventItem } from '../../../components/EventCard';
import { EventMapView } from '../../../components/EventMapView';
import { AppHeader } from '../../../components/AppHeader';
import { Chip, SegmentedControl, Press, Skeleton, EventCardSkeleton, EmptyState, ErrorState } from '../../../components/ui';
import { colors, radius, spacing, TAP, type as t } from '../../../lib/theme';
import { Icon } from '../../../components/icons';
import { onBlocksChanged } from '../../../lib/moderation';
import { fetchFeed, fetchFavourites, type ApiEvent, type ApiFavourite } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAuthGate } from '../../../components/AuthGate';
import { getGuestInterests } from '../../../lib/guestState';
import { useDiscoverFilters, activeFilterCount, clearFiltersGlobal } from '../../../lib/discover-filters';

// 'This week' first — it's the default; 'All' last since it's the least-used option.
const FILTERS = ['This week', 'Today', 'Near me', 'All'] as const;
type Filter = typeof FILTERS[number];

function apiEventToItem(e: ApiEvent): EventItem {
  return {
    id: e.id,
    hostId: e.hostId,
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
    sponsorCount: e.sponsorCount,
    topSponsor: e.topSponsor,
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
  const auth = useAuth();
  const { requireAuth, gateSheet } = useAuthGate();
  const [favourites, setFavourites] = useState<ApiFavourite[]>([]);
  // A guest's onboarding picks live on the device until they sign up.
  const [guestTeams, setGuestTeams] = useState<string[]>([]);

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

  // Blocking someone (from a card menu or the event page) refreshes the feed so
  // their parties disappear. A ref keeps the subscription stable.
  const reloadFeed = useRef<() => void>(() => {});
  useEffect(() => {
    reloadFeed.current = () => loadFeed(filter === 'Near me' ? userLocation : null);
  });
  useEffect(() => onBlocksChanged(() => reloadFeed.current()), []);

  // If location was already granted (e.g. at the onboarding step), use it for
  // the map and "Near me" without asking again. Never prompts from here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getLastKnownPositionAsync();
        if (!cancelled && loc) setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch { /* optional nicety */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reload when filters change (filter screen sets them and navigates back)
  useFocusEffect(useCallback(() => {
    loadFeed(filter === 'Near me' ? userLocation : null);
    if (auth.status === 'authenticated') {
      fetchFavourites().then(setFavourites).catch(() => {});
    } else {
      getGuestInterests().then((g) => setGuestTeams(g.filter((f) => f.type === 'team').map((f) => f.value)));
    }
  }, [filters, filter, userLocation, auth.status]));

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
  const favTeams = auth.status === 'authenticated'
    ? favourites.filter((f) => f.type === 'team').map((f) => f.value)
    : guestTeams;
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
          <SegmentedControl
            value={viewMode}
            onChange={handleModePress}
            options={[
              { key: 'list', label: tr('feed.viewList'), icon: 'list', accessibilityLabel: tr('feed.switchToListView') },
              { key: 'map', label: tr('feed.viewMap'), icon: 'map', accessibilityLabel: tr('feed.switchToMapView') },
            ]}
          />

          {viewMode === 'list' && (
            <View style={s.searchRow}>
              <Icon name="search" size={18} color={colors.textTertiary} />
              <TextInput
                style={s.searchInput}
                placeholder={tr('feed.searchPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <Press
                  onPress={() => setSearch('')}
                  style={s.clearBtn}
                  accessibilityRole="button"
                  accessibilityLabel={trCommon('shell.accessibility.clear')}
                >
                  <Icon name="close" size={16} color={colors.textTertiary} />
                </Press>
              )}
            </View>
          )}

          {/* Single filters entry point — opens the full filter half-sheet */}
          <Press
            style={[s.filterIconBtn, filterCount > 0 && s.filterIconBtnActive]}
            onPress={openFilters}
            accessibilityRole="button"
            accessibilityLabel={tr('feed.filtersLabel')}
          >
            <Icon name="filter" size={20} color={filterCount > 0 ? colors.action : colors.textSecondary} />
            {filterCount > 0 && (
              <View style={s.filterBadge}>
                <Text style={[t.labelSm, s.filterBadgeText]}>{filterCount}</Text>
              </View>
            )}
          </Press>
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
            {filters.useFavourites && <Chip label={tr('feed.yourTeams')} active tone="confirmed" onPress={openFilters} />}
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
          <View style={s.mapSkeleton}><Skeleton height="100%" radius={0} /></View>
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
          <View style={[s.list, { gap: spacing.lg }]} accessibilityLabel={tr('feed.loadingEvents')}>
            <EventCardSkeleton />
            <EventCardSkeleton />
          </View>
        ) : error ? (
          <ErrorState
            title={tr('feed.errorTitle')}
            message={error}
            retryLabel={trCommon('retry')}
            onRetry={() => { setLoading(true); loadFeed(); }}
          />
        ) : (
          <FlatList
            data={displayed}
            keyExtractor={(e) => e.id}
            contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.xl }]}
            ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.action} />
            }
            ListHeaderComponent={
              <Text style={[t.label, s.sectionLabel]}>
                {displayed.length === 0
                  ? tr('feed.noEventsFound')
                  : tr('feed.upcomingCount', { count: displayed.length })}
              </Text>
            }
            ListEmptyComponent={
              search ? (
                <EmptyState
                  icon="search"
                  title={tr('feed.emptySearchTitle')}
                  body={tr('feed.emptySearch')}
                  actionLabel={tr('feed.clearSearch')}
                  onAction={() => setSearch('')}
                />
              ) : filterCount > 0 ? (
                <EmptyState
                  icon="filter"
                  title={tr('feed.emptyFilteredTitle')}
                  body={tr('feed.emptyFiltered')}
                  actionLabel={tr('feed.clearFilters')}
                  onAction={clearFiltersGlobal}
                />
              ) : (
                <EmptyState
                  icon="calendar"
                  title={tr('feed.emptyDefaultTitle')}
                  body={tr('feed.emptyDefault')}
                  actionLabel={tr('feed.hostOne')}
                  onAction={() => {
                    if (requireAuth({ kind: 'host' })) router.push('/(tabs)/parties/create' as never);
                  }}
                />
              )
            }
            renderItem={({ item }) => <EventCard event={item} />}
            showsVerticalScrollIndicator={false}
          />
        )
      )}
      {gateSheet}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md },

  controlsRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },

  // Filled search input
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    ...t.labelMd,
    flex: 1,
    color: colors.textPrimary,
    minHeight: TAP - 4,
    paddingVertical: spacing.sm,
  },
  clearBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.md },

  // Single filters entry point — replaces the old Sport/Teams/Date/Venue row
  filterIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterIconBtnActive: {
    borderColor: colors.action,
  },
  filterBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { color: colors.textOnFill },

  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  // Quick filters
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  // List
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sectionLabel: { color: colors.textSecondary, marginBottom: spacing.md },

  // States
  mapSkeleton: { flex: 1 },
});
