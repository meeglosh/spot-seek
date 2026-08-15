/**
 * Settings — account, notification prefs, favourites, and about.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import {
  fetchNotificationPrefs, updateNotificationPrefs, deleteAccount, getStoredLocale, type ApiNotificationPrefs,
} from '../lib/api';
import { colors, palette, spacing, type as t } from '../lib/theme';
import { AppHeader } from '../components/AppHeader';
import { Btn, Badge, SectionTitle } from '../components/ui';
import { GuestGate } from '../components/AuthGate';
import { SUPPORTED_LOCALES, setAppLocale } from '../lib/i18n';

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
  return (
    <View style={s.row}>
      <View style={s.rowLabels}>
        <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{label}</Text>
        {sub ? <Text style={[t.bodySm, { color: colors.textSecondary }]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export default function SettingsScreen() {
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

  function handleSignOut() {
    auth.signOut();
    router.replace('/(auth)');
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount();
      auth.signOut();
      router.replace('/(auth)');
    } catch (err) {
      setDeleteError((err as Error).message || tr('account.deleteFallbackError'));
      setDeleteStep(false);
    } finally {
      setDeleting(false);
    }
  }

  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader back />
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
      <AppHeader back />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>{tr('title')}</Text>

        {/* ACCOUNT */}
        <View style={s.section}>
          <SectionTitle>{tr('account.title')}</SectionTitle>
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
              onPress={() => { setDeleteStep(true); setDeleteError(''); }}
              style={s.fullBtn}
            />
          ) : (
            <View style={s.confirmBox}>
              <Text style={[t.bodyMd, { color: colors.textPrimary }]}>
                {tr('account.deleteConfirm')}
              </Text>
              <View style={s.confirmBtns}>
                <Btn
                  label={tr('account.keepIt')}
                  variant="ghost"
                  small
                  style={s.confirmBtn}
                  onPress={() => setDeleteStep(false)}
                />
                <Btn
                  label={deleting ? '…' : tr('account.yesDelete')}
                  variant="danger"
                  small
                  style={s.confirmBtn}
                  onPress={handleDeleteAccount}
                  disabled={deleting}
                />
              </View>
            </View>
          )}
          {deleteError ? <Text style={[t.bodySm, { color: colors.danger }]}>{deleteError}</Text> : null}
        </View>

        {/* NOTIFICATIONS */}
        <View style={s.section}>
          <SectionTitle>{tr('notifications.title')}</SectionTitle>
          {prefsError ? <Text style={[t.bodySm, { color: colors.danger }]}>{prefsError}</Text> : null}

          <SettingsRow
            label={tr('notifications.email')}
            right={
              <Switch
                value={!!prefs?.emailEnabled}
                onValueChange={handleEmailToggle}
                trackColor={{ false: palette.surfaceHigh, true: colors.accent }}
              />
            }
          />
          <SettingsRow
            label={tr('notifications.push')}
            right={
              <View style={s.disabledRow}>
                <Switch value={!!prefs?.pushEnabled} disabled trackColor={{ false: palette.surfaceHigh, true: colors.accent }} />
                <Badge label={trCommon('comingSoon')} tone="neutral" dot={false} />
              </View>
            }
          />

          <View style={s.sliderBlock}>
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('notifications.radiusLabel')}</Text>
            <Text style={[t.labelCaps, { color: colors.accent }]}>
              {tr('notifications.radiusValue', { miles: radiusMi, km: milesToKm(radiusMi) })}
            </Text>
            <Slider
              minimumValue={10}
              maximumValue={500}
              step={10}
              value={radiusMi}
              onValueChange={setRadiusMi}
              onSlidingComplete={handleRadiusChange}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={palette.surfaceHigh}
              thumbTintColor={colors.accent}
            />
          </View>
        </View>

        {/* LANGUAGE */}
        <View style={s.section}>
          <SectionTitle>{tr('language.title')}</SectionTitle>
          <Pressable
            style={s.linkRow}
            onPress={() => setAppLocale(null)}
          >
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('language.systemDefault')}</Text>
            {!storedLocaleOverride ? (
              <Text style={[t.labelCapsSm, { color: colors.accent }]}>✓</Text>
            ) : null}
          </Pressable>
          {SUPPORTED_LOCALES.map(({ code, nativeName }) => (
            <Pressable
              key={code}
              style={s.linkRow}
              onPress={() => setAppLocale(code)}
            >
              <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{nativeName}</Text>
              {storedLocaleOverride === code ? (
                <Text style={[t.labelCapsSm, { color: colors.accent }]}>✓</Text>
              ) : null}
            </Pressable>
          ))}
        </View>

        {/* FAVOURITES */}
        <View style={s.section}>
          <SectionTitle>{tr('favourites.title')}</SectionTitle>
          <Pressable
            style={s.linkRow}
            onPress={() => router.push('/(auth)/interests' as never)}
          >
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('favourites.manage')}</Text>
            <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>›</Text>
          </Pressable>
        </View>

        {/* ABOUT */}
        <View style={s.section}>
          <SectionTitle>{tr('about.title')}</SectionTitle>
          <Pressable
            style={s.linkRow}
            onPress={() => Alert.alert(tr('about.terms'), tr('about.comingSoonAlert'))}
          >
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('about.terms')}</Text>
            <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>›</Text>
          </Pressable>
          <Pressable
            style={s.linkRow}
            onPress={() => Alert.alert(tr('about.privacy'), tr('about.comingSoonAlert'))}
          >
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('about.privacy')}</Text>
            <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>›</Text>
          </Pressable>
          <Pressable
            style={s.linkRow}
            onPress={() => Alert.alert(tr('about.contactSupport'), tr('about.comingSoonAlert'))}
          >
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>{tr('about.contactSupport')}</Text>
            <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>›</Text>
          </Pressable>

          <Text style={[t.labelCapsSm, s.versionText]}>
            {build ? tr('about.versionLabelWithBuild', { version: version ?? '—', build }) : tr('about.versionLabel', { version: version ?? '—' })}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing['2xl'] },
  section: { gap: spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLabels: { flex: 1, gap: 2 },
  disabledRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fullBtn: { alignSelf: 'stretch' },
  confirmBox: {
    borderWidth: 1, borderColor: colors.danger, backgroundColor: palette.surfaceMid,
    padding: spacing.lg, gap: spacing.md,
  },
  confirmBtns: { flexDirection: 'row', gap: spacing.md },
  confirmBtn: { flex: 1 },
  sliderBlock: { gap: spacing.xs, paddingVertical: spacing.md },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.separator,
  },
  versionText: { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.lg },
});
