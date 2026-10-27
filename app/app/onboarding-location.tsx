import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from '../components/Text';
import { useRouter, Stack } from 'expo-router';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, type as t } from '../lib/theme';
import { Btn } from '../components/ui';
import { Icon } from '../components/icons';
import { withReadable } from '../components/Readable';
import { isFoldedSplit } from '../lib/readableWidth';
import { trailingOffset } from '../lib/safeArea';

// Step 2 of the first-run flow. A short neutral explanation, then exactly one
// action: "Continue", which always goes straight to the OS permission prompt
// (App Review 5.1.1(iv): no defer/skip/close path around the request, and no
// swipe-back out of this screen). Whatever the answer, and on any failure, the
// flow moves on to interests; location is never a gate. Discover picks the
// permission up on its own if it was granted here, and falls back to the
// non-location filters if not.
function OnboardingLocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
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

  const hero = (
    <View style={s.hero}>
        <View style={s.iconWrap}>
          <Icon name="locate" size={44} color={colors.action} />
        </View>
        <Text style={[t.headlineLg, s.title]}>{tr('location.title')}</Text>
        <Text style={[t.bodyLg, s.body]}>{tr('location.body')}</Text>
      </View>
  );
  const footer = (
      <View style={s.footer}>
        <Btn label={tr('location.allow')} onPress={allow} disabled={asking} />
        <Text style={[t.bodySm, s.note]}>{tr('location.note')}</Text>
      </View>
  );

  const pad = { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl };
  // iPhone Duo inner display in landscape: story left of the fold, actions right.
  if (isFoldedSplit(width, height)) {
    return (
      <View style={[s.container, s.foldedRow, pad]}>
        {/* No swipe-back: the only way forward is Continue -> system prompt. */}
        <Stack.Screen options={{ gestureEnabled: false }} />
        <View style={s.foldedPane}>{hero}</View>
        <View style={[s.foldedPane, s.foldedActions, { paddingRight: trailingOffset(0, insets) }]}>{footer}</View>
      </View>
    );
  }

  return (
    <View style={[s.container, pad]}>
      {/* No swipe-back: the only way forward is Continue -> system prompt. */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      {hero}
      {footer}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  iconWrap: {
    backgroundColor: colors.surface1,
    width: 96,
    height: 96,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { color: colors.textPrimary, textAlign: 'center' },
  body: { color: colors.textSecondary, textAlign: 'center', maxWidth: 320 },
  foldedRow: { flexDirection: 'row', gap: spacing.xl },
  foldedPane: { flex: 1 },
  foldedActions: { justifyContent: 'center' },
  footer: { gap: spacing.sm },
  note: { color: colors.textTertiary, textAlign: 'center' },
});

export default withReadable(OnboardingLocationScreen, { unlessFolded: true });
