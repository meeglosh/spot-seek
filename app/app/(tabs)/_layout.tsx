import React from 'react';
import { Tabs } from 'expo-router';
import { Text, Image, Pressable, StyleSheet, type ImageSourcePropType } from 'react-native';
import type { BottomTabBarButtonProps } from 'expo-router/build/react-navigation/bottom-tabs/types';
import { colors, fonts, palette } from '../../lib/theme';

// Rendered from the actual Material Symbols glyph outlines (explore /
// sports_kabaddi / person) via a local extraction script, not the
// @expo/vector-icons font — that font never got linked into the compiled
// TestFlight archive (expo prebuild wasn't re-run after installing it) and
// silently fell back to tofu glyphs in production despite working in dev.
// Plain tintable PNGs sidestep font-linking entirely, the same asset
// pipeline already proven reliable for the app icon and splash screen.
// Metro's static-asset require() has no ESM equivalent for local images.
/* eslint-disable @typescript-eslint/no-require-imports */
const ICONS: Record<'discover' | 'parties' | 'profile', ImageSourcePropType> = {
  discover: require('../../assets/icons/tab-discover.png'),
  parties: require('../../assets/icons/tab-parties.png'),
  profile: require('../../assets/icons/tab-profile.png'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

function TabIcon({ focused, icon }: { focused: boolean; icon: keyof typeof ICONS }) {
  return (
    <Image
      source={ICONS[icon]}
      style={[s.icon, { tintColor: focused ? colors.accent : colors.textTertiary }]}
      resizeMode="contain"
    />
  );
}

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={[
        s.tabLabel,
        {
          color: focused ? colors.accent : colors.textTertiary,
          fontFamily: focused ? fonts.labelBold : fonts.label,
        },
      ]}
    >
      {label}
    </Text>
  );
}

// The library renders tabBarIcon and tabBarLabel as independent children —
// by default the active pill (iconWrap) could only wrap one of them. This
// wraps the whole default icon+label stack (passed in as `children`) in one
// Pressable so the active background covers both, matching the design.
// Selected state arrives as the `aria-selected` prop (BottomTabItem passes
// it directly, not via accessibilityState.selected — confirmed by reading
// the actual runtime source, not just the type declarations).
// `ref` is destructured out (not forwarded) solely to exclude it from the
// Pressable spread below — its BottomTabBarButtonProps type doesn't match
// Pressable's ref type, and this wrapper doesn't need to forward it anyway.
function TabButton(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { children, style, 'aria-selected': focused, ref: _ref, ...rest }: BottomTabBarButtonProps,
) {
  return (
    <Pressable
      {...rest}
      aria-selected={focused}
      style={[style, s.tabButton, focused && s.tabButtonActive]}
    >
      {children}
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 82,
          paddingTop: 10,
          paddingBottom: 14,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="discover" />,
          tabBarLabel: ({ focused }) => <TabLabel label="Discover" focused={focused} />,
          tabBarButton: TabButton,
        }}
      />
      <Tabs.Screen
        name="parties"
        options={{
          title: 'My Parties',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="parties" />,
          tabBarLabel: ({ focused }) => <TabLabel label="My Parties" focused={focused} />,
          tabBarButton: TabButton,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="profile" />,
          tabBarLabel: ({ focused }) => <TabLabel label="Profile" focused={focused} />,
          tabBarButton: TabButton,
        }}
      />
      {/* Sponsorship screens live behind the drawer, not the tab bar */}
      <Tabs.Screen name="sponsorship" options={{ href: null }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabButtonActive: {
    backgroundColor: `${palette.primary}1f`,
    borderRadius: 20,
    marginHorizontal: 8,
  },
  // +50% over the original 17 -> 26, matching the reference design's weight.
  icon: { width: 26, height: 26 },
  tabLabel: { fontSize: 11, marginTop: 2, letterSpacing: 0.6, textTransform: 'uppercase' },
});
