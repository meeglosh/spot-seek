/**
 * Full-screen filter page — High-Energy Action restyle.
 * Navigated to from the Discover header filter buttons.
 * Passes filter state back via router.back() + a shared state atom.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SPORTS, searchTeams } from '../../../lib/sports-data';
import { fetchFavourites, type ApiFavourite } from '../../../lib/api';
import { DateTimePicker } from '../../../components/DateTimePicker';
import { useDiscoverFilters } from '../../../lib/discover-filters';
import { colors, fonts, palette, spacing, type as t } from '../../../lib/theme';
import { Btn, Chip, SectionTitle } from '../../../components/ui';
import { goToAuth } from '../../../components/AuthGate';
import { useAuth } from '../../../lib/auth';

export default function FilterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  // Scoped to 'discover' — this screen's strings live under the filters
  // subtree of discover.json (see lib/i18n.ts for the key-naming convention).
  // Aliased to `tr` because `t` is already the theme.type import above.
  const { t: tr } = useTranslation('discover');

  // Modal: router.back() is a no-op if this is the only entry in its stack.
  const closeFilter = useCallback(() => {
    if (router.canGoBack()) { router.back(); return; }
    router.replace('/(tabs)/discover' as never);
  }, [router]);

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
      prev.includes(name) ? prev.filter((tm) => tm !== name) : [...prev, name],
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
    closeFilter();
  }

  const favTeams = favourites.filter((f) => f.type === 'team').map((f) => f.value);
  const favSports = favourites.filter((f) => f.type === 'sport').map((f) => f.value);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={closeFilter} style={s.closeBtn} hitSlop={8}>
          <Text style={s.closeGlyph}>✕</Text>
        </Pressable>
        <Text style={[t.headlineSm, { color: colors.textPrimary }]}>{tr('filters.title')}</Text>
        <Pressable onPress={clearAll} hitSlop={8}>
          <Text style={[t.labelCapsSm, { color: activeCount > 0 ? colors.live : colors.textTertiary }]}>
            {activeCount > 0 ? tr('filters.clearCount', { count: activeCount }) : tr('filters.clearAll')}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>

        {/* Your favourites quick-apply — sign-in nudge for guests */}
        {auth.status !== 'authenticated' ? (
          <View style={s.section}>
            <SectionTitle accent={colors.volt}>{tr('filters.yourInterests')}</SectionTitle>
            <Pressable
              style={s.favouriteRow}
              onPress={() => goToAuth(router, 'sign-in', '/(tabs)/discover/filter')}
            >
              <View style={s.favouriteLabels}>
                <Text style={[t.bodyMd, { color: colors.textPrimary }]}>
                  {tr('filters.filterByYourTeamsTitle')}
                </Text>
                <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                  {tr('filters.filterByYourTeamsSub')}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : favourites.length > 0 && (
          <View style={s.section}>
            <SectionTitle accent={colors.volt}>{tr('filters.yourInterests')}</SectionTitle>
            <View style={s.favouriteRow}>
              <View style={s.favouriteLabels}>
                <Text style={[t.bodyMd, { color: colors.textPrimary }]}>
                  {tr('filters.showOnlyYourTeams')}
                </Text>
                <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                  {[...favSports, ...favTeams].slice(0, 3).join(', ')}
                  {favourites.length > 3 ? tr('filters.moreFavourites', { count: favourites.length - 3 }) : ''}
                </Text>
              </View>
              <Switch
                value={useFavourites}
                onValueChange={setUseFavourites}
                trackColor={{ false: palette.surfaceHighest, true: colors.accent }}
                thumbColor={palette.bg}
              />
            </View>
          </View>
        )}

        {/* Sport */}
        <View style={s.section}>
          <SectionTitle>{tr('filters.sport')}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sportRow}>
            {SPORTS.map((s2) => (
              <Chip
                key={s2.id}
                label={s2.name}
                active={sport === s2.name}
                onPress={() => setSport(sport === s2.name ? '' : s2.name)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Teams */}
        <View style={s.section}>
          <SectionTitle>{tr('filters.teams')}</SectionTitle>
          <View style={s.searchRow}>
            <Text style={s.searchGlyph}>⌕</Text>
            <TextInput
              style={s.searchInput}
              placeholder={tr('filters.searchTeamsPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              value={teamSearch}
              onChangeText={setTeamSearch}
            />
          </View>

          {/* Selected teams */}
          {selectedTeams.length > 0 && (
            <View style={s.chipRow}>
              {selectedTeams.map((name) => (
                <Chip key={name} label={`${name} ✕`} active onPress={() => toggleTeam(name)} />
              ))}
            </View>
          )}

          {/* Team search results */}
          {teamResults.length > 0 && (
            <View style={s.chipRow}>
              {teamResults.map((tm) => (
                <Chip
                  key={tm.id}
                  label={tm.shortName}
                  active={selectedTeams.includes(tm.name)}
                  onPress={() => toggleTeam(tm.name)}
                />
              ))}
            </View>
          )}

          {/* Favourite teams quick-add */}
          {favTeams.length > 0 && teamSearch.length === 0 && (
            <View style={s.favSection}>
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>{tr('filters.yourFavouriteTeams')}</Text>
              <View style={s.chipRow}>
                {favTeams.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    tone="volt"
                    active={selectedTeams.includes(name)}
                    onPress={() => toggleTeam(name)}
                  />
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Date range */}
        <View style={s.section}>
          <SectionTitle>{tr('filters.dateRange')}</SectionTitle>
          <View style={s.dateRow}>
            <View style={s.datePart}>
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>{tr('filters.from')}</Text>
              <DateTimePicker value={after} onChange={setAfter} placeholder={tr('filters.anyDate')} />
            </View>
            <View style={s.datePart}>
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>{tr('filters.to')}</Text>
              <DateTimePicker value={before} onChange={setBefore} placeholder={tr('filters.anyDate')} minimumDate={after ?? undefined} />
            </View>
          </View>
        </View>

        {/* Venue */}
        <View style={s.section}>
          <SectionTitle>{tr('filters.venue')}</SectionTitle>
          <View style={s.searchRow}>
            <Text style={s.searchGlyph}>⌕</Text>
            <TextInput
              style={s.searchInput}
              placeholder={tr('filters.venuePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              value={venueSearch}
              onChangeText={setVenueSearch}
            />
            {venueSearch.length > 0 && (
              <Pressable onPress={() => setVenueSearch('')} hitSlop={8}>
                <Text style={s.clearGlyph}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>

      </ScrollView>

      {/* Apply bar */}
      <View style={[s.applyBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Btn
          label={activeCount > 0 ? tr('filters.showResults', { count: activeCount }) : tr('filters.showAllEvents')}
          onPress={apply}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { color: colors.textPrimary, fontSize: 18 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing['2xl'] },
  section: { gap: spacing.md },

  favouriteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: palette.surfaceMid,
    borderWidth: 1,
    borderColor: palette.surfaceHighest,
    borderTopWidth: 2,
    borderTopColor: colors.volt,
  },
  favouriteLabels: { flex: 1, paddingRight: spacing.lg, gap: 3 },

  sportRow: { gap: spacing.sm, paddingRight: spacing.md, flexDirection: 'row' },

  // Underlined search inputs
  searchRow: {
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
    paddingVertical: spacing.md,
  },
  clearGlyph: { color: colors.textTertiary, fontSize: 14 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  favSection: { gap: spacing.sm },

  dateRow: { flexDirection: 'row', gap: spacing.md },
  datePart: { flex: 1, gap: spacing.xs },

  applyBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
});
