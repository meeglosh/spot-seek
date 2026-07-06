import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
  useColorScheme, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventCard, type EventItem } from '../../../components/EventCard';
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
  };
}

function filterByTime(events: EventItem[], filter: Filter): EventItem[] {
  if (filter === 'All') return events;
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
  const [loading, setLoading] = useState(true); // true = show spinner on initial load
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');

  async function loadFeed(silent = false) {
    if (!silent) { /* loading stays true from initial state */ }
    setError('');
    try {
      const events = await fetchFeed();
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFeed(true);
  }, []);

  const displayed = filterByTime(allEvents, filter).filter((e) =>
    !search ||
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.broadcastSubject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={[s.wordmark, { color: c.textPrimary, fontFamily: fonts.display }]}>SpotSeek</Text>

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

        <View style={s.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              style={[s.filterPill, { backgroundColor: filter === f ? c.fill : c.bgSubtle, borderColor: c.cardBorder }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterText, { color: filter === f ? c.fillText : c.textSecondary, fontFamily: fonts.sansMedium }]}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* States */}
      {loading && !refreshing ? (
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
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md },
  wordmark: { fontSize: 28 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg,
    borderWidth: 1, paddingHorizontal: spacing.md, height: 44, gap: spacing.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 15 },
  filters: { flexDirection: 'row', gap: spacing.sm },
  filterPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.full, borderWidth: 1 },
  filterText: { fontSize: 13 },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  sectionLabel: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'], gap: spacing.lg },
  stateText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
});
