import React, { useState } from 'react';
import {
  Modal, View, ScrollView, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { Icon } from './icons';
import { Btn, FieldLabel, Press, inputStyle, inputFocusedStyle } from './ui';
import { colors, radius, spacing, TAP, type as t } from '../lib/theme';
import { reportEvent, REPORT_NOTE_MAX, type ReportReason } from '../lib/api';
import { REPORT_REASON_KEYS, reasonLabelKey, reportErrorKey } from '../lib/moderation';

type Submit = (eventId: string, reason: ReportReason, note?: string) => Promise<{ duplicate: boolean }>;

// The body of the report flow: a reason list, an optional note, "Send report",
// then a calm confirmation with a "Block this host" follow-up. Rendered inside
// ReportSheet (a native page sheet) and inline in the dev gallery.
export function ReportForm({
  eventId, onClose, onBlockHost, submitReport = reportEvent, initialStep = 'form', initialReason = null,
}: {
  eventId: string;
  onClose: () => void;
  /** Offered after a report goes through. Omit when blocking isn't possible. */
  onBlockHost?: () => void;
  submitReport?: Submit;
  initialStep?: 'form' | 'sent';
  initialReason?: ReportReason | null;
}) {
  const { t: tr } = useTranslation('moderation');
  const [reason, setReason] = useState<ReportReason | null>(initialReason);
  const [note, setNote] = useState('');
  const [noteFocused, setNoteFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(initialStep === 'sent');

  async function send() {
    if (!reason || sending) return;
    setSending(true);
    setError('');
    try {
      // A duplicate (200) gets the same thanks as a first report.
      await submitReport(eventId, reason, note);
      setSent(true);
    } catch (err) {
      setError(tr(reportErrorKey(err)));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <View style={s.sent}>
        <View style={s.sentIcon}>
          <Icon name="check" size={28} color={colors.confirmed} />
        </View>
        <Text style={[t.headlineMd, s.sentTitle]}>{tr('report.thanks')}</Text>
        <View style={s.sentActions}>
          {onBlockHost && (
            <Btn label={tr('report.blockHost')} variant="secondary" onPress={onBlockHost} />
          )}
          <Btn label={tr('report.done')} variant={onBlockHost ? 'ghost' : 'primary'} onPress={onClose} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.form}>
      <View style={s.headRow}>
        <View style={s.headText}>
          <Text style={[t.headlineMd, { color: colors.textPrimary }]}>{tr('report.title')}</Text>
          <Text style={[t.bodyMd, { color: colors.textSecondary }]}>{tr('report.subtitle')}</Text>
        </View>
        <Press
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={tr('report.close')}
          style={s.closeBtn}
        >
          <Icon name="close" size={20} color={colors.textSecondary} />
        </Press>
      </View>

      <View style={s.list} accessibilityRole="radiogroup">
        {REPORT_REASON_KEYS.map((key, i) => {
          const on = key === reason;
          return (
            <Press
              key={key}
              onPress={() => setReason(key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[s.row, i > 0 && s.rowDivider, on && s.rowOn]}
            >
              <Text style={[t.bodyMd, { color: colors.textPrimary, flex: 1 }]}>{tr(reasonLabelKey(key))}</Text>
              <View style={[s.radio, on && s.radioOn]}>
                {on && <Icon name="check" size={14} color={colors.textOnFill} />}
              </View>
            </Press>
          );
        })}
      </View>

      <View>
        <FieldLabel>{tr('report.noteLabel')}</FieldLabel>
        <TextInput
          style={[inputStyle, s.note, noteFocused && inputFocusedStyle]}
          placeholder={tr('report.notePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          value={note}
          onChangeText={setNote}
          onFocus={() => setNoteFocused(true)}
          onBlur={() => setNoteFocused(false)}
          multiline
          maxLength={REPORT_NOTE_MAX}
          textAlignVertical="top"
          accessibilityLabel={tr('report.noteLabel')}
        />
        <Text style={[t.labelSm, s.counter]}>{note.length}/{REPORT_NOTE_MAX}</Text>
      </View>

      {!!error && (
        <Text style={[t.bodySm, { color: colors.danger }]} accessibilityRole="alert">{error}</Text>
      )}

      <Btn
        label={sending ? tr('report.sending') : tr('report.send')}
        onPress={send}
        disabled={!reason || sending}
      />
    </View>
  );
}

// Native iOS page sheet (swipe down to dismiss); a full-screen modal on Android.
export function ReportSheet({
  visible, eventId, onClose, onBlockHost,
}: {
  visible: boolean;
  eventId: string;
  onClose: () => void;
  onBlockHost?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl }]}
        >
          {/* Mounted only while open, so reason, note and sent state reset each time */}
          {visible && (
            <ReportForm eventId={eventId} onClose={onClose} onBlockHost={onBlockHost} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.canvas },
  scroll: { padding: spacing.xl, flexGrow: 1 },
  form: { gap: spacing.lg },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headText: { flex: 1, gap: spacing.xs },
  closeBtn: {
    width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2, borderRadius: radius.round,
  },
  list: { backgroundColor: colors.surface1, borderRadius: radius.card, overflow: 'hidden' },
  row: {
    minHeight: TAP + 8, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  rowOn: { backgroundColor: colors.actionWash },
  radio: {
    width: 22, height: 22, borderRadius: radius.round, borderWidth: 1.5,
    borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.action, borderColor: colors.action },
  note: { minHeight: 96 },
  counter: { color: colors.textTertiary, textAlign: 'right', marginTop: spacing.xs },
  sent: { alignItems: 'center', gap: spacing.md, paddingTop: spacing['3xl'] },
  sentIcon: {
    width: 64, height: 64, borderRadius: radius.round, backgroundColor: colors.confirmedWash,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  sentTitle: { color: colors.textPrimary, textAlign: 'center' },
  sentActions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
});
