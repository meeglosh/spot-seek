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
