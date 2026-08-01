/**
 * Autocomplete input for venue addresses, backed by GET /api/geocode
 * (Photon/OSM proxied through the Worker).
 *
 * Behaviour:
 *  - Free text is always accepted — an unmatched address still saves, it just
 *    won't have coordinates (and therefore won't pin on the map).
 *  - While typing (debounced), suggestions appear; tapping one fills the field
 *    AND reports lat/lng via onSelect so the event can be pinned on the map.
 *  - Any manual edit after selecting clears the coordinates — a stale pin at
 *    the old address is worse than no pin.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { searchAddresses, type GeocodeSuggestion } from '../lib/api';
import { inputStyle, inputFocusedStyle } from './ui';
import { colors, fonts, palette, spacing, type as t } from '../lib/theme';

const DEBOUNCE_MS = 350;
const MIN_QUERY = 3;

type Props = {
  value: string;
  onChangeText: (value: string) => void; // manual typing — caller should clear coords
  onSelect: (suggestion: GeocodeSuggestion) => void;
  placeholder?: string;
  bias?: { latitude: number; longitude: number } | null;
};

export function AddressAutocompleteInput({
  value,
  onChangeText,
  onSelect,
  placeholder = 'Start typing an address…',
  bias,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Suppress the lookup triggered by programmatically filling the field on select.
  const justPickedRef = useRef(false);

  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    const q = value.trim();
    if (!focused || q.length < MIN_QUERY) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchAddresses(q, bias ?? undefined)
        .then((results) => { if (!cancelled) setSuggestions(results); })
        .catch(() => { if (!cancelled) setSuggestions([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, focused, bias]);

  const showSuggestions = focused && suggestions.length > 0;

  function pick(sugg: GeocodeSuggestion) {
    justPickedRef.current = true;
    onSelect(sugg);
    setSuggestions([]);
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <View>
      <View>
        <TextInput
          ref={inputRef}
          style={[inputStyle, focused && inputFocusedStyle]}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Slight delay so a tap on a suggestion registers before blur hides it
            setTimeout(() => setFocused(false), 150);
          }}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
        />
        {searching && (
          <ActivityIndicator size="small" color={colors.accent} style={s.spinner} />
        )}
      </View>

      {showSuggestions && (
        <View style={s.suggestions}>
          {suggestions.map((item, i) => (
            <Pressable
              key={`${item.lat},${item.lng},${item.label}`}
              style={({ pressed }) => [
                s.row,
                i < suggestions.length - 1 && s.rowDivider,
                pressed && { backgroundColor: palette.surfaceHigh },
              ]}
              onPress={() => pick(item)}
            >
              <Text style={s.rowGlyph}>◉</Text>
              <View style={s.rowLabels}>
                <Text style={s.rowLabel} numberOfLines={1}>{item.name}</Text>
                <Text style={[t.labelCapsSm, { color: colors.textTertiary }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {focused && value.trim().length >= MIN_QUERY && !searching && suggestions.length === 0 && (
        <Text style={s.customHint}>
          No matches — the address will be saved as typed, without a map pin.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  spinner: { position: 'absolute', right: spacing.md, top: 0, bottom: 0 },
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
  rowGlyph: { fontSize: 12, width: 20, textAlign: 'center', color: colors.accent },
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
