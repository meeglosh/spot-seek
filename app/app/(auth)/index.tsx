import React from 'react';
import {
  View, Text, Pressable, StyleSheet, useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { light, dark, fonts, spacing, radius } from '../../lib/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  return (
    <View style={[s.container, { backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      {/* Hero */}
      <View style={s.hero}>
        <View style={[s.badge, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
          <Text style={[s.badgeText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
            Watch parties, reimagined
          </Text>
        </View>
        <Text style={[s.headline, { color: c.textPrimary, fontFamily: fonts.display }]}>
          Find your{'\n'}watch party.
        </Text>
        <Text style={[s.sub, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
          Discover events around your favourite broadcasts. Host your own. Bring everyone together.
        </Text>
      </View>

      {/* Floating event preview cards */}
      <View style={s.cardStack}>
        {PREVIEW_EVENTS.map((ev, i) => (
          <View
            key={ev.id}
            style={[
              s.previewCard,
              {
                backgroundColor: c.card,
                borderColor: c.cardBorder,
                transform: [{ rotate: `${(i - 1) * 3}deg` }, { translateY: i * -6 }],
                zIndex: PREVIEW_EVENTS.length - i,
              },
            ]}
          >
            <Text style={[s.previewEmoji]}>{ev.emoji}</Text>
            <View style={s.previewInfo}>
              <Text style={[s.previewTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]} numberOfLines={1}>
                {ev.title}
              </Text>
              <Text style={[s.previewMeta, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>
                {ev.meta}
              </Text>
            </View>
            <View style={[s.previewPill, { backgroundColor: c.bgSubtle }]}>
              <Text style={[s.previewPillText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
                {ev.rsvp} going
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* CTAs */}
      <View style={s.ctas}>
        <Pressable
          style={[s.primaryBtn, { backgroundColor: c.fill }]}
          onPress={() => router.push('/(auth)/sign-up')}
        >
          <Text style={[s.primaryBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>
            Get started
          </Text>
        </Pressable>
        <Pressable
          style={[s.secondaryBtn, { backgroundColor: c.fillSubtle }]}
          onPress={() => router.push('/(auth)/sign-in')}
        >
          <Text style={[s.secondaryBtnText, { color: c.fillSubtleText, fontFamily: fonts.sansMedium }]}>
            Sign in
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const PREVIEW_EVENTS = [
  { id: '1', emoji: '⚽', title: 'Arsenal v Spurs', meta: 'Sun · The Red Lion, Islington', rsvp: 24 },
  { id: '2', emoji: '🏈', title: 'NFL Sunday Ticket', meta: 'Sun · Sports Bar NYC', rsvp: 18 },
  { id: '3', emoji: '🎾', title: 'Wimbledon Final', meta: 'Sun · The Crown, Clapham', rsvp: 31 },
];

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.xl },
  hero: { flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.xl },
  badge: {
    alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: radius.full, borderWidth: 1, marginBottom: spacing.lg,
  },
  badgeText: { fontSize: 12, letterSpacing: 0.3 },
  headline: { fontSize: 48, lineHeight: 52, marginBottom: spacing.md },
  sub: { fontSize: 16, lineHeight: 24, maxWidth: 300 },
  cardStack: { height: 120, marginBottom: spacing.xl, justifyContent: 'flex-end' },
  previewCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, gap: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  previewEmoji: { fontSize: 28 },
  previewInfo: { flex: 1 },
  previewTitle: { fontSize: 14, marginBottom: 2 },
  previewMeta: { fontSize: 12 },
  previewPill: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.full },
  previewPillText: { fontSize: 11 },
  ctas: { gap: spacing.md },
  primaryBtn: {
    height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16 },
  secondaryBtn: {
    height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 16 },
});
