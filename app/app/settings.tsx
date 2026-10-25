/**
 * Settings — account, notification prefs, favourites, and about.
 */
import { isSponsorshipEnabled } from '../lib/features';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, TextInput, ScrollView, StyleSheet, Alert, Linking } from 'react-native';
import { Text } from '../components/Text';
import Slider from '@react-native-community/slider';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import {
  fetchNotificationPrefs, updateNotificationPrefs, deleteAccount, DeleteAccountBlockedError, getStoredLocale,
  fetchConnectStatus, startConnectOnboarding, NOTIFICATION_TYPE_KEYS, type NotificationTypeKey, type NotificationChannel,
  type NotificationTypePrefs, type ApiNotificationPrefs, type ApiConnectStatus, type DeleteBlocker,
} from '../lib/api';
import { colors, radius, spacing, TAP, type as t } from '../lib/theme';
import { Icon } from '../components/icons';
import { AppHeader } from '../components/AppHeader';
import { Btn, ListRow, SectionTitle, FieldLabel, inputStyle, inputFocusedStyle, Press, Toggle, SoonTag } from '../components/ui';
import { GuestGate } from '../components/AuthGate';
import { SUPPORTED_LOCALES, setAppLocale } from '../lib/i18n';
import { enablePush, disablePush } from '../lib/push';
import { openGuidelines, openTerms, openPrivacy } from '../lib/moderation';
import { withReadable } from '../components/Readable';

// Typed (case-sensitive) to re-confirm account deletion; sent to the server too.
const DELETE_WORD = 'DELETE';

// An older backend may omit `types`; read it as all on and hide nothing.
function typePrefsOf(p: ApiNotificationPrefs | null): NotificationTypePrefs {
  const out = {} as NotificationTypePrefs;
  for (const k of NOTIFICATION_TYPE_KEYS) {
    out[k] = { push: p?.types?.[k]?.push ?? true, email: p?.types?.[k]?.email ?? true };
  }
  return out;
}

function milesToKm(mi: number): number {
  return Math.round(mi * 1.609);
}

function SettingsRow({
  label, sub, right,
}: {
  label: string;
  sub?: string;
  right: React.ReactNode;
}) {
  return <ListRow title={label} subtitle={sub} trailing={right} />;
}

