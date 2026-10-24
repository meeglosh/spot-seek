import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Press } from './ui';
import { colors, radius, spacing, TAP, type as t } from '../lib/theme';
import { enablePush, shouldOfferPushReminder, dismissPushReminderOffer } from '../lib/push';

// Inline card under the "You're in." confirmation. Asks for push at the moment
// it makes sense. Renders nothing unless every condition in
// shouldOfferPushReminder holds; "Not now" is remembered for good, a denied OS
// prompt hides the card quietly.
type Phase = 'hidden' | 'offer' | 'busy' | 'done';

export function PushReminderCard({ signedIn }: { signedIn: boolean }) {
  const { t: tr } = useTranslation('settings');
  const [phase, setPhase] = useState<Phase>('hidden');

  useEffect(() => {
    let live = true;
    shouldOfferPushReminder(signedIn).then((ok) => { if (live && ok) setPhase('offer'); });
    return () => { live = false; };
  }, [signedIn]);

  if (phase === 'hidden') return null;

  if (phase === 'done') {
    return (
      <View style={s.card}>
        <Text style={[t.bodyMd, s.title]} accessibilityLiveRegion="polite">{tr('notifications.pushPromptDone')}</Text>
      </View>
    );
  }

  async function turnOn() {
    setPhase('busy');
    const result = await enablePush();
    setPhase(result === 'enabled' ? 'done' : 'hidden');
  }

  function notNow() {
    setPhase('hidden');
    dismissPushReminderOffer();
  }

  return (
    <View style={s.card}>
      <Text style={[t.bodyLg, s.title]}>{tr('notifications.pushPromptTitle')}</Text>
      <Text style={[t.bodySm, s.body]}>{tr('notifications.pushPromptBody')}</Text>
      <View style={s.actions}>
        <Press style={s.ghost} onPress={notNow} disabled={phase === 'busy'} accessibilityRole="button">
          <Text style={[t.button, { color: colors.textSecondary }]}>{tr('notifications.pushPromptLater')}</Text>
        </Press>
        <Press
          style={s.primary}
          onPress={turnOn}
          disabled={phase === 'busy'}
          restOpacity={phase === 'busy' ? 0.6 : 1}
          accessibilityRole="button"
        >
          <Text style={[t.button, { color: colors.textOnFill }]}>{tr('notifications.pushPromptEnable')}</Text>
        </Press>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2, borderRadius: radius.card,
    padding: spacing.lg - 4, gap: spacing.xs,
  },
  title: { color: colors.textPrimary },
  body: { color: colors.textSecondary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  ghost: {
    minHeight: TAP, paddingHorizontal: spacing.md, borderRadius: radius.cta,
    alignItems: 'center', justifyContent: 'center',
  },
  primary: {
    minHeight: TAP, paddingHorizontal: spacing.lg, borderRadius: radius.cta,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action,
  },
});
