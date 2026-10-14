import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { scrubEvent, scrubBreadcrumb } from './sentryScrub';

// Public ingest DSN (safe to commit). Crash and error reporting for the beta.
const SENTRY_DSN =
  'https://20b324955367cee56e5e03e530d6fc93@o4511334152732672.ingest.us.sentry.io/4512255014862848';

const version = Constants.expoConfig?.version ?? '0.0.0';
const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? '0';

/** Sending is off in dev unless EXPO_PUBLIC_SENTRY_DEV=1. */
export const sentryEnabled = !__DEV__ || process.env.EXPO_PUBLIC_SENTRY_DEV === '1';

export function initSentry(): void {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: sentryEnabled,
    environment: __DEV__ ? 'development' : 'testflight',
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
