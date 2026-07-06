import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Switch, Platform, useColorScheme, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth';
import { createEvent } from '../../../lib/api';
import { light, dark, fonts, spacing, radius, palette, type Colors } from '../../../lib/theme';

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const auth = useAuth();

  const [title, setTitle] = useState('');
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('');
  const [hasVenue, setHasVenue] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canPublish = title.trim().length > 0 && broadcastSubject.trim().length > 0 && !loading;

  async function handleCreate(status: 'published' | 'draft') {
    if (!canPublish) return;
    if (auth.status !== 'authenticated') {
      router.push('/(auth)/sign-in');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await createEvent({
        title: title.trim(),
        broadcastSubject: broadcastSubject.trim(),
        description: description.trim() || undefined,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
        status,
        venueName: hasVenue && venueName.trim() ? venueName.trim() : undefined,
        venueAddress: hasVenue && venueAddress.trim() ? venueAddress.trim() : undefined,
        isPrivateLocation: hasVenue ? isPrivate : undefined,
      });
      router.back();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'unauthorized') {
        router.push('/(auth)/sign-in');
      } else {
        setError(msg || 'Could not create event. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} disabled={loading}>
          <Text style={[s.cancelText, { color: c.textSecondary, fontFamily: fonts.sansRegular, opacity: loading ? 0.4 : 1 }]}>
            Cancel
          </Text>
        </Pressable>
        <Text style={[s.headerTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>New event</Text>
        <Pressable
          onPress={() => handleCreate('published')}
          disabled={!canPublish}
          style={[s.publishBtn, { backgroundColor: c.fill, opacity: canPublish ? 1 : 0.4 }]}
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
        {/* Error banner */}
        {!!error && (
          <View style={[s.errorBanner, { backgroundColor: palette.red + '18', borderColor: palette.red + '40' }]}>
            <Text style={[s.errorText, { fontFamily: fonts.sansRegular }]}>{error}</Text>
          </View>
        )}

        {/* Main fields */}
        <View style={s.section}>
          <Field label="Event title" required c={c}>
            <TextInput
              style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: title ? c.fill : c.cardBorder, fontFamily: fonts.sansRegular }]}
              placeholder="e.g. Arsenal v Chelsea watch party"
              placeholderTextColor={c.textTertiary}
              value={title}
              onChangeText={setTitle}
              autoFocus
            />
          </Field>

          <Field label="What is being watched" required c={c}>
            <TextInput
              style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: broadcastSubject ? c.fill : c.cardBorder, fontFamily: fonts.sansRegular }]}
              placeholder="e.g. Premier League, NFL, F1…"
              placeholderTextColor={c.textTertiary}
              value={broadcastSubject}
              onChangeText={setBroadcastSubject}
            />
          </Field>

          <Field label="Description" c={c}>
            <TextInput
              style={[s.input, s.textArea, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]}
              placeholder="Tell people what to expect…"
              placeholderTextColor={c.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </Field>

          <Field label="Max capacity" hint="Leave blank for unlimited" c={c}>
            <TextInput
              style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]}
              placeholder="e.g. 30"
              placeholderTextColor={c.textTertiary}
              value={capacity}
              onChangeText={setCapacity}
              keyboardType="numeric"
            />
          </Field>
        </View>

        {/* Venue toggle */}
        <View style={[s.toggleCard, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <View style={s.toggleRow}>
            <View style={s.toggleLabels}>
              <Text style={[s.toggleTitle, { color: c.textPrimary, fontFamily: fonts.sansMedium }]}>Add a venue</Text>
              <Text style={[s.toggleSub, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>Let attendees know where to show up</Text>
            </View>
            <Switch value={hasVenue} onValueChange={setHasVenue} trackColor={{ false: c.cardBorder, true: c.fill }} thumbColor={c.bg} />
          </View>

          {hasVenue && (
            <View style={[s.venueFields, { borderTopColor: c.separator }]}>
              <TextInput
                style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]}
                placeholder="Venue name"
                placeholderTextColor={c.textTertiary}
                value={venueName}
                onChangeText={setVenueName}
              />
              <TextInput
                style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]}
                placeholder="Address"
                placeholderTextColor={c.textTertiary}
                value={venueAddress}
                onChangeText={setVenueAddress}
              />
              <View style={s.toggleRow}>
                <View style={s.toggleLabels}>
                  <Text style={[s.toggleTitle, { color: c.textPrimary, fontFamily: fonts.sansMedium }]}>Private location</Text>
                  <Text style={[s.toggleSub, { color: c.textSecondary, fontFamily: fonts.sansRegular }]}>Address hidden until RSVP&apos;d</Text>
                </View>
                <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ false: c.cardBorder, true: c.fill }} thumbColor={c.bg} />
              </View>
            </View>
          )}
        </View>

        {/* Save as draft */}
        <Pressable
          onPress={() => handleCreate('draft')}
          disabled={!canPublish}
          style={[s.draftBtn, { borderColor: c.cardBorder, opacity: canPublish ? 1 : 0.4 }]}
        >
          <Text style={[s.draftText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
            Save as draft instead
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, required, hint, children, c }: {
  label: string; required?: boolean; hint?: string;
  children: React.ReactNode; c: Colors;
}) {
  return (
    <View style={s.field}>
      <View style={s.labelRow}>
        <Text style={[s.label, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
          {label}
          {required && <Text style={{ color: palette.red }}> *</Text>}
        </Text>
        {hint && <Text style={[s.hint, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>{hint}</Text>}
      </View>
      {children}
    </View>
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
  errorBanner: {
    borderRadius: radius.md, borderWidth: 1, padding: spacing.md,
  },
  errorText: { fontSize: 13, color: palette.red },
  section: { gap: spacing.lg },
  field: { gap: spacing.xs + 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, letterSpacing: 0.3 },
  hint: { fontSize: 12 },
  input: {
    height: 52, borderRadius: radius.md, paddingHorizontal: spacing.lg,
    fontSize: 16, borderWidth: 1,
  },
  textArea: { height: 100, paddingTop: spacing.md },
  toggleCard: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  toggleLabels: { flex: 1, paddingRight: spacing.lg },
  toggleTitle: { fontSize: 15 },
  toggleSub: { fontSize: 13, marginTop: 2 },
  venueFields: { borderTopWidth: 1, padding: spacing.lg, gap: spacing.md },
  draftBtn: {
    height: 48, borderRadius: radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  draftText: { fontSize: 15 },
});
