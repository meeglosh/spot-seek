import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '../../../../components/Text';
import { Btn, EmptyState } from '../../../../components/ui';
import { useAuth } from '../../../../lib/auth';
import { claimGuestRsvp, type ClaimErrorCode } from '../../../../lib/api';
import { colors, spacing, type as t } from '../../../../lib/theme';

// Universal Link target for the guest-RSVP claim link on the web status page:
// https://spotseek.app/e/:eventId/claim/:token. Signed out → sign in and come
// back here; signed in → claim once, then land on the event.
type ShownError = Exclude<ClaimErrorCode, 'unauthorized'>;
const ERROR_KEY: Record<ShownError, string> = {
  already_claimed: 'claim.alreadyClaimed',
  not_confirmed: 'claim.notConfirmed',
  event_ended: 'claim.eventEnded',
  own_event: 'claim.ownEvent',
  forbidden: 'claim.forbidden',
  not_found: 'claim.invalid',
  network: 'claim.invalid',
};

export default function ClaimGuestRsvpScreen() {
  const { id, token } = useLocalSearchParams<{ id: string; token: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { t: tr } = useTranslation('discover');
  const [error, setError] = useState<ShownError | null>(null);
  const started = useRef(false);
  const status = auth.status;

  useEffect(() => {
    if (!id || !token) { setError('not_found'); return; }
    // Cold start from a universal link: the session is still being restored.
    if (status === 'loading') return;
    const claimPath = `/e/${encodeURIComponent(id)}/claim/${encodeURIComponent(token)}`;
    const goSignIn = () => router.push({ pathname: '/(auth)/sign-in', params: { redirect: claimPath } } as never);
    if (status !== 'authenticated') { goSignIn(); return; }
    if (started.current) return;
    started.current = true;
    void claimGuestRsvp(id, token).then((result) => {
      if (result.ok) {
        router.replace(`/(tabs)/discover/${encodeURIComponent(result.rsvp.eventId || id)}` as never);
        Alert.alert(tr('claim.success'));
      } else if (result.error === 'unauthorized') {
        // Session expired: allow a fresh claim once the person signs in again.
        started.current = false;
        goSignIn();
      } else {
        setError(result.error);
      }
    });
  }, [id, token, status, router, tr]);

  if (error) {
    const showEvent = error !== 'not_found' && error !== 'network' && !!id;
    return (
      <View style={[s.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <EmptyState icon="shield" title={tr('claim.title')} body={tr(ERROR_KEY[error])} />
        <View style={s.actions}>
          {showEvent ? (
            <Btn label={tr('claim.viewEvent')} onPress={() => router.replace(`/(tabs)/discover/${encodeURIComponent(id)}` as never)} />
          ) : null}
          <Btn label={tr('claim.browse')} variant="secondary" onPress={() => router.replace('/(tabs)/discover' as never)} />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, s.center]} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.action} />
      <Text style={[t.bodyMd, s.loading]}>{tr('claim.joining')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing.xl },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loading: { color: colors.textSecondary },
  actions: { gap: spacing.sm, maxWidth: 320, width: '100%', alignSelf: 'center' },
});