function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  // Scoped to the 'settings' namespace — every tr() call below is a dot-path
  // key relative to locales/<lang>/settings.json (e.g. tr('account.signOut')
  // reads settings.json's { account: { signOut: ... } }). See lib/i18n.ts
  // for the full key-naming convention. Aliased to `tr` (not the react-i18next
  // default `t`) because this file already uses `t` for theme.type tokens
  // (`t.bodyMd`, `t.headlineLg`, …) imported from ../lib/theme.
  const { t: tr, i18n } = useTranslation('settings');
  // 'Coming soon' is shared across screens, so it lives in common.json rather
  // than being duplicated into settings.json — see lib/i18n.ts's convention
  // note on when to reach for the `common` namespace instead of a domain one.
  const { t: trCommon } = useTranslation('common');

  const [prefs, setPrefs] = useState<ApiNotificationPrefs | null>(null);
  const [radiusMi, setRadiusMi] = useState(50);
  const [prefsError, setPrefsError] = useState('');

  // Which language row shows the checkmark: null means "System default" (no
  // persisted override — i18n is just following the device language), a
  // locale code means that row is the active pick. Re-read after every tap so
  // the indicator reflects what's actually persisted, not just i18n.language
  // (which alone can't distinguish "override set to device's own language"
  // from "no override at all").
  const [storedLocaleOverride, setStoredLocaleOverride] = useState<string | null>(null);
  useEffect(() => {
    getStoredLocale().then(setStoredLocaleOverride);
  }, [i18n.language]);

  const [deleteStep, setDeleteStep] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteTyped, setDeleteTyped] = useState('');
  const [deleteFocused, setDeleteFocused] = useState(false);
  const [deleteBlocker, setDeleteBlocker] = useState<DeleteBlocker | null>(null);

  // Only place location is reported from the app: a one-shot, best-effort
  // coarse position sent whenever the foreground permission is already
  // granted. This screen never prompts for permission itself — it defers to
  // whatever the user already decided elsewhere in the app.
  const locationReportedRef = useRef(false);

  const loadPrefs = useCallback(async () => {
    if (auth.status !== 'authenticated') return;
    setPrefsError('');
    try {
      const p = await fetchNotificationPrefs();
      if (p) {
        setPrefs(p);
        setRadiusMi(p.radiusMiles);
      }
    } catch {
      setPrefsError(tr('notifications.loadError'));
    }
  }, [auth.status, tr]);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  // ── Payouts (Stripe Connect, test mode — see PAYMENTS.md) ────────────────
  const [connectStatus, setConnectStatus] = useState<ApiConnectStatus | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [payoutsError, setPayoutsError] = useState('');

  const loadConnectStatus = useCallback(async () => {
    if (auth.status !== 'authenticated' || !isSponsorshipEnabled()) return;
    try {
      setConnectStatus(await fetchConnectStatus());
    } catch {
      // Non-fatal — the section just stays blank until the next load.
    }
  }, [auth.status]);

  // Also refreshes when the screen regains focus — Stripe onboarding returns
  // via the spotseek://settings deep link.
  useFocusEffect(useCallback(() => { loadConnectStatus(); }, [loadConnectStatus]));

  async function handleSetupPayouts() {
    setOnboarding(true);
    setPayoutsError('');
    try {
      const result = await startConnectOnboarding();
      if (!result) {
        setPayoutsError(tr('payouts.notLiveYet'));
        return;
      }
      await Linking.openURL(result.url);
    } catch {
      setPayoutsError(tr('payouts.setupError'));
    } finally {
      setOnboarding(false);
    }
  }

  useEffect(() => {
    if (auth.status !== 'authenticated' || locationReportedRef.current) return;
    locationReportedRef.current = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getLastKnownPositionAsync();
        if (!loc) return;
        await updateNotificationPrefs({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch (err) {
        console.error('[settings] failed to report location for nearby alerts:', err);
      }
    })();
  }, [auth.status]);

  async function handleRadiusChange(mi: number) {
    const prevPrefs = prefs;
    setRadiusMi(mi);
    // Optimistic — reconcile with the server response, roll back on error.
    if (prevPrefs) setPrefs({ ...prevPrefs, radiusMiles: mi });
    try {
      const updated = await updateNotificationPrefs({ radiusMiles: mi });
      setPrefs(updated);
      setRadiusMi(updated.radiusMiles);
    } catch {
      if (prevPrefs) { setPrefs(prevPrefs); setRadiusMi(prevPrefs.radiusMiles); }
      setPrefsError(tr('notifications.radiusError'));
    }
  }

  async function handleEmailToggle(value: boolean) {
    const prevPrefs = prefs;
    // Optimistic — same pattern as the radius slider: flip immediately,
    // reconcile with the server response, roll back on error.
    if (prevPrefs) setPrefs({ ...prevPrefs, emailEnabled: value });
    try {
      const updated = await updateNotificationPrefs({ emailEnabled: value });
      setPrefs(updated);
    } catch {
      if (prevPrefs) setPrefs(prevPrefs);
      setPrefsError(tr('notifications.emailError'));
    }
  }

  async function handlePushToggle(value: boolean) {
    const prevPrefs = prefs;
    setPrefsError('');
    if (!value) {
      if (prevPrefs) setPrefs({ ...prevPrefs, pushEnabled: false });
      try {
        await disablePush();
      } catch {
        if (prevPrefs) setPrefs(prevPrefs);
        setPrefsError(tr('notifications.pushError'));
      }
      return;
    }
    const result = await enablePush();
    if (result === 'enabled') {
      if (prevPrefs) setPrefs({ ...prevPrefs, pushEnabled: true });
    } else if (result === 'denied') {
      Alert.alert(tr('notifications.pushDeniedTitle'), tr('notifications.pushDeniedBody'), [
        { text: trCommon('cancel'), style: 'cancel' },
        { text: tr('notifications.openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
      ]);
    } else {
      setPrefsError(tr('notifications.pushError'));
    }
  }

  async function handleTypeToggle(key: NotificationTypeKey, channel: NotificationChannel, value: boolean) {
    const prevPrefs = prefs;
    if (!prevPrefs) return;
    setPrefsError('');
    // Optimistic, same as the master toggles: flip now, reconcile with the
    // server's full prefs, roll back on error.
    const optimistic = typePrefsOf(prevPrefs);
    optimistic[key] = { ...optimistic[key], [channel]: value };
    setPrefs({ ...prevPrefs, types: optimistic });
    try {
      const updated = await updateNotificationPrefs({ types: { [key]: { [channel]: value } } });
      setPrefs(updated.types ? updated : { ...updated, types: optimistic });
    } catch {
      setPrefs(prevPrefs);
      setPrefsError(tr('notifications.typeError'));
    }
  }

  function handleSignOut() {
    auth.signOut();
    router.replace('/(auth)');
  }

  function resetDelete() {
    setDeleteStep(false);
    setDeleteTyped('');
    setDeleteBlocker(null);
  }

  async function handleDeleteAccount() {
    if (deleteTyped !== DELETE_WORD) return;
    setDeleting(true);
    setDeleteError('');
    setDeleteBlocker(null);
    try {
      await deleteAccount();
      auth.signOut();
      router.replace('/(auth)');
    } catch (err) {
      if (err instanceof DeleteAccountBlockedError) {
        setDeleteBlocker(err.blocker);
      } else {
        setDeleteError((err as Error).message || tr('account.deleteFallbackError'));
      }
      setDeleteStep(false);
      setDeleteTyped('');
    } finally {
      setDeleting(false);
    }
  }

  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader back title={tr('title')} />
        <GuestGate
          title={tr('guestGate.title')}
          message={tr('guestGate.message')}
          redirect="/settings"
        />
      </View>
    );
  }

  const version = Constants.expoConfig?.version;
  const build = Constants.expoConfig?.ios?.buildNumber;

  return (
    <View style={s.container}>
      <AppHeader back title={tr('title')} />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing.xl }]}>
        {/* ACCOUNT */}
        <View style={s.section}>
          <SectionTitle style={s.sectionHead}>{tr('account.title')}</SectionTitle>
          <SettingsRow
            label={tr('account.signedInAs')}
            sub={auth.user.email}
            right={<View />}
          />
          <Btn label={tr('account.signOut')} variant="secondary" onPress={handleSignOut} style={s.fullBtn} />

          {!deleteStep ? (
            <Btn
              label={tr('account.deleteAccount')}
              variant="danger"
              onPress={() => { setDeleteStep(true); setDeleteError(''); setDeleteBlocker(null); }}
              style={s.fullBtn}
            />
          ) : (
            <View style={s.confirmBox}>
              <Text style={[t.bodyMd, { color: colors.textPrimary }]}>
                {tr('account.deleteConfirm')}
              </Text>
              <View>
                <FieldLabel color={colors.danger}>{tr('account.typeToConfirm', { word: DELETE_WORD })}</FieldLabel>
                <TextInput
                  style={[inputStyle, deleteFocused && inputFocusedStyle]}
                  value={deleteTyped}
                  onChangeText={setDeleteTyped}
                  onFocus={() => setDeleteFocused(true)}
                  onBlur={() => setDeleteFocused(false)}
                  placeholder={DELETE_WORD}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel={tr('account.typeToConfirm', { word: DELETE_WORD })}
                />
              </View>
              <View style={s.confirmBtns}>
                <Btn
                  label={tr('account.keepIt')}
                  variant="ghost"
                  small
                  style={s.confirmBtn}
                  onPress={resetDelete}
                />
                <Btn
                  label={deleting ? '…' : tr('account.yesDelete')}
                  variant="danger"
                  small
                  style={s.confirmBtn}
                  onPress={handleDeleteAccount}
                  disabled={deleting || deleteTyped !== DELETE_WORD}
                />
              </View>
            </View>
          )}
          {deleteBlocker?.code === 'has_upcoming_events' ? (
            <View style={s.confirmBox}>
              <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('account.blockedEvents')}</Text>
              {deleteBlocker.events.map((e) => (
                <Press
                  key={e.id}
                  style={s.linkRow}
                  onPress={() => router.push(`/(tabs)/discover/${e.id}` as never)}
                  accessibilityRole="link"
                >
                  <Text style={[t.bodyMd, { color: colors.action, flex: 1 }]} numberOfLines={2}>{e.title}</Text>
                  <Icon name="chevronRight" size={18} color={colors.textTertiary} />
                </Press>
              ))}
            </View>
          ) : null}
          {deleteBlocker?.code === 'money_in_flight' ? (
            <View style={s.confirmBox}>
              <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('account.blockedMoney')}</Text>
              {deleteBlocker.sponsorships.map((sp) => (
                <Press
                  key={sp.id}
                  style={s.linkRow}
                  onPress={() => router.push(`/(tabs)/discover/${sp.eventId}` as never)}
                  accessibilityRole="link"
                >
                  <Text style={[t.bodyMd, { color: colors.action, flex: 1 }]} numberOfLines={2}>
                    {sp.eventTitle} · ${(sp.amountCents / 100).toFixed(2)}
                  </Text>
                  <Icon name="chevronRight" size={18} color={colors.textTertiary} />
                </Press>
              ))}
            </View>
          ) : null}
          {deleteError ? <Text style={[t.bodySm, { color: colors.danger }]}>{deleteError}</Text> : null}
        </View>

        {/* NOTIFICATIONS */}
        <View style={s.section}>
          <SectionTitle style={s.sectionHead}>{tr('notifications.title')}</SectionTitle>
          {prefsError ? <Text style={[t.bodySm, { color: colors.danger }]}>{prefsError}</Text> : null}

          <SettingsRow
            label={tr('notifications.email')}
            right={
              <Toggle value={!!prefs?.emailEnabled} onValueChange={handleEmailToggle} />
            }
          />
          <SettingsRow
            label={tr('notifications.push')}
            right={
              <Toggle value={!!prefs?.pushEnabled} onValueChange={handlePushToggle} />
            }
          />

          <View style={s.sliderBlock}>
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('notifications.radiusLabel')}</Text>
            <Text style={[t.label, { color: colors.action }]}>
              {tr('notifications.radiusValue', { miles: radiusMi, km: milesToKm(radiusMi) })}
            </Text>
            <Slider
              minimumValue={10}
              maximumValue={500}
              step={10}
              value={radiusMi}
              onValueChange={setRadiusMi}
              onSlidingComplete={handleRadiusChange}
              minimumTrackTintColor={colors.action}
              maximumTrackTintColor={colors.surface3}
              thumbTintColor={colors.action}
            />
          </View>
        </View>

        {/* NOTIFICATION TYPES */}
        <View style={s.section}>
          <SectionTitle style={s.sectionHead}>{tr('notifications.typesTitle')}</SectionTitle>
          {NOTIFICATION_TYPE_KEYS.map((key) => {
            const row = typePrefsOf(prefs)[key];
            return (
              <View key={key} style={s.typeCard}>
                <View>
                  <Text style={[t.bodyLg, { color: colors.textPrimary }]}>{tr(`notifications.types.${key}.title`)}</Text>
                  <Text style={[t.bodySm, { color: colors.textTertiary }]}>{tr(`notifications.types.${key}.body`)}</Text>
                </View>
                <View style={s.channelRow}>
                  {(['push', 'email'] as const).map((channel) => {
                    const masterOn = channel === 'push' ? !!prefs?.pushEnabled : !!prefs?.emailEnabled;
                    const label = tr(channel === 'push' ? 'notifications.channelPush' : 'notifications.channelEmail');
                    return (
                      <View key={channel} style={[s.channel, !masterOn && s.channelOff]}>
                        <Text style={[t.label, { color: masterOn ? colors.textSecondary : colors.textTertiary }]}>{label}</Text>
                        <Toggle
                          value={masterOn && row[channel]}
                          disabled={!masterOn || !prefs}
                          onValueChange={(v) => handleTypeToggle(key, channel, v)}
                          accessibilityLabel={`${tr(`notifications.types.${key}.title`)}, ${label}`}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Text style={[t.bodySm, { color: colors.textTertiary }]}>{tr('notifications.typesNote')}</Text>
        </View>

        {/* LANGUAGE */}
        <View style={s.section}>
          <SectionTitle style={s.sectionHead}>{tr('language.title')}</SectionTitle>
          <ListRow
            title={tr('language.systemDefault')}
            onPress={() => setAppLocale(null)}
            trailing={!storedLocaleOverride ? <Icon name="check" size={18} color={colors.action} /> : undefined}
          />
          {SUPPORTED_LOCALES.map(({ code, nativeName }) => (
            <ListRow
              key={code}
              title={nativeName}
              onPress={() => setAppLocale(code)}
              trailing={storedLocaleOverride === code ? <Icon name="check" size={18} color={colors.action} /> : undefined}
            />
          ))}
        </View>

        {/* PAYOUTS (hidden in the beta) */}
        {isSponsorshipEnabled() && <View style={s.section}>
          <SectionTitle style={s.sectionHead}>{tr('payouts.title')}</SectionTitle>
          {connectStatus?.configured === false ? (
            <Text style={[t.bodySm, { color: colors.textSecondary }]}>
              {tr('payouts.notConfigured')}
            </Text>
          ) : connectStatus?.payoutsEnabled ? (
            <SettingsRow
              label={tr('payouts.enabledLabel')}
              right={<Icon name="check" size={18} color={colors.confirmed} />}
            />
          ) : connectStatus ? (
            <>
              <Btn
                label={onboarding ? '…' : tr('payouts.setup')}
                variant="secondary"
                onPress={handleSetupPayouts}
                disabled={onboarding}
                style={s.fullBtn}
              />
              {payoutsError !== '' && <Text style={[t.bodySm, { color: colors.danger }]}>{payoutsError}</Text>}
            </>
          ) : null}
        </View>}

        {/* FAVOURITES */}
        <View style={s.section}>
          <SectionTitle style={s.sectionHead}>{tr('favourites.title')}</SectionTitle>
          <ListRow icon="star" title={tr('favourites.manage')} onPress={() => router.push('/(auth)/interests' as never)} trailing={<Icon name="chevronRight" size={18} color={colors.textTertiary} />} />
        </View>

        {/* SAFETY */}
        <View style={s.section}>
          <SectionTitle style={s.sectionHead}>{tr('safety.title')}</SectionTitle>
          <ListRow icon="block" title={tr('safety.blocked')} onPress={() => router.push('/blocked' as never)} trailing={<Icon name="chevronRight" size={18} color={colors.textTertiary} />} />
        </View>

        {/* ABOUT */}
        <View style={s.section}>
          <SectionTitle style={s.sectionHead}>{tr('about.title')}</SectionTitle>
          <ListRow title={tr('about.guidelines')} onPress={openGuidelines} trailing={<Icon name="chevronRight" size={18} color={colors.textTertiary} />} />
          <ListRow title={tr('about.terms')} onPress={openTerms} trailing={<Icon name="chevronRight" size={18} color={colors.textTertiary} />} />
          <ListRow title={tr('about.privacy')} onPress={openPrivacy} trailing={<Icon name="chevronRight" size={18} color={colors.textTertiary} />} />
          <ListRow
            style={s.linkRowSoon}
            title={tr('about.contactSupport')}
            trailing={<SoonTag label={trCommon('soon')} />}
          />

          <Text style={[t.labelSm, s.versionText]}>
            {build ? tr('about.versionLabelWithBuild', { version: version ?? '—', build }) : tr('about.versionLabel', { version: version ?? '—' })}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, gap: spacing.xs },
  // FotMob rhythm: ~28 above a section header (4 gap + 24 margin), ~12 below (4 + 8 gap).
  sectionHead: { marginBottom: spacing.xs },
  section: { gap: spacing.sm },
  fullBtn: { alignSelf: 'stretch' },
  confirmBox: {
    backgroundColor: colors.surface1,
    padding: spacing.lg, gap: spacing.md,
    borderRadius: radius.card,
  },
  confirmBtns: { flexDirection: 'row', gap: spacing.md },
  confirmBtn: { flex: 1 },
  sliderBlock: {
    gap: spacing.xs, padding: spacing.lg - 4,
    backgroundColor: colors.surface1, borderRadius: radius.card,
  },
  typeCard: {
    gap: spacing.sm, padding: spacing.lg - 4,
    backgroundColor: colors.surface1, borderRadius: radius.card,
  },
  channelRow: { flexDirection: 'row', gap: spacing.xl },
  channel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  channelOff: { opacity: 0.6 },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: TAP + 16, paddingHorizontal: spacing.lg - 4, paddingVertical: spacing.sm,
    backgroundColor: colors.surface1, borderRadius: radius.card,
  },
  linkRowSoon: { opacity: 0.7 },
  versionText: { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.lg },
});

export default withReadable(SettingsScreen);
