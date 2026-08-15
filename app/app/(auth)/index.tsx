import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, palette, spacing, type as t } from '../../lib/theme';
import { Badge, Btn } from '../../components/ui';

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
        <Badge label={tr('secureConnection')} tone="live" style={s.badge} />
        <Text style={[t.displayXl, s.heroTitle]}>{tr('welcome.heroTitle')}</Text>
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
          hitSlop={8}
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
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  brand: { color: colors.accent, textAlign: 'center' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  // Badge defaults to alignSelf: 'flex-start' (correct for left-aligned
  // headers elsewhere) — center it here to match this screen's centered hero.
  badge: { alignSelf: 'center' },
  heroTitle: {
    color: palette.white,
    textAlign: 'center',
    fontSize: 56,
    lineHeight: 70,
    // Hard orange offset shadow — no blur (comic-book pop per the design).
    textShadowColor: palette.secondary,
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 0,
  },
  tagline: { color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
  panel: {
    backgroundColor: palette.surfaceLowest,
    borderTopWidth: 2,
    borderTopColor: colors.accent,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    padding: spacing.xl,
    gap: spacing.md,
  },
  skipLink: { alignItems: 'center', paddingTop: spacing.sm },
});
