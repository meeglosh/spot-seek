import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppHeader } from '../../../components/AppHeader';
import { colors, spacing, type as t } from '../../../lib/theme';

// Placeholder — replaced by the Sponsorship Details screen.
export default function SponsorshipDetailsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return (
    <View style={s.container}>
      <AppHeader back />
      <View style={s.center}>
        <Text style={[t.headlineMd, { color: colors.textPrimary }]}>Sponsorship</Text>
        <Text style={[t.bodyMd, { color: colors.textSecondary }]}>{eventId}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
});
