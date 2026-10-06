import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Text } from '../components/Text';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing, TAP, type as t } from '../lib/theme';
import { Btn, Chip, Press } from '../components/ui';
import { setOnboardingSeen } from '../lib/api';

// Step 1 of the first-run flow: one promise, one button.
//
//   /onboarding (this) -> /onboarding-location -> /(auth)/interests -> Discover (guest)
//
// "I have an account" jumps straight to sign-in (which lands on Discover).
// Both exits persist the seen-flag so a returning user goes straight to
// Discover (see app/index.tsx). Nothing here asks for an account.
/* eslint-disable @typescript-eslint/no-require-imports */
const BRAND_LOGO = require('../assets/splash-icon.png');
/* eslint-enable @typescript-eslint/no-require-imports */

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation('onboarding');

  const start = () => {
    setOnboardingSeen();
    router.push('/onboarding-location' as never);
  };

  const haveAccount = () => {
    setOnboardingSeen();
    router.push('/(auth)/sign-in' as never);
  };

  return (
    <View style={[s.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={s.brand}>
        <Image source={BRAND_LOGO} resizeMode="contain" style={s.logo} />
        <Text style={[t.headlineSm, s.wordmark]}>SPOT SEEK</Text>
      </View>

      <View style={s.hero}>
        <Text style={[t.displayHero, s.title]}>{tr('promise.title')}</Text>
        <Text style={[t.bodyLg, s.body]}>{tr('promise.body')}</Text>
        <View style={s.chips}>
          <Chip label={tr('promise.chips.liveSports')} tone="neutral" />
          <Chip label={tr('promise.chips.awards')} tone="neutral" />
          <Chip label={tr('promise.chips.bigEvents')} tone="neutral" />
        </View>
      </View>

      <View style={s.footer}>
        <Btn label={tr('promise.cta')} onPress={start} />
        <Press onPress={haveAccount} hitSlop={8} style={s.link} accessibilityRole="button">
          <Text style={[t.label, { color: colors.textSecondary }]}>{tr('promise.signIn')}</Text>
        </Press>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl },
  brand: { alignItems: 'center', gap: spacing.xs },
  logo: { width: 72, height: 72 },
  wordmark: { color: colors.textPrimary, letterSpacing: 1 },
  hero: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  title: { color: colors.textPrimary, textAlign: 'center' },
  body: { color: colors.textSecondary, textAlign: 'center', alignSelf: 'center', maxWidth: 320 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  footer: { gap: spacing.sm },
  link: { alignItems: 'center', justifyContent: 'center', minHeight: TAP },
});
