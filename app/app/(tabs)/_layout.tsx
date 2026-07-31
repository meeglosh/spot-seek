import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, palette } from '../../lib/theme';

function TabIcon({ focused, glyph }: { focused: boolean; glyph: string }) {
  return (
    <View style={[s.iconWrap, focused && s.iconWrapActive]}>
      <Text style={[s.glyph, { color: focused ? colors.accent : colors.textTertiary }]}>{glyph}</Text>
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
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} glyph="◎" />,
          tabBarLabel: ({ focused }) => <TabLabel label="Discover" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="parties"
        options={{
          title: 'My Parties',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} glyph="⚑" />,
          tabBarLabel: ({ focused }) => <TabLabel label="My Parties" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} glyph="◈" />,
          tabBarLabel: ({ focused }) => <TabLabel label="Profile" focused={focused} />,
        }}
      />
      {/* Sponsorship screens live behind the drawer, not the tab bar */}
      <Tabs.Screen name="sponsorship" options={{ href: null }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  iconWrap: { paddingBottom: 2, paddingHorizontal: 10 },
  iconWrapActive: { backgroundColor: `${palette.primary}1f` },
  glyph: { fontSize: 20 },
  tabLabel: { fontSize: 10, marginTop: 2, letterSpacing: 0.6, textTransform: 'uppercase' },
});
