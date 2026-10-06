import React, { useCallback, useState } from 'react';
import { View, Modal, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, elevation, type as t } from '../lib/theme';
import { Btn, Press } from './ui';
import { useAuth } from '../lib/auth';
import { setPendingIntent } from '../lib/guestState';

type Router = ReturnType<typeof useRouter>;

// Push to sign-in / sign-up carrying a redirect back to the gated screen so
// the user lands where they left off after authenticating.
// `context` is the sentence the gate showed ("Sign up to RSVP for Arsenal v
// Spurs"); the auth screen repeats it so the person remembers why they're there.
export function goToAuth(router: Router, mode: 'sign-in' | 'sign-up', redirect?: string, context?: string) {
  const params: Record<string, string> = {};
  if (redirect) params.redirect = redirect;
  if (context) params.context = context;
  router.push({ pathname: `/(auth)/${mode}`, params } as never);
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
      <Text style={[t.headlineLg, s.gateTitle]}>{title}</Text>
      <Text style={[t.bodyMd, s.gateBody]}>{message}</Text>
      <View style={s.gateActions}>
        <Btn label={tr('guestGate.signIn')} onPress={() => goToAuth(router, 'sign-in', redirect)} />
        <Btn label={tr('guestGate.createAccount')} variant="secondary" onPress={() => goToAuth(router, 'sign-up', redirect)} />
      </View>
    </View>
  );
}

// What the guest was trying to do. `label` is the thing named in the sheet's
// title ("Sign up to RSVP for {{label}}"). `redirect` is where the person
// returns to; `rsvpEventId` lets the event screen finish the RSVP afterwards.
export type GateIntent =
  | { kind: 'rsvp'; label: string; eventId: string }
  | { kind: 'report'; eventId: string }
  | { kind: 'host' }
  | { kind: 'favourite' }
  | { kind: 'notifications' }
  | { kind: 'profile' }
  | { kind: 'parties' };

const INTENT_REDIRECT: Record<Exclude<GateIntent['kind'], 'rsvp' | 'report'>, string> = {
  host: '/(tabs)/parties/create',
  favourite: '/(tabs)/discover/filter',
  notifications: '/notifications',
  profile: '/(tabs)/profile',
  parties: '/(tabs)/parties',
};

// One hook for every "needs an account" tap. `requireAuth(intent)` returns
// true when the person is signed in (carry on). For a guest it opens the
// contextual sheet and returns false. Render `gateSheet` once in the screen.
export function useAuthGate() {
  const auth = useAuth();
  const { t: tr } = useTranslation('common');
  const [intent, setIntent] = useState<GateIntent | null>(null);
  const [open, setOpen] = useState(false);

  const requireAuth = useCallback((next: GateIntent): boolean => {
    if (auth.status === 'authenticated') return true;
    setIntent(next);
    setOpen(true);
    return false;
  }, [auth.status]);

  const redirect = intent
    ? intent.kind === 'rsvp' || intent.kind === 'report'
      ? `/(tabs)/discover/${intent.eventId}`
      : INTENT_REDIRECT[intent.kind]
    : undefined;
  const title = intent
    ? intent.kind === 'rsvp'
      ? tr('authSheet.rsvp', { label: intent.label })
      : tr(`authSheet.${intent.kind}`)
    : undefined;

  const gateSheet = (
    <AuthGateSheet
      visible={open}
      onClose={() => setOpen(false)}
      title={title}
      message={tr('authSheet.message')}
      redirect={redirect}
      onAuthStart={() => {
        if (intent?.kind === 'rsvp') setPendingIntent({ kind: 'rsvp', eventId: intent.eventId });
        else setPendingIntent(null);
      }}
    />
  );

  return { requireAuth, gateSheet };
}

// Bottom-sheet gate for inline actions (e.g. tapping JOIN PARTY as a guest).
export function AuthGateSheet({
  visible, onClose, title, message, redirect, onAuthStart,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  redirect?: string;
  /** Runs when the person commits to signing up / in (e.g. to stash an intent). */
  onAuthStart?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation('common');

  const go = (mode: 'sign-in' | 'sign-up') => {
    onClose();
    onAuthStart?.();
    goToAuth(router, mode, redirect, title);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={[t.headlineMd, s.gateTitle]}>{title ?? tr('guestGate.joinTheAction')}</Text>
        <Text style={[t.bodyMd, s.gateBody]}>{message}</Text>
        <View style={s.gateActions}>
          <Btn label={tr('guestGate.createAccount')} onPress={() => go('sign-up')} />
          <Btn label={tr('guestGate.signIn')} variant="secondary" onPress={() => go('sign-in')} />
        </View>
        <Press onPress={onClose} hitSlop={8} style={s.dismiss}>
          <Text style={[t.label, { color: colors.textTertiary }]}>{tr('guestGate.keepBrowsing')}</Text>
        </Press>
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
    color: colors.textPrimary,
    textAlign: 'center',
  },
  gateBody: { color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
  gateActions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.md },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    ...elevation(3),
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  dismiss: { paddingVertical: spacing.sm, marginTop: spacing.xs },
});
