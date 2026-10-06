import React, { useEffect, useRef, useState } from 'react';
import {
  View, Pressable, Animated, AccessibilityInfo, StyleSheet,
  type ViewStyle, type StyleProp, type PressableProps,
} from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './icons';
import {
  colors, radius, spacing, type as t, TAP, HARD_OFFSET,
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

const SEG_SHADOW = 3;
const CHIP_SHADOW = 3;

// ─── Hard shadow: a real solid block behind the content ─────────────────────
// Not a platform shadow (those paint from child alpha and differ per OS).
// Layers: [wrapper: reserves `offset` px right+bottom] > [block, absolute,
// shifted by `offset`] + [content, opaque, on top]. Pressed: the content
// translates onto the stationary block, so it reads as pushed in.
// `style` is wrapper layout (flex, margins, alignSelf); `contentStyle` is the
// visual face and MUST carry an opaque backgroundColor when `active`.

export function HardShadow({
  offset = HARD_OFFSET, active = true, pressed = false, reserve = true,
  color = colors.shadow, round = false, fill = true, style, contentStyle, children,
}: {
  offset?: number;
  /** Draw the block. When false the layout is still reserved (no jump on select). */
  active?: boolean;
  pressed?: boolean;
  /** Reserve `offset` px of space right and below for the block. */
  reserve?: boolean;
  color?: string;
  /** Circular block, for round faces (map pins). */
  round?: boolean;
  /** Face grows to fill a taller wrapper (equal-height tiles). Off for fixed-size faces. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const shift = active && pressed ? { transform: [{ translateX: offset }, { translateY: offset }] } : null;
  return (
    <View style={[reserve && { paddingRight: offset, paddingBottom: offset }, style]}>
      {active && (
        <View
          testID="hard-shadow-block"
          pointerEvents="none"
          style={[
            s.hardBlock,
            { left: offset, top: offset, right: reserve ? 0 : -offset, bottom: reserve ? 0 : -offset, backgroundColor: color },
            round && { borderRadius: radius.round },
          ]}
        />
      )}
      <View testID="hard-shadow-content" style={[fill && s.hardContent, contentStyle, shift]}>{children}</View>
    </View>
  );
}

// Pressable whose face is a HardShadow. `style` lays out the touch target;
// `contentStyle` styles the face (receives `pressed`).
export function HardPressable({
  offset = HARD_OFFSET, active = true, reserve = true, style, contentStyle, children, ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  offset?: number;
  active?: boolean;
  reserve?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle> | ((pressed: boolean) => StyleProp<ViewStyle>);
  children?: React.ReactNode | ((pressed: boolean) => React.ReactNode);
}) {
  return (
    <Pressable {...rest} style={style}>
      {({ pressed }) => (
        <HardShadow
          offset={offset}
          active={active}
          reserve={reserve}
          pressed={pressed}
          contentStyle={typeof contentStyle === 'function' ? contentStyle(pressed) : contentStyle}
        >
          {typeof children === 'function' ? children(pressed) : children}
        </HardShadow>
      )}
    </Pressable>
  );
}

// ─── Segmented control: selected segment = opaque fill + hard shadow block ───
// Every segment (selected or not) reserves the same shadow gutter, so the
// selected one sits fully inside the frame with equal inner padding and both
// have identical 44pt hit areas.

export function SegmentedControl<K extends string>({
  options, value, onChange, style, iconOnly = false,
}: {
  options: ReadonlyArray<{ key: K; label: string; icon?: IconName; accessibilityLabel?: string }>;
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
  /** Compact: icon-only segments of fixed, equal size (label becomes the a11y label). */
  iconOnly?: boolean;
}) {
  return (
    <View style={[s.segmented, style]}>
      {options.map((opt) => {
        const on = opt.key === value;
        const color = on ? colors.textOnFill : colors.textPrimary;
        return (
          <HardPressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={opt.accessibilityLabel ?? (iconOnly ? opt.label : undefined)}
            active={on}
            offset={SEG_SHADOW}
            style={iconOnly ? s.segmentSlotIcon : s.segmentSlot}
            contentStyle={(pressed) => [
              s.segmentFace,
              on && { backgroundColor: colors.action },
              !on && pressed && { backgroundColor: colors.surface3 },
            ]}
          >
            {opt.icon && <Icon name={opt.icon} size={iconOnly ? 20 : 16} color={color} />}
            {!(iconOnly && opt.icon) && <Text style={[t.labelCaps, { color }]} numberOfLines={1}>{opt.label}</Text>}
          </HardPressable>
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
  const face: ViewStyle[] = [s.btn, small ? s.btnSmall : {}];
  let textColor: string = colors.textOnFill;
  const primary = variant === 'primary';

  if (primary) {
    face.push({ backgroundColor: colors.action });
  } else if (variant === 'secondary') {
    face.push({ backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.borderStrong });
    textColor = colors.textPrimary;
  } else if (variant === 'ghost') {
    face.push({ backgroundColor: colors.surface3 });
    textColor = colors.textPrimary;
  } else {
    face.push({ backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.danger });
    textColor = colors.danger;
  }

  return (
    <HardPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      offset={BTN_SHADOW}
      active={primary && !disabled}
      reserve={primary}
      style={style}
      contentStyle={(pressed) => [
        face,
        !primary && pressed && { backgroundColor: colors.surface3 },
        disabled && s.btnDisabled,
      ]}
    >
      <Text style={[small ? t.labelCapsSm : t.labelCaps, { color: textColor }]}>{label}</Text>
    </HardPressable>
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
  // Opaque selected face (the wash flattened over the canvas): the hard-shadow
  // block sits behind it, so the face must not be translucent.
  const selectedFill =
    tone === 'live' ? colors.liveSelectedFill
      : tone === 'confirmed' ? colors.confirmedSelectedFill
        : tone === 'neutral' ? colors.surface3
          : colors.actionSelectedFill;
  const content = (
    <>
      <Text style={[t.labelCapsSm, { color: active ? toneColor : colors.textSecondary }]}>{label}</Text>
      {trailingIcon && <Icon name={trailingIcon} size={12} color={active ? toneColor : colors.textSecondary} />}
    </>
  );
  // Without `onPress` the chip is a static tag: no press state, no tap role,
  // no shadow.
  if (!onPress) {
    return (
      <View
        style={[
          s.chip,
          { borderColor: active ? toneColor : colors.borderSubtle },
          active && { backgroundColor: selectedFill },
        ]}
      >
        {content}
      </View>
    );
  }
  return (
    <HardPressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      active={active}
      offset={CHIP_SHADOW}
      contentStyle={(pressed) => [
        s.chip,
        { borderColor: active ? toneColor : colors.borderSubtle },
        active && { backgroundColor: selectedFill },
        !active && pressed && { backgroundColor: colors.surface3 },
      ]}
    >
      {content}
    </HardPressable>
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
  hardBlock: { position: 'absolute' },
  hardContent: { flexGrow: 1 },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.xs,
  },
  // Slot = touch target incl. the reserved shadow gutter; face = the segment.
  segmentSlot: { flex: 1 },
  segmentSlotIcon: { width: TAP + SEG_SHADOW },
  segmentFace: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    minHeight: TAP,
    minWidth: TAP,
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
