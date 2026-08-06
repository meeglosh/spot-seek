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
import { colors, fonts, palette, spacing, type as t } from '../lib/theme';
import { Btn } from '../components/ui';
import { setOnboardingSeen } from '../lib/api';

// A brand slide has no photo/accent/chips — just the logo mark, wordmark,
// and tagline centered on the plain background. Photo slides carry the
// existing fields. Both variants share the same footer (progress + CTA).
type BrandSlide = { key: string; kind: 'brand' };
type PhotoSlide = {
  key: string;
  kind: 'photo';
  image: number;
  accent: string;
  headline: string;
  body: string;
  chips: string[];
};
type Slide = BrandSlide | PhotoSlide;

// Matches the require() pattern used elsewhere for local image assets (see
// components/AppHeader.tsx) — static imports don't cover these picture
// assets the way they do the icon set.
/* eslint-disable @typescript-eslint/no-require-imports */
const SLIDES: Slide[] = [
  { key: 'brand', kind: 'brand' },
  {
    key: 'seeker',
    kind: 'photo',
    image: require('../assets/onboarding/onboarding-seeker.jpg'),
    accent: colors.accent,
    headline: 'FIND YOUR CROWD',
    body: 'Discover local watch parties for the events you love. Never watch alone again.',
    chips: ['LIVE SPORTS', 'AWARDS', 'BIG EVENTS'],
  },
  {
    key: 'host',
    kind: 'photo',
    image: require('../assets/onboarding/onboarding-host.jpg'),
    accent: colors.live,
    headline: 'LEAD THE EXPERIENCE',
    body: 'Host your own watch party. Build a community around your passion and lead the fun.',
    chips: ['YOUR VENUE', 'YOUR CROWD', 'YOUR RULES'],
  },
  {
    key: 'sponsor',
    kind: 'photo',
    image: require('../assets/onboarding/onboarding-sponsor.jpg'),
    accent: colors.volt,
    headline: 'FUEL THE PASSION',
    body: 'Partner with local events. Sponsor watch parties to reach the crowd and unlock exclusive perks.',
    chips: ['VIP ACCESS', 'GEAR DROPS', 'PARTNER DEALS'],
  },
];
const BRAND_LOGO = require('../assets/splash-icon.png');
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

  const renderItem = ({ item }: { item: Slide }) => {
    if (item.kind === 'brand') {
      return (
        <View style={[{ width: pageWidth, flex: 1 }, s.brandSlide]}>
          <View style={[s.slideContent, { paddingTop: insets.top + spacing.sm }]}>
            <View style={s.brandCenter}>
              <Image source={BRAND_LOGO} resizeMode="contain" style={s.brandLogo} />
              <Text style={[s.brandWordmark, { fontFamily: fonts.display }]}>SPOT SEEK</Text>
              <Text style={[t.labelCaps, s.brandTagline]}>NEVER WATCH ALONE</Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={{ width: pageWidth, flex: 1 }}>
        <Image source={item.image} resizeMode="cover" style={StyleSheet.absoluteFill} />
        {/* The bottom-to-dark fade that seats the content card is now baked
            into the JPEG asset itself (smoothstep vertical gradient), so
            only the flat full-bleed scrim for overall text/SKIP contrast
            remains here. */}
        <View style={[StyleSheet.absoluteFill, s.scrim]} />

        <View style={[s.slideContent, { paddingTop: insets.top + spacing.sm }]}>
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
  };

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
      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
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
        <Pressable onPress={finish} hitSlop={8} style={s.skipBtn} accessibilityLabel="Skip onboarding">
          <Text style={[t.labelCaps, { color: colors.textSecondary }]}>SKIP</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  scrim: { backgroundColor: 'rgba(14,14,17,0.28)' },

  slideContent: { flex: 1 },
  skipBtn: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandSlide: { backgroundColor: colors.bg },
  brandCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  brandLogo: { width: 140, height: 140, marginBottom: spacing.sm },
  brandWordmark: {
    fontSize: 40,
    color: colors.accent,
    letterSpacing: 1,
    textShadowColor: `${colors.accent}66`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  brandTagline: { color: colors.textSecondary, fontSize: 16, letterSpacing: 3 },

  card: {
    backgroundColor: 'rgba(27,27,30,0.92)',
    borderTopWidth: 2,
    borderBottomWidth: 4,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  // Anton's cap-height runs much taller than its nominal font size — a tight
  // lineHeight clips glyph tops (see the ~1.25-1.35x multiplier the theme's
  // own Anton presets use, e.g. displayXl's 56/44 ≈ 1.27). paddingTop adds a
  // small extra margin above the ink for full-bleed slides.
  headline: { color: colors.textPrimary, fontSize: 40, lineHeight: 52, paddingTop: 6 },
  bodyRule: { borderLeftWidth: 3, paddingLeft: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },

  footer: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  progressRow: { flexDirection: 'row', gap: spacing.sm },
  progressSeg: { flex: 1, height: 4 },
});
