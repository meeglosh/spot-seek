import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, palette, spacing, type as t } from '../lib/theme';
import { Badge, Btn } from './ui';

type Router = ReturnType<typeof useRouter>;

// Push to sign-in / sign-up carrying a redirect back to the gated screen so
// the user lands where they left off after authenticating.
export function goToAuth(router: Router, mode: 'sign-in' | 'sign-up', redirect?: string) {
  router.push({
    pathname: `/(auth)/${mode}`,
    params: redirect ? { redirect } : {},
  } as never);
}

// Full-screen gate for members-only screens (My Parties, Profile, Sponsorship…).
// Screens render their own AppHeader above this.
export function GuestGate({
  title, message, redirect,
}: {
  title: string;
  message: string;
  redirect?: string;
}) {
  const router = useRouter();
  // Scoped to 'common' — this gate's own hardcoded strings live under the
  // guestGate subtree of common.json (see lib/i18n.ts for the convention).
  // Aliased to `tr` because `t` is already the theme.type import above.
  const { t: tr } = useTranslation('common');
  return (
    <View style={s.center}>
      <Badge label={tr('guestGate.membersOnly')} tone="live" />
      <Text style={[t.headlineLg, s.gateTitle]}>{title}</Text>
      <Text style={[t.bodyMd, s.gateBody]}>{message}</Text>
      <View style={s.gateActions}>
        <Btn label={tr('guestGate.signIn')} onPress={() => goToAuth(router, 'sign-in', redirect)} />
        <Btn label={tr('guestGate.createAccount')} variant="secondary" onPress={() => goToAuth(router, 'sign-up', redirect)} />
      </View>
    </View>
  );
}

// Bottom-sheet gate for inline actions (e.g. tapping JOIN PARTY as a guest).
export function AuthGateSheet({
  visible, onClose, title, message, redirect,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  redirect?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation('common');

  const go = (mode: 'sign-in' | 'sign-up') => {
    onClose();
    goToAuth(router, mode, redirect);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Badge label={tr('guestGate.membersOnly')} tone="live" />
        <Text style={[t.headlineMd, s.gateTitle]}>{title ?? tr('guestGate.joinTheAction')}</Text>
        <Text style={[t.bodyMd, s.gateBody]}>{message}</Text>
        <View style={s.gateActions}>
          <Btn label={tr('guestGate.signIn')} onPress={() => go('sign-in')} />
          <Btn label={tr('guestGate.createAccount')} variant="secondary" onPress={() => go('sign-up')} />
        </View>
        <Pressable onPress={onClose} hitSlop={8} style={s.dismiss}>
          <Text style={[t.labelCaps, { color: colors.textTertiary }]}>{tr('guestGate.keepBrowsing')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    gap: spacing.lg,
  },
  gateTitle: {
    color: palette.white,
    textAlign: 'center',
    textShadowColor: palette.secondary,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  gateBody: { color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
  gateActions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.md },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.surfaceLowest,
    borderTopWidth: 2,
    borderTopColor: colors.accent,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  dismiss: { paddingVertical: spacing.sm, marginTop: spacing.xs },
});
