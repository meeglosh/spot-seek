import React from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../lib/auth';
import { fetchNotificationPrefs } from '../lib/api';
import { refreshPushRegistration } from '../lib/push';
import { routeFor } from '../lib/notificationRoutes';

// Foreground pushes still show as a banner (otherwise iOS silently drops them).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Renders nothing. Inside AuthProvider it (1) silently re-registers the APNs
 * token for opted-in users (never prompts), and (2) routes notification taps —
 * including the cold-start tap that launched the app — with the same routeFor
 * logic as the Notification Center.
 */
export default function PushBootstrap() {
  const router = useRouter();
  const auth = useAuth();
  const response = Notifications.useLastNotificationResponse();
  const handledRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (Platform.OS !== 'ios' || auth.status !== 'authenticated') return;
    fetchNotificationPrefs()
      .then((prefs) => { if (prefs?.pushEnabled) return refreshPushRegistration(); })
      .catch(() => {});
  }, [auth.status]);

  React.useEffect(() => {
    if (!response || auth.status === 'loading') return;
    // Only the default tap (not dismiss/custom actions) navigates.
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handledRef.current === id) return;
    handledRef.current = id;
    if (auth.status !== 'authenticated') return;
    const data = response.notification.request.content.data as { eventId?: string; type?: string } | undefined;
    const path = routeFor(data?.type, data?.eventId ?? null);
    if (!path) {
      router.push('/notifications' as never);
      return;
    }
    // Let the root redirect / launch splash settle on a cold start first.
    // (No cleanup: handledRef already marked this tap handled, so a re-run
    // must not cancel the pending navigation.)
    setTimeout(() => router.push(path as never), 400);
  }, [response, auth.status, router]);

  return null;
}
