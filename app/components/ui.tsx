import React, { useEffect, useRef, useState } from 'react';
import {
  View, Pressable, Animated, AccessibilityInfo, StyleSheet,
  type ViewStyle, type StyleProp,
} from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './icons';
import {
  colors, radius, spacing, type as t, TAP, hardShadow, pressStyle,
} from '../lib/theme';

// ─── Reduce Motion ────────────────────────────────────────────────────────────

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (mounted) setReduce(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { mounted = false; sub.remove(); };
  }, []);
  return reduce;
}

// ─── Live dot: a true circle (radius.round) that pulses subtly ───────────────
// Opacity-only loop on the native driver; static when Reduce Motion is on.

export function LiveDot({ color = colors.live, size = 8 }: { color?: string; size?: number }) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) { opacity.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, opacity]);

  return (
    <Animated.View
      style={{
        width: size, height: size, borderRadius: radius.round, backgroundColor: color, opacity,
      }}
    />
  );
}

// ─── Segmented control: the selected segment is "selected" = fill + shadow ───

export function SegmentedControl<K extends string>({
  options, value, onChange, style,
}: {
  options: ReadonlyArray<{ key: K; label: string; icon?: IconName; accessibilityLabel?: string }>;
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.segmented, style]}>
      {options.map((opt) => {
        const on = opt.key === value;
        const color = on ? colors.textOnFill : colors.textPrimary;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={opt.accessibilityLabel}
            style={({ pressed }) => [
              s.segmentBtn,
              on && { backgroundColor: colors.action },
              on && hardShadow(3),
              on && pressStyle(pressed, 3),
              !on && pressed && { backgroundColor: colors.surface3 },
            ]}
          >
            {opt.icon && <Icon name={opt.icon} size={16} color={color} />}
            <Text style={[t.labelCaps, { color }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── In-content back link (auth screens): back icon + label, 44pt target ─────

export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={s.backLink}
    >
      <Icon name="back" size={18} color={colors.textSecondary} />
      <Text style={[t.labelCaps, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Section title: Anton caps over a 1px rule ───────────────────────────────

export function SectionTitle({ children }: { children: string }) {
  return (
    <View style={s.sectionWrap}>
      <Text style={[t.headlineMd, { color: colors.textPrimary }]}>{children}</Text>
      <View style={s.sectionRule} />
    </View>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
// primary   solid action fill, black text, hard shadow (pressable primary).
//           Press collapses the shadow: the block travels the offset.
// secondary 2px strong border, transparent (interactive = 2px)
// ghost     quiet filled well
// danger    2px danger border

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BTN_SHADOW = 4;

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
  let textColor: string = colors.textOnFill;
  const primary = variant === 'primary';

  if (primary) {
    base.push({ backgroundColor: colors.action });
  } else if (variant === 'secondary') {
    base.push({ backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.borderStrong });
    textColor = colors.textPrimary;
  } else if (variant === 'ghost') {
    base.push({ backgroundColor: colors.surface3 });
    textColor = colors.textPrimary;
  } else {
    base.push({ backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.danger });
    textColor = colors.danger;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        base,
        primary && !disabled && hardShadow(BTN_SHADOW),
        primary && !disabled && pressStyle(pressed, BTN_SHADOW),
        !primary && pressed && { backgroundColor: colors.surface3 },
        disabled && s.btnDisabled,
        style,
      ]}
    >
      <Text style={[small ? t.labelCapsSm : t.labelCaps, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

// ─── Chip: square tag. Selected = 2px tone border + wash + hard shadow ───────
// Corners are square on purpose: the set's chamfer motif lives in the icons;
// a clipped-corner chip would need a bespoke SVG border per tone and does not
// earn its weight.

export function Chip({
  label, active = false, onPress, tone = 'action', trailingIcon,
}: {
  label: string;
  active?: boolean;
  /** Optional glyph after the label, e.g. 'close' on a removable chip. */
  trailingIcon?: IconName;
  onPress?: () => void;
  tone?: 'action' | 'live' | 'confirmed' | 'neutral';
}) {
  const toneColor =
    tone === 'live' ? colors.live
      : tone === 'confirmed' ? colors.confirmed
        : tone === 'neutral' ? colors.textPrimary
          : colors.action;
  const wash =
    tone === 'live' ? colors.liveWash
      : tone === 'confirmed' ? colors.confirmedWash
        : tone === 'neutral' ? colors.surface3
          : colors.actionWash;
  // Without `onPress` the chip is a static tag: no press state, no tap role.
  if (!onPress) {
    return (
      <View
        style={[
          s.chip,
          { borderColor: active ? toneColor : colors.borderSubtle },
          active && { backgroundColor: wash },
        ]}
      >
        <Text style={[t.labelCapsSm, { color: active ? toneColor : colors.textSecondary }]}>{label}</Text>
        {trailingIcon && <Icon name={trailingIcon} size={12} color={active ? toneColor : colors.textSecondary} />}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        s.chip,
        { borderColor: active ? toneColor : colors.borderSubtle },
        active && { backgroundColor: wash },
        active && hardShadow(3),
        active && pressStyle(pressed, 3),
        !active && pressed && { backgroundColor: colors.surface3 },
      ]}
    >
      <Text style={[t.labelCapsSm, { color: active ? toneColor : colors.textSecondary }]}>{label}</Text>
      {trailingIcon && <Icon name={trailingIcon} size={12} color={active ? toneColor : colors.textSecondary} />}
    </Pressable>
  );
}

// ─── Badge: state marker. Pulsing dot only for tone="live" ───────────────────

export function Badge({
  label, tone = 'live', dot = true, icon, style,
}: {
  label: string;
  tone?: 'live' | 'action' | 'confirmed' | 'neutral';
  dot?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const toneColor =
    tone === 'action' ? colors.action
      : tone === 'confirmed' ? colors.confirmed
        : tone === 'neutral' ? colors.textSecondary
          : colors.live;
  return (
    <View style={[s.badge, style]}>
      {icon && <Icon name={icon} size={12} color={toneColor} />}
      {dot && !icon && (tone === 'live'
        ? <LiveDot color={toneColor} size={7} />
        : <View style={[s.badgeDot, { backgroundColor: toneColor }]} />)}
      <Text style={[t.labelCapsSm, { color: tone === 'neutral' ? colors.textPrimary : toneColor }]}>{label}</Text>
    </View>
  );
}

// ─── Segmented progress bar (mechanical, not smooth) ─────────────────────────

export function SegmentBar({
  value, max, segments = 10, tone = colors.action,
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
          style={[s.seg, { backgroundColor: i < filled ? tone : colors.surface3 }]}
        />
      ))}
    </View>
  );
}

// ─── Field label + underlined input styling ──────────────────────────────────

export function FieldLabel({ children, color = colors.textSecondary }: { children: string; color?: string }) {
  return <Text style={[t.labelCaps, { color, marginBottom: spacing.sm }]}>{children}</Text>;
}

// Underline-only input frame: 2px strong bottom border (interactive = 2px),
// turning to the action colour on focus. Focus never uses `live`.
export const inputStyle = {
  ...t.bodyMdStrong,
  backgroundColor: colors.surface2,
  borderBottomWidth: 2,
  borderBottomColor: colors.borderStrong,
  color: colors.textPrimary,
  minHeight: TAP,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.md,
} as const;

export const inputFocusedStyle = { borderBottomColor: colors.action } as const;

const s = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.xs + 1,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs + 2,
    minHeight: TAP,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLink: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: TAP, alignSelf: 'flex-start',
  },
  sectionWrap: { gap: spacing.sm, marginBottom: spacing.lg },
  sectionRule: { height: 1, backgroundColor: colors.borderSubtle },

  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TAP + 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  // Small buttons keep the 44pt minimum tap height.
  btnSmall: { minHeight: TAP, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  btnDisabled: { opacity: 0.4 },

  chip: {
    borderWidth: 2,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    alignSelf: 'flex-start',
  },
  badgeDot: { width: 7, height: 7, borderRadius: radius.round },

  segRow: { flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 8 },
});
