import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Icon } from './icons';
import { Press } from './ui';
import { colors, radius, spacing, TAP, type as t } from '../lib/theme';
import { openGuidelines } from '../lib/moderation';

// Host-only notice on a party the moderation system has acted on.
//  hidden  = under review: calm, neutral surface (nothing is wrong yet)
//  removed = taken down: a danger wash, with a link to the guidelines
export function ModerationBanner({ kind }: { kind: 'hidden' | 'removed' }) {
  const { t: tr } = useTranslation('moderation');
  const removed = kind === 'removed';
  return (
    <View style={[s.wrap, removed ? s.removed : s.hidden]} accessibilityRole="summary">
      <View style={s.head}>
        <Icon
          name={removed ? 'block' : 'shield'}
          size={20}
          color={removed ? colors.danger : colors.textSecondary}
        />
        <Text style={[t.bodyMdStrong, s.text]}>
          {removed ? tr('banner.removed') : tr('banner.hidden')}
        </Text>
      </View>
      {removed && (
        <Press onPress={openGuidelines} accessibilityRole="link" style={s.link}>
          <Text style={[t.label, { color: colors.actionMuted }]}>{tr('banner.guidelinesLink')}</Text>
        </Press>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: radius.card, padding: spacing.lg, gap: spacing.xs },
  hidden: { backgroundColor: colors.surface2 },
  removed: { backgroundColor: colors.dangerWash },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { color: colors.textPrimary, flex: 1 },
  link: { minHeight: TAP, justifyContent: 'center', marginLeft: 20 + spacing.md },
});
