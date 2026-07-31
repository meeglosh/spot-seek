import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Image, StyleSheet, type ImageSourcePropType } from 'react-native';
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
    <View style={[s.iconWrap, focused && s.iconWrapActive]}>
      <Image
        source={ICONS[icon]}
        style={[s.icon, { tintColor: focused ? colors.accent : colors.textTertiary }]}
        resizeMode="contain"
      />
    </View>
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
        }}
      />
      <Tabs.Screen
        name="parties"
        options={{
          title: 'My Parties',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="parties" />,
          tabBarLabel: ({ focused }) => <TabLabel label="My Parties" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="profile" />,
          tabBarLabel: ({ focused }) => <TabLabel label="Profile" focused={focused} />,
        }}
      />
      {/* Sponsorship screens live behind the drawer, not the tab bar */}
      <Tabs.Screen name="sponsorship" options={{ href: null }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  iconWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  iconWrapActive: { backgroundColor: `${palette.primary}1f` },
  icon: { width: 17, height: 17 },
  tabLabel: { fontSize: 11, marginTop: 4, letterSpacing: 0.6, textTransform: 'uppercase' },
});
