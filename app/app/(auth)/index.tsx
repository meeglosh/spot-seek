import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../components/Text';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing, TAP, type as t } from '../../lib/theme';
import { Btn } from '../../components/ui';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Scoped to the 'auth' namespace — tr()/t() calls below read
  // locales/<lang>/auth.json. Aliased to `tr` because this file already
  // uses `t` for theme.type tokens imported from ../../lib/theme. See
  // lib/i18n.ts for the full key-naming convention.
  const { t: tr } = useTranslation('auth');

  return (
    <View style={[s.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      {/* Brand mark — wordmark, kept untranslated */}
      <Text style={[t.headlineSm, s.brand]}>Spot Seek</Text>

      {/* Hero */}
      <View style={s.hero}>
        <Text style={[t.displayHero, s.heroTitle]}>{tr('welcome.heroTitle')}</Text>
        <Text style={[t.bodyLg, s.tagline]}>
          {tr('welcome.tagline')}
        </Text>
      </View>

      {/* CTA panel */}
      <View style={s.panel}>
        <Btn label={tr('welcome.createAccount')} onPress={() => router.push('/(auth)/sign-up')} />
        <Btn label={tr('welcome.signIn')} variant="secondary" onPress={() => router.push('/(auth)/sign-in')} />
        <Pressable
          onPress={() => router.replace('/(tabs)/discover')}
          style={s.skipLink}
          accessibilityLabel={tr('skipForNow')}
        >
          <Text style={[t.labelCaps, { color: colors.textSecondary }]}>{tr('skipForNow')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl },
  brand: { color: colors.action, textAlign: 'center' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  heroTitle: {
    color: colors.textPrimary,
    textAlign: 'center',
  },
  tagline: { color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
  panel: {
    backgroundColor: colors.surfaceSunken,
    borderTopWidth: 2,
    borderTopColor: colors.action,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.xl,
    gap: spacing.md,
  },
  skipLink: { alignItems: 'center', justifyContent: 'center', minHeight: TAP },
});
