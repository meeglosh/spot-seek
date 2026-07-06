import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { light, dark } from '../../../lib/theme';

export default function HostLayout() {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
    </Stack>
  );
}
