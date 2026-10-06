/**
 * Notification Center — every event/sponsorship notification for the signed-in
 * user, newest first. Marks everything read as soon as the list has loaded,
 * so the AppHeader badge clears, but keeps rendering the as-fetched `read`
 * state for this pass so a user can still see what was new.
 */
import React, { useState, useCallback, useRef } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from '../components/Text';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '../lib/auth';
import {
  fetchNotifications, markNotificationsRead, type ApiNotification,
} from '../lib/api';
import { colors, radius, spacing, type as t } from '../lib/theme';
import { Press, RowSkeleton, EmptyState, ErrorState } from '../components/ui';
import { routeFor } from '../lib/notificationRoutes';
import { AppHeader } from '../components/AppHeader';
import { GuestGate } from '../components/AuthGate';

// No new deps: a small relative-time formatter matching the compact style
// used elsewhere in the app ("2h ago", "3d ago"). Takes the notifications-
// scoped `t` so it can be called from the component below without a hook of
// its own — see lib/i18n.ts's key-naming convention for the `_one`/`_other`
// plural suffixes used here.
function timeAgo(iso: string, tr: TFunction<'notifications'>): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return tr('timeAgo.justNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return tr('timeAgo.minutes', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return tr('timeAgo.hours', { count: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return tr('timeAgo.days', { count: day });
  const week = Math.floor(day / 7);
  if (week < 5) return tr('timeAgo.weeks', { count: week });
  const month = Math.floor(day / 30);
  if (month < 12) return tr('timeAgo.months', { count: month });
  const year = Math.floor(day / 365);
  return tr('timeAgo.years', { count: year });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  // Scoped to 'notifications' — see settings.tsx / lib/i18n.ts for the
  // key-naming convention this follows.
  const { t: tr } = useTranslation('notifications');
  const { t: trCommon } = useTranslation('common');

  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Guards the mark-all-read call so it fires once per screen visit, not
  // once per re-render of the focus effect.
  const markedRef = useRef(false);

  const load = useCallback(async () => {
    if (auth.status !== 'authenticated') { setLoading(false); return; }
    setError('');
    try {
      const { notifications: list } = await fetchNotifications();
      setNotifications(list);
      if (!markedRef.current) {
        markedRef.current = true;
        markNotificationsRead().catch(() => {});
      }
    } catch {
      setError(tr('loadError'));
    } finally {
      setLoading(false);
    }
  }, [auth.status, tr]);

  useFocusEffect(useCallback(() => {
    markedRef.current = false;
    load();
  }, [load]));

  function handlePress(n: ApiNotification) {
    const path = routeFor(n.type, n.eventId);
    if (!path) return;
    router.push(path as never);
  }

  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader back />
        <GuestGate
          title={tr('guestGate.title')}
          message={tr('guestGate.message')}
          redirect="/notifications"
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <AppHeader back />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={[t.headlineLg, s.title]}>{tr('title')}</Text>

        {loading ? (
          <View style={s.list} accessibilityLabel={trCommon('loading')}>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : error ? (
          <ErrorState
            title={tr('errorTitle')}
            message={error}
            retryLabel={trCommon('retry')}
            onRetry={() => { setLoading(true); load(); }}
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon="bell"
            title={tr('emptyTitle')}
            body={tr('empty')}
            actionLabel={tr('emptyCta')}
            onAction={() => router.push('/(tabs)/discover' as never)}
          />
        ) : (
          <View style={s.list}>
            {notifications.map((n) => {
              const path = routeFor(n.type, n.eventId);
              return (
                <Press
                  key={n.id}
                  style={[s.row, !n.read && s.rowUnread]}
                  onPress={path ? () => handlePress(n) : undefined}
                >
                  <Text style={[t.bodyLg, s.rowTitle]}>{n.title}</Text>
                  <Text style={[t.bodySm, s.rowBody]}>{n.body}</Text>
                  <Text style={[t.labelSm, s.rowTime]}>{timeAgo(n.createdAt, tr)}</Text>
                </Press>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  title: { color: colors.textPrimary },
  list: { gap: spacing.md },
  row: {
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radius.card,
  },
  // Unread = a full action-coloured border and a raised surface (no side stripe).
  rowUnread: {
    borderColor: colors.action,
    backgroundColor: colors.surface2,
  },
  rowTitle: { color: colors.textPrimary },
  rowBody: { color: colors.textSecondary },
  rowTime: { color: colors.textTertiary, marginTop: spacing.xs },
});
