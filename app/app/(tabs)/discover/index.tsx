import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl, useColorScheme, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventCard, type EventItem } from '../../../components/EventCard';
import { light, dark, fonts, spacing, radius } from '../../../lib/theme';

const FILTERS = ['All', 'Today', 'This week', 'Near me'] as const;
type Filter = typeof FILTERS[number];

const MOCK_EVENTS: EventItem[] = [
  { id: '1', title: 'Arsenal v Spurs North London Derby', broadcastSubject: 'Premier League', startsAt: new Date(Date.now() + 3600000 * 24).toISOString(), venueName: 'The Red Lion', venueAddress: '123 Islington High St', status: 'published', goingCount: 24, hostName: 'Marcus T.' },
  { id: '2', title: 'NFL Sunday RedZone', broadcastSubject: 'NFL', startsAt: new Date(Date.now() + 3600000 * 48).toISOString(), venueName: 'Sports Bar NYC', venueAddress: '456 W 44th St', status: 'published', goingCount: 18, hostName: 'Sarah K.' },
  { id: '3', title: 'Wimbledon Men\'s Final', broadcastSubject: 'Tennis', startsAt: new Date(Date.now() + 3600000 * 72).toISOString(), venueName: 'The Crown', venueAddress: '89 Clapham High St', status: 'published', goingCount: 31, hostName: 'James B.' },
  { id: '4', title: 'Champions League Final', broadcastSubject: 'UEFA', startsAt: new Date(Date.now() + 3600000 * 96).toISOString(), venueName: 'My Place', isPrivateLocation: true, status: 'published', goingCount: 12, hostName: 'Elena V.' },
  { id: '5', title: 'Formula 1 Monaco GP', broadcastSubject: 'F1', startsAt: new Date(Date.now() + 3600000 * 120).toISOString(), venueName: 'The Garage Bar', venueAddress: '22 King Street', status: 'published', goingCount: 8, hostName: 'Dev P.' },
];

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const events = MOCK_EVENTS.filter((e) =>
    !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.broadcastSubject.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={[s.wordmark, { color: c.textPrimary, fontFamily: fonts.display }]}>SpotSeek</Text>

        {/* Search */}
        <View style={[s.searchRow, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
          <Text style={[s.searchIcon, { color: c.textTertiary }]}>🔍</Text>
          <TextInput
            style={[s.searchInput, { color: c.textPrimary, fontFamily: fonts.sansRegular }]}
            placeholder="Search events or sports…"
            placeholderTextColor={c.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Filter pills */}
        <View style={s.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              style={[
                s.filterPill,
                { backgroundColor: filter === f ? c.fill : c.bgSubtle, borderColor: c.cardBorder },
              ]}
              onPress={() => setFilter(f)}
            >
              <Text style={[
                s.filterText,
                { color: filter === f ? c.fillText : c.textSecondary, fontFamily: fonts.sansMedium },
              ]}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Feed */}
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + spacing.xl }]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textTertiary} />
        }
        ListHeaderComponent={
          <Text style={[s.sectionLabel, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
            {events.length} upcoming events
          </Text>
        }
        renderItem={({ item }) => <EventCard event={item} />}
        showsVerticalScrollIndicator={false}
      />
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
  filterPill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: radius.full, borderWidth: 1,
  },
  filterText: { fontSize: 13 },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  sectionLabel: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: spacing.md },
});
