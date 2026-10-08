import React from 'react';
import { View, StyleSheet, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Btn, Press } from './ui';
import { colors, radius, spacing, TAP, elevation, type as t } from '../lib/theme';
import { presentationFor, type EventPhase } from '../lib/eventTime';

// The sticky bottom area of the event detail screen. While a party is
// upcoming or on, it is the RSVP bar. Once it has ended it becomes a calm
// panel: no RSVP, no cancel, just what happened and (for a guest who went) a
// way to review. Share and Report live in the hero, so they stay available.

type Props = {
  phase: EventPhase;
  /** RSVP bar */
  rsvpLabel: string;
  rsvpColor: string;
  rsvpLoading?: boolean;
  rsvpError?: string;
  isActive?: boolean;
  onRsvp?: () => void;
  /** Ended panel */
  dateLabel?: string | null;
  canReview?: boolean;
  hasReview?: boolean;
  onReview?: () => void;
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
};

export function EventRsvpArea({
  phase, rsvpLabel, rsvpColor, rsvpLoading = false, rsvpError, isActive = false, onRsvp,
  dateLabel, canReview = false, hasReview = false, onReview, bottomInset = 0, style,
}: Props) {
  const { t: tr } = useTranslation('discover');
  const pres = presentationFor(phase);

  if (pres.detailPanel === 'ended') {
    return (
      <View style={[s.bar, { paddingBottom: bottomInset + spacing.md }, style]}>
        <Text style={[t.headlineSm, { color: colors.textPrimary }]}>{tr('detail.ended.title')}</Text>
        {dateLabel ? (
          <Text style={[t.bodyMd, { color: colors.textSecondary }]}>{tr('detail.ended.date', { date: dateLabel })}</Text>
        ) : null}
        {canReview && (
          <Btn
            label={hasReview ? tr('detail.ended.editReview') : tr('detail.ended.review')}
            variant="secondary"
            onPress={onReview ?? (() => {})}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[s.bar, { paddingBottom: bottomInset + spacing.md }, style]}>
      {rsvpError ? <Text style={[t.bodySm, s.rsvpError]}>{rsvpError}</Text> : null}
      <Press
        style={[s.rsvpBtn, { backgroundColor: rsvpColor }]}
        restOpacity={rsvpLoading ? 0.6 : 1}
        onPress={onRsvp}
        disabled={rsvpLoading}
        accessibilityRole="button"
      >
        {rsvpLoading ? (
          <ActivityIndicator color={colors.textOnFill} />
        ) : (
          <Text style={[t.button, { color: colors.textOnFill }]}>{rsvpLabel}</Text>
        )}
      </Press>
      {isActive && (
        <Press onPress={onRsvp} disabled={rsvpLoading} style={s.textLink} accessibilityRole="button">
          <Text style={[t.labelSm, s.cancelText]}>{tr('detail.cancelRsvp')}</Text>
        </Press>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    ...elevation(1),
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    shadowOffset: { width: 0, height: -2 },
    gap: spacing.sm,
  },
  rsvpBtn: { height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control },
  rsvpError: { color: colors.danger, textAlign: 'center' },
  textLink: { minHeight: TAP, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.textTertiary, textAlign: 'center' },
});
