import { Stack, Redirect } from 'expo-router';
import { isSponsorshipEnabled, SPONSORSHIP_FALLBACK_ROUTE } from '../../../lib/features';
import { colors } from '../../../lib/theme';

export default function SponsorshipLayout() {
  // Beta: every sponsorship route (index, browse, [eventId]) deep-links to Discover.
  if (!isSponsorshipEnabled()) return <Redirect href={SPONSORSHIP_FALLBACK_ROUTE as never} />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="browse" />
      <Stack.Screen name="[eventId]" />
    </Stack>
  );
}
