import React, { useEffect, useRef } from 'react';
import {
  View, Modal, Animated, Easing, PanResponder, AccessibilityInfo, StyleSheet, Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon } from './icons';
import { Press, useReduceMotion } from './ui';
import { colors, radius, spacing, TAP, elevation, type as t } from '../lib/theme';
import { momentFor, momentTiming as T } from '../lib/youreIn';

// The signature moment: RSVP becomes "going" and the SpotSeek pin drops into
// the sheet, the way it drops into the crowd on the landing page. Transform and
// opacity only, native driver throughout. The sheet itself stays opaque (it
// carries a shadow); only its content animates.
type Props = {
  visible: boolean;
  state: 'going' | 'waitlisted';
  title: string;
  when: string | null;
  canGetDirections: boolean;
  onShare: () => void;
  onDirections: () => void;
  onDone: () => void;
};

const DROP_FROM = -240;
const SHEET_FROM = 520;

export function YoureIn({ visible, state, title, when, canGetDirections, onShare, onDirections, onDone }: Props) {
  const { t: tr } = useTranslation('discover');
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const moment = momentFor(state, reduceMotion, canGetDirections);

  const scrim = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(0)).current;   // swipe-down offset
  const enter = useRef(new Animated.Value(0)).current;    // slide-up entrance
  const pinY = useRef(new Animated.Value(DROP_FROM)).current;
  const pinOpacity = useRef(new Animated.Value(0)).current;
  const squashX = useRef(new Animated.Value(1)).current;
  const squashY = useRef(new Animated.Value(1)).current;
  const shadow = useRef(new Animated.Value(0)).current;
  const headline = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;
  const actions = useRef(new Animated.Value(0)).current;
  const all = useRef(new Animated.Value(0)).current;      // crossfade path

  const motion = moment?.motion;
  const variant = moment?.variant;

  useEffect(() => {
    if (!visible || !variant) return;
    // Reset every beat so a second RSVP replays cleanly.
    [scrim, pinOpacity, shadow, headline, line, actions, all].forEach((v) => v.setValue(0));
    sheetY.setValue(0);
    enter.setValue(reduceMotion ? 1 : 0);
    pinY.setValue(motion === 'drop' ? DROP_FROM : 0);
    squashX.setValue(1);
    squashY.setValue(1);

    AccessibilityInfo.announceForAccessibility(
      variant === 'going' ? tr('youreIn.announceGoing') : tr('youreIn.announceWaitlist'),
    );

    const fadeIn = (v: Animated.Value, duration: number) =>
      Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const beat = (v: Animated.Value, delay: number) =>
      Animated.sequence([Animated.delay(delay), fadeIn(v, T.reveal)]);

    let anim: Animated.CompositeAnimation;
    if (motion === 'drop') {
      anim = Animated.parallel([
        fadeIn(scrim, T.scrim),
        Animated.timing(enter, { toValue: 1, duration: T.sheet, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(T.dropAt),
          Animated.parallel([
            // Gravity: accelerate into the landing.
            Animated.timing(pinY, { toValue: 0, duration: T.drop, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.timing(pinOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
            Animated.timing(shadow, { toValue: 1, duration: T.drop, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
          // Small squash on landing, then spring back to rest.
          Animated.parallel([
            Animated.timing(squashY, { toValue: 0.82, duration: T.squash, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(squashX, { toValue: 1.12, duration: T.squash, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.spring(squashY, { toValue: 1, damping: 9, stiffness: 260, mass: 0.6, useNativeDriver: true }),
            Animated.spring(squashX, { toValue: 1, damping: 9, stiffness: 260, mass: 0.6, useNativeDriver: true }),
          ]),
        ]),
        beat(headline, T.headlineAt),
        beat(line, T.lineAt),
        beat(actions, T.actionsAt),
      ]);
    } else {
      // Reduce Motion and the waitlist: one crossfade of the same content.
      anim = Animated.parallel([
        fadeIn(scrim, T.scrim),
        // The calm variant still arrives gently; Reduce Motion has no slide.
        reduceMotion
          ? Animated.delay(0)
          : Animated.timing(enter, { toValue: 1, duration: T.sheet, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        fadeIn(all, T.fade),
      ]);
    }
    anim.start();
    return () => anim.stop();
    // Replays only when it is shown again or the variant changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, variant, motion, reduceMotion]);

  const dismissRef = useRef(onDone);
  dismissRef.current = onDone;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => { if (g.dy > 0) sheetY.setValue(g.dy); },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 90 || g.vy > 0.9) {
          Animated.timing(sheetY, { toValue: 600, duration: 180, useNativeDriver: true })
            .start(() => dismissRef.current());
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  if (!moment) return null;
  const going = moment.variant === 'going';
  const drop = moment.motion === 'drop';
  const accent = going ? colors.action : colors.live;
  // In the crossfade path every beat shares one opacity.
  const o = (v: Animated.Value) => (drop ? v : all);
  const rise = (v: Animated.Value, from: number) =>
    drop ? [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] : [];
  const has = (a: 'share' | 'directions' | 'done') => moment.actions.includes(a);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <View style={s.root}>
        <Animated.View style={[StyleSheet.absoluteFill, s.scrim, { opacity: scrim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessible={false} />
        </Animated.View>

        <Animated.View
          {...pan.panHandlers}
          accessibilityViewIsModal
          style={[
            s.sheet,
            elevation(3),
            { paddingBottom: insets.bottom + spacing.lg, transform: [{ translateY: Animated.add(sheetY, enter.interpolate({ inputRange: [0, 1], outputRange: [SHEET_FROM, 0] })) }] },
          ]}
        >
          <View style={s.grab} />

          <View style={s.stage}>
            {drop && (
              <Animated.View style={[s.ground, { opacity: shadow, transform: [{ scaleX: squashX }] }]} />
            )}
            <Animated.View
              style={{
                opacity: drop ? pinOpacity : all,
                transform: [{ translateY: pinY }, { scaleX: squashX }, { scaleY: squashY }],
              }}
            >
              <Icon name="pin" size={84} color={accent} />
            </Animated.View>
          </View>

          <Animated.View style={{ opacity: o(headline), transform: rise(headline, 10) }}>
            <Text style={[t.displayXl, s.headline]} accessibilityRole="header">
              {going ? tr('youreIn.going') : tr('youreIn.waitlist')}
            </Text>
          </Animated.View>

          <Animated.View style={[s.lineWrap, { opacity: o(line), transform: rise(line, 8) }]}>
            <Text style={[t.bodyLg, s.title]} numberOfLines={2}>{title}</Text>
            {going && when ? <Text style={[t.label, s.when]}>{when}</Text> : null}
            {!going ? <Text style={[t.bodyMd, s.when]}>{tr('youreIn.waitlistBody')}</Text> : null}
          </Animated.View>

          <Animated.View style={[s.actions, { opacity: o(actions) }]}>
            {has('share') && (
              <Press style={s.ghost} onPress={onShare} accessibilityRole="button">
                <Icon name="share" size={18} color={colors.actionMuted} />
                <Text style={[t.button, { color: colors.actionMuted }]}>{tr('youreIn.share')}</Text>
              </Press>
            )}
            {has('directions') && (
              <Press style={s.ghost} onPress={onDirections} accessibilityRole="button">
                <Icon name="pin" size={18} color={colors.actionMuted} />
                <Text style={[t.button, { color: colors.actionMuted }]}>{tr('youreIn.directions')}</Text>
              </Press>
            )}
          </Animated.View>
          <Animated.View style={{ opacity: o(actions) }}>
            <Press style={[s.done, { backgroundColor: accent }]} onPress={onDone} accessibilityRole="button">
              <Text style={[t.button, { color: colors.textOnFill }]}>{tr('youreIn.done')}</Text>
            </Press>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: colors.scrim },
  sheet: {
    width: '100%',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: 'stretch',
    gap: spacing.md,
  },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  stage: { height: 132, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: spacing.sm },
  ground: {
    position: 'absolute', bottom: 4, width: 64, height: 8, borderRadius: radius.round,
    backgroundColor: colors.surfaceSunken,
  },
  headline: { color: colors.textPrimary, textAlign: 'center' },
  lineWrap: { alignItems: 'center', gap: spacing.xs },
  title: { color: colors.textPrimary, textAlign: 'center' },
  when: { color: colors.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  ghost: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TAP,
    paddingHorizontal: spacing.md, borderRadius: radius.control, backgroundColor: colors.surface2,
  },
  done: { height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control },
});
