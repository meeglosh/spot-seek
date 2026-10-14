import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ErrorState } from './ui';
import { colors } from '../lib/theme';

/** Full-screen fallback for the root error boundary. Copy: locales common.crash.* */
export default function CrashFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={s.root}>
      <ErrorState
        title={t('crash.title')}
        message={t('crash.message')}
        retryLabel={t('crash.retry')}
        onRetry={onRetry}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas, justifyContent: 'center' },
});
