import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../components/Text';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, TAP, elevation, type as t } from '../lib/theme';
import { Btn, Press } from '../components/ui';
import { Icon } from '../components/icons';

// Step 2 of the first-run flow. Explain first, ask second: the OS permission
// prompt only appears when the person taps the button, never on cold start.
// Either choice (and any failure) moves on to interests; location is never a
// gate. Discover picks the permission up on its own if it was granted here.
export default function OnboardingLocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation('onboarding');
  const [asking, setAsking] = useState(false);

  const next = () => router.replace('/(auth)/interests' as never);

  const allow = async () => {
    if (asking) return;
    setAsking(true);
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // A failed prompt must never trap the person on this screen.
    }
    setAsking(false);
    next();
  };

  return (
    <View style={[s.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={s.hero}>
        <View style={s.iconWrap}>
          <Icon name="locate" size={44} color={colors.action} />
        </View>
        <Text style={[t.headlineLg, s.title]}>{tr('location.title')}</Text>
        <Text style={[t.bodyLg, s.body]}>{tr('location.body')}</Text>
      </View>

      <View style={s.footer}>
        <Btn label={tr('location.allow')} onPress={allow} disabled={asking} />
        <Press onPress={next} hitSlop={8} style={s.link} accessibilityRole="button" disabled={asking}>
          <Text style={[t.label, { color: colors.textSecondary }]}>{tr('location.skip')}</Text>
        </Press>
        <Text style={[t.bodySm, s.note]}>{tr('location.note')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  iconWrap: {
    ...elevation(2),
    width: 96,
    height: 96,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { color: colors.textPrimary, textAlign: 'center' },
  body: { color: colors.textSecondary, textAlign: 'center', maxWidth: 320 },
  footer: { gap: spacing.sm },
  link: { alignItems: 'center', justifyContent: 'center', minHeight: TAP },
  note: { color: colors.textTertiary, textAlign: 'center' },
});
