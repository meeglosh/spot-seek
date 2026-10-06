import { Stack } from 'expo-router';
import { colors, radius } from '../../../lib/theme';

export default function DiscoverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" options={{ animation: 'slide_from_right' }} />
      {/* Filters: a native iOS form sheet (medium and full detents) with a
          grabber, so the feed stays visible behind it. Android falls back to
          a modal. */}
      <Stack.Screen
        name="filter"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.7, 1],
          sheetInitialDetentIndex: 0,
          sheetGrabberVisible: true,
          sheetExpandsWhenScrolledToEdge: false,
          sheetCornerRadius: radius.sheet,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
    </Stack>
  );
}
