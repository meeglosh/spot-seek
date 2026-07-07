/**
 * Onboarding: pick your sports and teams.
 * Shown once after sign-up. Skippable. Data saved to /api/favourites/bulk.
 */
import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput,
  useColorScheme, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPORTS, searchTeams, type Sport } from '../../lib/sports-data';
import { saveFavouritesBulk } from '../../lib/api';
import { light, dark, fonts, spacing, radius } from '../../lib/theme';

export default function InterestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedSport, setExpandedSport] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState('');
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
            if (league.teams.some((t) => t.name === teamName)) {
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
    router.replace('/(tabs)/discover');
  }

  return (
    <View style={[s.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={[s.title, { color: c.textPrimary, fontFamily: fonts.display }]}>
            What do you follow?
          </Text>
          <Text style={[s.subtitle, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
            Pick your sports and teams. You can change these any time.
          </Text>
        </View>
        <Pressable onPress={() => router.replace('/(tabs)/discover')}>
          <Text style={[s.skip, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>Skip</Text>
        </Pressable>
      </View>

      {/* Team search */}
      <View style={[s.searchRow, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
        <Text style={{ color: c.textTertiary, fontSize: 14 }}>🔍</Text>
        <TextInput
          style={[s.searchInput, { color: c.textPrimary, fontFamily: fonts.sansRegular }]}
          placeholder="Search for a team…"
          placeholderTextColor={c.textTertiary}
          value={teamSearch}
          onChangeText={setTeamSearch}
        />
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Team search results */}
        {searchResults.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.sectionLabel, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
              Search results
            </Text>
            <View style={s.chipGrid}>
              {searchResults.map((t) => {
                const key = teamKey(t.name);
                const on = selected.has(key);
                return (
                  <Pressable key={t.id} style={[s.chip, { backgroundColor: on ? c.fill : c.bgSubtle, borderColor: on ? c.fill : c.cardBorder }]} onPress={() => toggle(key)}>
                    <Text style={[s.chipText, { color: on ? c.fillText : c.textPrimary, fontFamily: fonts.sansMedium }]}>{t.shortName}</Text>
                    <Text style={[s.chipSub, { color: on ? c.fillText + 'CC' : c.textTertiary, fontFamily: fonts.sansRegular }]}>{t.leagueName}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <>
            {/* Sport category selection */}
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
                Sports
              </Text>
              <View style={s.sportGrid}>
                {SPORTS.map((sport) => {
                  const key = sportKey(sport);
                  const on = selected.has(key);
                  return (
                    <View key={sport.id} style={s.sportBlock}>
                      <Pressable
                        style={[s.sportChip, { backgroundColor: on ? c.fill : c.bgSubtle, borderColor: on ? c.fill : c.cardBorder }]}
                        onPress={() => {
                          toggle(key);
                          setExpandedSport(expandedSport === sport.id ? null : sport.id);
                        }}
                      >
                        <Text style={s.sportEmoji}>{sport.emoji}</Text>
                        <Text style={[s.sportName, { color: on ? c.fillText : c.textPrimary, fontFamily: fonts.sansMedium }]}>{sport.name}</Text>
                        <Text style={[s.sportArrow, { color: on ? c.fillText + '88' : c.textTertiary }]}>
                          {expandedSport === sport.id ? '▲' : '▼'}
                        </Text>
                      </Pressable>

                      {/* Inline team chips */}
                      {expandedSport === sport.id && (
                        <View style={[s.teamsPanel, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
                          {sport.leagues.map((league) => (
                            <View key={league.id} style={s.leagueBlock}>
                              <Text style={[s.leagueName, { color: c.textTertiary, fontFamily: fonts.sansMedium }]}>{league.name}</Text>
                              <View style={s.chipGrid}>
                                {league.teams.map((team) => {
                                  const tk = teamKey(team.name);
                                  const ton = selected.has(tk);
                                  return (
                                    <Pressable key={team.id} style={[s.teamChip, { backgroundColor: ton ? c.fill : c.card, borderColor: ton ? c.fill : c.cardBorder }]} onPress={() => toggle(tk)}>
                                      <Text style={[s.teamChipText, { color: ton ? c.fillText : c.textPrimary, fontFamily: fonts.sansMedium }]}>{team.shortName}</Text>
                                    </Pressable>
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
      <View style={[s.saveBar, { backgroundColor: c.bg, borderTopColor: c.cardBorder, paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={[s.selCount, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
          {selected.size} selected
        </Text>
        <Pressable
          style={[s.saveBtn, { backgroundColor: c.fill, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={c.fillText} />
            : <Text style={[s.saveBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>Save &amp; continue</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md, paddingTop: spacing.lg, gap: spacing.md },
  title: { fontSize: 28, lineHeight: 32, marginBottom: spacing.xs },
  subtitle: { fontSize: 14, lineHeight: 20, maxWidth: 260 },
  skip: { fontSize: 15, paddingTop: spacing.xs },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md, height: 44, gap: spacing.sm, marginHorizontal: spacing.xl, marginBottom: spacing.md },
  searchInput: { flex: 1, fontSize: 15 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionLabel: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  sportGrid: { gap: spacing.sm },
  sportBlock: { gap: spacing.xs },
  sportChip: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm },
  sportEmoji: { fontSize: 20 },
  sportName: { flex: 1, fontSize: 15 },
  sportArrow: { fontSize: 10 },
  teamsPanel: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.md },
  leagueBlock: { gap: spacing.sm },
  leagueName: { fontSize: 11, letterSpacing: 0.3, textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, borderWidth: 1 },
  chipText: { fontSize: 13 },
  chipSub: { fontSize: 11 },
  teamChip: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.full, borderWidth: 1 },
  teamChipText: { fontSize: 12 },
  saveBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, gap: spacing.md },
  selCount: { fontSize: 13 },
  saveBtn: { flex: 1, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 15 },
});
