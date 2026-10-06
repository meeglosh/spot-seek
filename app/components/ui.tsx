import React, { useEffect, useRef, useState } from 'react';
import {
  View, Pressable, Animated, AccessibilityInfo, StyleSheet, Switch,
  type ViewStyle, type StyleProp, type PressableProps,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Icon, type IconName } from './icons';
import { colors, radius, spacing, space, type as t, TAP, elevation, press } from '../lib/theme';

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

// ─── Press: the one pressable. Gentle 0.97 scale + opacity dip over 120ms ────
// Drop-in for Pressable; `style` may be a function of { pressed }. Reduce
// Motion drops the scale and keeps the opacity dip (a state change must still
// be visible). `restOpacity` lets a disabled control sit at e.g. 0.4.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressStyle = StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);

export type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: PressStyle;
  restOpacity?: number;
  children?: React.ReactNode;
};

export function Press({
  style, restOpacity = 1, disabled, onPressIn, onPressOut, children, ...rest
}: PressProps) {
  const reduceMotion = useReduceMotion();
  const v = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);

  const to = (toValue: number) => {
    Animated.timing(v, { toValue, duration: press.duration, useNativeDriver: true }).start();
  };

  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  const live = !disabled;

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { if (live) { setPressed(true); to(1); } onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); to(0); onPressOut?.(e); }}
      style={[
        resolved,
        {
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [restOpacity, restOpacity * press.dip] }),
          transform: [{
            scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, reduceMotion ? 1 : press.scale] }),
          }],
        },
      ]}
    >
      {children}
    </AnimatedPressable>
  );
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

// ─── Toggle: the NATIVE Switch, themed with tokens ───────────────────────────
// Track: surface3 off, action on. Thumb: paper (opaque, high contrast on both).
// `ios_backgroundColor` keeps the off track on-token when iOS paints the rim.

export function Toggle({
  value, onValueChange, disabled, accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: colors.surface3, true: colors.action }}
      thumbColor={colors.textPrimary}
      ios_backgroundColor={colors.surface3}
    />
  );
}

// ─── Skeleton: opaque surface with a slow shimmer ────────────────────────────
// A surface2 block with an opaque surface3 layer fading in and out over it
// (never a translucent view, so no shadow or bleed artefacts). Static under
// Reduce Motion. The loop is stopped on unmount.

export function Skeleton({
  width = '100%', height = 16, radius: r = radius.control, style,
}: {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReduceMotion();
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) { glow.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); glow.setValue(0); };
  }, [reduceMotion, glow]);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: r, backgroundColor: colors.surface2, overflow: 'hidden' }, style]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface3, opacity: glow }]}
      />
    </View>
  );
}

// A card-shaped skeleton matching EventCard (cover, badge, title, meta, footer).
export function EventCardSkeleton() {
  const { t: tr } = useTranslation('common');
  return (
    <View style={s.skelCard} accessibilityLabel={tr('loading')} accessible>
      <Skeleton height={120} radius={0} />
      <View style={s.skelBody}>
        <Skeleton width="30%" height={20} radius={radius.pill} />
        <Skeleton width="80%" height={22} />
        <Skeleton width="55%" height={14} />
        <View style={s.skelFooter}>
          <Skeleton width="35%" height={16} />
          <Skeleton width={72} height={TAP} />
        </View>
      </View>
    </View>
  );
}

// A row-shaped skeleton for list rows (notifications, sponsorship, dashboard).
export function RowSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <View style={s.skelRow}>
      <Skeleton width="60%" height={18} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '40%' : '90%'} height={14} />
      ))}
    </View>
  );
}

// ─── EmptyState: icon, title, why it is empty, one primary next action ───────
// Pass `actionLabel` + `onAction` only when an existing route/action fits.

export function EmptyState({
  icon, title, body, actionLabel, onAction, style,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.stateWrap, style]}>
      <View style={s.stateIcon}>
        <Icon name={icon} size={28} color={colors.textSecondary} />
      </View>
      <Text style={[t.headlineSm, s.stateTitle]}>{title}</Text>
      <Text style={[t.bodyMd, s.stateBody]}>{body}</Text>
      {actionLabel && onAction && <Btn label={actionLabel} onPress={onAction} style={s.stateBtn} />}
    </View>
  );
}

