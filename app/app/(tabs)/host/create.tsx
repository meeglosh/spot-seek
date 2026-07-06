import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Switch, Platform, useColorScheme, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { light, dark, fonts, spacing, radius } from '../../../lib/theme';

type Field = { label: string; key: string; placeholder: string; multiline?: boolean; keyboard?: 'default' | 'numeric' };

const FIELDS: Field[] = [
  { label: 'Event title', key: 'title', placeholder: 'e.g. Arsenal v Chelsea watch party' },
  { label: 'What is being watched', key: 'broadcastSubject', placeholder: 'e.g. Premier League, NFL, F1…' },
  { label: 'Description (optional)', key: 'description', placeholder: 'Tell people what to expect…', multiline: true },
  { label: 'Max capacity (optional)', key: 'capacity', placeholder: 'Leave blank for unlimited', keyboard: 'numeric' },
];

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;

  const [form, setForm] = useState<Record<string, string>>({});
  const [hasVenue, setHasVenue] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);

  function set(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleCreate() {
    if (!form.title || !form.broadcastSubject) return;
    setLoading(true);
    // TODO: call POST /api/events
    setTimeout(() => {
      setLoading(false);
      router.back();
    }, 600);
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={[s.cancelText, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>Cancel</Text>
        </Pressable>
        <Text style={[s.headerTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>New event</Text>
        <Pressable
          onPress={handleCreate}
          disabled={!form.title || !form.broadcastSubject || loading}
          style={[s.publishBtn, { backgroundColor: c.fill, opacity: (!form.title || !form.broadcastSubject || loading) ? 0.4 : 1 }]}
        >
          <Text style={[s.publishBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>
            {loading ? '…' : 'Publish'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing['2xl'] }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Main fields */}
        <View style={s.section}>
          {FIELDS.map((field) => (
            <View key={field.key} style={s.field}>
              <Text style={[s.label, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>{field.label}</Text>
              <TextInput
                style={[
                  s.input,
                  { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular },
                  field.multiline && s.textArea,
                ]}
                placeholder={field.placeholder}
                placeholderTextColor={c.textTertiary}
                value={form[field.key] ?? ''}
                onChangeText={(v) => set(field.key, v)}
                multiline={field.multiline}
                keyboardType={field.keyboard ?? 'default'}
                numberOfLines={field.multiline ? 4 : 1}
                textAlignVertical={field.multiline ? 'top' : 'auto'}
              />
            </View>
          ))}
        </View>

        {/* Venue toggle */}
        <View style={[s.toggleCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <View style={s.toggleRow}>
            <View>
              <Text style={[s.toggleTitle, { color: c.textPrimary, fontFamily: fonts.sansMedium }]}>Add a venue</Text>
              <Text style={[s.toggleSub, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>Let attendees know where to show up</Text>
            </View>
            <Switch
              value={hasVenue}
              onValueChange={setHasVenue}
              trackColor={{ false: c.cardBorder, true: c.fill }}
              thumbColor={c.bg}
            />
          </View>

          {hasVenue && (
            <View style={[s.venueFields, { borderTopColor: c.separator }]}>
              {['Venue name', 'Address'].map((label) => (
                <TextInput
                  key={label}
                  style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]}
                  placeholder={label}
                  placeholderTextColor={c.textTertiary}
                  value={form[label.toLowerCase().replace(' ', '_')] ?? ''}
                  onChangeText={(v) => set(label.toLowerCase().replace(' ', '_'), v)}
                />
              ))}
              <View style={s.toggleRow}>
                <View>
                  <Text style={[s.toggleTitle, { color: c.textPrimary, fontFamily: fonts.sansMedium }]}>Private location</Text>
                  <Text style={[s.toggleSub, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>Address hidden until RSVP&apos;d</Text>
                </View>
                <Switch
                  value={isPrivate}
                  onValueChange={setIsPrivate}
                  trackColor={{ false: c.cardBorder, true: c.fill }}
                  thumbColor={c.bg}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
  },
  cancelText: { fontSize: 16 },
  headerTitle: { fontSize: 16 },
  publishBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full },
  publishBtnText: { fontSize: 14 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl, paddingTop: spacing.md },
  section: { gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { fontSize: 13, letterSpacing: 0.3 },
  input: {
    height: 52, borderRadius: radius.md, paddingHorizontal: spacing.lg,
    fontSize: 16, borderWidth: 1,
  },
  textArea: { height: 100, paddingTop: spacing.md },
  toggleCard: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg,
  },
  toggleTitle: { fontSize: 15 },
  toggleSub: { fontSize: 13, marginTop: 2 },
  venueFields: { borderTopWidth: 1, padding: spacing.lg, gap: spacing.md },
});
