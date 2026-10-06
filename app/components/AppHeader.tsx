import React, { useState, useRef, useEffect } from 'react';
import {
  View, Pressable, StyleSheet, Modal, Animated, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Icon, type IconName } from './icons';
import { colors, radius, spacing, TAP, elevation, type as t } from '../lib/theme';
import { Press, SoonTag } from './ui';
import { useAuth } from '../lib/auth';
import { fetchNotifications } from '../lib/api';
import { useAuthGate, type GateIntent } from './AuthGate';

const DRAWER_WIDTH = Math.min(Dimensions.get('window').width * 0.78, 320);

type MenuItem = { icon: IconName; label: string; onPress?: () => void; soon?: boolean };

function DrawerMenu({
  open, onClose, onGuestAction,
}: {
  open: boolean;
  onClose: () => void;
  /** Called for a guest tapping a members-only item; the parent owns the sign-up sheet. */
  onGuestAction: (intent: GateIntent) => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  // Scoped to 'common' (the app's defaultNS) since these keys live under
  // common.json's `shell` subtree — see lib/i18n.ts for the convention.
  // Aliased to `tr` because `t` is already the theme.type import used
  // throughout this file (t.headlineSm, t.labelSm, …).
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
    {
      icon: 'live',
      label: tr('shell.menu.switchToHosting'),
      onPress: () => {
        if (auth.status !== 'authenticated') { onGuestAction({ kind: 'host' }); return; }
        go('/(tabs)/parties/dashboard');
      },
    },
    { icon: 'sponsorship', label: tr('shell.menu.sponsorships'), onPress: () => go('/(tabs)/sponsorship') },
    {
      icon: 'wallet',
      label: tr('shell.menu.wallet'),
      soon: true,
    },
    { icon: 'settings', label: tr('shell.menu.settings'), onPress: () => go('/settings') },
  ];

  const name = auth.status === 'authenticated' ? auth.user.name : tr('shell.guestName');
  const initial = name.trim().charAt(0).toUpperCase() || 'S';

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel={tr('shell.accessibility.closeMenu')} />
      <Animated.View
        style={[
          s.drawer,
          { paddingTop: insets.top + spacing.lg, transform: [{ translateX: slide }] },
        ]}
      >
        <View style={s.drawerProfile}>
          <View style={s.drawerAvatar}>
            <Text style={[t.headlineSm, { color: colors.textPrimary }]}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[t.headlineSm, { color: colors.textPrimary }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[t.labelSm, { color: colors.textTertiary }]}>{tr('shell.roleSeeker')}</Text>
          </View>
        </View>

        <View style={s.drawerDivider} />

        {items.map((item) => item.soon ? (
          <View
            key={item.label}
            accessibilityState={{ disabled: true }}
            style={[s.drawerItem, s.drawerItemSoon]}
          >
            <Icon name={item.icon} size={22} color={colors.textTertiary} />
            <Text style={[t.bodyMdStrong, { color: colors.textTertiary, flex: 1 }]}>{item.label}</Text>
            <SoonTag label={tr('soon')} />
          </View>
        ) : (
          <Press
            key={item.label}
            accessibilityRole="button"
            style={({ pressed }) => [s.drawerItem, pressed && { backgroundColor: colors.surface3 }]}
            onPress={item.onPress}
          >
            <Icon name={item.icon} size={22} color={colors.textSecondary} />
            <Text style={[t.bodyMdStrong, { color: colors.textPrimary }]}>{item.label}</Text>
          </Press>
        ))}

        <View style={s.drawerDivider} />
        {auth.status === 'authenticated' ? (
          <Press
            accessibilityRole="button"
            style={({ pressed }) => [s.drawerItem, pressed && { backgroundColor: colors.surface3 }]}
            onPress={() => {
              onClose();
              auth.signOut();
              router.replace('/(auth)');
            }}
          >
            <Icon name="signOut" size={22} color={colors.danger} />
            <Text style={[t.bodyMdStrong, { color: colors.danger }]}>
              {tr('shell.menu.signOut')}
            </Text>
          </Press>
        ) : (
          <Press
            accessibilityRole="button"
            style={({ pressed }) => [s.drawerItem, pressed && { backgroundColor: colors.surface3 }]}
            onPress={() => go('/(auth)/sign-in')}
          >
            <Icon name="signIn" size={22} color={colors.action} />
            <Text style={[t.bodyMdStrong, { color: colors.action }]}>
              {tr('shell.menu.signIn')}
            </Text>
          </Press>
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
  const { requireAuth, gateSheet } = useAuthGate();

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
        <Press
          onPress={onBack ?? (() => router.back())}
          style={s.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={tr('shell.accessibility.back')}
        >
          <Icon name="back" size={24} color={colors.textPrimary} />
        </Press>
      ) : (
        <Press
          onPress={() => setMenuOpen(true)}
          style={s.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={tr('shell.accessibility.openMenu')}
        >
          <Icon name="menu" size={24} color={colors.action} />
        </Press>
      )}

      <Text style={[t.headlineMd, s.wordmark]}>SPOT SEEK</Text>

      <View style={s.headerRight}>
        <Press
          onPress={() => {
            if (requireAuth({ kind: 'notifications' })) router.push('/notifications' as never);
          }}
          style={s.bellBtn}
          accessibilityRole="button"
          accessibilityLabel={tr('shell.accessibility.notifications')}
        >
          <Icon name="bell" size={24} color={colors.textSecondary} />
          {unread > 0 && (
            <View style={s.bellBadge}>
              <Text style={[t.labelSm, s.bellBadgeText]} numberOfLines={1}>
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          )}
        </Press>

        <Press
          onPress={() => {
            if (requireAuth({ kind: 'profile' })) router.push('/(tabs)/profile' as never);
          }}
          hitSlop={4}
          style={s.avatar}
          accessibilityRole="button"
          accessibilityLabel={tr('shell.accessibility.profile')}
        >
          <Text style={[t.label, { color: colors.action }]}>{initial}</Text>
        </Press>
      </View>

      <DrawerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onGuestAction={(intent) => {
          // iOS can't present a second modal while the drawer is still
          // dismissing, so let the drawer finish closing first.
          setMenuOpen(false);
          setTimeout(() => requireAuth(intent), 350);
        }}
      />
      {gateSheet}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.canvas,
  },
  headerBtn: { width: TAP, height: TAP, alignItems: 'flex-start', justifyContent: 'center' },
  // Brand wordmark is not interactive, so it is not `action` cyan.
  wordmark: { color: colors.textPrimary, letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bellBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  // Unread count is neither action nor live: a neutral paper chip.
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { color: colors.textOnFill },
  // Avatars are true circles (radius.round).
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.round,
    borderWidth: 1,
    borderColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    ...elevation(3),
    borderTopRightRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
  },
  drawerProfile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  drawerAvatar: {
    width: 52, height: 52, borderRadius: radius.round,
    backgroundColor: colors.surface1,
    alignItems: 'center', justifyContent: 'center',
  },
  drawerDivider: { height: 1, backgroundColor: colors.borderSubtle, marginVertical: spacing.md },
  drawerItemSoon: { opacity: 0.8 },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    minHeight: TAP + 4, paddingHorizontal: spacing.sm,
    borderRadius: radius.control,
  },
});
