import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  FlatList,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, palette, spacing, type as t } from '../lib/theme';
import { Btn } from '../components/ui';
import { setOnboardingSeen } from '../lib/api';

type Slide = {
  key: string;
  image: number;
  accent: string;
  headline: string;
  body: string;
  chips: string[];
};

// Matches the require() pattern used elsewhere for local image assets (see
// components/AppHeader.tsx) — static imports don't cover these picture
// assets the way they do the icon set.
/* eslint-disable @typescript-eslint/no-require-imports */
const SLIDES: Slide[] = [
  {
    key: 'seeker',
    image: require('../assets/onboarding/onboarding-seeker.jpg'),
    accent: colors.accent,
    headline: 'FIND YOUR CROWD',
    body: 'Discover local watch parties for the events you love. Never watch alone again.',
    chips: ['LIVE SPORTS', 'AWARDS', 'BIG EVENTS'],
  },
  {
    key: 'host',
    image: require('../assets/onboarding/onboarding-host.jpg'),
    accent: colors.live,
    headline: 'LEAD THE EXPERIENCE',
    body: 'Host your own watch party. Build a community around your passion and lead the fun.',
    chips: ['YOUR VENUE', 'YOUR CROWD', 'YOUR RULES'],
  },
  {
    key: 'sponsor',
    image: require('../assets/onboarding/onboarding-sponsor.jpg'),
    accent: colors.volt,
    headline: 'FUEL THE PASSION',
    body: 'Partner with local events. Sponsor watch parties to reach the crowd and unlock exclusive perks.',
    chips: ['VIP ACCESS', 'GEAR DROPS', 'PARTNER DEALS'],
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: pageWidth } = useWindowDimensions();
  const listRef = React.useRef<FlatList<Slide>>(null);
  const [index, setIndex] = React.useState(0);

  // Both exits (SKIP on any slide, GET STARTED on the last) persist the
  // seen-flag and send unauthenticated users on to the existing welcome /
  // sign-in flow — onboarding is a one-time detour in front of it, not a
  // parallel route.
  const finish = React.useCallback(() => {
    setOnboardingSeen();
    router.replace('/(auth)');
  }, [router]);

  const goNext = React.useCallback(() => {
    if (index >= SLIDES.length - 1) {
      finish();
      return;
    }
    const next = index + 1;
    setIndex(next);
    listRef.current?.scrollToOffset({ offset: next * pageWidth, animated: true });
  }, [index, pageWidth, finish]);

  // Swiping manually also has to update the progress bar / CTA label, since
  // the FlatList is `scrollEnabled` alongside the NEXT button driving it.
  const onMomentumScrollEnd = React.useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      setIndex(next);
    },
    [pageWidth],
  );

  const renderItem = ({ item }: { item: Slide }) => (
    <View style={{ width: pageWidth, flex: 1 }}>
      <Image source={item.image} resizeMode="cover" style={StyleSheet.absoluteFill} />
      {/* Dark scrim over the full slide, plus a stronger bottom region to
          seat the content card — approximated with two stacked absolute
          Views since expo-linear-gradient isn't a project dependency. */}
      <View style={[StyleSheet.absoluteFill, s.scrim]} />
      <View style={s.bottomScrimOuter} />
      <View style={s.bottomScrimInner} />

      <View style={[s.slideContent, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={finish} hitSlop={8} style={s.skipBtn} accessibilityLabel="Skip onboarding">
          <Text style={[t.labelCaps, { color: colors.textSecondary }]}>SKIP</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <View style={[s.card, { borderTopColor: item.accent, borderBottomColor: item.accent }]}>
          <Text style={[t.displayXl, s.headline]}>{item.headline}</Text>
          <View style={[s.bodyRule, { borderLeftColor: item.accent }]}>
            <Text style={[t.bodyMd, { color: colors.textSecondary }]}>{item.body}</Text>
          </View>
          <View style={s.chipRow}>
            {item.chips.map((chip) => (
              <View key={chip} style={[s.chip, { borderColor: item.accent }]}>
                <Text style={[t.labelCapsSm, { color: item.accent }]}>{chip}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        scrollEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ flex: 1 }}
      />

      {/* Fixed footer — shared across all slides, never scrolls with them. */}
      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={s.progressRow}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.key}
              style={[s.progressSeg, { backgroundColor: i === index ? colors.accent : palette.surfaceHigh }]}
            />
          ))}
        </View>
        <Btn
          label={index === SLIDES.length - 1 ? 'GET STARTED →' : 'NEXT →'}
          onPress={goNext}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  scrim: { backgroundColor: 'rgba(14,14,17,0.55)' },
  bottomScrimOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    backgroundColor: 'rgba(14,14,17,0.35)',
  },
  bottomScrimInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '30%',
    backgroundColor: 'rgba(14,14,17,0.45)',
  },

  slideContent: { flex: 1 },
  skipBtn: { alignSelf: 'flex-end', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },

  card: {
    backgroundColor: 'rgba(27,27,30,0.92)',
    borderTopWidth: 2,
    borderBottomWidth: 4,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  headline: { color: colors.textPrimary, fontSize: 40, lineHeight: 46 },
  bodyRule: { borderLeftWidth: 3, paddingLeft: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },

  footer: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  progressRow: { flexDirection: 'row', gap: spacing.sm },
  progressSeg: { flex: 1, height: 4 },
});
