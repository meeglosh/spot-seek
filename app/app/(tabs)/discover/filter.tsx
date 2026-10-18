/**
 * Filter form sheet — High-Energy Action restyle.
 * Navigated to from the Discover header filter buttons.
 * Passes filter state back via router.back() + a shared state atom.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from '../../../components/Text';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SPORTS, searchTeams } from '../../../lib/sports-data';
import { fetchFavourites, type ApiFavourite } from '../../../lib/api';
import { DateTimePicker } from '../../../components/DateTimePicker';
import { useDiscoverFilters } from '../../../lib/discover-filters';
import { colors, spacing, TAP, type as t } from '../../../lib/theme';
import { Btn, Chip, SectionTitle, SearchField, IconButton, ListRow, Press, Toggle } from '../../../components/ui';
import { useAuthGate } from '../../../components/AuthGate';
import { useAuth } from '../../../lib/auth';

// spacing.lg top + 44pt tap row + spacing.md bottom
const HEADER_H = spacing.lg + TAP + spacing.md;

export default function FilterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { requireAuth, gateSheet } = useAuthGate();
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
  const [showPast, setShowPast] = useState(filters.showPast ?? false);
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
    setShowPast(false);
  }

  const activeCount =
    (sport ? 1 : 0) +
    selectedTeams.length +
    (after ? 1 : 0) +
    (before ? 1 : 0) +
    (venueSearch ? 1 : 0) +
    (useFavourites ? 1 : 0) +
    (showPast ? 1 : 0);

  function apply() {
    setFilters({
      sport: sport || undefined,
      teams: selectedTeams.length > 0 ? selectedTeams : undefined,
      after: after?.toISOString(),
      before: before?.toISOString(),
      venue: venueSearch || undefined,
      useFavourites,
      showPast,
    });
    closeFilter();
  }

  const favTeams = favourites.filter((f) => f.type === 'team').map((f) => f.value);
  const favSports = favourites.filter((f) => f.type === 'sport').map((f) => f.value);

  return (
    <View style={s.container} collapsable={false}>
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        {/* Your favourites quick-apply — sign-in nudge for guests */}
        {auth.status !== 'authenticated' ? (
          <View style={s.section}>
            <SectionTitle>{tr('filters.yourInterests')}</SectionTitle>
            <ListRow
              title={tr('filters.filterByYourTeamsTitle')}
              subtitle={tr('filters.filterByYourTeamsSub')}
              onPress={() => requireAuth({ kind: 'favourite' })}
            />
          </View>
        ) : favourites.length > 0 && (
          <View style={s.section}>
            <SectionTitle>{tr('filters.yourInterests')}</SectionTitle>
            <ListRow
              title={tr('filters.showOnlyYourTeams')}
              subtitle={`${[...favSports, ...favTeams].slice(0, 3).join(', ')}${favourites.length > 3 ? tr('filters.moreFavourites', { count: favourites.length - 3 }) : ''}`}
              trailing={<Toggle value={useFavourites} onValueChange={setUseFavourites} />}
            />
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
          <SearchField
            placeholder={tr('filters.searchTeamsPlaceholder')}
            value={teamSearch}
            onChangeText={setTeamSearch}
          />

          {/* Selected teams */}
          {selectedTeams.length > 0 && (
            <View style={s.chipRow}>
              {selectedTeams.map((name) => (
                <Chip key={name} label={name} trailingIcon="close" active onPress={() => toggleTeam(name)} />
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
              <Text style={[t.labelSm, { color: colors.textTertiary }]}>{tr('filters.yourFavouriteTeams')}</Text>
              <View style={s.chipRow}>
                {favTeams.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    tone="confirmed"
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
              <Text style={[t.labelSm, { color: colors.textTertiary }]}>{tr('filters.from')}</Text>
              <DateTimePicker value={after} onChange={setAfter} placeholder={tr('filters.anyDate')} />
            </View>
            <View style={s.datePart}>
              <Text style={[t.labelSm, { color: colors.textTertiary }]}>{tr('filters.to')}</Text>
              <DateTimePicker value={before} onChange={setBefore} placeholder={tr('filters.anyDate')} minimumDate={after ?? undefined} />
            </View>
          </View>
        </View>

        {/* Venue */}
        <View style={s.section}>
          <SectionTitle>{tr('filters.venue')}</SectionTitle>
          <SearchField
            placeholder={tr('filters.venuePlaceholder')}
            value={venueSearch}
            onChangeText={setVenueSearch}
            onClear={() => setVenueSearch('')}
          />
        </View>

        {/* Past parties: opt-in, off by default, never persisted */}
        <View style={s.section}>
          <ListRow
            title={tr('filters.showPast')}
            subtitle={tr('filters.showPastSub')}
            trailing={<Toggle value={showPast} onValueChange={setShowPast} accessibilityLabel={tr('filters.showPast')} />}
          />
        </View>

      </ScrollView>

      {/* react-native-screens form sheets accept ONE ScrollView plus ONE other
          subview, so the header and the apply bar share this overlay. The
          scroll view reserves HEADER_H at its top and room for the bar. */}
      <View style={s.overlay} pointerEvents="box-none" collapsable={false}>
      <View style={s.header}>
        <IconButton
          icon="close"
          onPress={closeFilter}
          accessibilityLabel={tr('filters.title')}
        />
        <Text style={[t.headlineSm, { color: colors.textPrimary }]}>{tr('filters.title')}</Text>
        <Press onPress={clearAll} style={s.clearAll} accessibilityRole="button">
          <Text style={[t.labelSm, { color: activeCount > 0 ? colors.action : colors.textTertiary }]}>
            {activeCount > 0 ? tr('filters.clearCount', { count: activeCount }) : tr('filters.clearAll')}
          </Text>
        </Press>
      </View>

      {/* Apply bar */}
      <View style={[s.applyBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Btn
          label={activeCount > 0 ? tr('filters.showResults', { count: activeCount }) : tr('filters.showAllEvents')}
          onPress={apply}
        />
      </View>
      </View>
      {gateSheet}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.lg,
    backgroundColor: colors.canvas,
    height: HEADER_H,
  },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  clearAll: { minHeight: TAP, justifyContent: 'center' },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: HEADER_H, gap: spacing.lg },
  section: { gap: spacing.md },

  sportRow: { gap: spacing.sm, paddingRight: spacing.md, flexDirection: 'row' },


  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  favSection: { gap: spacing.sm },

  dateRow: { flexDirection: 'row', gap: spacing.md },
  datePart: { flex: 1, gap: spacing.xs },

  applyBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.canvas,
  },
});
