import React, { useRef, useState, useEffect } from 'react';
import { Tabs } from 'expo-router';
import {
  Text, Image, Pressable, View, StyleSheet, Animated,
  type ImageSourcePropType, type LayoutChangeEvent,
} from 'react-native';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/types';
import { useTranslation } from 'react-i18next';
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

type TabLayout = { x: number; width: number };

// A shared, animated pill can't be built from independent per-tab
// tabBarButton renderers (each tab only knows its own focus state, not the
// others' positions) — it needs one element outside any single tab that
// knows every tab's on-screen x/width and slides between them. That
// requires taking over the whole bar via the `tabBar` prop rather than
// per-screen tabBarButton, which only replaces one tab's button in place.
function CustomTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const [layouts, setLayouts] = useState<Record<number, TabLayout>>({});
  const pillX = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(0)).current;
  const hasPositioned = useRef(false);

  useEffect(() => {
    const layout = layouts[state.index];
    if (!layout) return;
    if (!hasPositioned.current) {
      // Snap into place on first measurement instead of sliding in from the
      // top-left corner (Animated.Value defaults to 0) on cold start.
      pillX.setValue(layout.x);
      pillWidth.setValue(layout.width);
      hasPositioned.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(pillX, {
        toValue: layout.x, useNativeDriver: false, damping: 22, stiffness: 260, mass: 0.7,
      }),
      Animated.spring(pillWidth, {
        toValue: layout.width, useNativeDriver: false, damping: 22, stiffness: 260, mass: 0.7,
      }),
    ]).start();
    // width/x can't run on the native driver (layout properties), so this
    // stays JS-driven — fine at this size/frequency.
  }, [state.index, layouts, pillX, pillWidth]);

  return (
    // The safe-area inset lives on this outer wrapper as pure padding below
    // the content row, not as extra height the row (or the pill) stretches
    // into — otherwise the pill's top/bottom-anchored positioning resolves
    // against the padded total height instead of the icon+label content.
    <View style={[s.tabBarOuter, { paddingBottom: insets.bottom }]}>
      <View style={s.tabBarRow}>
        <Animated.View
          pointerEvents="none"
          style={[s.pill, { transform: [{ translateX: pillX }], width: pillWidth }]}
        />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          // The `href: null` shortcut (used to hide the sponsorship stack
          // from the bar) sets tabBarItemStyle: { display: 'none' } under
          // the hood — reuse that same signal instead of hardcoding a name.
          const itemStyle = options.tabBarItemStyle;
          const hidden = !!(itemStyle && typeof itemStyle === 'object' && 'display' in itemStyle && itemStyle.display === 'none');
          if (hidden) return null;

          const focused = state.index === index;
          const tintColor = focused ? colors.accent : colors.textTertiary;
          const icon = options.tabBarIcon?.({ focused, color: tintColor, size: 24 });
          const label = typeof options.tabBarLabel === 'function'
            ? options.tabBarLabel({
              focused, color: tintColor, position: 'below-icon', children: options.title ?? route.name,
            })
            : (options.tabBarLabel ?? options.title ?? route.name);

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLayout={(e: LayoutChangeEvent) => {
                // Every tab button is an equal-width flex:1 column, so the
                // pill is inset from the column's edges (matching the fixed
                // margin the previous per-tab pill used) rather than sized to
                // fill it — filling it would span nearly edge-to-edge
                // between tabs.
                const inset = 8;
                const { x, width } = e.nativeEvent.layout;
                const next = { x: x + inset, width: width - inset * 2 };
                setLayouts((prev) => (
                  prev[index]?.x === next.x && prev[index]?.width === next.width ? prev : { ...prev, [index]: next }
                ));
              }}
              style={s.tabButton}
            >
              {icon}
              {label}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  // Scoped to 'common' (the app's defaultNS) — tab labels live under
  // common.json's `tabs` subtree since they're app-shell chrome, not
  // specific to any one screen's namespace.
  const { t: tr } = useTranslation('common');
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: tr('tabs.discover'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="discover" />,
          tabBarLabel: ({ focused }) => <TabLabel label={tr('tabs.discover')} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="parties"
        options={{
          title: tr('tabs.myParties'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="parties" />,
          tabBarLabel: ({ focused }) => <TabLabel label={tr('tabs.myParties')} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: tr('tabs.profile'),
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="profile" />,
          tabBarLabel: ({ focused }) => <TabLabel label={tr('tabs.profile')} focused={focused} />,
        }}
      />
      {/* Sponsorship screens live behind the drawer, not the tab bar */}
      <Tabs.Screen name="sponsorship" options={{ href: null }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  // Safe-area inset lives here as pure padding below the content row — it
  // must not be part of the row's own (resolved, content-driven) height, or
  // the pill's top/bottom-anchored fill stretches into that empty space too.
  tabBarOuter: {
    backgroundColor: colors.tabBar,
    borderTopColor: colors.tabBarBorder,
    borderTopWidth: 1,
  },
  tabBarRow: {
    flexDirection: 'row',
    position: 'relative',
    paddingTop: 10,
    paddingBottom: 14,
  },
  pill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    backgroundColor: `${palette.primary}1f`,
    borderRadius: 20,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  // 24px — was 26 (a 50% bump from the original 17 while chasing the
  // reference design's weight), nudged back down to 24 as the better fit.
  icon: { width: 24, height: 24 },
  tabLabel: { fontSize: 11, marginTop: 2, letterSpacing: 0.6, textTransform: 'uppercase' },
});
