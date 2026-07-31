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

  if (!loaded) return null;

  return (
    <AuthProvider>
      {/* Dark-only design system — light status bar text everywhere */}
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
