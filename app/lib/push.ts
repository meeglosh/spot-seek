/**
 * Native push (direct APNs — NOT the Expo push service). The device token is
 * the raw APNs hex token from getDevicePushTokenAsync, registered with our
 * backend, which pushes to Apple itself. Permission is requested only from
 * user-initiated moments (Settings toggle, first "going" RSVP) — never on cold
 * launch.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { registerPushToken, deletePushToken, updateNotificationPrefs } from './api';

const PROMPTED_KEY = 'spotseek_push_prompted';
const TOKEN_KEY = 'spotseek_push_token';

// TestFlight / App Store builds talk to production APNs; debug builds run by
// Xcode get sandbox tokens.
const ENVIRONMENT = __DEV__ ? 'sandbox' : 'production';

export type EnablePushResult = 'enabled' | 'denied' | 'unsupported' | 'error';

async function registerCurrentToken(): Promise<string> {
  const { data } = await Notifications.getDevicePushTokenAsync();
  const token = String(data);
  await registerPushToken(token, ENVIRONMENT);
  SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {});
  return token;
}

/** Asks for permission (if needed), registers the token, flips pushEnabled on. */
export async function enablePush(): Promise<EnablePushResult> {
  if (Platform.OS !== 'ios') return 'unsupported';
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) {
      perm = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
    }
    if (!perm.granted) return 'denied';
    await registerCurrentToken();
    await updateNotificationPrefs({ pushEnabled: true });
    return 'enabled';
  } catch (err) {
    console.error('[push] enable failed:', err);
    return 'error';
  }
}

/** Unregisters this device and flips pushEnabled off. */
export async function disablePush(): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  if (token) {
    await deletePushToken(token).catch(() => {});
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }
  await updateNotificationPrefs({ pushEnabled: false });
}

/**
 * Tokens can rotate: on launch, if the OS permission is still granted and the
 * user has opted in, silently re-register (idempotent upsert). Never prompts.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await registerCurrentToken();
  } catch (err) {
    console.error('[push] refresh failed:', err);
  }
}

/** True at most once per install — gates the first-RSVP permission prompt. */
export async function shouldPromptForPush(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    if (await SecureStore.getItemAsync(PROMPTED_KEY)) return false;
    await SecureStore.setItemAsync(PROMPTED_KEY, '1');
    const perm = await Notifications.getPermissionsAsync();
    return !perm.granted && perm.canAskAgain;
  } catch {
    return false;
  }
}
