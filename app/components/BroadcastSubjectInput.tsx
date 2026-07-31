/**
 * Autocomplete input for the "What is being watched?" field.
 *
 * Behaviour:
 *  - Free text is always accepted. The field works like a normal TextInput.
 *  - While typing, suggestions appear from the sports catalogue:
 *      1. Leagues whose name matches (e.g. "Premier League", "NFL")
 *      2. Teams whose name matches (e.g. "Arsenal", "Lakers")
 *      3. Sport category names (e.g. "Soccer", "Basketball")
 *  - Tapping a suggestion fills the field and hides the list.
 *  - Tapping outside or submitting with custom text is fine — no validation.
 */
import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
} from 'react-native';
import { SPORTS } from '../lib/sports-data';
import { inputStyle, inputFocusedStyle } from './ui';
import { colors, fonts, palette, spacing, type as t } from '../lib/theme';

// ─── Build the suggestion catalogue once ─────────────────────────────────────

type Suggestion = {
  key: string;
  label: string;       // what goes into the field
  sublabel: string;    // e.g. "Premier League" or "Soccer"
  category: 'league' | 'team' | 'sport';
};

const CATALOGUE: Suggestion[] = (() => {
  const items: Suggestion[] = [];

  for (const sport of SPORTS) {
    // Sport category
    items.push({
      key: `sport:${sport.id}`,
      label: sport.name,
      sublabel: `All ${sport.name} events`,
      category: 'sport',
    });

    for (const league of sport.leagues) {
      // League
      items.push({
        key: `league:${league.id}`,
        label: league.name,
        sublabel: sport.name,
        category: 'league',
      });

      // Teams (capped — we don't need all 390, just what matches the query)
      for (const team of league.teams) {
        items.push({
          key: `team:${team.id}`,
          label: team.name,
          sublabel: league.name,
          category: 'team',
        });
      }
    }
  }

  return items;
})();

function getSuggestions(query: string): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const scored: Array<{ item: Suggestion; score: number }> = [];

  for (const item of CATALOGUE) {
    const labelLower = item.label.toLowerCase();
    if (!labelLower.includes(q) && !item.sublabel.toLowerCase().includes(q)) continue;

    // Score: starts-with beats contains; leagues beat teams for short queries
    let score = labelLower.includes(q) ? 2 : 1;
    if (labelLower.startsWith(q)) score += 3;
    if (item.category === 'league') score += 1;
    if (item.category === 'sport') score += 0.5;

    scored.push({ item, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.item);
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

// Sharp geometric markers per category — no emoji in HEA.
const CATEGORY_GLYPH: Record<Suggestion['category'], string> = {
  league: '◆',
  team: '●',
  sport: '■',
};

const CATEGORY_COLOR: Record<Suggestion['category'], string> = {
  league: colors.accent,
  team: colors.textSecondary,
  sport: colors.live,
};

export function BroadcastSubjectInput({
  value,
  onChange,
  placeholder = 'e.g. Premier League, Arsenal, F1…',
}: Props) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const suggestions = useMemo(
    () => (focused ? getSuggestions(value) : []),
    [value, focused],
  );

  const showSuggestions = focused && suggestions.length > 0;

  function pick(label: string) {
    onChange(label);
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <View>
      {/* Input — underline style, orange on focus */}
      <TextInput
        ref={inputRef}
        style={[inputStyle, focused && inputFocusedStyle]}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Slight delay so a tap on a suggestion registers before blur hides it
          setTimeout(() => setFocused(false), 150);
        }}
        returnKeyType="done"
        autoCapitalize="words"
      />

      {/* Suggestions panel — inline, pushes content down */}
      {showSuggestions && (
        <View style={s.suggestions}>
          {suggestions.map((item, i) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                s.row,
                i < suggestions.length - 1 && s.rowDivider,
                pressed && { backgroundColor: palette.surfaceHigh },
              ]}
              onPress={() => pick(item.label)}
            >
              <Text style={[s.rowGlyph, { color: CATEGORY_COLOR[item.category] }]}>
                {CATEGORY_GLYPH[item.category]}
              </Text>
              <View style={s.rowLabels}>
                <Text style={s.rowLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={[t.labelCapsSm, { color: colors.textTertiary }]} numberOfLines={1}>
                  {item.sublabel}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Hint shown when focused but no suggestions yet */}
      {focused && value.length > 0 && suggestions.length === 0 && (
        <Text style={s.customHint}>
          No matches — your custom value will be used as-is.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  suggestions: {
    backgroundColor: palette.surfaceMid,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowGlyph: { fontSize: 12, width: 20, textAlign: 'center' },
  rowLabels: { flex: 1, gap: 1 },
  rowLabel: { fontSize: 15, color: colors.textPrimary, fontFamily: fonts.sansMedium },
  customHint: {
    fontSize: 12,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
    color: colors.textTertiary,
    fontFamily: fonts.sansRegular,
  },
});
