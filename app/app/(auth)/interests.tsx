/**
 * Onboarding: pick your sports and teams.
 * Shown once after sign-up. Skippable. Data saved to /api/favourites/bulk.
 */
import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Text } from '../../components/Text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SPORTS, searchTeams, type Sport } from '../../lib/sports-data';
import { saveFavouritesBulk } from '../../lib/api';
import { colors, radius, spacing, TAP, type as t } from '../../lib/theme';
import { Icon } from '../../components/icons';
import { Btn, Chip, inputStyle, inputFocusedStyle, Press } from '../../components/ui';

export default function InterestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  // Land back on the screen that originally gated the user, or Discover.
  const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/(tabs)/discover';
  // Scoped to the 'auth' namespace — tr()/t() calls below read
  // locales/<lang>/auth.json. Aliased to `tr` because this file already
  // uses `t` for theme.type tokens imported from ../../lib/theme. See
  // lib/i18n.ts for the full key-naming convention.
  const { t: tr } = useTranslation('auth');

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
          <Text style={[t.headlineMd, s.title]}>{tr('interests.title')}</Text>
          <Text style={[t.bodySm, s.subtitle]}>
            {tr('interests.subtitle')}
          </Text>
        </View>
        <Press
          onPress={() => router.replace(target as never)}
          style={s.skip}
          accessibilityRole="button"
        >
          <Text style={[t.label, { color: colors.textTertiary }]}>{tr('interests.skip')}</Text>
        </Press>
      </View>

      {/* Team search — underline input per the design */}
      <TextInput
        style={[inputStyle, s.search, searchFocused && inputFocusedStyle]}
        placeholder={tr('interests.searchPlaceholder')}
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
            <Text style={[t.label, s.sectionLabel]}>{tr('interests.searchResults')}</Text>
            <View style={s.chipGrid}>
              {searchResults.map((team) => {
                const key = teamKey(team.name);
                const on = selected.has(key);
                return (
                  <Press
                    key={team.id}
                    style={[s.resultChip, on && s.resultChipOn]}
                    onPress={() => toggle(key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[t.labelSm, { color: on ? colors.action : colors.textPrimary }]}>
                      {team.shortName}
                    </Text>
                    <Text style={[t.labelSm, { color: colors.textTertiary }]}>
                      {team.leagueName}
                    </Text>
                  </Press>
                );
              })}
            </View>
          </View>
        ) : (
          <>
            {/* Sport category selection */}
            <View style={s.section}>
              <Text style={[t.label, s.sectionLabel]}>{tr('interests.sports')}</Text>
              <View style={s.sportGrid}>
                {SPORTS.map((sport) => {
                  const key = sportKey(sport);
                  const on = selected.has(key);
                  return (
                    <View key={sport.id} style={s.sportBlock}>
                      <Press
                        style={[s.sportRow, on && s.sportRowOn]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, expanded: expandedSport === sport.id }}
                        onPress={() => {
                          toggle(key);
                          setExpandedSport(expandedSport === sport.id ? null : sport.id);
                        }}
                      >
                        <Text style={[t.label, s.sportName, on && { color: colors.action }]}>
                          {sport.name}
                        </Text>
                        <Icon
                          name={expandedSport === sport.id ? 'chevronUp' : 'chevronDown'}
                          size={18}
                          color={on ? colors.action : colors.textTertiary}
                        />
                      </Press>

                      {/* Inline team chips */}
                      {expandedSport === sport.id && (
                        <View style={s.teamsPanel}>
                          {sport.leagues.map((league) => (
                            <View key={league.id} style={s.leagueBlock}>
                              <Text style={[t.labelSm, { color: colors.textTertiary }]}>{league.name}</Text>
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
        <Text style={[t.monoData, s.selCount]}>{tr('interests.selectedCount', { count: selected.size })}</Text>
        <Btn
          label={saving ? tr('interests.savingLabel') : tr('interests.saveLabel')}
          onPress={handleSave}
          disabled={saving}
          style={s.saveBtn}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, paddingTop: spacing.lg, gap: spacing.md,
  },
  headerText: { flex: 1, gap: spacing.sm },
  title: { color: colors.textPrimary },
  skip: { minHeight: TAP, justifyContent: 'center' },
  subtitle: { color: colors.textSecondary, maxWidth: 260 },
  search: { marginHorizontal: spacing.xl, marginBottom: spacing.lg },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionLabel: { color: colors.textSecondary },
  sportGrid: { gap: spacing.sm },
  sportBlock: { gap: spacing.xs },
  sportRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: TAP, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: 'transparent',
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
  },
  sportRowOn: { borderColor: colors.action, backgroundColor: colors.actionWash },
  sportName: { flex: 1, color: colors.textPrimary },
  teamsPanel: {
    backgroundColor: colors.surface1,
    padding: spacing.md, gap: spacing.md,
    borderRadius: radius.card,
  },
  leagueBlock: { gap: spacing.sm },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  resultChip: {
    borderWidth: 1, borderColor: 'transparent', backgroundColor: colors.surface2,
    minHeight: TAP, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2,
    borderRadius: radius.control,
  },
  resultChipOn: { borderColor: colors.action, backgroundColor: colors.actionWash },
  saveBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md,
    backgroundColor: colors.canvas,
  },
  selCount: { color: colors.textSecondary },
  saveBtn: { flex: 1 },
});
