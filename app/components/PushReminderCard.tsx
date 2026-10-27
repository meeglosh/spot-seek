import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Press } from './ui';
import { colors, radius, spacing, TAP, type as t } from '../lib/theme';
import { enablePush, getPushReminderOffer, dismissPushReminderOffer, type PushReminderOffer } from '../lib/push';

// Inline card under the "You're in." confirmation. Renders nothing unless
// getPushReminderOffer says so.
//  - 'ask' (OS permission undetermined): this is a message shown before a
//    system permission prompt, so it has ONE button, "Continue", which always
//    goes to the system prompt. No "Not now"; ignoring the card dismisses it.
//  - 'toggle' (OS permission already granted): a plain feature choice, so it
//    keeps "Not now" / "Turn on"; "Not now" is remembered for good.
// A denied OS prompt hides the card quietly (Settings has the link).
type Phase = 'hidden' | 'offer' | 'busy' | 'done';

export function PushReminderCard({ signedIn }: { signedIn: boolean }) {
  const { t: tr } = useTranslation('settings');
  const [phase, setPhase] = useState<Phase>('hidden');
  const [mode, setMode] = useState<PushReminderOffer>('none');

  useEffect(() => {
    let live = true;
    getPushReminderOffer(signedIn).then((offer) => {
      if (live && offer !== 'none') { setMode(offer); setPhase('offer'); }
    });
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
        {mode === 'toggle' && (
          <Press style={s.ghost} onPress={notNow} disabled={phase === 'busy'} accessibilityRole="button">
            <Text style={[t.button, { color: colors.textSecondary }]}>{tr('notifications.pushPromptLater')}</Text>
          </Press>
        )}
        <Press
          style={s.primary}
          onPress={turnOn}
          disabled={phase === 'busy'}
          restOpacity={phase === 'busy' ? 0.6 : 1}
          accessibilityRole="button"
        >
          <Text style={[t.button, { color: colors.textOnFill }]}>{tr(mode === 'ask' ? 'notifications.pushPromptContinue' : 'notifications.pushPromptEnable')}</Text>
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
