import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Icon } from './icons';
import { colors, spacing, TAP, type as t } from '../lib/theme';

// ─── StarRating: read-only display, 0-5 float rendered with the icon set ─────
// Filled star = earned rating (the one place a fill carries meaning); display
// stars are neutral paper, since a rating is not interactive.

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
          <Icon
            key={i}
            name={i < rounded ? 'starFilled' : 'star'}
            size={size}
            color={i < rounded ? colors.textPrimary : colors.textTertiary}
          />
        ))}
      </View>
      {label && (
        <Text style={[t.labelCapsSm, { color: colors.textSecondary }]}>{label}</Text>
      )}
    </View>
  );
}

// ─── StarInput: 5 tappable stars, 1-5 rating (interactive = action) ──────────

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
            style={s.starHit}
            accessibilityRole="button"
            accessibilityState={{ selected: filled }}
            accessibilityLabel={accessibilityLabel ? `${accessibilityLabel} ${rating}` : `${rating}`}
          >
            <Icon
              name={filled ? 'starFilled' : 'star'}
              size={size}
              color={filled ? colors.action : colors.textTertiary}
            />
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
  starHit: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
});
