import React, { useState } from 'react';
import {
  View, Pressable, StyleSheet, Modal, Platform,
} from 'react-native';
import { Text } from './Text';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { colors, radius, spacing, TAP, elevation, type as t } from '../lib/theme';
import { Press } from './ui';
import { Icon } from './icons';

type Props = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minimumDate?: Date;
};

export function DateTimePicker({ value, onChange, placeholder = 'Set date & time', minimumDate }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');
  // Staging date so we confirm date then time in two steps on Android
  const [staged, setStaged] = useState<Date>(value ?? new Date());

  const formatted = value
    ? `${value.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`
    : null;

  function openPicker() {
    setStaged(value ?? new Date());
    setMode('date');
    setShowPicker(true);
  }

  function handleChange(_: unknown, selected?: Date) {
    if (!selected) {
      // User cancelled (Android)
      setShowPicker(false);
      return;
    }
    if (Platform.OS === 'android') {
      if (mode === 'date') {
        setStaged(selected);
        setMode('time'); // Android: show time picker next
      } else {
        setShowPicker(false);
        onChange(selected);
      }
    } else {
      // iOS: continuous update
      setStaged(selected);
    }
  }

  function confirmIOS() {
    setShowPicker(false);
    onChange(staged);
  }

  function clear() {
    setShowPicker(false);
    onChange(null);
  }

  return (
    <>
      {/* Underline trigger — action-coloured bottom border while the picker is open */}
      <Press
        style={[s.trigger, showPicker && { borderColor: colors.action }]}
        onPress={openPicker}
        accessibilityRole="button"
      >
        <Text
          style={[
            t.bodyMdStrong,
            s.triggerText,
            { color: value ? colors.textPrimary : colors.textTertiary },
          ]}
        >
          {formatted ?? placeholder}
        </Text>
        {value && (
          <Press onPress={clear} style={s.clearBtn} accessibilityRole="button">
            <Icon name="close" size={16} color={colors.textTertiary} />
          </Press>
        )}
      </Press>

      {/* Android: inline native picker (no modal needed) */}
      {Platform.OS === 'android' && showPicker && (
        <RNDateTimePicker
          value={staged}
          mode={mode}
          display="default"
          onChange={handleChange}
          minimumDate={minimumDate}
        />
      )}

      {/* iOS: modal with inline spinner + confirm */}
      {Platform.OS === 'ios' && showPicker && (
        <Modal transparent animationType="slide">
          <Pressable style={s.backdrop} onPress={() => setShowPicker(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Press onPress={clear} style={s.sheetBtn} accessibilityRole="button">
                <Text style={[t.label, { color: colors.textSecondary }]}>Clear</Text>
              </Press>
              <Text style={[t.label, { color: colors.textPrimary }]}>Date & Time</Text>
              <Press onPress={confirmIOS} style={s.sheetBtn} accessibilityRole="button">
                <Text style={[t.label, { color: colors.action }]}>Done</Text>
              </Press>
            </View>
            <RNDateTimePicker
              value={staged}
              mode="datetime"
              display="spinner"
              onChange={handleChange}
              minimumDate={minimumDate}
              themeVariant="dark"
              style={{ height: 200 }}
            />
          </View>
        </Modal>
      )}
    </>
  );
}

const s = StyleSheet.create({
  trigger: {
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: TAP + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  triggerText: { flex: 1 },
  clearBtn: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.md },
  sheetBtn: { minHeight: TAP, justifyContent: 'center' },

  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    ...elevation(3),
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingBottom: spacing['3xl'],
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.xl,
    paddingBottom: spacing.md,
  },
});
