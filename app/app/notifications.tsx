/**
 * Notification Center — every event/sponsorship notification for the signed-in
 * user, newest first. Marks everything read as soon as the list has loaded,
 * so the AppHeader badge clears, but keeps rendering the as-fetched `read`
 * state for this pass so a user can still see what was new.
 */
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import {
  fetchNotifications, markNotificationsRead, type ApiNotification, type ApiNotificationType,
} from '../lib/api';
import { colors, palette, spacing, type as t } from '../lib/theme';
import { AppHeader } from '../components/AppHeader';
import { GuestGate } from '../components/AuthGate';

// No new deps: a small relative-time formatter matching the compact style
// used elsewhere in the app ("2h ago", "3d ago").
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  const year = Math.floor(day / 365);
  return `${year}y ago`;
}

function routeFor(type: ApiNotificationType, eventId: string | null): string | null {
  if (!eventId) return null;
  if (type === 'sponsor_bid' || type === 'rsvp') return '/(tabs)/parties/dashboard';
  if (type === 'sponsorship_request') return '/(tabs)/sponsorship';
  return `/(tabs)/discover/${eventId}`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();

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
      setError('Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, [auth.status]);

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
          title="Notifications"
          message="Sign in to see activity on your parties and sponsorships."
          redirect="/notifications"
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <AppHeader back />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={[t.headlineLg, s.title]}>Notifications</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : error ? (
          <Text style={[t.bodyMd, s.errorText]}>{error}</Text>
        ) : notifications.length === 0 ? (
          <Text style={[t.bodyMd, s.emptyText]}>
            No notifications yet — activity on your parties shows up here.
          </Text>
        ) : (
          <View style={s.list}>
            {notifications.map((n) => {
              const path = routeFor(n.type, n.eventId);
              return (
                <Pressable
                  key={n.id}
                  style={[s.row, !n.read && s.rowUnread]}
                  onPress={path ? () => handlePress(n) : undefined}
                >
                  <Text style={[t.bodyLg, s.rowTitle]}>{n.title}</Text>
                  <Text style={[t.bodySm, s.rowBody]}>{n.body}</Text>
                  <Text style={[t.labelCapsSm, s.rowTime]}>{timeAgo(n.createdAt)}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  title: { color: colors.textPrimary },
  emptyText: { color: colors.textSecondary, marginTop: spacing.xl, textAlign: 'center' },
  errorText: { color: colors.danger, marginTop: spacing.xl, textAlign: 'center' },
  list: { gap: spacing.md },
  row: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderLeftWidth: 2,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  rowUnread: {
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    backgroundColor: palette.surfaceMid,
  },
  rowTitle: { color: colors.textPrimary },
  rowBody: { color: colors.textSecondary },
  rowTime: { color: colors.textTertiary, marginTop: spacing.xs },
});
