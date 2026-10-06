import { useCallback } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { blockUser, fetchProfile } from './api';
import { emitBlocksChanged } from './moderation';

// "Block Maya?" confirmation in a native action sheet (iOS) / alert (Android),
// naming the person and the consequence, then the block call. `onBlocked` runs
// after the server confirms (e.g. leave the party; feeds refresh via the
// blocks-changed bus). When the host's name isn't known (feed cards don't carry
// it) it is fetched first, falling back to "this host".
export function useBlockHost() {
  const { t: tr } = useTranslation('moderation');

  return useCallback(async (
    host: { id: string; name?: string | null },
    onBlocked?: () => void,
  ) => {
    let name = host.name?.trim() || '';
    if (!name) {
      name = await fetchProfile(host.id).then((p) => p.displayName).catch(() => '');
    }
    const who = name || tr('block.thisHost');
    const title = tr('block.title', { name: who });
    const message = tr('block.message');
    const confirmLabel = tr('block.confirm', { name: who });

    const run = async () => {
      try {
        await blockUser(host.id);
        emitBlocksChanged();
        onBlocked?.();
      } catch {
        Alert.alert(tr('block.errorTitle'), tr('block.error'));
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          message,
          options: [confirmLabel, tr('cancel')],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (i) => { if (i === 0) run(); },
      );
    } else {
      Alert.alert(title, message, [
        { text: tr('cancel'), style: 'cancel' },
        { text: confirmLabel, style: 'destructive', onPress: () => { run(); } },
      ]);
    }
  }, [tr]);
}
