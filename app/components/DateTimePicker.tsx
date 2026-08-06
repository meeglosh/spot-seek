import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, Platform,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { colors, fonts, palette, spacing, type as t } from '../lib/theme';

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
      {/* Underline trigger — orange bottom border while the picker is open */}
      <Pressable
        style={[s.trigger, showPicker && { borderBottomColor: colors.live }]}
        onPress={openPicker}
      >
        <Text
          style={[
            s.triggerText,
            { color: value ? colors.textPrimary : colors.textTertiary },
          ]}
        >
          {formatted ?? placeholder}
        </Text>
        {value && (
          <Pressable onPress={clear} hitSlop={12}>
            <Text style={s.clearGlyph}>✕</Text>
          </Pressable>
        )}
      </Pressable>

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
              <Pressable onPress={clear}>
                <Text style={[t.labelCaps, { color: colors.textSecondary }]}>Clear</Text>
              </Pressable>
              <Text style={[t.labelCaps, { color: colors.textPrimary }]}>Date & Time</Text>
              <Pressable onPress={confirmIOS}>
                <Text style={[t.labelCaps, { color: colors.accent }]}>Done</Text>
              </Pressable>
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
    backgroundColor: palette.surfaceMid,
    borderBottomWidth: 2,
    borderBottomColor: palette.outlineVariant,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  triggerText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 16 },
  clearGlyph: { color: colors.textTertiary, fontSize: 16 },

  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: palette.surfaceLow,
    borderTopWidth: 2,
    borderTopColor: colors.accent,
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
