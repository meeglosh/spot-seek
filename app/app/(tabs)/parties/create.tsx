import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  Switch, Platform, KeyboardAvoidingView, Image, ActivityIndicator,
  type TextInputProps,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../../lib/auth';
import { createEvent, fetchEvent, type ApiEvent } from '../../../lib/api';
import { API_BASE, apiFetch, uploadEventCover, deleteEvent } from '../../../lib/api';
import { AppHeader } from '../../../components/AppHeader';
import { Btn, FieldLabel, inputStyle, inputFocusedStyle } from '../../../components/ui';
import { GuestGate, goToAuth } from '../../../components/AuthGate';
import { BroadcastSubjectInput } from '../../../components/BroadcastSubjectInput';
import { AddressAutocompleteInput } from '../../../components/AddressAutocompleteInput';
import { DateTimePicker } from '../../../components/DateTimePicker';
import MapView, { Marker } from 'react-native-maps';
import { colors, palette, spacing, type as t } from '../../../lib/theme';

// ─── HEA form primitives ─────────────────────────────────────────────────────

// Underline input with orange focus state.
function Input(props: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.textTertiary}
      {...props}
      style={[inputStyle, focused && inputFocusedStyle, props.style]}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

// Numbered section block: cyan top border, Anton section title.
function FormSection({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={[t.headlineMd, { color: colors.accent }]}>{num}. {title}</Text>
      {children}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  // Set only by picking an autocomplete suggestion; cleared on manual edits so
  // a stale pin never outlives the address it belonged to.
  const [venueCoords, setVenueCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState('image/jpeg');
  const [existingCoverUrl, setExistingCoverUrl] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [initialising, setInitialising] = useState(isEdit);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Terminal state: replaces the form with a success screen once the
  // publish/draft/delete round-trip has actually completed.
  const [outcome, setOutcome] = useState<{
    kind: 'published' | 'draft' | 'deleted';
    savedEventId?: string;
    coverError?: string;
  } | null>(null);

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
        if (e.venueLat != null && e.venueLng != null) {
          setVenueCoords({ latitude: e.venueLat, longitude: e.venueLng });
        }
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
    if (auth.status !== 'authenticated') { goToAuth(router, 'sign-in', '/(tabs)/parties/create'); return; }

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
        venueLat: hasVenue && venueCoords ? venueCoords.latitude : undefined,
        venueLng: hasVenue && venueCoords ? venueCoords.longitude : undefined,
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

      // Upload the cover separately: a failed upload must never make a
      // successful publish look like a failure (it used to abort before
      // navigation, stranding the user on this screen with the error banner
      // scrolled out of view). Surface it on the success screen instead.
      let coverError: string | undefined;
      if (coverUri) {
        try {
          await uploadEventCover(savedEvent.id, coverUri, coverMime);
        } catch (err) {
          coverError = (err as Error).message || 'Cover upload failed.';
        }
      }

      setOutcome({ kind: status, savedEventId: savedEvent.id, coverError });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'unauthorized') goToAuth(router, 'sign-in', '/(tabs)/parties/create');
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
      setOutcome({ kind: 'deleted' });
    } catch (err) {
      setError((err as Error).message || 'Could not delete the party.');
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  }

  // ── Not signed in: gate before the form, not at submit time ────────────────
  if (auth.status !== 'authenticated') {
    return (
      <View style={s.container}>
        <AppHeader back />
        <GuestGate
          title="Host a Party"
          message="Sign in to create watch parties, rally your crowd, and manage RSVPs."
          redirect="/(tabs)/parties/create"
        />
      </View>
    );
  }

  if (initialising) {
    return (
      <View style={[s.container, s.centerFill]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // ── Success screen — publish / draft / delete completed ────────────────────
  if (outcome) {
    const copy = {
      published: {
        title: 'Party Published',
        body: 'Your watch party is live on the Discover feed.',
      },
      draft: {
        title: 'Draft Saved',
        body: 'Pick it back up any time from your Command Center drafts.',
      },
      deleted: {
        title: 'Party Deleted',
        body: 'The party and its RSVPs have been removed.',
      },
    }[outcome.kind];

    return (
      <View style={s.container}>
        <AppHeader back />
        <View style={s.centerFill}>
          <View style={s.successGlyphBox}>
            <Text style={s.successGlyph}>✓</Text>
          </View>
          <Text style={[t.headlineLg, s.successTitle]}>{copy.title}</Text>
          <Text style={[t.bodyMd, s.successBody]}>{copy.body}</Text>

          {outcome.coverError && (
            <View style={s.successWarn}>
              <Text style={[t.labelCapsSm, { color: colors.live }]}>Cover image failed</Text>
              <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                {outcome.coverError} — you can retry from Edit Party.
              </Text>
            </View>
          )}

          <View style={s.successActions}>
            {outcome.kind === 'published' && outcome.savedEventId && (
              <Btn
                label="View Party"
                onPress={() => router.replace(`/(tabs)/discover/${outcome.savedEventId}` as never)}
              />
            )}
            <Btn
              label="Done"
              variant={outcome.kind === 'published' ? 'secondary' : 'primary'}
              onPress={() => router.back()}
            />
          </View>
        </View>
      </View>
    );
  }

  const coverSource = coverUri ?? (existingCoverUrl ? `${API_BASE}${existingCoverUrl}` : null);

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader back />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + spacing['2xl'] }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Headline */}
        <View style={s.headlineBlock}>
          <Text style={[t.headlineLg, { color: colors.textPrimary }]}>
            {isEdit ? 'Edit Party' : 'Host a Party'}
          </Text>
          <Text style={[t.bodyMd, { color: colors.textSecondary }]}>
            Set up your watch party and rally the squad.
          </Text>
        </View>

        {!!error && (
          <View style={s.errorBanner}>
            <Text style={[t.bodySm, { color: colors.danger }]}>{error}</Text>
          </View>
        )}

        {/* Cover image */}
        <Pressable onPress={pickImage} style={s.coverPicker}>
          {coverSource ? (
            <Image source={{ uri: coverSource }} style={s.coverPreview} resizeMode="cover" />
          ) : (
            <Text style={[t.labelCaps, { color: colors.textTertiary }]}>+ Add Cover Photo</Text>
          )}
          <View style={s.coverOverlay}>
            <Text style={[t.labelCapsSm, { color: colors.accent }]}>
              {coverSource ? 'Change Photo' : 'Cover Photo'}
            </Text>
          </View>
        </Pressable>

        {/* 01 — The basics */}
        <FormSection num="01" title="The Basics">
          <View style={s.field}>
            <FieldLabel>Event Name</FieldLabel>
            <Input
              placeholder="e.g. Arsenal v Chelsea watch party"
              value={title}
              onChangeText={setTitle}
              autoFocus={!isEdit}
            />
          </View>

          <View style={s.field}>
            <FieldLabel>What Is Being Watched</FieldLabel>
            <BroadcastSubjectInput
              value={broadcastSubject}
              onChange={setBroadcastSubject}
            />
          </View>

          <View style={s.field}>
            <FieldLabel>Description</FieldLabel>
            <Input
              style={s.textArea}
              placeholder="Tell people what to expect…"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={s.field}>
            <View style={s.labelRow}>
              <FieldLabel>Max Capacity</FieldLabel>
              <Text style={[t.labelCapsSm, { color: colors.textTertiary }]}>Blank = unlimited</Text>
            </View>
            <Input
              placeholder="e.g. 30"
              value={capacity}
              onChangeText={setCapacity}
              keyboardType="numeric"
            />
          </View>
        </FormSection>

        {/* 02 — Time & place */}
        <FormSection num="02" title="Time & Place">
          <View style={s.field}>
            <FieldLabel>Starts</FieldLabel>
            <DateTimePicker
              value={startsAt}
              onChange={setStartsAt}
              placeholder="Set date & time"
              minimumDate={new Date()}
            />
          </View>

          <View style={s.field}>
            <FieldLabel>Ends</FieldLabel>
            <DateTimePicker
              value={endsAt}
              onChange={setEndsAt}
              placeholder="Optional end time"
              minimumDate={startsAt ?? new Date()}
            />
          </View>

          <View style={s.toggleRow}>
            <View style={s.toggleLabels}>
              <Text style={[t.labelCaps, { color: colors.textPrimary }]}>Add a Venue</Text>
              <Text style={[t.bodySm, { color: colors.textSecondary }]}>
                Let attendees know where to show up
              </Text>
            </View>
            <Switch
              value={hasVenue}
              onValueChange={setHasVenue}
              trackColor={{ false: palette.surfaceHigh, true: colors.accent }}
              thumbColor={colors.bg}
            />
          </View>

          {hasVenue && (
            <View style={s.venueFields}>
              <View style={s.field}>
                <FieldLabel>Venue Name</FieldLabel>
                <Input placeholder="Venue name" value={venueName} onChangeText={setVenueName} />
              </View>
              <View style={s.field}>
                <FieldLabel>Address</FieldLabel>
                <AddressAutocompleteInput
                  value={venueAddress}
                  onChangeText={(text) => {
                    setVenueAddress(text);
                    setVenueCoords(null); // manual edit invalidates the picked pin
                  }}
                  onSelect={(sugg) => {
                    setVenueAddress(sugg.label);
                    setVenueCoords({ latitude: sugg.lat, longitude: sugg.lng });
                    // Prefill the venue name from a picked POI if it's still empty.
                    if (!venueName.trim() && sugg.name && sugg.name !== sugg.label) {
                      setVenueName(sugg.name);
                    }
                  }}
                />
              </View>

              {/* Map preview — proves the pin before publishing */}
              {venueCoords && (
                <View style={s.mapPreviewWrap}>
                  <MapView
                    style={s.mapPreview}
                    region={{
                      ...venueCoords,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    toolbarEnabled={false}
                    pointerEvents="none"
                  >
                    <Marker coordinate={venueCoords} pinColor={palette.secondary} />
                  </MapView>
                  <View style={s.mapPreviewBadge}>
                    <Text style={[t.labelCapsSm, { color: colors.accent }]}>Pinned on map</Text>
                  </View>
                </View>
              )}
              {!venueCoords && venueAddress.trim().length > 0 && (
                <Text style={[t.bodySm, { color: colors.textTertiary }]}>
                  Pick a suggested address to pin this party on the Discover map.
                </Text>
              )}
            </View>
          )}
        </FormSection>

        {/* 03 — Privacy (maps to isPrivateLocation) */}
        <FormSection num="03" title="Privacy">
          <View style={s.privacyTiles}>
            <Pressable
              onPress={() => setIsPrivate(false)}
              style={[s.privacyTile, !isPrivate && s.privacyTileActive]}
            >
              <Text style={[t.labelCaps, { color: !isPrivate ? colors.live : colors.textPrimary }]}>
                Public
              </Text>
              <Text style={[t.bodySm, s.privacyTileSub]}>Anyone can join</Text>
            </Pressable>
            <Pressable
              onPress={() => setIsPrivate(true)}
              style={[s.privacyTile, isPrivate && s.privacyTileActive]}
            >
              <Text style={[t.labelCaps, { color: isPrivate ? colors.live : colors.textPrimary }]}>
                Private
              </Text>
              <Text style={[t.bodySm, s.privacyTileSub]}>Invite only — address hidden until RSVP</Text>
            </Pressable>
          </View>
          {isPrivate && !hasVenue && (
            <Text style={[t.bodySm, { color: colors.textTertiary }]}>
              Add a venue above to hide its address from non-attendees.
            </Text>
          )}
        </FormSection>

        {/* Actions */}
        <Btn
          label={loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Publish Party'}
          onPress={() => handleSave('published')}
          disabled={!canSave}
        />
        <Btn
          label={isEdit ? 'Save as Draft' : 'Save as Draft Instead'}
          variant="secondary"
          onPress={() => handleSave('draft')}
          disabled={!canSave}
        />

        {isEdit && (
          !showDeleteConfirm ? (
            <Btn label="Delete Party" variant="danger" onPress={() => setShowDeleteConfirm(true)} />
          ) : (
            <View style={s.confirmBox}>
              <Text style={[t.bodyMd, { color: colors.textPrimary }]}>
                Delete this party? This cannot be undone.
              </Text>
              <View style={s.confirmBtns}>
                <Btn
                  label="Keep It"
                  variant="ghost"
                  small
                  style={s.confirmBtn}
                  onPress={() => setShowDeleteConfirm(false)}
                />
                <Btn
                  label={loading ? '…' : 'Yes, Delete'}
                  variant="danger"
                  small
                  style={s.confirmBtn}
                  onPress={handleDelete}
                  disabled={loading}
                />
              </View>
            </View>
          )
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },

  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg },
  headlineBlock: { gap: spacing.xs },

  errorBanner: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: `${palette.errorDim}33`,
    padding: spacing.md,
  },

  coverPicker: {
    height: 160,
    backgroundColor: palette.surfaceMid,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPreview: { position: 'absolute', width: '100%', height: '100%' },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.overlay,
  },

  section: {
    backgroundColor: palette.surfaceLow,
    borderTopWidth: 1,
    borderTopColor: colors.accentDim,
    padding: spacing.lg,
    gap: spacing.lg,
  },

  field: { gap: 0 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  textArea: { height: 100, paddingTop: spacing.md },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabels: { flex: 1, paddingRight: spacing.lg, gap: 2 },
  venueFields: {
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  mapPreviewWrap: {
    height: 150,
    borderWidth: 1,
    borderColor: `${colors.accent}80`,
    overflow: 'hidden',
  },
  mapPreview: { flex: 1 },
  mapPreviewBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },

  // Success screen
  successGlyphBox: {
    width: 72,
    height: 72,
    borderWidth: 2,
    borderColor: colors.volt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  successGlyph: { fontSize: 36, color: colors.volt },
  successTitle: {
    color: palette.white,
    textAlign: 'center',
    textShadowColor: palette.secondary,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  successBody: {
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    marginTop: spacing.sm,
  },
  successWarn: {
    borderWidth: 1,
    borderColor: `${colors.live}80`,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xl,
    maxWidth: 320,
  },
  successActions: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing['2xl'], paddingHorizontal: spacing.xl },

  privacyTiles: { flexDirection: 'row', gap: spacing.md },
  privacyTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  privacyTileActive: {
    borderColor: colors.live,
    backgroundColor: `${palette.secondary}1a`,
  },
  privacyTileSub: { color: colors.textSecondary, textAlign: 'center' },

  confirmBox: {
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: `${palette.errorDim}1a`,
    padding: spacing.lg,
    gap: spacing.md,
  },
  confirmBtns: { flexDirection: 'row', gap: spacing.md },
  confirmBtn: { flex: 1 },
});
