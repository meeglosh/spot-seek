/**
 * Onboarding: pick your sports and teams.
 * Shown once after sign-up. Skippable. Data saved to /api/favourites/bulk.
 */
import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPORTS, searchTeams, type Sport } from '../../lib/sports-data';
import { saveFavouritesBulk } from '../../lib/api';
import { colors, palette, spacing, type as t } from '../../lib/theme';
import { Btn, Chip, inputStyle, inputFocusedStyle } from '../../components/ui';

export default function InterestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  // Land back on the screen that originally gated the user, or Discover.
  const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/(tabs)/discover';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedSport, setExpandedSport] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function sportKey(s: Sport) { return `sport:${s.name}`; }
  function teamKey(teamName: string) { return `team:${teamName}`; }

  const searchResults = teamSearch.length > 1 ? searchTeams(teamSearch) : [];

  async function handleSave() {
    setSaving(true);
    const favs: Array<{ type: string; value: string; sport?: string }> = [];
    for (const key of selected) {
      if (key.startsWith('sport:')) {
        favs.push({ type: 'sport', value: key.slice(6) });
      } else if (key.startsWith('team:')) {
        const teamName = key.slice(5);
        // Find the sport for this team
        for (const sport of SPORTS) {
          for (const league of sport.leagues) {
            if (league.teams.some((tm) => tm.name === teamName)) {
              favs.push({ type: 'team', value: teamName, sport: sport.name });
              break;
            }
          }
        }
      }
    }
    try {
      await saveFavouritesBulk(favs);
    } catch { /* non-fatal, user can set later */ }
    setSaving(false);
    router.replace(target as never);
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={[t.headlineMd, s.title]}>What do{'\n'}you follow?</Text>
          <Text style={[t.bodySm, s.subtitle]}>
            Pick your sports and teams. You can change these any time.
          </Text>
        </View>
        <Pressable onPress={() => router.replace(target as never)} hitSlop={8}>
          <Text style={[t.labelCaps, { color: colors.textTertiary }]}>Skip</Text>
        </Pressable>
      </View>

      {/* Team search — underline input per the design */}
      <TextInput
        style={[inputStyle, s.search, searchFocused && inputFocusedStyle]}
        placeholder="Search for a team…"
        placeholderTextColor={colors.textTertiary}
        value={teamSearch}
        onChangeText={setTeamSearch}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        autoCapitalize="none"
      />

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Team search results */}
        {searchResults.length > 0 ? (
          <View style={s.section}>
            <Text style={[t.labelCaps, s.sectionLabel]}>Search results</Text>
            <View style={s.chipGrid}>
              {searchResults.map((team) => {
                const key = teamKey(team.name);
                const on = selected.has(key);
                return (
                  <Pressable
                    key={team.id}
                    style={[s.resultChip, on && s.resultChipOn]}
                    onPress={() => toggle(key)}
                  >
                    <Text style={[t.labelCapsSm, { color: on ? colors.accent : colors.textPrimary }]}>
                      {team.shortName}
                    </Text>
                    <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>
                      {team.leagueName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <>
            {/* Sport category selection */}
            <View style={s.section}>
              <Text style={[t.labelCaps, s.sectionLabel]}>Sports</Text>
              <View style={s.sportGrid}>
                {SPORTS.map((sport) => {
                  const key = sportKey(sport);
                  const on = selected.has(key);
                  return (
                    <View key={sport.id} style={s.sportBlock}>
                      <Pressable
                        style={[s.sportRow, on && s.sportRowOn]}
                        onPress={() => {
                          toggle(key);
                          setExpandedSport(expandedSport === sport.id ? null : sport.id);
                        }}
                      >
                        <Text style={[t.labelCaps, s.sportName, on && { color: colors.accent }]}>
                          {sport.name}
                        </Text>
                        <Text style={[t.labelCapsSm, { color: on ? colors.accent : colors.textTertiary }]}>
                          {expandedSport === sport.id ? '▲' : '▼'}
                        </Text>
                      </Pressable>

                      {/* Inline team chips */}
                      {expandedSport === sport.id && (
                        <View style={s.teamsPanel}>
                          {sport.leagues.map((league) => (
                            <View key={league.id} style={s.leagueBlock}>
                              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>{league.name}</Text>
                              <View style={s.chipGrid}>
                                {league.teams.map((team) => {
                                  const tk = teamKey(team.name);
                                  const ton = selected.has(tk);
                                  return (
                                    <Chip
                                      key={team.id}
                                      label={team.shortName}
                                      active={ton}
                                      onPress={() => toggle(tk)}
                                    />
                                  );
                                })}
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Save bar */}
      <View style={[s.saveBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={[t.monoData, s.selCount]}>{selected.size} selected</Text>
        <Btn
          label={saving ? 'Saving…' : 'Save & continue'}
          onPress={handleSave}
          disabled={saving}
          style={s.saveBtn}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, paddingTop: spacing.lg, gap: spacing.md,
  },
  headerText: { flex: 1, gap: spacing.sm },
  title: {
    color: palette.white,
    textShadowColor: palette.secondary,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  subtitle: { color: colors.textSecondary, maxWidth: 260 },
  search: { marginHorizontal: spacing.xl, marginBottom: spacing.lg },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionLabel: { color: colors.accent },
  sportGrid: { gap: spacing.sm },
  sportBlock: { gap: spacing.xs },
  sportRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderWidth: 1, borderColor: colors.cardBorder,
    backgroundColor: palette.surfaceMid,
  },
  sportRowOn: { borderColor: colors.accent, backgroundColor: `${colors.accent}1a` },
  sportName: { flex: 1, color: colors.textPrimary },
  teamsPanel: {
    borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: palette.surfaceLowest,
    padding: spacing.md, gap: spacing.md,
  },
  leagueBlock: { gap: spacing.sm },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  resultChip: {
    borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: palette.surfaceMid,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2,
  },
  resultChipOn: { borderColor: colors.accent, backgroundColor: `${colors.accent}33` },
  saveBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md,
    borderTopWidth: 2, borderTopColor: colors.cardBorder, backgroundColor: colors.bg,
  },
  selCount: { color: colors.textSecondary },
  saveBtn: { flex: 1 },
});
