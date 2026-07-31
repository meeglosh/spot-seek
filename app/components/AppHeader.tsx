import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, Animated, Dimensions, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, fonts, palette, spacing, type as t } from '../lib/theme';
import { useAuth } from '../lib/auth';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 320);

type MenuItem = { icon: string; label: string; onPress: () => void };

function DrawerMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 0 : -DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  const items: MenuItem[] = [
    { icon: '⚡', label: 'Switch to Hosting', onPress: () => go('/(tabs)/parties/dashboard') },
    { icon: '◎', label: 'Sponsorships', onPress: () => go('/(tabs)/sponsorship') },
    { icon: '▣', label: 'Wallet', onPress: () => { onClose(); Alert.alert('Wallet', 'Coming soon.'); } },
    { icon: '⚙', label: 'Settings', onPress: () => { onClose(); Alert.alert('Settings', 'Coming soon.'); } },
  ];

  const name = auth.status === 'authenticated' ? auth.user.name : 'Seeker';
  const initial = name.trim().charAt(0).toUpperCase() || 'S';

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <Animated.View
        style={[
          s.drawer,
          { paddingTop: insets.top + spacing.xl, transform: [{ translateX: slide }] },
        ]}
      >
        <View style={s.drawerProfile}>
          <View style={s.drawerAvatar}>
            <Text style={[t.headlineSm, { color: colors.fillText }]}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.drawerName, { fontFamily: fonts.display }]} numberOfLines={1}>
              {name.toUpperCase()}
            </Text>
            <Text style={[t.labelCapsSm, { color: colors.live }]}>Seeker</Text>
          </View>
        </View>

        <View style={s.drawerDivider} />

        {items.map((item) => (
          <Pressable
            key={item.label}
            style={({ pressed }) => [s.drawerItem, pressed && { backgroundColor: palette.surfaceHigh }]}
            onPress={item.onPress}
          >
            <Text style={s.drawerIcon}>{item.icon}</Text>
            <Text style={[s.drawerLabel, { fontFamily: fonts.sansMedium }]}>{item.label}</Text>
          </Pressable>
        ))}

        {auth.status === 'authenticated' && (
          <>
            <View style={s.drawerDivider} />
            <Pressable
              style={({ pressed }) => [s.drawerItem, pressed && { backgroundColor: palette.surfaceHigh }]}
              onPress={() => {
                onClose();
                auth.signOut();
                router.replace('/(auth)');
              }}
            >
              <Text style={[s.drawerIcon, { color: colors.danger }]}>⏻</Text>
              <Text style={[s.drawerLabel, { fontFamily: fonts.sansMedium, color: colors.danger }]}>Sign Out</Text>
            </Pressable>
          </>
        )}
      </Animated.View>
    </Modal>
  );
}

export function AppHeader({ back = false }: { back?: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const initial =
    auth.status === 'authenticated' ? (auth.user.name.trim().charAt(0).toUpperCase() || 'S') : 'S';

  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
      {back ? (
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.headerBtn}>
          <Text style={s.headerBtnIcon}>←</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} style={s.headerBtn} accessibilityLabel="Open menu">
          <Text style={[s.headerBtnIcon, { color: colors.accent }]}>☰</Text>
        </Pressable>
      )}

      <Text style={[s.wordmark, { fontFamily: fonts.display }]}>SPOT SEEK</Text>

      <Pressable
        onPress={() => router.push('/(tabs)/profile' as never)}
        hitSlop={12}
        style={s.avatar}
        accessibilityLabel="Profile"
      >
        <Text style={[t.labelCaps, { color: colors.accent }]}>{initial}</Text>
      </Pressable>

      <DrawerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: palette.surfaceLowest,
  },
  headerBtn: { width: 36, alignItems: 'flex-start' },
  headerBtnIcon: { fontSize: 22, color: colors.textPrimary },
  wordmark: {
    fontSize: 24,
    color: colors.accent,
    letterSpacing: 1,
    textShadowColor: `${colors.accent}66`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMid,
  },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: palette.surfaceLowest,
    borderRightWidth: 1,
    borderRightColor: palette.surfaceHighest,
    paddingHorizontal: spacing.lg,
  },
  drawerProfile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  drawerAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  drawerName: { fontSize: 20, color: colors.accent },
  drawerDivider: { height: 1, backgroundColor: palette.surfaceHigh, marginVertical: spacing.md },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    paddingVertical: spacing.md + 2, paddingHorizontal: spacing.sm,
  },
  drawerIcon: { fontSize: 18, color: colors.textSecondary, width: 24, textAlign: 'center' },
  drawerLabel: { fontSize: 16, color: colors.textPrimary },
});
