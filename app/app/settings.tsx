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
import { useAuth } from '../lib/auth';
import {
  fetchNotificationPrefs, updateNotificationPrefs, deleteAccount, type ApiNotificationPrefs,
} from '../lib/api';
import { colors, palette, spacing, type as t } from '../lib/theme';
import { AppHeader } from '../components/AppHeader';
import { Btn, Badge, SectionTitle } from '../components/ui';
import { GuestGate } from '../components/AuthGate';

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

  const [prefs, setPrefs] = useState<ApiNotificationPrefs | null>(null);
  const [radiusMi, setRadiusMi] = useState(50);
  const [prefsError, setPrefsError] = useState('');

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
      setPrefsError('Could not load notification settings.');
    }
  }, [auth.status]);

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
      setPrefsError('Could not save radius — try again.');
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
      setPrefsError('Could not save email notifications — try again.');
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
      setDeleteError((err as Error).message || 'Could not delete account.');
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
          title="Settings"
          message="Sign in to manage your account and notification preferences."
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
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>Settings</Text>

        {/* ACCOUNT */}
        <View style={s.section}>
          <SectionTitle>Account</SectionTitle>
          <SettingsRow
            label="Signed in as"
            sub={auth.user.email}
            right={<View />}
          />
          <Btn label="Sign Out" variant="secondary" onPress={handleSignOut} style={s.fullBtn} />

          {!deleteStep ? (
            <Btn
              label="Delete Account"
              variant="danger"
              onPress={() => { setDeleteStep(true); setDeleteError(''); }}
              style={s.fullBtn}
            />
          ) : (
            <View style={s.confirmBox}>
              <Text style={[t.bodyMd, { color: colors.textPrimary }]}>
                Delete your account? This cannot be undone. Hosts must delete their own events first.
              </Text>
              <View style={s.confirmBtns}>
                <Btn
                  label="Keep It"
                  variant="ghost"
                  small
                  style={s.confirmBtn}
                  onPress={() => setDeleteStep(false)}
                />
                <Btn
                  label={deleting ? '…' : 'Yes, Delete'}
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
          <SectionTitle>Notifications</SectionTitle>
          {prefsError ? <Text style={[t.bodySm, { color: colors.danger }]}>{prefsError}</Text> : null}

          <SettingsRow
            label="Email notifications"
            right={
              <Switch
                value={!!prefs?.emailEnabled}
                onValueChange={handleEmailToggle}
                trackColor={{ false: palette.surfaceHigh, true: colors.accent }}
              />
            }
          />
          <SettingsRow
            label="Push notifications"
            right={
              <View style={s.disabledRow}>
                <Switch value={!!prefs?.pushEnabled} disabled trackColor={{ false: palette.surfaceHigh, true: colors.accent }} />
                <Badge label="Coming soon" tone="neutral" dot={false} />
              </View>
            }
          />

          <View style={s.sliderBlock}>
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>Nearby alert radius</Text>
            <Text style={[t.labelCaps, { color: colors.accent }]}>
              {radiusMi} mi / {milesToKm(radiusMi)} km
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

        {/* FAVOURITES */}
        <View style={s.section}>
          <SectionTitle>Favourites</SectionTitle>
          <Pressable
            style={s.linkRow}
            onPress={() => router.push('/(auth)/interests' as never)}
          >
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>Manage favourites</Text>
            <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>›</Text>
          </Pressable>
        </View>

        {/* ABOUT */}
        <View style={s.section}>
          <SectionTitle>About</SectionTitle>
          <Pressable
            style={s.linkRow}
            onPress={() => Alert.alert('Terms of Service', 'Coming soon.')}
          >
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>Terms of Service</Text>
            <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>›</Text>
          </Pressable>
          <Pressable
            style={s.linkRow}
            onPress={() => Alert.alert('Privacy Policy', 'Coming soon.')}
          >
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>Privacy Policy</Text>
            <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>›</Text>
          </Pressable>
          <Pressable
            style={s.linkRow}
            onPress={() => Alert.alert('Contact Support', 'Coming soon.')}
          >
            <Text style={[t.bodyMd, { color: colors.textPrimary }]}>Contact Support</Text>
            <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>›</Text>
          </Pressable>

          <Text style={[t.labelCapsSm, s.versionText]}>
            Version {version ?? '—'}{build ? ` (${build})` : ''}
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
