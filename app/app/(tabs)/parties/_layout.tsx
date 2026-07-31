import { Stack } from 'expo-router';
import { colors } from '../../../lib/theme';

export default function PartiesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="create" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
    </Stack>
  );
}
