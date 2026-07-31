import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { colors, fonts, palette, spacing, type as t, hardShadow } from '../lib/theme';

// ─── Section title: Anton caps with an electric underline bar ────────────────

export function SectionTitle({ children, accent = colors.accent }: { children: string; accent?: string }) {
  return (
    <View style={s.sectionWrap}>
      <Text style={[t.headlineMd, { color: colors.textPrimary }]}>{children}</Text>
      <View style={[s.sectionBar, { backgroundColor: accent }]} />
    </View>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
// primary   — solid electric blue, black text, hard orange drop shadow
// secondary — heavy white border, transparent
// ghost     — outlined in surface tone, subdued

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Btn({
  label, onPress, variant = 'primary', disabled = false, small = false, style,
}: {
  label: string;
  onPress?: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const base: ViewStyle[] = [s.btn, small ? s.btnSmall : {}];
  let textColor: string = colors.fillText;

  if (variant === 'primary') {
    base.push({ backgroundColor: colors.fill }, disabled ? {} : hardShadow(palette.secondary, 3));
    textColor = colors.fillText;
  } else if (variant === 'secondary') {
    base.push({ backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.textPrimary });
    textColor = colors.textPrimary;
  } else if (variant === 'ghost') {
    base.push({ backgroundColor: colors.fillSubtle });
    textColor = colors.fillSubtleText;
  } else {
    base.push({ backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.danger });
    textColor = colors.danger;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [base, disabled && s.btnDisabled, pressed && s.btnPressed, style]}
    >
      <Text style={[small ? t.labelCapsSm : t.labelCaps, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Chip: clipped-corner tag, semi-transparent accent fill ──────────────────

export function Chip({
  label, active = false, onPress, tone = 'accent',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'accent' | 'live' | 'volt' | 'neutral';
}) {
  const toneColor =
    tone === 'live' ? colors.live : tone === 'volt' ? colors.volt : tone === 'neutral' ? colors.textSecondary : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.chip,
        { borderColor: active ? toneColor : colors.cardBorder },
        active && { backgroundColor: `${toneColor}33` },
      ]}
    >
      <Text style={[t.labelCapsSm, { color: active ? toneColor : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Badge: LIVE / HOT MATCH / status marker with pulsing-dot look ───────────

export function Badge({
  label, tone = 'live', dot = true, style,
}: {
  label: string;
  tone?: 'live' | 'accent' | 'volt' | 'neutral';
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const toneColor =
    tone === 'accent' ? colors.accent : tone === 'volt' ? colors.volt : tone === 'neutral' ? colors.textSecondary : colors.live;
  return (
    <View style={[s.badge, { backgroundColor: palette.surfaceHigh }, style]}>
      {dot && <View style={[s.badgeDot, { backgroundColor: toneColor }]} />}
      <Text style={[t.labelCapsSm, { color: tone === 'neutral' ? colors.textPrimary : toneColor }]}>{label}</Text>
    </View>
  );
}

// ─── Segmented progress bar (mechanical, not smooth) ─────────────────────────

export function SegmentBar({
  value, max, segments = 10, tone = colors.accent,
}: {
  value: number;
  max: number;
  segments?: number;
  tone?: string;
}) {
  const filled = max > 0 ? Math.round((Math.min(value, max) / max) * segments) : 0;
  return (
    <View style={s.segRow}>
      {Array.from({ length: segments }, (_, i) => (
        <View
          key={i}
          style={[s.seg, { backgroundColor: i < filled ? tone : palette.surfaceHighest }]}
        />
      ))}
    </View>
  );
}

// ─── Field label + underlined input wrapper styling helpers ──────────────────

export function FieldLabel({ children, color = colors.accent }: { children: string; color?: string }) {
  return <Text style={[t.labelCaps, { color, marginBottom: spacing.sm }]}>{children}</Text>;
}

// Underline-only input frame per the design (2px bottom border, orange focus).
export const inputStyle = {
  backgroundColor: palette.surfaceMid,
  borderBottomWidth: 2,
  borderBottomColor: palette.outlineVariant,
  color: colors.textPrimary,
  fontFamily: fonts.sansMedium,
  fontSize: 16,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.md,
} as const;

export const inputFocusedStyle = { borderBottomColor: colors.live } as const;

const s = StyleSheet.create({
  sectionWrap: { gap: spacing.sm, marginBottom: spacing.lg },
  sectionBar: { width: 48, height: 3 },

  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  btnSmall: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  btnPressed: { opacity: 0.82, transform: [{ translateX: 1 }, { translateY: 1 }] },
  btnDisabled: { opacity: 0.4 },

  chip: {
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    alignSelf: 'flex-start',
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },

  segRow: { flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 8 },
});
