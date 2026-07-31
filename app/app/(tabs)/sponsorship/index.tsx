import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppHeader } from '../../../components/AppHeader';
import { colors, spacing, type as t } from '../../../lib/theme';

// Placeholder — replaced by the Sponsorship Marketplace screen.
export default function SponsorshipHubScreen() {
  return (
    <View style={s.container}>
      <AppHeader />
      <View style={s.center}>
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>Sponsorship Hub</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
