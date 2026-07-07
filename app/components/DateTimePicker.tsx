import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, Platform, useColorScheme,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { light, dark, fonts, spacing, radius } from '../lib/theme';

type Props = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  minimumDate?: Date;
};

export function DateTimePicker({ value, onChange, placeholder = 'Set date & time', minimumDate }: Props) {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const isDark = scheme === 'dark';

  const [showPicker, setShowPicker] = useState(false);
  const [mode, setMode] = useState<'date' | 'time'>('date');
  // Staging date so we confirm date then time in two steps on Android
  const [staged, setStaged] = useState<Date>(value ?? new Date());

  const formatted = value
    ? `${value.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
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
      <Pressable
        style={[s.trigger, { backgroundColor: c.bgSubtle, borderColor: value ? c.fill : c.cardBorder }]}
        onPress={openPicker}
      >
        <Text style={[s.triggerText, { color: value ? c.textPrimary : c.textTertiary, fontFamily: fonts.sansRegular }]}>
          {formatted ?? placeholder}
        </Text>
        {value && (
          <Pressable onPress={clear} hitSlop={12}>
            <Text style={[{ color: c.textTertiary, fontSize: 16 }]}>✕</Text>
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
          <View style={[s.sheet, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <View style={s.sheetHeader}>
              <Pressable onPress={clear}>
                <Text style={[{ color: c.textSecondary, fontFamily: fonts.sansRegular, fontSize: 15 }]}>Clear</Text>
              </Pressable>
              <Text style={[{ color: c.textPrimary, fontFamily: fonts.sansSemiBold, fontSize: 15 }]}>Date & Time</Text>
              <Pressable onPress={confirmIOS}>
                <Text style={[{ color: c.textPrimary, fontFamily: fonts.sansSemiBold, fontSize: 15 }]}>Done</Text>
              </Pressable>
            </View>
            <RNDateTimePicker
              value={staged}
              mode="datetime"
              display="spinner"
              onChange={handleChange}
              minimumDate={minimumDate}
              themeVariant={isDark ? 'dark' : 'light'}
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
    height: 52, borderRadius: radius.md, borderWidth: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  triggerText: { fontSize: 16, flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    paddingBottom: spacing['3xl'],
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.xl, paddingBottom: spacing.md,
  },
});
