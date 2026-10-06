import React from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useTranslation } from 'react-i18next';
import { colors, spacing, type as t } from '../lib/theme';

// Matches the require() pattern used for the same asset in app/onboarding.tsx
// (brand slide) — static imports don't cover these picture assets the way
// they do the icon set.
/* eslint-disable-next-line @typescript-eslint/no-require-imports */
const BRAND_LOGO = require('../assets/splash-icon.png');

const FADE_MS = 350;

type Props = {
  // Parent flips this to true once the hold period is over. Flipping it
  // starts the fade; onDone fires after the fade animation completes so the
  // parent can unmount this component.
  dismiss: boolean;
  onDone: () => void;
};

// Cold-launch bridge from the native splash (same dark bg + logo, configured
// in app.json) into the app. Mounted once by the root layout and faded out
// after a hold period; it never reappears on foreground-from-background or
// navigation because the parent only mounts it once, on cold start.
export default function LaunchSplash({ dismiss, onDone }: Props) {
  // Scoped to 'common' (the app's defaultNS) — the tagline lives under
  // common.json's `brand` subtree since it's app-wide, not screen-specific.
  // Aliased to `tr` because `t` is already the theme.type import used below
  // (t.labelCaps).
  const { t: tr } = useTranslation('common');
  const opacity = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!dismiss) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [dismiss, opacity, onDone]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.container, { opacity }]}>
      <View style={s.center}>
        <Image source={BRAND_LOGO} resizeMode="contain" style={s.logo} />
        <Text style={[t.displayXl, s.wordmark]}>SPOT SEEK</Text>
        <Text style={[t.labelCaps, s.tagline]}>{tr('brand.tagline')}</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  logo: { width: 140, height: 140, marginBottom: spacing.sm },
  wordmark: { color: colors.textPrimary, letterSpacing: 1 },
  tagline: { color: colors.textSecondary, letterSpacing: 3 },
});
