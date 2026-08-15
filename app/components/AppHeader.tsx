import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, Pressable, Image, StyleSheet, Modal, Animated, Dimensions, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, palette, spacing, type as t } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { fetchNotifications } from '../lib/api';

// Rendered from the Material Symbols "notifications" glyph outline via the
// same local extraction script used for the tab bar icons — see
// app/(tabs)/_layout.tsx for why plain tintable PNGs are used instead of the
// vector-icon font.
/* eslint-disable @typescript-eslint/no-require-imports */
const BELL_ICON = require('../assets/icons/icon-bell.png');
/* eslint-enable @typescript-eslint/no-require-imports */

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 320);

type MenuItem = { icon: string; label: string; onPress: () => void };

function DrawerMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  // Scoped to 'common' (the app's defaultNS) since these keys live under
  // common.json's `shell` subtree — see lib/i18n.ts for the convention.
  // Aliased to `tr` because `t` is already the theme.type import used
  // throughout this file (t.headlineSm, t.labelCapsSm, …).
  const { t: tr } = useTranslation('common');
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
    { icon: '⚡', label: tr('shell.menu.switchToHosting'), onPress: () => go('/(tabs)/parties/dashboard') },
    { icon: '◎', label: tr('shell.menu.sponsorships'), onPress: () => go('/(tabs)/sponsorship') },
    {
      icon: '▣',
      label: tr('shell.menu.wallet'),
      onPress: () => { onClose(); Alert.alert(tr('shell.menu.wallet'), tr('shell.menu.walletComingSoon')); },
    },
    { icon: '⚙', label: tr('shell.menu.settings'), onPress: () => go('/settings') },
  ];

  const name = auth.status === 'authenticated' ? auth.user.name : tr('shell.guestName');
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
            <Text style={[t.labelCapsSm, { color: colors.live }]}>{tr('shell.roleSeeker')}</Text>
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

        <View style={s.drawerDivider} />
        {auth.status === 'authenticated' ? (
          <Pressable
            style={({ pressed }) => [s.drawerItem, pressed && { backgroundColor: palette.surfaceHigh }]}
            onPress={() => {
              onClose();
              auth.signOut();
              router.replace('/(auth)');
            }}
          >
            <Text style={[s.drawerIcon, { color: colors.danger }]}>⏻</Text>
            <Text style={[s.drawerLabel, { fontFamily: fonts.sansMedium, color: colors.danger }]}>
              {tr('shell.menu.signOut')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [s.drawerItem, pressed && { backgroundColor: palette.surfaceHigh }]}
            onPress={() => go('/(auth)/sign-in')}
          >
            <Text style={[s.drawerIcon, { color: colors.accent }]}>→</Text>
            <Text style={[s.drawerLabel, { fontFamily: fonts.sansMedium, color: colors.accent }]}>
              {tr('shell.menu.signIn')}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </Modal>
  );
}

// `onBack` overrides the default router.back(), which is a no-op on screens
// with no history beneath them (e.g. a modal opened directly into its stack).
export function AppHeader({ back = false, onBack }: { back?: boolean; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { t: tr } = useTranslation('common');
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const initial =
    auth.status === 'authenticated' ? (auth.user.name.trim().charAt(0).toUpperCase() || 'S') : 'S';

  // AppHeader isn't a screen, so it has no focus lifecycle of its own —
  // refresh on mount, whenever the drawer opens (a natural re-engagement
  // point), and on a 60s poll while mounted, which for practical purposes is
  // "while the app is open" since AppHeader is rendered on every screen.
  useEffect(() => {
    if (auth.status !== 'authenticated') { setUnread(0); return; }
    let cancelled = false;
    const load = () => {
      fetchNotifications()
        .then(({ unread: n }) => { if (!cancelled) setUnread(n); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [auth.status]);

  useEffect(() => {
    if (!menuOpen || auth.status !== 'authenticated') return;
    fetchNotifications()
      .then(({ unread: n }) => setUnread(n))
      .catch(() => {});
  }, [menuOpen, auth.status]);

  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
      {back ? (
        <Pressable onPress={onBack ?? (() => router.back())} hitSlop={12} style={s.headerBtn}>
          <Text style={s.headerBtnIcon}>←</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={12}
          style={s.headerBtn}
          accessibilityLabel={tr('shell.accessibility.openMenu')}
        >
          <Text style={[s.headerBtnIcon, { color: colors.accent }]}>☰</Text>
        </Pressable>
      )}

      <Text style={[s.wordmark, { fontFamily: fonts.display }]}>SPOT SEEK</Text>

      <View style={s.headerRight}>
        {auth.status === 'authenticated' && (
          <Pressable
            onPress={() => router.push('/notifications' as never)}
            hitSlop={12}
            style={s.bellBtn}
            accessibilityLabel={tr('shell.accessibility.notifications')}
          >
            <Image
              source={BELL_ICON}
              style={[s.bellIcon, { tintColor: colors.textSecondary }]}
              resizeMode="contain"
            />
            {unread > 0 && (
              <View style={s.bellBadge}>
                <Text style={[t.labelCapsSm, s.bellBadgeText]} numberOfLines={1}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={() => router.push('/(tabs)/profile' as never)}
          hitSlop={12}
          style={s.avatar}
          accessibilityLabel={tr('shell.accessibility.profile')}
        >
          <Text style={[t.labelCaps, { color: colors.accent }]}>{initial}</Text>
        </Pressable>
      </View>

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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bellBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { width: 22, height: 22 },
  bellBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { color: palette.black, fontSize: 9, lineHeight: 11 },
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
