import React from 'react';
import { Tabs } from 'expo-router';
import { useColorScheme, View, Text, StyleSheet } from 'react-native';
import { light, dark, fonts, type Colors } from '../../lib/theme';

type IconProps = { focused: boolean; label: string; emoji: string; c: Colors };

function TabIcon({ focused, emoji, c }: IconProps) {
  return (
    <View style={[s.iconWrap, focused && { borderBottomWidth: 2, borderColor: c.textPrimary }]}>
      <Text style={s.emoji}>{emoji}</Text>
    </View>
  );
}

function TabLabel({ label, focused, c }: { label: string; focused: boolean; c: Colors }) {
  return (
    <Text style={[
      s.tabLabel,
      { color: focused ? c.textPrimary : c.textTertiary, fontFamily: focused ? fonts.sansSemiBold : fonts.sansRegular },
    ]}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.tabBarBorder,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: c.textPrimary,
        tabBarInactiveTintColor: c.textTertiary,
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Discover" emoji="🔍" c={c} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Discover" focused={focused} c={c} />,
        }}
      />
      <Tabs.Screen
        name="host"
        options={{
          title: 'Host',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Host" emoji="📅" c={c} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Host" focused={focused} c={c} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Profile" emoji="👤" c={c} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Profile" focused={focused} c={c} />,
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  iconWrap: { paddingBottom: 2 },
  emoji: { fontSize: 20 },
  tabLabel: { fontSize: 10, marginTop: 2 },
});
