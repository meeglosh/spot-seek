import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  ArchivoNarrow_400Regular,
  ArchivoNarrow_500Medium,
  ArchivoNarrow_600SemiBold,
  ArchivoNarrow_700Bold,
} from '@expo-google-fonts/archivo-narrow';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { AuthProvider } from '../lib/auth';
import { colors } from '../lib/theme';
import LaunchSplash from '../components/LaunchSplash';
// Side-effect import: initializes i18next synchronously (device-language
// guess) before this component's first render — required by react-i18next's
// convention of the i18n instance existing before any useTranslation() call
// mounts. The (async) persisted-locale-override check below layers on top
// once SecureStore resolves; the splash screen covers that gap.
import { applyStoredLocaleOverride } from '../lib/i18n';

// Hold the branded splash fully visible before starting the fade, then fade
// over LaunchSplash's own ~350ms — total experience ≈1.5s. Chosen to mask
// the auth-restore / root-redirect flicker in app/index.tsx underneath.
const SPLASH_HOLD_MS = 1100;

export default function RootLayout() {
  const [loaded] = useFonts({
    Anton_400Regular,
    ArchivoNarrow_400Regular,
    ArchivoNarrow_500Medium,
    ArchivoNarrow_600SemiBold,
    ArchivoNarrow_700Bold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  // Mount-once state: this only ever goes true->false a single time for the
  // lifetime of this component instance, so the splash shows on cold launch
  // only — never on foreground-from-background or navigation.
  const [showSplash, setShowSplash] = React.useState(true);
  const [dismissSplash, setDismissSplash] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDismissSplash(true), SPLASH_HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  // Apply a persisted language override (if any) over the device-language
  // guess i18n started with — see the import comment above.
  React.useEffect(() => {
    applyStoredLocaleOverride();
  }, []);

  if (!loaded) return null;

  return (
    <AuthProvider>
      {/* Dark-only design system — light status bar text everywhere */}
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* Registered first so "/" is unambiguously the initial route — it
            redirects based on auth state instead of leaving expo-router to
            default to whichever screen sorts first (was "(auth)"). */}
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="settings" />
      </Stack>
      {/* Overlays the whole app (including the Stack above) during cold
          launch, masking auth-restore and the root redirect underneath. */}
      {showSplash && (
        <LaunchSplash dismiss={dismissSplash} onDone={() => setShowSplash(false)} />
      )}
    </AuthProvider>
  );
}