// ─── ErrorState: what failed + Retry (calls the existing loader) ─────────────

export function ErrorState({
  title, message, retryLabel, onRetry, style,
}: {
  title: string;
  message?: string;
  retryLabel: string;
  onRetry: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.stateWrap, style]} accessibilityRole="alert">
      <View style={[s.stateIcon, { backgroundColor: colors.dangerWash }]}>
        <Icon name="shield" size={28} color={colors.danger} />
      </View>
      <Text style={[t.headlineSm, s.stateTitle]}>{title}</Text>
      {message ? <Text style={[t.bodyMd, s.stateBody]}>{message}</Text> : null}
      <Btn label={retryLabel} variant="secondary" onPress={onRetry} style={s.stateBtn} />
    </View>
  );
}

// ─── SoonTag: a quiet "Soon" marker for stubbed features ─────────────────────

export function SoonTag({ label }: { label: string }) {
  return (
    <View style={s.soonTag}>
      <Text style={[t.tag, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ─── Segmented control ───────────────────────────────────────────────────────
// A recessed track (surface2) holding a raised thumb (surface3, opaque, with a
// soft level-1 shadow). Sizing: segments hug their content by default and the
// control never exceeds its container (`maxWidth: '100%'`, labels truncate).
// Pass `fill` to stretch the control and share the width equally. The thumb's
// radius is the track's minus the track padding, so the curves stay concentric.

const SEG_PAD = 3;

export function SegmentedControl<K extends string>({
  options, value, onChange, style, fill = false,
}: {
  options: ReadonlyArray<{ key: K; label: string; icon?: IconName; accessibilityLabel?: string }>;
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
  fill?: boolean;
}) {
  return (
    <View style={[s.segmented, fill ? s.segmentedFill : s.segmentedHug, style]}>
      {options.map((opt) => {
        const on = opt.key === value;
        return (
          <Press
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={opt.accessibilityLabel}
            style={[
              s.segmentBtn,
              fill ? s.segmentFill : s.segmentHug,
              on && s.segmentOn,
            ]}
          >
            {opt.icon && (
              <Icon name={opt.icon} size={16} color={on ? colors.action : colors.textTertiary} />
            )}
            <Text
              style={[t.label, { color: on ? colors.textPrimary : colors.textSecondary }]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

// ─── In-content back link (auth screens): back icon + label, 44pt target ─────

export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      style={s.backLink}
    >
      <Icon name="back" size={18} color={colors.textSecondary} />
      <Text style={[t.label, { color: colors.textSecondary }]}>{label}</Text>
    </Press>
  );
}

// ─── Section title: Anton, mixed case, room above and less below ─────────────

export function SectionTitle({ children }: { children: string }) {
  return (
    <View style={s.sectionWrap}>
      <Text style={[t.headlineMd, { color: colors.textPrimary }]}>{children}</Text>
    </View>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
// primary   solid action fill, dark text. NO shadow: colour and weight carry it.
// secondary raised neutral fill (surface3), no border
// ghost     no fill, soft cyan text (tertiary emphasis)
// danger    danger wash, danger text

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
  let bg: string = colors.action;
  let textColor: string = colors.textOnFill;
  if (variant === 'secondary') { bg = colors.surface3; textColor = colors.textPrimary; }
  else if (variant === 'ghost') { bg = 'transparent'; textColor = colors.actionMuted; }
  else if (variant === 'danger') { bg = colors.dangerWash; textColor = colors.danger; }

  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      restOpacity={disabled ? 0.4 : 1}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[s.btn, small && s.btnSmall, { backgroundColor: bg }, style]}
    >
      <Text style={[small ? t.buttonSm : t.button, { color: textColor }]}>{label}</Text>
    </Press>
  );
}

// ─── Chip: pill. Selected = tone wash + tone text + faint tone edge ──────────
// No shadow, no stacked layers: a selected chip is ONE view with ONE label
// (brutalist-v2 shadowed a translucent chip and iOS drew the label twice).

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
  const fg = active ? toneColor : colors.textSecondary;
  const frame: ViewStyle = active
    ? { backgroundColor: wash, borderColor: `${toneColor}55` }
    : { backgroundColor: colors.surface2, borderColor: 'transparent' };
  const content = (
    <>
      <Text style={[t.labelMd, { color: fg }]} numberOfLines={1}>{label}</Text>
      {trailingIcon && <Icon name={trailingIcon} size={12} color={fg} />}
    </>
  );
  // Without `onPress` the chip is a static tag: no press state, no tap role.
  if (!onPress) return <View style={[s.chip, frame]}>{content}</View>;
  return (
    <Press
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[s.chip, frame]}
    >
      {content}
    </Press>
  );
}

// ─── Badge: state marker. Pulsing dot only for tone="live" ───────────────────
// Tiny caps tag (the one place caps live), on an opaque surface3 pill.

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
      <Text style={[t.tag, { color: tone === 'neutral' ? colors.textPrimary : toneColor }]}>{label}</Text>
    </View>
  );
}

// ─── Segmented progress bar ──────────────────────────────────────────────────

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

// ─── Field label + input styling ─────────────────────────────────────────────

export function FieldLabel({ children, color = colors.textSecondary }: { children: string; color?: string }) {
  return <Text style={[t.label, { color, marginBottom: spacing.sm }]}>{children}</Text>;
}

// Filled well (surface2) with control radius. The 1px edge is transparent at
// rest and turns action on focus, so focusing never shifts layout.
export const inputStyle = {
  ...t.bodyMdStrong,
  backgroundColor: colors.surface2,
  borderWidth: 1,
  borderColor: 'transparent',
  borderRadius: radius.control,
  color: colors.textPrimary,
  minHeight: TAP + 4,
  paddingHorizontal: spacing.lg - 4,
  paddingVertical: spacing.md,
} as const;

export const inputFocusedStyle = { borderColor: colors.action } as const;

const s = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    padding: SEG_PAD,
    maxWidth: '100%',
  },
  segmentedHug: { alignSelf: 'flex-start', flexShrink: 1 },
  segmentedFill: { alignSelf: 'stretch' },
  segmentBtn: {
    flexDirection: 'row',
    gap: 6,
    minHeight: TAP - SEG_PAD,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control - SEG_PAD,
  },
  segmentHug: { flexShrink: 1, minWidth: 0 },
  segmentFill: { flex: 1, minWidth: 0 },
  // Opaque thumb, soft level-1 shadow.
  segmentOn: { ...elevation(1), backgroundColor: colors.surface3 },
  backLink: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: TAP, alignSelf: 'flex-start',
  },
  sectionWrap: { marginTop: space.headingAbove - spacing.sm, marginBottom: space.headingBelow },

  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TAP + 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.control,
  },
  // Small buttons keep the 44pt minimum tap height.
  btnSmall: { minHeight: TAP, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },

  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    alignSelf: 'flex-start',
  },
  badgeDot: { width: 7, height: 7, borderRadius: radius.round },

  skelCard: { ...elevation(1), borderRadius: radius.card, overflow: 'hidden' },
  skelBody: { padding: spacing.lg, gap: spacing.sm },
  skelFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  skelRow: { backgroundColor: colors.surface1, borderRadius: radius.card, padding: spacing.lg, gap: spacing.sm },
  stateWrap: { alignItems: 'center', paddingVertical: spacing['2xl'], paddingHorizontal: spacing.xl, gap: spacing.sm },
  stateIcon: {
    width: 64, height: 64, borderRadius: radius.round, backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  stateTitle: { color: colors.textPrimary, textAlign: 'center' },
  stateBody: { color: colors.textSecondary, textAlign: 'center', maxWidth: 320 },
  stateBtn: { marginTop: spacing.md, maxWidth: 320, width: '100%' },
  soonTag: { backgroundColor: colors.surface3, borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },

  segRow: { flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 6, borderRadius: 3 },
});
