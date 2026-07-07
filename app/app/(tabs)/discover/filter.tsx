/**
 * Full-screen filter page — Airbnb style.
 * Navigated to from the Discover header filter button.
 * Passes filter state back via router.back() + a shared state atom.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
  useColorScheme, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPORTS, searchTeams } from '../../../lib/sports-data';
import { fetchFavourites, type ApiFavourite } from '../../../lib/api';
import { DateTimePicker } from '../../../components/DateTimePicker';
import { useDiscoverFilters } from '../../../lib/discover-filters';
import { light, dark, fonts, spacing, radius, type Colors } from '../../../lib/theme';

export default function FilterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  const { filters, setFilters } = useDiscoverFilters();

  // Local draft state — only applied when user taps "Show results"
  const [sport, setSport] = useState(filters.sport ?? '');
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<string[]>(filters.teams ?? []);
  const [after, setAfter] = useState<Date | null>(filters.after ? new Date(filters.after) : null);
  const [before, setBefore] = useState<Date | null>(filters.before ? new Date(filters.before) : null);
  const [venueSearch, setVenueSearch] = useState(filters.venue ?? '');
  const [useFavourites, setUseFavourites] = useState(filters.useFavourites ?? false);
  const [favourites, setFavourites] = useState<ApiFavourite[]>([]);

  useEffect(() => {
    fetchFavourites().then(setFavourites).catch(() => {});
  }, []);

  const teamResults = teamSearch.length > 1 ? searchTeams(teamSearch) : [];

  function toggleTeam(name: string) {
    setSelectedTeams((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name],
    );
  }

  function clearAll() {
    setSport('');
    setTeamSearch('');
    setSelectedTeams([]);
    setAfter(null);
    setBefore(null);
    setVenueSearch('');
    setUseFavourites(false);
  }

  const activeCount =
    (sport ? 1 : 0) +
    selectedTeams.length +
    (after ? 1 : 0) +
    (before ? 1 : 0) +
    (venueSearch ? 1 : 0) +
    (useFavourites ? 1 : 0);

  function apply() {
    setFilters({
      sport: sport || undefined,
      teams: selectedTeams.length > 0 ? selectedTeams : undefined,
      after: after?.toISOString(),
      before: before?.toISOString(),
      venue: venueSearch || undefined,
      useFavourites,
    });
    router.back();
  }

  const favTeams = favourites.filter((f) => f.type === 'team').map((f) => f.value);
  const favSports = favourites.filter((f) => f.type === 'sport').map((f) => f.value);

  return (
    <View style={[s.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: c.separator }]}>
        <Pressable onPress={() => router.back()} style={s.closeBtn}>
          <Text style={[{ color: c.textPrimary, fontSize: 18 }]}>✕</Text>
        </Pressable>
        <Text style={[s.headerTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>Filters</Text>
        <Pressable onPress={clearAll}>
          <Text style={[s.clearText, { color: activeCount > 0 ? c.textPrimary : c.textTertiary, fontFamily: fonts.sansMedium }]}>
            Clear {activeCount > 0 ? `(${activeCount})` : 'all'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>

        {/* Your favourites quick-apply */}
        {favourites.length > 0 && (
          <Section title="Your interests" c={c}>
            <View style={[s.favouriteRow, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
              <View style={s.favouriteLabels}>
                <Text style={[s.favouriteTitle, { color: c.textPrimary, fontFamily: fonts.sansMedium }]}>
                  Show only your teams & sports
                </Text>
                <Text style={[s.favouriteSub, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
                  {[...favSports, ...favTeams].slice(0, 3).join(', ')}
                  {favourites.length > 3 ? ` +${favourites.length - 3} more` : ''}
                </Text>
              </View>
              <Switch value={useFavourites} onValueChange={setUseFavourites} trackColor={{ false: c.cardBorder, true: c.fill }} thumbColor={c.bg} />
            </View>
          </Section>
        )}

        {/* Sport */}
        <Section title="Sport" c={c}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sportRow}>
            {SPORTS.map((s2) => {
              const on = sport === s2.name;
              return (
                <Pressable key={s2.id} style={[s.sportPill, { backgroundColor: on ? c.fill : c.bgSubtle, borderColor: on ? c.fill : c.cardBorder }]} onPress={() => setSport(on ? '' : s2.name)}>
                  <Text style={s.sportEmoji}>{s2.emoji}</Text>
                  <Text style={[s.sportPillText, { color: on ? c.fillText : c.textPrimary, fontFamily: fonts.sansMedium }]}>{s2.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Section>

        {/* Teams */}
        <Section title="Teams" c={c}>
          <View style={[s.searchRow, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
            <Text style={{ color: c.textTertiary, fontSize: 14 }}>🔍</Text>
            <TextInput style={[s.searchInput, { color: c.textPrimary, fontFamily: fonts.sansRegular }]} placeholder="Search teams…" placeholderTextColor={c.textTertiary} value={teamSearch} onChangeText={setTeamSearch} />
          </View>

          {/* Selected teams */}
          {selectedTeams.length > 0 && (
            <View style={s.chipRow}>
              {selectedTeams.map((name) => (
                <Pressable key={name} style={[s.activeChip, { backgroundColor: c.fill }]} onPress={() => toggleTeam(name)}>
                  <Text style={[s.activeChipText, { color: c.fillText, fontFamily: fonts.sansMedium }]}>{name} ✕</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Team search results */}
          {teamResults.length > 0 && (
            <View style={s.chipRow}>
              {teamResults.map((t) => {
                const on = selectedTeams.includes(t.name);
                return (
                  <Pressable key={t.id} style={[s.teamChip, { backgroundColor: on ? c.fill : c.bgSubtle, borderColor: on ? c.fill : c.cardBorder }]} onPress={() => toggleTeam(t.name)}>
                    <Text style={[s.teamChipText, { color: on ? c.fillText : c.textPrimary, fontFamily: fonts.sansMedium }]}>{t.shortName}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Favourite teams quick-add */}
          {favTeams.length > 0 && teamSearch.length === 0 && (
            <View style={s.favSection}>
              <Text style={[s.favLabel, { color: c.textTertiary, fontFamily: fonts.sansMedium }]}>Your favourite teams</Text>
              <View style={s.chipRow}>
                {favTeams.map((name) => {
                  const on = selectedTeams.includes(name);
                  return (
                    <Pressable key={name} style={[s.teamChip, { backgroundColor: on ? c.fill : c.bgSubtle, borderColor: on ? c.fill : c.cardBorder }]} onPress={() => toggleTeam(name)}>
                      <Text style={[s.teamChipText, { color: on ? c.fillText : c.textPrimary, fontFamily: fonts.sansMedium }]}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </Section>

        {/* Date range */}
        <Section title="Date range" c={c}>
          <View style={s.dateRow}>
            <View style={s.datePart}>
              <Text style={[s.dateLabel, { color: c.textTertiary, fontFamily: fonts.sansMedium }]}>From</Text>
              <DateTimePicker value={after} onChange={setAfter} placeholder="Any date" />
            </View>
            <View style={s.datePart}>
              <Text style={[s.dateLabel, { color: c.textTertiary, fontFamily: fonts.sansMedium }]}>To</Text>
              <DateTimePicker value={before} onChange={setBefore} placeholder="Any date" minimumDate={after ?? undefined} />
            </View>
          </View>
        </Section>

        {/* Venue */}
        <Section title="Venue" c={c}>
          <View style={[s.searchRow, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
            <Text style={{ color: c.textTertiary, fontSize: 14 }}>📍</Text>
            <TextInput style={[s.searchInput, { color: c.textPrimary, fontFamily: fonts.sansRegular }]} placeholder="e.g. The Red Lion…" placeholderTextColor={c.textTertiary} value={venueSearch} onChangeText={setVenueSearch} />
            {venueSearch.length > 0 && (
              <Pressable onPress={() => setVenueSearch('')}>
                <Text style={{ color: c.textTertiary, fontSize: 14, paddingRight: spacing.xs }}>✕</Text>
              </Pressable>
            )}
          </View>
        </Section>

      </ScrollView>

      {/* Apply bar */}
      <View style={[s.applyBar, { backgroundColor: c.bg, borderTopColor: c.separator, paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable style={[s.applyBtn, { backgroundColor: c.fill }]} onPress={apply}>
          <Text style={[s.applyBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>
            {activeCount > 0 ? `Show results · ${activeCount} filter${activeCount === 1 ? '' : 's'}` : 'Show all events'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, children, c }: { title: string; children: React.ReactNode; c: Colors }) {
  return (
    <View style={sec.wrap}>
      <Text style={[sec.title, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>{title}</Text>
      {children}
    </View>
  );
}
const sec = StyleSheet.create({
  wrap: { gap: spacing.md },
  title: { fontSize: 17 },
});

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md, paddingTop: spacing.sm, borderBottomWidth: 1 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16 },
  clearText: { fontSize: 14 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.xl * 1.5 },
  favouriteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  favouriteLabels: { flex: 1, paddingRight: spacing.lg, gap: 3 },
  favouriteTitle: { fontSize: 15 },
  favouriteSub: { fontSize: 12 },
  sportRow: { gap: spacing.sm, paddingRight: spacing.md },
  sportPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, gap: spacing.xs },
  sportEmoji: { fontSize: 16 },
  sportPillText: { fontSize: 13 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md, height: 44, gap: spacing.sm },
  searchInput: { flex: 1, fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  activeChip: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.full },
  activeChipText: { fontSize: 13 },
  teamChip: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.full, borderWidth: 1 },
  teamChipText: { fontSize: 13 },
  favSection: { gap: spacing.sm },
  favLabel: { fontSize: 11, letterSpacing: 0.3, textTransform: 'uppercase' },
  dateRow: { flexDirection: 'row', gap: spacing.md },
  datePart: { flex: 1, gap: spacing.xs },
  dateLabel: { fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase' },
  applyBar: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1 },
  applyBtn: { height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  applyBtnText: { fontSize: 16 },
});
