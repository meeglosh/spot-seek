import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { scrubEvent, scrubBreadcrumb } from './sentryScrub';

// Public ingest DSN (safe to commit). Crash and error reporting for the beta.
const SENTRY_DSN =
  'https://20b324955367cee56e5e03e530d6fc93@o4511334152732672.ingest.us.sentry.io/4512255014862848';

const version = Constants.expoConfig?.version ?? '0.0.0';
const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? '0';

const devOverride = process.env.EXPO_PUBLIC_SENTRY_DEV === '1';

/**
 * Real-device release builds report. Simulators/emulators and dev builds do not,
 * unless EXPO_PUBLIC_SENTRY_DEV=1 deliberately turns it on (then environment is
 * 'simulator' / 'development', never 'testflight').
 */
export const sentryEnabled = (Device.isDevice && !__DEV__) || devOverride;

export const sentryEnvironment = !Device.isDevice
  ? 'simulator'
  : __DEV__
    ? 'development'
    : 'testflight';

export function initSentry(): void {
  // Skip init entirely when disabled so the native crash handler is never
  // installed either. Sentry.wrap/ErrorBoundary/setUser are safe without init.
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: true,
    environment: sentryEnvironment,
    release: `com.spotseek.app@${version}+${buildNumber}`,
    dist: buildNumber,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    // No session replay: mobileReplayIntegration is deliberately not added.
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}

/** User context is the account id only. Pass null on sign-out. */
export function setSentryUser(id: string | null): void {
  Sentry.setUser(id ? { id } : null);
}

export { Sentry };
