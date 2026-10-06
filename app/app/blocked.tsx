/**
 * Settings -> Blocked people. Everyone the signed-in user has blocked, newest
 * first, with Unblock on each row.
 */
import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Image } from 'react-native';
import { Text } from '../components/Text';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { fetchBlockedUsers, unblockUser, resolveImageUrl, type ApiBlockedUser } from '../lib/api';
import { emitBlocksChanged } from '../lib/moderation';
import { colors, radius, spacing, type as t } from '../lib/theme';
import { AppHeader } from '../components/AppHeader';
import { Btn, RowSkeleton, EmptyState, ErrorState } from '../components/ui';
import { GuestGate } from '../components/AuthGate';

export function BlockedRow({
  person, busy, onUnblock,
}: {
  person: Pick<ApiBlockedUser, 'displayName' | 'avatarUrl'>;
  busy?: boolean;
  onUnblock: () => void;
}) {
  const { t: tr } = useTranslation('moderation');
  const avatar = resolveImageUrl(person.avatarUrl);
  return (
    <View style={s.row}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, s.avatarFallback]}>
          <Text style={[t.headlineSm, { color: colors.textSecondary }]}>
            {person.displayName.trim().charAt(0)}
          </Text>
        </View>
      )}
      <Text style={[t.bodyLg, s.name]} numberOfLines={1}>{person.displayName}</Text>
      <Btn
        label={tr('blocked.unblock')}
        variant="secondary"
        small
        onPress={onUnblock}
        disabled={busy}
      />
    </View>
  );
}

export default function BlockedPeopleScreen() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { t: tr } = useTranslation('moderation');
  const { t: trCommon } = useTranslation('common');

  const [blocks, setBlocks] = useState<ApiBlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (auth.status !== 'authenticated') { setLoading(false); return; }
    setError('');
    try {
      setBlocks(await fetchBlockedUsers());
    } catch {
      setError(tr('blocked.loadError'));
    } finally {
      setLoading(false);
    }
  }, [auth.status, tr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleUnblock(person: ApiBlockedUser) {
    setBusyId(person.userId);
    setActionError('');
    try {
      await unblockUser(person.userId);
      setBlocks((prev) => prev.filter((b) => b.userId !== person.userId));
      emitBlocksChanged();
    } catch {
      setActionError(tr('blocked.unblockError'));
    } finally {
      setBusyId(null);
    }
  }

  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader back />
        <GuestGate
          title={tr('blocked.title')}
          message={tr('blocked.subtitle')}
          redirect="/blocked"
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <AppHeader back />
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={[t.headlineLg, { color: colors.textPrimary }]}>{tr('blocked.title')}</Text>
        {!loading && !error && blocks.length > 0 && (
          <Text style={[t.bodyMd, { color: colors.textSecondary }]}>{tr('blocked.subtitle')}</Text>
        )}

        {loading ? (
          <View style={s.list} accessibilityLabel={trCommon('loading')}>
            <RowSkeleton lines={1} />
            <RowSkeleton lines={1} />
          </View>
        ) : error ? (
          <ErrorState
            title={tr('blocked.errorTitle')}
            message={error}
            retryLabel={trCommon('retry')}
            onRetry={() => { setLoading(true); load(); }}
          />
        ) : blocks.length === 0 ? (
          <EmptyState
            icon="users"
            title={tr('blocked.emptyTitle')}
            body={tr('blocked.empty')}
          />
        ) : (
          <View style={s.list}>
            {!!actionError && <Text style={[t.bodySm, { color: colors.danger }]}>{actionError}</Text>}
            {blocks.map((b) => (
              <BlockedRow
                key={b.userId}
                person={b}
                busy={busyId === b.userId}
                onUnblock={() => handleUnblock(b)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  list: { gap: spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface1, borderRadius: radius.card, padding: spacing.md,
  },
  avatar: { width: 44, height: 44, borderRadius: radius.round, backgroundColor: colors.surface2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, color: colors.textPrimary },
});
