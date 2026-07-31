import { Stack } from 'expo-router';
import { colors } from '../../../lib/theme';

export default function SponsorshipLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[eventId]" />
    </Stack>
  );
}
