import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, palette, spacing, type as t } from '../../lib/theme';
import { Badge, Btn } from '../../components/ui';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      {/* Brand mark */}
      <Text style={[t.headlineSm, s.brand]}>Spot Seek</Text>

      {/* Hero */}
      <View style={s.hero}>
        <Badge label="Secure connection" tone="live" />
        <Text style={[t.displayXl, s.heroTitle]}>Join the{'\n'}action</Text>
        <Text style={[t.bodyLg, s.tagline]}>
          Discover watch parties around your favourite broadcasts. Host your own. Bring everyone together.
        </Text>
      </View>

      {/* CTA panel */}
      <View style={s.panel}>
        <Btn label="Create account →" onPress={() => router.push('/(auth)/sign-up')} />
        <Btn label="Sign in" variant="secondary" onPress={() => router.push('/(auth)/sign-in')} />
        <Pressable
          onPress={() => router.replace('/(tabs)/discover')}
          hitSlop={8}
          style={s.guestLink}
          accessibilityLabel="Explore as guest"
        >
          <Text style={[t.labelCaps, { color: colors.textSecondary }]}>
            Explore as guest <Text style={{ color: colors.accent }}>→</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  brand: { color: colors.accent, textAlign: 'center' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  heroTitle: {
    color: palette.white,
    textAlign: 'center',
    fontSize: 56,
    lineHeight: 60,
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
  guestLink: { alignItems: 'center', paddingTop: spacing.sm },
});
