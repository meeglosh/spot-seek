import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing, type as t } from '../lib/theme';

// ─── StarRating: read-only display, 0-5 float rendered as glyph stars ────────
// Text glyphs rather than an icon asset — "★"/"☆" render crisply at any size
// with zero extra bundle weight, matching the rest of HEA's asset-light UI.

export function StarRating({
  value, size = 16, label,
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const rounded = Math.round(Math.min(5, Math.max(0, value)));
  return (
    <View style={s.row}>
      <View style={s.starsRow}>
        {Array.from({ length: 5 }, (_, i) => (
          <Text
            key={i}
            style={{ fontSize: size, lineHeight: size * 1.15, color: i < rounded ? colors.accent : colors.textTertiary }}
          >
            {i < rounded ? '★' : '☆'}
          </Text>
        ))}
      </View>
      {label && (
        <Text style={[t.labelCapsSm, { color: colors.textSecondary, fontFamily: fonts.label }]}>{label}</Text>
      )}
    </View>
  );
}

// ─── StarInput: 5 tappable stars, 1-5 rating ──────────────────────────────────

export function StarInput({
  value, onChange, size = 28, accessibilityLabel,
}: {
  value: number;
  onChange: (rating: number) => void;
  size?: number;
  accessibilityLabel?: string;
}) {
  return (
    <View style={s.inputRow}>
      {Array.from({ length: 5 }, (_, i) => {
        const rating = i + 1;
        const filled = rating <= value;
        return (
          <Pressable
            key={i}
            onPress={() => onChange(rating)}
            hitSlop={6}
            style={s.starHit}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ? `${accessibilityLabel} ${rating}` : `${rating}`}
          >
            <Text style={{ fontSize: size, lineHeight: size * 1.15, color: filled ? colors.accent : colors.textTertiary }}>
              {filled ? '★' : '☆'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  starsRow: { flexDirection: 'row', gap: 2 },
  inputRow: { flexDirection: 'row', gap: spacing.xs },
  starHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
