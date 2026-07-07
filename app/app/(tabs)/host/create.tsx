import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Switch, Platform, useColorScheme, KeyboardAvoidingView,
  Image, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../../lib/auth';
import { createEvent, fetchEvent, type ApiEvent } from '../../../lib/api';
import { apiFetch, uploadEventCover, deleteEvent } from '../../../lib/api';
import { DateTimePicker } from '../../../components/DateTimePicker';
import { light, dark, fonts, spacing, radius, palette, type Colors } from '../../../lib/theme';

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? dark : light;
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const isEdit = !!eventId;
  const auth = useAuth();

  // Form state
  const [title, setTitle] = useState('');
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [hasVenue, setHasVenue] = useState(false);
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState('image/jpeg');
  const [existingCoverUrl, setExistingCoverUrl] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [initialising, setInitialising] = useState(isEdit);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Pre-fill form when editing
  useEffect(() => {
    if (!isEdit || !eventId) return;
    fetchEvent(eventId)
      .then((e: ApiEvent) => {
        setTitle(e.title);
        setBroadcastSubject(e.broadcastSubject);
        setDescription(e.description ?? '');
        setCapacity(e.capacity != null ? String(e.capacity) : '');
        setStartsAt(e.startsAt ? new Date(e.startsAt) : null);
        setEndsAt(e.endsAt ? new Date(e.endsAt) : null);
        if (e.venueName) { setHasVenue(true); setVenueName(e.venueName); }
        if (e.venueAddress) setVenueAddress(e.venueAddress);
        setIsPrivate(e.isPrivateLocation);
        setExistingCoverUrl(e.coverImageUrl);
      })
      .catch(() => setError('Could not load event for editing.'))
      .finally(() => setInitialising(false));
  }, [isEdit, eventId]);

  const canSave = title.trim().length > 0 && broadcastSubject.trim().length > 0 && !loading;

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverUri(result.assets[0].uri);
      setCoverMime(result.assets[0].mimeType ?? 'image/jpeg');
    }
  }

  async function handleSave(status: 'published' | 'draft') {
    if (!canSave) return;
    if (auth.status !== 'authenticated') { router.push('/(auth)/sign-in'); return; }

    setLoading(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        broadcastSubject: broadcastSubject.trim(),
        description: description.trim() || undefined,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
        status,
        startsAt: startsAt?.toISOString(),
        endsAt: endsAt?.toISOString(),
        venueName: hasVenue && venueName.trim() ? venueName.trim() : undefined,
        venueAddress: hasVenue && venueAddress.trim() ? venueAddress.trim() : undefined,
        isPrivateLocation: hasVenue ? isPrivate : undefined,
      };

      let savedEvent: ApiEvent;
      if (isEdit && eventId) {
        const res = await apiFetch(`/api/events/${eventId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        const { event } = await res.json() as { event: ApiEvent };
        savedEvent = event;
      } else {
        savedEvent = await createEvent(payload);
      }

      // Upload new cover image if one was picked
      if (coverUri) {
        await uploadEventCover(savedEvent.id, coverUri, coverMime);
      }

      router.back();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'unauthorized') router.push('/(auth)/sign-in');
      else setError(msg || 'Could not save event.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!eventId) return;
    setLoading(true);
    try {
      await deleteEvent(eventId);
      router.back();
    } catch (err) {
      setError((err as Error).message);
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  }

  if (initialising) {
    return (
      <View style={[s.container, { backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={c.textSecondary} />
      </View>
    );
  }

  const coverSource = coverUri ?? (existingCoverUrl ? `http://localhost:8787${existingCoverUrl}` : null);

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
        <Text style={[s.headerTitle, { color: c.textPrimary, fontFamily: fonts.sansSemiBold }]}>
          {isEdit ? 'Edit event' : 'New event'}
        </Text>
        <Pressable
          onPress={() => handleSave('published')}
          disabled={!canSave}
          style={[s.publishBtn, { backgroundColor: c.fill, opacity: canSave ? 1 : 0.4 }]}
        >
          <Text style={[s.publishBtnText, { color: c.fillText, fontFamily: fonts.sansSemiBold }]}>
            {loading ? '…' : isEdit ? 'Save' : 'Publish'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing['2xl'] }]}
        keyboardShouldPersistTaps="handled"
      >
        {!!error && (
          <View style={[s.errorBanner, { backgroundColor: palette.red + '18', borderColor: palette.red + '40' }]}>
            <Text style={[{ color: palette.red, fontFamily: fonts.sansRegular, fontSize: 13 }]}>{error}</Text>
          </View>
        )}

        {/* Cover image */}
        <Pressable onPress={pickImage} style={[s.coverPicker, { backgroundColor: c.bgSubtle, borderColor: c.cardBorder }]}>
          {coverSource ? (
            <Image source={{ uri: coverSource }} style={s.coverPreview} resizeMode="cover" />
          ) : (
            <View style={s.coverEmpty}>
              <Text style={[{ fontSize: 28 }]}>🖼️</Text>
              <Text style={[s.coverHint, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>
                Add cover photo
              </Text>
            </View>
          )}
          <View style={[s.coverOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
            <Text style={{ color: '#fff', fontFamily: fonts.sansMedium, fontSize: 13 }}>
              {coverSource ? 'Change photo' : 'Add photo'}
            </Text>
          </View>
        </Pressable>

        {/* Main fields */}
        <View style={s.section}>
          <Field label="Event title" required c={c}>
            <TextInput
              style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: title ? c.fill : c.cardBorder, fontFamily: fonts.sansRegular }]}
              placeholder="e.g. Arsenal v Chelsea watch party"
              placeholderTextColor={c.textTertiary}
              value={title}
              onChangeText={setTitle}
              autoFocus={!isEdit}
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

          <Field label="Starts" c={c}>
            <DateTimePicker
              value={startsAt}
              onChange={setStartsAt}
              placeholder="Set date & time"
              minimumDate={new Date()}
            />
          </Field>

          <Field label="Ends" c={c}>
            <DateTimePicker
              value={endsAt}
              onChange={setEndsAt}
              placeholder="Optional end time"
              minimumDate={startsAt ?? new Date()}
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

        {/* Venue */}
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
              <TextInput style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]} placeholder="Venue name" placeholderTextColor={c.textTertiary} value={venueName} onChangeText={setVenueName} />
              <TextInput style={[s.input, { backgroundColor: c.bgSubtle, color: c.textPrimary, borderColor: c.cardBorder, fontFamily: fonts.sansRegular }]} placeholder="Address" placeholderTextColor={c.textTertiary} value={venueAddress} onChangeText={setVenueAddress} />
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

        {/* Draft / Delete */}
        <Pressable onPress={() => handleSave('draft')} disabled={!canSave} style={[s.draftBtn, { borderColor: c.cardBorder, opacity: canSave ? 1 : 0.4 }]}>
          <Text style={[s.draftText, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
            {isEdit ? 'Save as draft' : 'Save as draft instead'}
          </Text>
        </Pressable>

        {isEdit && (
          <>
            {!showDeleteConfirm ? (
              <Pressable onPress={() => setShowDeleteConfirm(true)} style={[s.deleteBtn, { borderColor: palette.red + '40' }]}>
                <Text style={[s.deleteText, { fontFamily: fonts.sansMedium }]}>Delete event</Text>
              </Pressable>
            ) : (
              <View style={[s.confirmBox, { backgroundColor: palette.red + '10', borderColor: palette.red + '40' }]}>
                <Text style={[s.confirmText, { color: c.textPrimary, fontFamily: fonts.sansMedium }]}>
                  Delete this event? This cannot be undone.
                </Text>
                <View style={s.confirmBtns}>
                  <Pressable onPress={() => setShowDeleteConfirm(false)} style={[s.confirmCancel, { borderColor: c.cardBorder }]}>
                    <Text style={[{ color: c.textSecondary, fontFamily: fonts.sansMedium, fontSize: 14 }]}>Keep it</Text>
                  </Pressable>
                  <Pressable onPress={handleDelete} disabled={loading} style={s.confirmDelete}>
                    <Text style={[{ color: '#fff', fontFamily: fonts.sansSemiBold, fontSize: 14 }]}>
                      {loading ? '…' : 'Yes, delete'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, required, hint, children, c }: { label: string; required?: boolean; hint?: string; children: React.ReactNode; c: Colors }) {
  return (
    <View style={s.field}>
      <View style={s.labelRow}>
        <Text style={[s.label, { color: c.textSecondary, fontFamily: fonts.sansMedium }]}>
          {label}{required && <Text style={{ color: palette.red }}> *</Text>}
        </Text>
        {hint && <Text style={[s.hint, { color: c.textTertiary, fontFamily: fonts.sansRegular }]}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  cancelText: { fontSize: 16 },
  headerTitle: { fontSize: 16 },
  publishBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full },
  publishBtnText: { fontSize: 14 },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl, paddingTop: spacing.md },
  errorBanner: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  coverPicker: {
    height: 160, borderRadius: radius.lg, borderWidth: 1,
    overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
  },
  coverPreview: { position: 'absolute', width: '100%', height: '100%' },
  coverEmpty: { alignItems: 'center', gap: spacing.sm },
  coverHint: { fontSize: 14 },
  coverOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.sm, alignItems: 'center',
  },
  section: { gap: spacing.lg },
  field: { gap: spacing.xs + 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, letterSpacing: 0.3 },
  hint: { fontSize: 12 },
  input: { height: 52, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 16, borderWidth: 1 },
  textArea: { height: 100, paddingTop: spacing.md },
  toggleCard: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  toggleLabels: { flex: 1, paddingRight: spacing.lg },
  toggleTitle: { fontSize: 15 },
  toggleSub: { fontSize: 13, marginTop: 2 },
  venueFields: { borderTopWidth: 1, padding: spacing.lg, gap: spacing.md },
  draftBtn: { height: 48, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  draftText: { fontSize: 15 },
  deleteBtn: { height: 48, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 15, color: palette.red },
  confirmBox: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  confirmText: { fontSize: 14, lineHeight: 20 },
  confirmBtns: { flexDirection: 'row', gap: spacing.md },
  confirmCancel: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  confirmDelete: { flex: 1, height: 44, borderRadius: radius.md, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center' },
});
